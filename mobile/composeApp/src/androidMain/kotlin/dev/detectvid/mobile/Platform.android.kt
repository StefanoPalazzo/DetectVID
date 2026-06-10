package dev.detectvid.mobile.platform

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.webkit.WebView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.FileProvider
import dev.detectvid.mobile.data.LocalAnalysis
import dev.detectvid.mobile.data.PickedImage
import dev.detectvid.mobile.data.DEFAULT_BASE_URL
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.time.Clock
import java.io.File
import java.net.URL
import kotlin.coroutines.resume

@Composable
actual fun rememberPlatformFileSystem(): PlatformFileSystem {
    val context = LocalContext.current.applicationContext
    return remember(context) { AndroidFileSystem(context) }
}

class AndroidFileSystem(private val context: Context) : PlatformFileSystem {
    override suspend fun readText(relativePath: String): String? {
        val file = resolve(relativePath)
        return if (file.exists()) file.readText() else null
    }

    override suspend fun writeText(relativePath: String, text: String) {
        val file = resolve(relativePath)
        file.parentFile?.mkdirs()
        file.writeText(text)
    }

    override suspend fun writeBytes(relativePath: String, bytes: ByteArray) {
        val file = resolve(relativePath)
        file.parentFile?.mkdirs()
        file.writeBytes(bytes)
    }

    override suspend fun readBytes(relativePath: String): ByteArray = resolve(relativePath).readBytes()

    override fun absolutePath(relativePath: String): String = resolve(relativePath).absolutePath

    private fun resolve(relativePath: String): File = File(context.filesDir, relativePath)
}

@Composable
actual fun rememberPhotoSource(): PhotoSource {
    val context = LocalContext.current
    var pickContinuation by remember { mutableStateOf<kotlin.coroutines.Continuation<PickedImage?>?>(null) }
    var cameraContinuation by remember { mutableStateOf<kotlin.coroutines.Continuation<PickedImage?>?>(null) }
    var pendingCameraFile by remember { mutableStateOf<File?>(null) }

    val pickLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val image = uri?.toPickedImage(context)
        pickContinuation?.resume(image)
        pickContinuation = null
    }

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        val file = pendingCameraFile
        val image = if (success && file != null && file.exists()) {
            PickedImage(
                bytes = file.readBytes(),
                fileName = file.name,
                mimeType = "image/jpeg",
            )
        } else null
        cameraContinuation?.resume(image)
        cameraContinuation = null
        pendingCameraFile = null
    }

    return remember(context, pickLauncher, cameraLauncher) {
        object : PhotoSource {
            override suspend fun pickImage(): PickedImage? = suspendCancellableCoroutine { continuation ->
                pickContinuation = continuation
                pickLauncher.launch("image/*")
            }

            override suspend fun takePhoto(): PickedImage? = suspendCancellableCoroutine { continuation ->
                val imagesDir = File(context.filesDir, "images").apply { mkdirs() }
                val file = File(imagesDir, "capture-${System.currentTimeMillis()}.jpg")
                pendingCameraFile = file
                cameraContinuation = continuation
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                cameraLauncher.launch(uri)
            }
        }
    }
}

private fun Uri.toPickedImage(context: Context): PickedImage? = runCatching {
    val resolver = context.contentResolver
    val mimeType = resolver.getType(this) ?: "image/jpeg"
    val bytes = resolver.openInputStream(this)?.use { it.readBytes() } ?: return null
    PickedImage(
        bytes = bytes,
        fileName = lastPathSegment?.substringAfterLast('/') ?: "leaf-${System.currentTimeMillis()}.jpg",
        mimeType = mimeType,
    )
}.getOrNull()

actual fun platformHttpClient(): HttpClient = HttpClient(OkHttp)

actual fun currentTimeMillis(): Long = System.currentTimeMillis()

actual fun nowIsoString(): String = Clock.System.now().toString()

@Composable
actual fun AnalysisImagePreview(localImagePath: String?, remoteImageUrl: String?, contentDescription: String?, modifier: Modifier) {
    val context = LocalContext.current.applicationContext
    val bitmap by produceState<android.graphics.Bitmap?>(initialValue = null, localImagePath, remoteImageUrl) {
        value = withContext(Dispatchers.IO) {
            localImagePath
                ?.let { File(context.filesDir, it) }
                ?.takeIf { it.exists() }
                ?.let { BitmapFactory.decodeFile(it.absolutePath) }
                ?: remoteImageUrl
                    ?.normalizeImageUrl()
                    ?.let { runCatching { URL(it).openStream().use(BitmapFactory::decodeStream) }.getOrNull() }
        }
    }

    val renderedBitmap = bitmap
    if (renderedBitmap != null) {
        Image(
            bitmap = renderedBitmap.asImageBitmap(),
            contentDescription = contentDescription,
            contentScale = ContentScale.Crop,
            modifier = modifier,
        )
    } else {
        Box(modifier = modifier.background(Color(0xFFE5E7EB)), contentAlignment = Alignment.Center) {
            androidx.compose.material3.Text("Hoja", color = Color(0xFF6B7280))
        }
    }
}

