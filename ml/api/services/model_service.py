"""
services/model_service.py — Abstracción del modelo ML.

ESTE es el único archivo que sabe que existe PyTorch.
Si mañana querés:
  - Usar ONNX Runtime  → creás OnnxModelService con la misma interfaz
  - Llamar a una API externa (Replicate, HuggingFace) → RemoteModelService
  - Usar TensorFlow   → TFModelService

El controller y las rutas no cambian. Solo swapeás la implementación
en main.py al momento de crear la instancia.

Interfaz mínima que cualquier implementación debe cumplir:
    predict(image_bytes: bytes) -> dict
    is_loaded() -> bool
    device_name() -> str
    model_name() -> str
"""

import sys
import io
import tempfile
import os
from pathlib import Path

# Agregar src/ al path para importar los módulos ML existentes
ML_ROOT = Path(__file__).parent.parent.parent   # ml/
sys.path.insert(0, str(ML_ROOT / "src"))

import torch
from PIL import Image

from config import DEVICE, MODEL_NAME, BEST_MODEL_PATH
from model import load_model
from predict import predict as ml_predict, preprocess_image


class PyTorchModelService:
    """
    Implementación con PyTorch + checkpoint .pth local.

    El modelo se carga UNA sola vez al instanciar (startup de la API).
    Cada request solo corre el forward pass — no hay I/O de disco.
    """

    def __init__(self, checkpoint_path: str = None):
        self._model = None
        self._device = DEVICE
        self._model_name = MODEL_NAME
        self._checkpoint_path = checkpoint_path or str(BEST_MODEL_PATH)
        self._load()

    def _load(self):
        """Carga el modelo desde el checkpoint. Se llama solo en __init__."""
        print(f"[ModelService] Cargando modelo desde {self._checkpoint_path}")
        print(f"[ModelService] Dispositivo: {self._device.upper()}")

        checkpoint = torch.load(
            self._checkpoint_path,
            map_location=self._device,
            weights_only=False
        )

        # El checkpoint puede traer metadatos del entrenamiento
        if isinstance(checkpoint, dict):
            self._model_name = checkpoint.get("model_name", MODEL_NAME)

        self._model = load_model(
            self._checkpoint_path,
            model_name=self._model_name,
            device=self._device,
        )
        print(f"[ModelService] ✓ Listo — {self._model_name} en {self._device.upper()}")

    def predict(self, image_bytes: bytes) -> dict:
        """
        Recibe la imagen como bytes (viene del request HTTP) y devuelve
        el resultado de clasificación.

        Retorna siempre el mismo dict, sin importar el backbone:
        {
            "class": "oidio",
            "display_name": "Oídio (Powdery Mildew)",
            "confidence": 0.97,
            "probabilities": {"Sana": 0.01, ...}
        }
        """
        # Guardar bytes en un archivo temporal para reutilizar preprocess_image()
        # que ya existe en predict.py — no duplicamos lógica.
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        try:
            result = ml_predict(tmp_path, model=self._model, device=self._device)
        finally:
            os.unlink(tmp_path)

        return result

    def is_loaded(self) -> bool:
        return self._model is not None

    def device_name(self) -> str:
        return self._device

    def model_name(self) -> str:
        return self._model_name
