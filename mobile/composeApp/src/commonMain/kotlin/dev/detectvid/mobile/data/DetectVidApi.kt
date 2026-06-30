package dev.detectvid.mobile.data

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.submitFormWithBinaryData
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

class DetectVidApi(
    private val client: HttpClient,
    private val getBaseUrl: () -> String,
    private val getAuthCookie: () -> String?,
    private val onAuthCookie: (String) -> Unit,
) {
    suspend fun login(email: String, password: String): AuthResponse {
        val response = client.post(url("/api/auth/login")) {
            contentType(ContentType.Application.Json)
            setBody(LoginRequest(email = email, password = password))
        }
        captureCookie(response.headers.getAll(HttpHeaders.SetCookie))
        ensureSuccess(response.status)
        return response.body()
    }

    suspend fun register(name: String, email: String, password: String): AuthResponse {
        val response = client.post(url("/api/auth/register")) {
            contentType(ContentType.Application.Json)
            setBody(RegisterRequest(name = name, email = email, password = password))
        }
        captureCookie(response.headers.getAll(HttpHeaders.SetCookie))
        ensureSuccess(response.status)
        return response.body()
    }

    suspend fun me(): AuthResponse {
        val response = client.get(url("/api/auth/me")) { authHeader() }
        ensureSuccess(response.status)
        return response.body()
    }

    suspend fun predict(image: PickedImage): MlPredictionResponse {
        val response = client.submitFormWithBinaryData(
            url = url("/api/ml/predict"),
            formData = formData {
                append(
                    key = "file",
                    value = image.bytes,
                    headers = fileHeaders(image.fileName, image.mimeType),
                )
            },
        )
        ensureSuccess(response.status)
        return response.body()
    }

    suspend fun saveAnalysis(image: PickedImage, envelope: AnalysisEnvelope): SaveAnalysisResponse {
        val response = client.submitFormWithBinaryData(
            url = url("/api/analyses"),
            formData = formData {
                append(
                    key = "image",
                    value = image.bytes,
                    headers = fileHeaders(image.fileName, image.mimeType),
                )
                append("result", Json.encodeToString(AnalysisEnvelope.serializer(), envelope))
                image.latitude?.let { append("latitude", it.toString()) }
                image.longitude?.let { append("longitude", it.toString()) }
            },
        ) {
            authHeader()
        }
        ensureSuccess(response.status)
        return response.body()
    }

    suspend fun listAnalyses(): ListAnalysesResponse {
        val response = client.get(url("/api/analyses?limit=100")) { authHeader() }
        ensureSuccess(response.status)
        return response.body()
    }

    suspend fun listFincas(): ListFincasResponse {
        val response = client.get(url("/api/fincas")) { authHeader() }
        ensureSuccess(response.status)
        return response.body()
    }

    suspend fun deleteAnalysis(remoteId: String) {
        val response = client.delete(url("/api/analyses/$remoteId")) { authHeader() }
        ensureSuccess(response.status)
    }

    private fun url(path: String): String = getBaseUrl().trimEnd('/') + path

    private fun io.ktor.client.request.HttpRequestBuilder.authHeader() {
        val cookie = getAuthCookie()?.takeIf { it.isNotBlank() } ?: return
        header(HttpHeaders.Cookie, "auth_token=$cookie")
    }

    private fun captureCookie(setCookieHeaders: List<String>?) {
        setCookieHeaders.orEmpty()
            .firstOrNull { it.startsWith("auth_token=") }
            ?.substringAfter("auth_token=")
            ?.substringBefore(';')
            ?.takeIf { it.isNotBlank() }
            ?.let(onAuthCookie)
    }

    private fun ensureSuccess(status: HttpStatusCode) {
        if (status.value !in 200..299) {
            error("DetectVID API returned HTTP ${status.value}")
        }
    }

    private fun fileHeaders(fileName: String, mimeType: String): Headers = Headers.build {
        append(HttpHeaders.ContentType, mimeType)
        append(HttpHeaders.ContentDisposition, "filename=\"$fileName\"")
    }
}

fun createDetectVidHttpClient(engineClient: HttpClient): HttpClient = engineClient.config {
    install(ContentNegotiation) {
        json(Json { ignoreUnknownKeys = true; explicitNulls = false })
    }
    install(Logging) {
        level = LogLevel.INFO
    }
}
