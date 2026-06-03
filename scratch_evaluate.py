import sys
import torch
from pathlib import Path

# Agregar src al path
sys.path.insert(0, str(Path("ml/src").absolute()))

from predict import predict, resolve_image_paths
from config import DEVICE, CLASS_TO_IDX

# Modelos a evaluar (4 clases, fase clean)
model_files = [
    "exp18_4cls_weighted_eff_clean_best.pth",
    "exp19_4cls_weighted_res18_clean_best.pth",
    "exp20_4cls_weighted_mob_clean_best.pth",
    "exp21_4cls_weighted_res50_clean_best.pth",
    "exp22_4cls_under_eff_clean_best.pth",
    "exp23_4cls_under_res18_clean_best.pth"
]

images_dir = Path.home() / "Desktop" / "mis-hojas"
image_files = resolve_image_paths([str(images_dir)])

print(f"Evaluando {len(image_files)} imágenes en {len(model_files)} modelos...\n")

results = {}

for model_file in model_files:
    checkpoint_path = f"ml/checkpoints/{model_file}"
    model_name_display = model_file.replace('_best.pth', '')
    print(f"========================================")
    print(f"Modelo: {model_name_display}")
    
    # Extraer el model_name correcto del checkpoint o nombre del archivo
    if "eff" in model_file:
        model_name = "efficientnet_b0"
    elif "res18" in model_file:
        model_name = "resnet18"
    elif "res50" in model_file:
        model_name = "resnet50"
    elif "mob" in model_file:
        model_name = "mobilenet_v3"
        
    try:
        from model import load_model
        model = load_model(checkpoint_path, model_name=model_name, device=DEVICE)
    except Exception as e:
        print(f"Error cargando {model_file}: {e}")
        continue
        
    correctas = 0
    total = len(image_files)
    
    # Contadores por clase
    stats = {"healthy": {"aciertos": 0, "total": 0}, 
             "oidio": {"aciertos": 0, "total": 0}, 
             "peronospora": {"aciertos": 0, "total": 0}}
             
    for img_path in image_files:
        filename = img_path.name.lower()
        
        # Determinar clase real basada en el nombre del archivo
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
            
        pred = predict(str(img_path), model=model, device=DEVICE)
        pred_class = pred["class"]
        
        if pred_class == true_class:
            correctas += 1
            stats[true_class]["aciertos"] += 1
            
    # Resumen del modelo
    acc = (correctas / total) * 100 if total > 0 else 0
    print(f"Accuracy Total: {correctas}/{total} ({acc:.1f}%)")
    print(f"  - Healthy:     {stats['healthy']['aciertos']}/{stats['healthy']['total']}")
    print(f"  - Oidio:       {stats['oidio']['aciertos']}/{stats['oidio']['total']}")
    print(f"  - Peronospora: {stats['peronospora']['aciertos']}/{stats['peronospora']['total']}\n")
    
    results[model_name_display] = {
        "acc": acc,
        "h": stats['healthy']['aciertos'],
        "o": stats['oidio']['aciertos'],
        "p": stats['peronospora']['aciertos']
    }

print("=== RANKING FINAL ===")
sorted_results = sorted(results.items(), key=lambda x: x[1]['acc'], reverse=True)
for name, data in sorted_results:
    print(f"{data['acc']:5.1f}% | {name:32} | Sana: {data['h']}/7 | Oid: {data['o']}/3 | Pero: {data['p']}/5")
