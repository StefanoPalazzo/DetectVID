"""
eval_mis_hojas.py — Evalúa el modelo exp13 contra mis-hojas del escritorio.

Infiere la clase real desde el nombre del archivo:
  - healthy* → healthy
  - oidio*   → oidio
  - pero*    → peronospora

Muestra:
  - Resultado por imagen (predicho vs real)
  - Accuracy y tabla de confusión por clase
  - Análisis de fallos (qué confundió con qué)
"""

import sys
import json
from pathlib import Path
from collections import defaultdict

import torch
import torch.nn.functional as F
from torchvision import transforms
from PIL import Image

# ── Setup de paths ─────────────────────────────────────────────────────────────
ML_DIR = Path(__file__).parent / "ml"
sys.path.insert(0, str(ML_DIR / "src"))

from config import (
    DEVICE, INPUT_SIZE, IMAGENET_MEAN, IMAGENET_STD,
    BEST_MODEL_PATH, IDX_TO_CLASS, CLASS_DISPLAY_NAMES, MODEL_NAME,
)
from model import load_model

# ── Configuración ──────────────────────────────────────────────────────────────
MIS_HOJAS_DIR = Path.home() / "Desktop" / "mis-hojas"
CROPPED_DIR   = Path.home() / "Desktop" / "mis-hojas-cropped"


# ── Inferir clase real desde nombre de archivo ─────────────────────────────────
def infer_ground_truth(filename: str) -> str | None:
    name = filename.lower()
    if name.startswith("healthy"):
        return "healthy"
    elif name.startswith("oidio"):
        return "oidio"
    elif name.startswith("pero"):
        return "peronospora"
    return None


# ── Preprocesamiento ───────────────────────────────────────────────────────────
def build_transform():
    return transforms.Compose([
        transforms.Resize(INPUT_SIZE),
        transforms.ToTensor(),
        transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
    ])


@torch.no_grad()
def predict_image(image_path: Path, model, transform, device: str) -> dict:
    img = Image.open(image_path).convert("RGB")
    tensor = transform(img).unsqueeze(0).to(device)
    logits = model(tensor)
    probs = F.softmax(logits, dim=1).squeeze()
    pred_idx = probs.argmax().item()
    pred_class = IDX_TO_CLASS[pred_idx]
    confidence = probs[pred_idx].item()
    prob_dict = {IDX_TO_CLASS[i]: probs[i].item() for i in range(len(IDX_TO_CLASS))}
    return {"class": pred_class, "confidence": confidence, "probabilities": prob_dict}


