package dev.detectvid.mobile.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class User(
    val id: String,
    val name: String,
    val email: String,
    val role: String,
)

@Serializable
data class MobileState(
    val baseUrl: String = DEFAULT_BASE_URL,
    val authCookie: String? = null,
    val user: User? = null,
    val analyses: List<LocalAnalysis> = emptyList(),
    val fincas: List<Finca> = emptyList(),
    val darkMode: Boolean = true,
    val pendingDeletes: List<PendingDelete> = emptyList(),
)

@Serializable
data class Finca(
    val id: String,
    val name: String,
    val color: String = "#16a34a",
    val coordinates: List<FincaCoordinate> = emptyList(),
)

@Serializable
data class FincaCoordinate(
    val lat: Double,
    val lng: Double,
)

@Serializable
data class LocalAnalysis(
    val id: String,
    val localImagePath: String? = null,
    val remoteImageUrl: String? = null,
    val fileName: String,
    val mimeType: String,
    val createdAt: String,
    val updatedAt: String,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val status: SyncStatus = SyncStatus.Queued,
    val errorMessage: String? = null,
    val remoteId: String? = null,
    val result: AnalysisEnvelope? = null,
)

@Serializable
data class PendingDelete(
    val remoteId: String,
    val createdAt: String,
)

@Serializable
enum class SyncStatus {
    Queued,
    Analyzing,
    Syncing,
    Synced,
    Failed,
}

@Serializable
data class PickedImage(
    val bytes: ByteArray,
    val fileName: String,
    val mimeType: String,
    val latitude: Double? = null,
    val longitude: Double? = null,
)

@Serializable
data class AnalysisEnvelope(
    val success: Boolean = true,
    val analysisId: String,
    val timestamp: String,
    val processingTime: Int? = null,
    val image: ImageMetadata,
    val result: DiseaseResult,
    val model: ModelMetadata,
)

@Serializable
data class ImageMetadata(
    val name: String,
    val size: Long,
    val type: String,
    val dimensions: String? = null,
    val quality: String,
)

@Serializable
data class DiseaseResult(
    val disease: String,
    val diseaseKey: String,
    val status: String,
    val confidence: Int,
    val riskLevel: String,
    val riskColor: String,
    val affectedArea: String,
    val urgency: String,
    val symptoms: List<String>,
    val recommendation: String,
)

@Serializable
data class ModelMetadata(
    val name: String,
    val version: String = "1.0.0",
    val type: String = "cloud",
)

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class RegisterRequest(val name: String, val email: String, val password: String)

@Serializable
data class AuthResponse(
    val success: Boolean,
    val message: String? = null,
    val user: User? = null,
)

@Serializable
data class MlPredictionResponse(
    @SerialName("predicted_class") val predictedClass: String,
    @SerialName("display_name") val displayName: String,
    val confidence: Double,
    @SerialName("is_uncertain") val isUncertain: Boolean? = null,
    val probabilities: Map<String, Double> = emptyMap(),
    @SerialName("model_name") val modelName: String? = null,
)

@Serializable
data class SaveAnalysisResponse(
    val success: Boolean,
    val analysis: RemoteAnalysis? = null,
)

@Serializable
data class ListAnalysesResponse(
    val success: Boolean,
    val analyses: List<RemoteAnalysis> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
)

@Serializable
data class ListFincasResponse(
    val success: Boolean,
    val fincas: List<Finca> = emptyList(),
)

@Serializable
data class RemoteAnalysis(
    val id: String,
    val imageUrl: String? = null,
    val disease: String,
    val diseaseKey: String,
    val status: String,
    val confidence: Int,
    val riskLevel: String,
    val riskColor: String,
    val affectedArea: String,
    val urgency: String,
    val symptoms: List<String> = emptyList(),
    val recommendation: String,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val analysisId: String,
    val processingTime: Int? = null,
    val modelName: String = "EfficientNet-B0 exp44_4cls_field_eff_quality_aug",
    val diseaseName: String? = null,
    val createdAt: String? = null,
)

const val DEFAULT_BASE_URL = "https://success-amanda-enlargement-globe.trycloudflare.com"
