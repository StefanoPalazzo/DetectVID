"""
routes/predict.py — Definición de endpoints HTTP.

Las rutas solo saben de HTTP: métodos, paths, status codes.
Toda la lógica está en el controller.
"""

from fastapi import APIRouter, UploadFile, File, Depends

from api.controllers.predict_controller import PredictController
from api.schemas.prediction import PredictionResponse, HealthResponse

router = APIRouter()


def get_controller() -> PredictController:
    """
    Dependency injection de FastAPI.
    main.py sobreescribe esto con la instancia real al arrancar.
    """
    raise NotImplementedError("Controller no inicializado.")


@router.post(
    "/predict",
    response_model=PredictionResponse,
    summary="Clasificar una imagen de hoja de vid",
    description="Recibe una imagen (JPG/PNG/WEBP) y devuelve la enfermedad detectada con su probabilidad.",
)
async def predict(
    file: UploadFile = File(..., description="Imagen de la hoja a clasificar"),
    controller: PredictController = Depends(get_controller),
):
    return await controller.predict(file)


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Estado del servicio ML",
)
def health(controller: PredictController = Depends(get_controller)):
    return controller.health()
