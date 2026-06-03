import sys
import os
import torch
import torch.nn.functional as F
from pathlib import Path

sys.path.insert(0, str(Path("ml/src").absolute()))
from config import DEVICE
from predict import resolve_image_paths, preprocess_image

# Clases fijas
IDX_TO_CLASS_3 = {0: "healthy", 1: "oidio", 2: "peronospora"}
IDX_TO_CLASS_4 = {0: "healthy", 1: "oidio", 2: "peronospora", 3: "others"}

images_dir = Path.home() / "Desktop" / "mis-hojas"
image_files = resolve_image_paths([str(images_dir)])

checkpoints_dir = Path("ml/checkpoints")
model_files = sorted([f.name for f in checkpoints_dir.glob("*_best.pth")])

print(f"Evaluando {len(image_files)} imágenes en {len(model_files)} modelos...\n")

results = {}

for model_file in model_files:
    checkpoint_path = str(checkpoints_dir / model_file)
    model_name_display = model_file.replace('_best.pth', '')
    
    num_classes = 3 if "3cls" in model_file else 4
    
    # Inferir arquitectura
    if "eff" in model_file or "extended" in model_file:
        model_name = "efficientnet_b0"
    elif "res18" in model_file:
        model_name = "resnet18"
    elif "res50" in model_file:
        model_name = "resnet50"
    elif "mob" in model_file:
        model_name = "mobilenet_v3"
    else:
        continue
        
    try:
        from model import load_model
        # Forzamos num_classes para que los de 3 clases carguen bien
        model = load_model(checkpoint_path, model_name=model_name, num_classes=num_classes, device=DEVICE)
    except Exception as e:
        print(f"Error cargando {model_file}: {e}")
        continue
        
    correctas = 0
    total = len(image_files)
    
    stats = {"healthy": {"aciertos": 0, "total": 0}, 
             "oidio": {"aciertos": 0, "total": 0}, 
             "peronospora": {"aciertos": 0, "total": 0}}
             
    idx_map = IDX_TO_CLASS_4 if num_classes == 4 else IDX_TO_CLASS_3
             
    for img_path in image_files:
        filename = img_path.name.lower()
        
        true_class = None
        if "healthy" in filename:
            true_class = "healthy"
        elif "oidio" in filename:
            true_class = "oidio"
        elif "pero" in filename:
            true_class = "peronospora"
            
        if not true_class:
            total -= 1
            continue
            
        stats[true_class]["total"] += 1
            
        # Predicción manual para sortear dependencias de config.py
        with torch.no_grad():
            image_tensor = preprocess_image(str(img_path)).to(DEVICE)
            logits = model(image_tensor)
            probabilities = F.softmax(logits, dim=1).squeeze()
            pred_idx = probabilities.argmax().item()
            pred_class = idx_map.get(pred_idx, "unknown")
        
        if pred_class == true_class:
            correctas += 1
            stats[true_class]["aciertos"] += 1
            
    acc = (correctas / total) * 100 if total > 0 else 0
    
    results[model_name_display] = {
        "acc": acc,
        "h": stats['healthy']['aciertos'],
        "o": stats['oidio']['aciertos'],
        "p": stats['peronospora']['aciertos']
    }

print("\n=== RANKING DE LOS 24 MODELOS (TEST DE CAMPO) ===")
sorted_results = sorted(results.items(), key=lambda x: x[1]['acc'], reverse=True)

# Separar en Fase 1 y Fase 2
print("\n--- TOP FASE 2 (CLEAN - SIN FONDOS PLANOS) ---")
for name, data in sorted_results:
    if "clean" in name:
        print(f"{data['acc']:5.1f}% | {name:32} | Sana: {data['h']}/7 | Oid: {data['o']}/3 | Pero: {data['p']}/5")

print("\n--- TOP FASE 1 (CON FONDOS PLANOS / ATAJO VISUAL) ---")
for name, data in sorted_results:
    if "clean" not in name:
        print(f"{data['acc']:5.1f}% | {name:32} | Sana: {data['h']}/7 | Oid: {data['o']}/3 | Pero: {data['p']}/5")
