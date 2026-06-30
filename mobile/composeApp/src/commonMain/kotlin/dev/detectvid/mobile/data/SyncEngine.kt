package dev.detectvid.mobile.data

import kotlin.time.TimeSource

class SyncEngine(
    private val store: LocalStore,
    private val api: DetectVidApi,
) {
    suspend fun syncAll(onState: suspend (MobileState) -> Unit = {}): MobileState {
        val current = store.load()
        if (current.user == null || current.authCookie.isNullOrBlank()) return current

        syncPending(onState)
        syncDeletes(onState)
        val synced = pullRemote(onState)
        return pullFincas(onState).copy(analyses = synced.analyses)
    }

    suspend fun syncDeletes(onState: suspend (MobileState) -> Unit = {}) {
        for (delete in store.pendingDeletes()) {
            runCatching {
                api.deleteAnalysis(delete.remoteId)
                onState(store.markDeleteSynced(delete.remoteId))
            }
        }
    }

    suspend fun syncPending(onState: suspend (MobileState) -> Unit = {}) {
        for (item in store.pendingAnalyses()) {
            runCatching {
                onState(store.markStatus(item.id, SyncStatus.Analyzing))
                val imageBytes = store.readImageBytes(item)
                val image = PickedImage(
                    bytes = imageBytes,
                    fileName = item.fileName,
                    mimeType = item.mimeType,
                    latitude = item.latitude,
                    longitude = item.longitude,
                )
                val envelope = item.result ?: run {
                    val mark = TimeSource.Monotonic.markNow()
                    val prediction = api.predict(image)
                    buildAnalysisEnvelope(image, prediction, mark.elapsedNow().inWholeMilliseconds.toInt())
                        .also { onState(store.savePrediction(item.id, it)) }
                }
                val saved = api.saveAnalysis(image, envelope)
                onState(store.markSynced(item.id, saved.analysis?.id, saved.analysis?.imageUrl))
            }.onFailure { error ->
                onState(store.markStatus(item.id, SyncStatus.Failed, error.message ?: "Sync failed"))
            }
        }
    }

    suspend fun pullRemote(onState: suspend (MobileState) -> Unit = {}): MobileState {
        val response = api.listAnalyses()
        val state = store.upsertRemote(response.analyses)
        onState(state)
        return state
    }

    suspend fun pullFincas(onState: suspend (MobileState) -> Unit = {}): MobileState {
        val response = api.listFincas()
        val state = store.replaceFincas(response.fincas)
        onState(state)
        return state
    }
}
