"""
predict.py — Clasificar una imagen de hoja de vid con el modelo entrenado
═════════════════════════════════════════════════════════════════════════════

Uso:
    python src/predict.py ruta/a/tu/imagen.jpg
    python src/predict.py ~/Desktop/hoja_enferma.png
    python src/predict.py foto1.jpg foto2.jpg foto3.jpg
    python src/predict.py ~/Desktop/carpeta_con_hojas/

Acepta imágenes sueltas o carpetas (escanea recursivamente).
Formatos: JPG, PNG, WEBP, BMP, TIFF. Cualquier tamaño.
"""

import sys
import argparse
from pathlib import Path

import torch
import torch.nn.functional as F
from torchvision import transforms
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))

from config import (
    DEVICE, INPUT_SIZE, IMAGENET_MEAN, IMAGENET_STD,
    BEST_MODEL_PATH, IDX_TO_CLASS, CLASS_DISPLAY_NAMES, MODEL_NAME,
)
from model import load_model


# ─── Preprocesamiento ────────────────────────────────────────────────────────

def preprocess_image(image_path: str) -> torch.Tensor:
    """
    Carga una imagen y la prepara para el modelo.

    El modelo espera:
    - Tensor de (1, 3, 224, 224)  ← batch de 1 imagen, RGB, 224x224
    - Normalizado con estadísticas de ImageNet

    Es el mismo preprocesamiento que se usa en evaluación (sin augmentation).
    """
    transform = transforms.Compose([
        transforms.Resize(INPUT_SIZE),
        transforms.ToTensor(),
        transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
    ])

    img = Image.open(image_path).convert("RGB")
    tensor = transform(img)
    # unsqueeze(0) agrega la dimensión de batch: (3, 224, 224) → (1, 3, 224, 224)
    return tensor.unsqueeze(0)


# ─── Predicción ───────────────────────────────────────────────────────────────

@torch.no_grad()
def predict(image_path: str, model=None, device: str = DEVICE) -> dict:
    """
    Clasifica una imagen de hoja de vid.

    Returns:
        {
            "class": "oidio",
            "display_name": "Oídio (Powdery Mildew)",
            "confidence": 0.97,
            "probabilities": {"Sana": 0.01, "Oídio": 0.97, "Peronospora": 0.02}
        }
    """
    if model is None:
        checkpoint = torch.load(str(BEST_MODEL_PATH), map_location=device, weights_only=False)
        model_name = MODEL_NAME
        if isinstance(checkpoint, dict):
            model_name = checkpoint.get("model_name", MODEL_NAME)
        model = load_model(str(BEST_MODEL_PATH), model_name=model_name, device=device)

    image = preprocess_image(image_path).to(device)
    logits = model(image)
    probabilities = F.softmax(logits, dim=1).squeeze()  # (3,)

    pred_idx = probabilities.argmax().item()
    pred_class = IDX_TO_CLASS[pred_idx]
    confidence = probabilities[pred_idx].item()

    prob_dict = {}
    for i in range(len(IDX_TO_CLASS)):
        cls_name = CLASS_DISPLAY_NAMES[IDX_TO_CLASS[i]]
        prob_dict[cls_name] = probabilities[i].item()

    return {
        "class": pred_class,
        "display_name": CLASS_DISPLAY_NAMES[pred_class],
        "confidence": confidence,
        "probabilities": prob_dict,
    }


# ─── Resolución de paths ──────────────────────────────────────────────────────

VALID_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}


def resolve_image_paths(paths: list) -> list:
    """
    Dado una lista de paths (archivos o carpetas), devuelve
    una lista plana de archivos de imagen válidos.
    """
    resolved = []
    for p in paths:
        path = Path(p)
        if path.is_dir():
            # Escanear carpeta recursivamente
            images = sorted(
                f for f in path.rglob("*")
                if f.is_file() and f.suffix.lower() in VALID_EXTENSIONS
            )
            if not images:
                print(f"  ⚠️  No se encontraron imágenes en: {path}")
            resolved.extend(images)
        elif path.is_file():
            resolved.append(path)
        else:
            print(f"  ✗ No encontrada: {p}")
    return resolved


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Clasificar imágenes de hojas de vid",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Ejemplos:\n"
               "  python src/predict.py ~/Desktop/hoja.jpg\n"
               "  python src/predict.py ~/Desktop/mis_hojas/",
    )
    parser.add_argument(
        "images",
        nargs="+",
        type=str,
        help="Ruta(s) a imágenes o carpetas con imágenes",
    )
    parser.add_argument(
        "--checkpoint",
        type=str,
        default=str(BEST_MODEL_PATH),
        help="Ruta al checkpoint del modelo",
    )
    args = parser.parse_args()

    # Resolver carpetas → lista de imágenes
    image_files = resolve_image_paths(args.images)
    if not image_files:
        print("No se encontraron imágenes para clasificar.")
        return

    # Cargar modelo una sola vez
    checkpoint = torch.load(args.checkpoint, map_location=DEVICE, weights_only=False)
    model_name = MODEL_NAME
    if isinstance(checkpoint, dict):
        model_name = checkpoint.get("model_name", MODEL_NAME)
    model = load_model(args.checkpoint, model_name=model_name, device=DEVICE)

    print(f"\n{'='*60}")
    print(f"  DetectVID — Predicción ({len(image_files)} imágenes)")
    print(f"  Dispositivo: {DEVICE.upper()}")
    print(f"{'='*60}\n")

    for path in image_files:

        result = predict(str(path), model=model)

        # Barra visual de confianza
        conf = result["confidence"]
        bar_len = 30
        filled = int(bar_len * conf)
        bar = "█" * filled + "░" * (bar_len - filled)

        # Emoji según la clase
        emoji = {"healthy": "🍃", "oidio": "🦠", "peronospora": "🍂"}.get(result["class"], "🔍")

        print(f"  📷 {path.name}")
        print(f"  {emoji} {result['display_name']}")
        print(f"  {bar} {conf*100:.1f}%")
        print()

        # Mostrar todas las probabilidades
        for cls_name, prob in sorted(result["probabilities"].items(), key=lambda x: -x[1]):
            indicator = "→" if prob == conf else " "
            print(f"    {indicator} {cls_name:<30} {prob*100:.1f}%")
        print()


if __name__ == "__main__":
    main()
