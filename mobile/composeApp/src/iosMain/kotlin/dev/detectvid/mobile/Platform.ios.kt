package dev.detectvid.mobile.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toComposeImageBitmap
import androidx.compose.ui.interop.UIKitView
import androidx.compose.ui.layout.ContentScale
import dev.detectvid.mobile.data.LocalAnalysis
import dev.detectvid.mobile.data.DEFAULT_BASE_URL
import dev.detectvid.mobile.data.PickedImage
import io.ktor.client.HttpClient
import io.ktor.client.engine.darwin.Darwin
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.refTo
import kotlinx.cinterop.readValue
import kotlinx.cinterop.usePinned
import platform.Foundation.*
import platform.UIKit.UIApplication
import platform.UIKit.UIImage
import platform.UIKit.UIImageJPEGRepresentation
import platform.UIKit.UIImagePickerController
import platform.UIKit.UIImagePickerControllerDelegateProtocol
import platform.UIKit.UIImagePickerControllerOriginalImage
import platform.UIKit.UIImagePickerControllerSourceType
import platform.UIKit.UINavigationControllerDelegateProtocol
import platform.WebKit.WKWebView
import platform.WebKit.WKWebViewConfiguration
import platform.darwin.NSObject
import platform.posix.memcpy
import org.jetbrains.skia.Image.Companion.makeFromEncoded
import kotlin.coroutines.Continuation
import kotlin.coroutines.resume
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext

@Composable
actual fun rememberPlatformFileSystem(): PlatformFileSystem = remember { IosFileSystem() }

@OptIn(ExperimentalForeignApi::class)
class IosFileSystem : PlatformFileSystem {
    private val root: String by lazy {
        val url = NSFileManager.defaultManager.URLForDirectory(
            directory = NSDocumentDirectory,
            inDomain = NSUserDomainMask,
            appropriateForURL = null,
            create = true,
            error = null,
        ) ?: error("Documents directory unavailable")
        url.path ?: error("Documents directory path unavailable")
    }

    override suspend fun readText(relativePath: String): String? {
        val path = absolutePath(relativePath)
        return if (NSFileManager.defaultManager.fileExistsAtPath(path)) {
            readBytes(relativePath).decodeToString()
        } else null
    }

    override suspend fun writeText(relativePath: String, text: String) {
        writeBytes(relativePath, text.encodeToByteArray())
    }

    override suspend fun writeBytes(relativePath: String, bytes: ByteArray) {
        ensureParent(relativePath)
        NSFileManager.defaultManager.createFileAtPath(absolutePath(relativePath), contents = bytes.toNSData(), attributes = null)
    }

    override suspend fun readBytes(relativePath: String): ByteArray {
        val data = NSData.dataWithContentsOfFile(absolutePath(relativePath)) ?: error("File not found: $relativePath")
        return data.toByteArray()
    }

    override fun absolutePath(relativePath: String): String = "$root/${relativePath.trimStart('/')}"

    private fun ensureParent(relativePath: String) {
        val fullPath = absolutePath(relativePath)
        val directory = fullPath.substringBeforeLast('/', root)
        NSFileManager.defaultManager.createDirectoryAtPath(directory, withIntermediateDirectories = true, attributes = null, error = null)
    }
}

@Composable
actual fun rememberPhotoSource(): PhotoSource = remember { IosPhotoSource() }

private class IosPhotoSource : PhotoSource {
    private var activeDelegate: IosPickerDelegate? = null

    override suspend fun takePhoto(): PickedImage? = presentPicker(SourceTypeCamera)

    override suspend fun pickImage(): PickedImage? = presentPicker(SourceTypePhotoLibrary)

    private suspend fun presentPicker(sourceType: UIImagePickerControllerSourceType): PickedImage? = suspendCancellableCoroutine { cont ->
        if (!UIImagePickerController.isSourceTypeAvailable(sourceType)) {
            cont.resume(null)
            return@suspendCancellableCoroutine
        }

        val picker = UIImagePickerController()
        val delegate = IosPickerDelegate(
            continuation = cont,
            onFinished = { activeDelegate = null },
        )
        activeDelegate = delegate
        picker.sourceType = sourceType
        picker.delegate = delegate

        UIApplication.sharedApplication.keyWindow?.rootViewController?.presentViewController(picker, animated = true, completion = null)
            ?: run {
                activeDelegate = null
                cont.resume(null)
            }
    }
}

