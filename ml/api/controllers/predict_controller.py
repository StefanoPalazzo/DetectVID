"""
controllers/predict_controller.py — Lógica de request/response.

El controller:
  - Recibe el archivo del request (FastAPI UploadFile)
  - Valida que sea una imagen
  - Llama al service
  - Mapea el resultado al schema de respuesta

NO sabe nada de PyTorch, modelos, ni rutas HTTP.
NO sabe nada de cómo se procesa la imagen internamente.
"""

from fastapi import UploadFile, HTTPException

from api.services.model_service import PyTorchModelService
from api.schemas.prediction import PredictionResponse, HealthResponse

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/bmp"}


class PredictController:

    def __init__(self, model_service: PyTorchModelService):
        # Inyección de dependencia — el controller no crea el servicio,
        # lo recibe. Esto permite testear pasando un mock.
        self._service = model_service

    async def predict(self, file: UploadFile) -> PredictionResponse:
        """Valida el archivo, corre la predicción, devuelve el schema."""

        if file.content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=415,
                detail=f"Formato no soportado: {file.content_type}. Usá JPG, PNG, WEBP o BMP."
            )

        image_bytes = await file.read()

        if len(image_bytes) == 0:
            raise HTTPException(status_code=400, detail="El archivo está vacío.")

        try:
            result = self._service.predict(image_bytes)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Error al procesar la imagen: {str(e)}"
            )

        return PredictionResponse(
            predicted_class=result["class"],
            display_name=result["display_name"],
            confidence=result["confidence"],
            probabilities=result["probabilities"],
            model_name=self._service.model_name(),
        )

    def health(self) -> HealthResponse:
        return HealthResponse(
            status="ok" if self._service.is_loaded() else "model_not_loaded",
            model_loaded=self._service.is_loaded(),
            device=self._service.device_name(),
        )
