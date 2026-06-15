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
from pathlib import Path

# Agregar src/ al path para importar los módulos ML existentes
ML_ROOT = Path(__file__).parent.parent.parent   # ml/
sys.path.insert(0, str(ML_ROOT / "src"))

import torch
from PIL import Image, ImageOps
from torchvision import transforms
import torch.nn.functional as F

from config import DEVICE, MODEL_NAME, BEST_MODEL_PATH, INPUT_SIZE, IMAGENET_MEAN, IMAGENET_STD, IDX_TO_CLASS, CLASS_DISPLAY_NAMES
from model import load_model

UNCERTAIN_CONFIDENCE_THRESHOLD = 0.70
UNCERTAIN_MARGIN_THRESHOLD = 0.15


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

    @torch.no_grad()
    def predict(self, image_bytes: bytes) -> dict:
        """Run inference from request bytes without writing temp files.

        Phone cameras produce multi-megabyte images, but the model only needs
        INPUT_SIZE pixels. Downscaling before tensor conversion prevents long
        CPU-bound requests that can exceed Cloudflare's timeout.
        """
        image = Image.open(io.BytesIO(image_bytes))
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)

        transform = transforms.Compose([
            transforms.Resize(INPUT_SIZE),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ])
        tensor = transform(image).unsqueeze(0).to(self._device)

        logits = self._model(tensor)
        probabilities = F.softmax(logits, dim=1).squeeze()
        sorted_probs, sorted_indices = torch.sort(probabilities, descending=True)

        pred_idx = sorted_indices[0].item()
        pred_class = IDX_TO_CLASS[pred_idx]
        confidence = sorted_probs[0].item()
        runner_up_confidence = sorted_probs[1].item() if len(sorted_probs) > 1 else 0.0
        top1_margin = confidence - runner_up_confidence
        is_uncertain = (
            confidence < UNCERTAIN_CONFIDENCE_THRESHOLD
            or top1_margin < UNCERTAIN_MARGIN_THRESHOLD
        )

        prob_dict = {
            CLASS_DISPLAY_NAMES[IDX_TO_CLASS[i]]: probabilities[i].item()
            for i in range(len(IDX_TO_CLASS))
        }

        return {
            "class": pred_class,
            "display_name": CLASS_DISPLAY_NAMES[pred_class],
            "confidence": confidence,
            "top1_margin": top1_margin,
            "is_uncertain": is_uncertain,
            "decision_status": "uncertain" if is_uncertain else "accepted",
            "thresholds": {
                "confidence": UNCERTAIN_CONFIDENCE_THRESHOLD,
                "margin": UNCERTAIN_MARGIN_THRESHOLD,
            },
            "probabilities": prob_dict,
        }

    def is_loaded(self) -> bool:
        return self._model is not None

    def device_name(self) -> str:
        return self._device

    def model_name(self) -> str:
        return self._model_name
