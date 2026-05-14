"""
schemas/prediction.py — Contratos de entrada y salida de la API.

Pydantic valida automáticamente los tipos. Si el cliente manda algo
que no cumple el schema, FastAPI devuelve 422 con detalle del error
antes de que el controller se entere.
"""

from pydantic import BaseModel
from typing import Optional


class PredictionResponse(BaseModel):
    """Lo que la API devuelve siempre, sin importar el modelo que corra abajo."""
    predicted_class: str
    display_name: str
    confidence: float
    probabilities: dict[str, float]
    model_name: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    device: str