private class IosPickerDelegate(
    private val continuation: Continuation<PickedImage?>,
    private val onFinished: () -> Unit,
) : NSObject(), UIImagePickerControllerDelegateProtocol, UINavigationControllerDelegateProtocol {

    override fun imagePickerControllerDidCancel(picker: UIImagePickerController) {
        picker.dismissViewControllerAnimated(true, completion = null)
        continuation.resume(null)
        onFinished()
    }

    override fun imagePickerController(
        picker: UIImagePickerController,
        didFinishPickingMediaWithInfo: Map<Any?, *>,
    ) {
        val image = didFinishPickingMediaWithInfo[UIImagePickerControllerOriginalImage] as? UIImage
        val bytes = image?.let { UIImageJPEGRepresentation(it, 0.92)?.toByteArray() }
        picker.dismissViewControllerAnimated(true, completion = null)
        continuation.resume(
            bytes?.let {
                PickedImage(
                    bytes = it,
                    fileName = "leaf-${currentTimeMillis()}.jpg",
                    mimeType = "image/jpeg",
                )
            },
        )
        onFinished()
    }
}

actual fun platformHttpClient(): HttpClient = HttpClient(Darwin)

actual fun currentTimeMillis(): Long = (NSDate().timeIntervalSince1970 * 1000).toLong()

actual fun nowIsoString(): String = NSDate().description ?: currentTimeMillis().toString()

@Composable
actual fun AnalysisImagePreview(localImagePath: String?, remoteImageUrl: String?, contentDescription: String?, modifier: Modifier) {
    val imageBitmap by produceState<androidx.compose.ui.graphics.ImageBitmap?>(initialValue = null, localImagePath, remoteImageUrl) {
        value = withContext(Dispatchers.Default) {
            val bytes = localImagePath
                ?.let { runCatching { NSData.dataWithContentsOfFile(IosFileSystem().absolutePath(it))?.toByteArray() }.getOrNull() }
                ?: remoteImageUrl
                    ?.normalizeImageUrl()
                    ?.let { runCatching { NSData.dataWithContentsOfURL(NSURL(string = it))?.toByteArray() }.getOrNull() }
            bytes?.let { runCatching { makeFromEncoded(it).toComposeImageBitmap() }.getOrNull() }
        }
    }

    val renderedBitmap = imageBitmap
    if (renderedBitmap != null) {
        Image(
            bitmap = renderedBitmap,
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
@OptIn(ExperimentalForeignApi::class)
actual fun NativeMapPreview(analyses: List<LocalAnalysis>, modifier: Modifier) {
    val html = remember(analyses) { vineyardMapHtml(analyses) }
    UIKitView(
        modifier = modifier,
        factory = {
            WKWebView(frame = platform.CoreGraphics.CGRectZero.readValue(), configuration = WKWebViewConfiguration()).apply {
                loadHTMLString(html, baseURL = NSURL(string = "https://detectvid.local/"))
            }
        },
        update = { it.loadHTMLString(html, baseURL = NSURL(string = "https://detectvid.local/")) },
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

private val SourceTypePhotoLibrary: UIImagePickerControllerSourceType = UIImagePickerControllerSourceType.UIImagePickerControllerSourceTypePhotoLibrary
private val SourceTypeCamera: UIImagePickerControllerSourceType = UIImagePickerControllerSourceType.UIImagePickerControllerSourceTypeCamera

@OptIn(ExperimentalForeignApi::class)
private fun ByteArray.toNSData(): NSData = usePinned { pinned ->
    NSData.create(bytes = pinned.addressOf(0), length = size.toULong())
}

@OptIn(ExperimentalForeignApi::class)
private fun NSData.toByteArray(): ByteArray {
    val result = ByteArray(length.toInt())
    if (result.isEmpty()) return result
    result.usePinned { pinned -> memcpy(pinned.addressOf(0), bytes, length) }
    return result
}