private fun String.normalizeImageUrl(): String =
    when {
        startsWith("http://") || startsWith("https://") -> this
        startsWith("/") -> DEFAULT_BASE_URL.trimEnd('/') + this
        else -> DEFAULT_BASE_URL.trimEnd('/') + "/" + this
    }

@Composable
actual fun NativeMapPreview(analyses: List<LocalAnalysis>, modifier: Modifier) {
    val html = remember(analyses) { vineyardMapHtml(analyses) }
    AndroidView(
        modifier = modifier,
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                loadDataWithBaseURL("https://detectvid.local/", html, "text/html", "UTF-8", null)
            }
        },
        update = { it.loadDataWithBaseURL("https://detectvid.local/", html, "text/html", "UTF-8", null) },
    )
}

private fun vineyardMapHtml(analyses: List<LocalAnalysis>): String {
    val points = analyses.filter { it.latitude != null && it.longitude != null }.joinToString(",") { item ->
        val result = item.result?.result
        val color = when {
            result?.riskColor.equals("green", ignoreCase = true) -> "#16a34a"
            result?.riskColor.equals("yellow", ignoreCase = true) -> "#f59e0b"
            result?.riskColor.equals("red", ignoreCase = true) -> "#ef4444"
            else -> "#6b7280"
        }
        """{lat:${item.latitude},lng:${item.longitude},color:"$color",label:"${(result?.disease ?: item.fileName).htmlEscape()}",confidence:"${result?.confidence ?: 0}%"}"""
    }
    return """
        <!doctype html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <style>
            html, body, #map { height:100%; margin:0; background:#052e16; font-family:-apple-system, BlinkMacSystemFont, sans-serif; }
            #fallback { position:absolute; inset:0; z-index:0; overflow:hidden; background:linear-gradient(135deg,#052e16,#166534 55%,#059669); }
            #fallback:before { content:""; position:absolute; inset:18px; border:1px solid rgba(255,255,255,.22); border-radius:22px; }
            .row { position:absolute; left:9%; right:9%; height:4px; border-radius:999px; background:rgba(255,255,255,.22); transform:rotate(-8deg); }
            .map-title { position:absolute; left:20px; top:18px; color:white; font-weight:800; font-size:16px; z-index:1; }
            .map-subtitle { position:absolute; left:20px; bottom:18px; color:#dcfce7; font-size:13px; z-index:1; }
            .dot { position:absolute; width:18px; height:18px; border-radius:99px; border:3px solid white; box-shadow:0 8px 24px rgba(0,0,0,.28); z-index:2; }
            .leaflet-container { z-index:3; }
            .leaflet-control-attribution { font-size:9px; }
          </style>
        </head>
        <body>
          <div id="fallback">
            <div class="map-title">Mapa del viñedo</div>
            <div class="map-subtitle">Mendoza · Zonas de análisis GPS</div>
            <div class="row" style="top:28%"></div><div class="row" style="top:42%"></div><div class="row" style="top:56%"></div><div class="row" style="top:70%"></div>
          </div>
          <div id="map"></div>
          <script>
            const points = [$points];
            const center = points.length ? [points[0].lat, points[0].lng] : [-32.8895, -68.8458];
            points.forEach((p,i) => {
              const d = document.createElement('div'); d.className='dot'; d.style.background=p.color;
              d.style.left=(26+(i*17)%52)+'%'; d.style.top=(34+(i*13)%34)+'%'; document.getElementById('fallback').appendChild(d);
            });
            const map = L.map('map', { zoomControl:false }).setView(center, points.length ? 15 : 11);
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'© OSM' }).addTo(map);
            points.forEach(p => L.circle([p.lat,p.lng], { radius:25, color:p.color, fillColor:p.color, fillOpacity:0.35, weight:2 })
              .bindPopup('<b>'+p.label+'</b><br/>Confianza '+p.confidence).addTo(map));
          </script>
        </body>
        </html>
    """.trimIndent()
}

private fun String.htmlEscape(): String =
    replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;").replace(">", "&gt;")
