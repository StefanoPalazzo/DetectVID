package dev.detectvid.mobile.data

import dev.detectvid.mobile.platform.nowIsoString
import kotlin.math.roundToInt

private data class DiseaseMeta(
    val disease: String,
    val diseaseKey: String,
    val status: String,
    val riskLevel: String,
    val riskColor: String,
    val urgency: String,
    val symptoms: List<String>,
    val recommendation: String,
)

private val classMeta = mapOf(
    "healthy" to DiseaseMeta(
        disease = "Sana",
        diseaseKey = "healthy",
        status = "Sana",
        riskLevel = "Bajo",
        riskColor = "green",
        urgency = "Sin urgencia",
        symptoms = listOf("No se detectaron síntomas de enfermedad."),
        recommendation = "La hoja presenta un estado saludable. Continuar con el manejo preventivo habitual del viñedo.",
    ),
    "oidio" to DiseaseMeta(
        disease = "Oídio",
        diseaseKey = "powdery_mildew",
        status = "Enferma",
        riskLevel = "Alto",
        riskColor = "red",
        urgency = "Inmediata",
        symptoms = listOf(
            "Manchas blancas pulverulentas en el haz de la hoja",
            "Polvo grisáceo o blanco sobre la superficie foliar",
            "Deformación y rizado de brotes jóvenes",
            "Detención del crecimiento en zonas afectadas",
        ),
        recommendation = "Se detectó presencia de Oídio (Uncinula necator). Se recomienda aplicar fungicida azufrado o sistémico según la fenología del cultivo. Consultar con un ingeniero agrónomo para definir dosis y momento de aplicación.",
    ),
    "peronospora" to DiseaseMeta(
        disease = "Peronóspora",
        diseaseKey = "downy_mildew",
        status = "Enferma",
        riskLevel = "Alto",
        riskColor = "red",
        urgency = "Inmediata",
        symptoms = listOf(
            "Manchas amarillo-verdosas en el haz (\"manchas de aceite\")",
            "Pelusa blanca en el envés de la hoja (esporulación)",
            "Necrosis foliar en estadios avanzados",
            "Caída prematura de hojas afectadas",
        ),
        recommendation = "Se detectó presencia de Peronóspora (Plasmopara viticola). Aplicar fungicidas cúpricos o sistémicos específicos. La temperatura y humedad actuales favorecen el desarrollo. Revisión urgente del lote afectado.",
    ),
    "others" to DiseaseMeta(
        disease = "Otras",
        diseaseKey = "others",
        status = "No clasificada",
        riskLevel = "Medio",
        riskColor = "yellow",
        urgency = "Revisión recomendada",
        symptoms = listOf(
            "La imagen parece mostrar síntomas que no corresponden claramente a oídio ni peronóspora.",
            "Puede tratarse de otra enfermedad, daño fisiológico, quemadura, deficiencia nutricional o senescencia.",
        ),
        recommendation = "El modelo detectó un patrón fuera de las clases principales. Se recomienda tomar una foto cercana adicional y consultar con un ingeniero agrónomo antes de decidir un tratamiento.",
    ),
    "uncertain" to DiseaseMeta(
        disease = "Resultado incierto",
        diseaseKey = "uncertain",
        status = "Incierto",
        riskLevel = "Indeterminado",
        riskColor = "gray",
        urgency = "Repetir foto",
        symptoms = listOf(
            "El modelo no tiene suficiente certeza para emitir un diagnóstico confiable.",
            "La foto puede tener poca luz, reflejos, distancia excesiva, encuadre incompleto o síntomas ambiguos.",
        ),
        recommendation = "Repetí la captura con una hoja o racimo en primer plano, buena iluminación, foco nítido y sin sombras fuertes. Si el síntoma persiste, compará varias hojas de la misma planta y pedí confirmación agronómica.",
    ),
)

fun buildAnalysisEnvelope(image: PickedImage, prediction: MlPredictionResponse, processingTimeMs: Int): AnalysisEnvelope {
    val meta = if (prediction.isUncertain == true || prediction.predictedClass !in classMeta) {
        classMeta.getValue("uncertain")
    } else {
        classMeta.getValue(prediction.predictedClass)
    }
    val confidence = (prediction.confidence * 100).roundToInt().coerceIn(0, 100)
    val affectedArea = if (meta.riskLevel == "Bajo") 0 else (((1 - prediction.confidence) * 60) + 10).roundToInt()

    return AnalysisEnvelope(
        analysisId = "DVD-${randomId()}",
        timestamp = nowIsoString(),
        processingTime = processingTimeMs,
        image = ImageMetadata(
            name = image.fileName,
            size = image.bytes.size.toLong(),
            type = image.mimeType,
            dimensions = null,
            quality = if (prediction.isUncertain == true || confidence <= 70) "low" else "good",
        ),
        result = DiseaseResult(
            disease = meta.disease,
            diseaseKey = meta.diseaseKey,
            status = meta.status,
            confidence = confidence,
            riskLevel = meta.riskLevel,
            riskColor = meta.riskColor,
            affectedArea = when (meta.riskLevel) {
                "Indeterminado" -> "No estimada"
                "Bajo" -> "~0%"
                else -> "~$affectedArea%"
            },
            urgency = meta.urgency,
            symptoms = meta.symptoms,
            recommendation = meta.recommendation,
        ),
        model = ModelMetadata(
            name = prediction.modelName ?: "EfficientNet-B0 exp44_4cls_field_eff_quality_aug",
            type = "cloud",
        ),
    )
}

fun RemoteAnalysis.toLocalAnalysis(): LocalAnalysis = LocalAnalysis(
    id = "remote-$id",
    localImagePath = null,
    remoteImageUrl = imageUrl,
    fileName = imageUrl?.substringAfterLast('/') ?: analysisId,
    mimeType = "image/jpeg",
    createdAt = createdAt ?: nowIsoString(),
    updatedAt = nowIsoString(),
    latitude = latitude,
    longitude = longitude,
    status = SyncStatus.Synced,
    remoteId = id,
    result = AnalysisEnvelope(
        analysisId = analysisId,
        timestamp = createdAt ?: nowIsoString(),
        processingTime = processingTime,
        image = ImageMetadata(
            name = imageUrl?.substringAfterLast('/') ?: analysisId,
            size = 0,
            type = "image/jpeg",
            quality = if (confidence > 70) "good" else "low",
        ),
        result = DiseaseResult(
            disease = diseaseName ?: disease,
            diseaseKey = diseaseKey,
            status = status,
            confidence = confidence,
            riskLevel = riskLevel,
            riskColor = riskColor,
            affectedArea = affectedArea,
            urgency = urgency,
            symptoms = symptoms,
            recommendation = recommendation,
        ),
        model = ModelMetadata(name = modelName),
    ),
)
