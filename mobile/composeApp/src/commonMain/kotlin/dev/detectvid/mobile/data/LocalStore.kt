package dev.detectvid.mobile.data

import dev.detectvid.mobile.platform.PlatformFileSystem
import dev.detectvid.mobile.platform.nowIsoString
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class LocalStore(
    private val fileSystem: PlatformFileSystem,
    private val json: Json = Json { ignoreUnknownKeys = true; prettyPrint = true },
) {
    private val mutex = Mutex()
    private var state = MobileState()
    private var loaded = false

    suspend fun load(): MobileState = mutex.withLock {
        ensureLoadedLocked()
        state
    }

    suspend fun updateBaseUrl(baseUrl: String): MobileState = update { it.copy(baseUrl = baseUrl.trim().trimEnd('/')) }

    suspend fun updateDarkMode(enabled: Boolean): MobileState = update { it.copy(darkMode = enabled) }

    suspend fun saveSession(user: User, authCookie: String?): MobileState = update {
        it.copy(user = user, authCookie = authCookie ?: it.authCookie)
    }

    suspend fun clearSession(): MobileState = update { it.copy(user = null, authCookie = null) }

    suspend fun addImage(image: PickedImage): LocalAnalysis = mutex.withLock {
        ensureLoadedLocked()
        val id = randomId()
        val extension = when (image.mimeType) {
            "image/png" -> "png"
            "image/webp" -> "webp"
            else -> "jpg"
        }
        val path = "images/$id.$extension"
        fileSystem.writeBytes(path, image.bytes)
        val now = nowIsoString()
        val item = LocalAnalysis(
            id = id,
            localImagePath = path,
            fileName = image.fileName,
            mimeType = image.mimeType,
            createdAt = now,
            updatedAt = now,
            latitude = image.latitude,
            longitude = image.longitude,
            status = SyncStatus.Queued,
        )
        state = state.copy(analyses = listOf(item) + state.analyses)
        persistLocked()
        item
    }

    suspend fun readImageBytes(item: LocalAnalysis): ByteArray {
        val path = item.localImagePath ?: error("Analysis ${item.id} has no local image")
        return fileSystem.readBytes(path)
    }

    suspend fun markStatus(id: String, status: SyncStatus, error: String? = null): MobileState = updateAnalysis(id) {
        it.copy(status = status, errorMessage = error, updatedAt = nowIsoString())
    }

    suspend fun savePrediction(id: String, envelope: AnalysisEnvelope): MobileState = updateAnalysis(id) {
        it.copy(result = envelope, status = SyncStatus.Syncing, errorMessage = null, updatedAt = nowIsoString())
    }

    suspend fun markSynced(id: String, remoteId: String?): MobileState = updateAnalysis(id) {
        it.copy(status = SyncStatus.Synced, remoteId = remoteId, errorMessage = null, updatedAt = nowIsoString())
    }

    suspend fun deleteAnalysis(id: String): MobileState = update { current ->
        val item = current.analyses.firstOrNull { it.id == id } ?: return@update current
        val delete = item.remoteId?.let { PendingDelete(remoteId = it, createdAt = nowIsoString()) }
        current.copy(
            analyses = current.analyses.filterNot { it.id == id },
            pendingDeletes = if (delete == null || current.pendingDeletes.any { it.remoteId == delete.remoteId }) {
                current.pendingDeletes
            } else {
                current.pendingDeletes + delete
            },
        )
    }

    suspend fun pendingDeletes(): List<PendingDelete> = mutex.withLock {
        ensureLoadedLocked()
        state.pendingDeletes
    }

    suspend fun markDeleteSynced(remoteId: String): MobileState = update { current ->
        current.copy(pendingDeletes = current.pendingDeletes.filterNot { it.remoteId == remoteId })
    }

    suspend fun upsertRemote(remoteItems: List<RemoteAnalysis>): MobileState = mutex.withLock {
        ensureLoadedLocked()
        val localByRemote = state.analyses.mapNotNull { item -> item.remoteId?.let { it to item } }.toMap()
        val remoteAsLocal = remoteItems.map {
            val remote = it.toLocalAnalysis()
            val existing = localByRemote[it.id]
            if (existing != null) {
                remote.copy(
                    localImagePath = existing.localImagePath,
                    fileName = existing.fileName,
                    mimeType = existing.mimeType,
                )
            } else {
                remote
            }
        }
        val mergedRemoteIds = remoteAsLocal.mapNotNull { it.remoteId }.toSet()
        val localOnly = state.analyses.filter { it.remoteId == null && it.status != SyncStatus.Synced }
        state = state.copy(analyses = (localOnly + remoteAsLocal).distinctBy { it.remoteId ?: it.id }.sortedByDescending { it.createdAt })
        persistLocked()
        state
    }

    suspend fun pendingAnalyses(): List<LocalAnalysis> = mutex.withLock {
        ensureLoadedLocked()
        state.analyses.filter { it.localImagePath != null && it.status in setOf(SyncStatus.Queued, SyncStatus.Failed) }
    }

    private suspend fun update(transform: (MobileState) -> MobileState): MobileState = mutex.withLock {
        ensureLoadedLocked()
        state = transform(state)
        persistLocked()
        state
    }

    private suspend fun updateAnalysis(id: String, transform: (LocalAnalysis) -> LocalAnalysis): MobileState = update { current ->
        current.copy(analyses = current.analyses.map { if (it.id == id) transform(it) else it })
    }

    private suspend fun ensureLoadedLocked() {
        if (loaded) return
        val content = fileSystem.readText(STATE_FILE)
        state = content?.let { runCatching { json.decodeFromString<MobileState>(it) }.getOrNull() } ?: MobileState()
        loaded = true
    }

    private suspend fun persistLocked() {
        fileSystem.writeText(STATE_FILE, json.encodeToString(state))
    }

    companion object {
        private const val STATE_FILE = "detectvid_state.json"
    }
}
