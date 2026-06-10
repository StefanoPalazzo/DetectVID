package dev.detectvid.mobile.platform

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import dev.detectvid.mobile.data.LocalAnalysis
import dev.detectvid.mobile.data.PickedImage

interface PlatformFileSystem {
    suspend fun readText(relativePath: String): String?
    suspend fun writeText(relativePath: String, text: String)
    suspend fun writeBytes(relativePath: String, bytes: ByteArray)
    suspend fun readBytes(relativePath: String): ByteArray
    fun absolutePath(relativePath: String): String
}

interface PhotoSource {
    suspend fun takePhoto(): PickedImage?
    suspend fun pickImage(): PickedImage?
}

@Composable
expect fun rememberPlatformFileSystem(): PlatformFileSystem

@Composable
expect fun rememberPhotoSource(): PhotoSource

@Composable
expect fun AnalysisImagePreview(localImagePath: String?, remoteImageUrl: String?, contentDescription: String?, modifier: Modifier)

@Composable
expect fun NativeMapPreview(analyses: List<LocalAnalysis>, modifier: Modifier)

expect fun platformHttpClient(): io.ktor.client.HttpClient

expect fun currentTimeMillis(): Long

expect fun nowIsoString(): String