# ── Evaluación ─────────────────────────────────────────────────────────────────
def evaluate(folder: Path, model, transform, checkpoint_name: str, label: str = "ORIGINAL"):
    VALID_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}
    images = sorted(f for f in folder.iterdir() if f.suffix.lower() in VALID_EXT)

    results = []
    per_class_correct   = defaultdict(int)
    per_class_total     = defaultdict(int)
    confusion           = defaultdict(lambda: defaultdict(int))

    print(f"\n{'═'*70}")
    print(f"  DetectVID — Evaluación [{label}]  ({len(images)} imágenes)")
    print(f"  Modelo: {checkpoint_name}")
    print(f"  Carpeta: {folder}")
    print(f"{'═'*70}\n")

    for img_path in images:
        gt = infer_ground_truth(img_path.name)
        if gt is None:
            print(f"  ⚠️  {img_path.name} — No se puede inferir clase real. Saltando.")
            continue

        result = predict_image(img_path, model, transform, DEVICE)
        pred   = result["class"]
        conf   = result["confidence"]
        correct = (pred == gt)

        per_class_total[gt]   += 1
        per_class_correct[gt] += int(correct)
        confusion[gt][pred]   += 1

        tick = "✅" if correct else "❌"
        gt_display   = CLASS_DISPLAY_NAMES.get(gt, gt)
        pred_display = CLASS_DISPLAY_NAMES.get(pred, pred)

        print(f"  {tick} {img_path.name:<30} Real: {gt_display:<30} → Pred: {pred_display:<30}  ({conf*100:.1f}%)")
        if not correct:
            probs = result["probabilities"]
            for cls, p in sorted(probs.items(), key=lambda x: -x[1]):
                bar = "█" * int(20 * p) + "░" * (20 - int(20 * p))
                print(f"       {bar} {CLASS_DISPLAY_NAMES.get(cls, cls):<28} {p*100:.1f}%")

        results.append({"file": img_path.name, "gt": gt, "pred": pred, "conf": conf, "correct": correct})

    # ── Resumen por clase ──────────────────────────────────────────────────────
    total_correct = sum(per_class_correct.values())
    total_imgs    = sum(per_class_total.values())
    overall_acc   = total_correct / total_imgs if total_imgs > 0 else 0

    print(f"\n{'─'*70}")
    print(f"  RESULTADOS [{label}]")
    print(f"{'─'*70}")
    print(f"  {'Clase':<30} {'Correctas':<12} {'Total':<8} {'Accuracy'}")
    print(f"  {'─'*60}")
    for cls in ["healthy", "oidio", "peronospora"]:
        if per_class_total[cls] == 0:
            continue
        acc = per_class_correct[cls] / per_class_total[cls]
        bar = "█" * int(10 * acc) + "░" * (10 - int(10 * acc))
        name = CLASS_DISPLAY_NAMES.get(cls, cls)
        print(f"  {name:<30} {per_class_correct[cls]}/{per_class_total[cls]:<10}  {bar}  {acc*100:.1f}%")

    print(f"  {'─'*60}")
    print(f"  {'TOTAL':<30} {total_correct}/{total_imgs:<10}  {overall_acc*100:.1f}%")

    # ── Matriz de confusión simplificada ───────────────────────────────────────
    print(f"\n  Matriz de confusión (real → predicho):")
    classes = ["healthy", "oidio", "peronospora"]
    header  = f"  {'':>14}" + "".join(f"  {CLASS_DISPLAY_NAMES.get(c,'')[:12]:<14}" for c in classes)
    print(header)
    for real in classes:
        if per_class_total[real] == 0:
            continue
        row = f"  {CLASS_DISPLAY_NAMES.get(real,'')[:12]:<14}"
        for pred_cls in classes:
            cnt = confusion[real][pred_cls]
            row += f"  {cnt:<14}"
        print(row)

    print()
    return results, overall_acc


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=str, default=str(BEST_MODEL_PATH))
    args = parser.parse_args()
    
    ckpt_path = Path(args.checkpoint)

    print(f"\n  Cargando modelo {ckpt_path.name}...")
    checkpoint = torch.load(str(ckpt_path), map_location=DEVICE, weights_only=False)
    model_name = MODEL_NAME
    num_classes = 3
    if isinstance(checkpoint, dict):
        model_name = checkpoint.get("model_name", MODEL_NAME)
        num_classes = checkpoint.get("num_classes", 3)
    model = load_model(str(ckpt_path), model_name=model_name, num_classes=num_classes, device=DEVICE)
    transform = build_transform()

    # Evaluación 1: imágenes originales
    results_orig, acc_orig = evaluate(MIS_HOJAS_DIR, model, transform, ckpt_path.name, label="ORIGINAL")

    # Evaluación 2: imágenes croppeadas (si existen)
    if CROPPED_DIR.exists() and any(CROPPED_DIR.iterdir()):
        results_crop, acc_crop = evaluate(CROPPED_DIR, model, transform, ckpt_path.name, label="CROPPED")
        delta = acc_crop - acc_orig
        sign  = "+" if delta >= 0 else ""
        print(f"\n{'═'*70}")
        print(f"  COMPARATIVA: Original vs Cropped")
        print(f"{'─'*70}")
        print(f"  Original : {acc_orig*100:.1f}%")
        print(f"  Cropped  : {acc_crop*100:.1f}%")
        print(f"  Delta    : {sign}{delta*100:.1f}%  {'✅ MEJORÓ' if delta > 0 else ('➖ IGUAL' if delta == 0 else '❌ EMPEORÓ')}")
        print(f"{'═'*70}\n")
    else:
        print(f"\n  ℹ️  No se encontraron imágenes en {CROPPED_DIR}.")
        print(f"     Corré primero el script crop_hojas.py para generar la carpeta.\n")


if __name__ == "__main__":
    main()
