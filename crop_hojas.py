"""
crop_hojas.py — Segmenta la hoja del fondo y guarda versiones recortadas en mis-hojas-cropped.

Estrategia de crop:
  1. Intentamos GrabCut (OpenCV) con inicialización automática via bounding box central.
     GrabCut hace segmentación iterativa foreground/background.
  2. Si GrabCut falla o da máscara vacía, caemos en un crop inteligente por color:
     convertimos a HSV y filtramos tonos verdes/marrones/grises que corresponden a hojas.
  3. Fallback final: crop central del 80% de la imagen (al menos elimina bordes irrelevantes).

La imagen recortada se guarda con el MISMO nombre de archivo en mis-hojas-cropped/.
"""

import sys
import traceback
from pathlib import Path

import numpy as np
from PIL import Image

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False
    print("  ⚠️  OpenCV no instalado. Usando solo crop por color HSV.")

# ── Rutas ──────────────────────────────────────────────────────────────────────
MIS_HOJAS_DIR = Path.home() / "Desktop" / "mis-hojas"
CROPPED_DIR   = Path.home() / "Desktop" / "mis-hojas-cropped"
VALID_EXT     = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}


# ── Estrategia 1: GrabCut ──────────────────────────────────────────────────────
def crop_grabcut(img_rgb: np.ndarray) -> np.ndarray | None:
    """Usa GrabCut de OpenCV para encontrar la hoja y recortar el bounding box.
    NO toca los píxeles — solo elimina el espacio sobrante alrededor de la hoja."""
    if not HAS_CV2:
        return None

    h, w = img_rgb.shape[:2]
    img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)

    # Rect inicial: margen del 10% en cada borde
    margin_x = max(int(w * 0.10), 5)
    margin_y = max(int(h * 0.10), 5)
    rect = (margin_x, margin_y, w - 2 * margin_x, h - 2 * margin_y)

    mask      = np.zeros((h, w), np.uint8)
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)

    try:
        cv2.grabCut(img_bgr, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
    except Exception:
        return None

    # Foreground definitivo + probable foreground
    fg_mask = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

    if fg_mask.sum() < (h * w * 0.05):  # Menos del 5% → falló
        return None

    # Crop al bounding box del foreground — SIN tocar los píxeles originales
    coords = cv2.findNonZero(fg_mask)
    if coords is None:
        return None
    x, y, rw, rh = cv2.boundingRect(coords)
    padding = 10
    x1 = max(0, x - padding)
    y1 = max(0, y - padding)
    x2 = min(w, x + rw + padding)
    y2 = min(h, y + rh + padding)
    return img_rgb[y1:y2, x1:x2]  # Píxeles originales intactos, solo recortados


# ── Estrategia 2: Segmentación por color HSV ───────────────────────────────────
def crop_hsv(img_rgb: np.ndarray) -> np.ndarray:
    """
    Filtra píxeles que NO corresponden a colores de hoja (verdes, amarillos, marrones).
    Hace un bounding-box del contenido relevante.
    """
    # Convertir a HSV
    img_hsv = np.array(Image.fromarray(img_rgb).convert("HSV"))

    # Rango de colores de hoja:
    # Verde sano: H≈60-170, Verde enfermo (oidio blanco/gris): S<50 
    # Marrón/peronospora: H≈10-30
    h_ch = img_hsv[:, :, 0]
    s_ch = img_hsv[:, :, 1]
    v_ch = img_hsv[:, :, 2]

    # Máscara de "fondo probable" = cielo azul, suelo beige claro, blanco puro
    sky_mask   = (h_ch >= 150) & (h_ch <= 200) & (s_ch > 60)   # azul cielo
    white_mask = (v_ch > 230) & (s_ch < 30)                     # blanco/gris muy claro (fondo plano)
    bg_mask    = sky_mask | white_mask

    fg_mask = (~bg_mask).astype(np.uint8) * 255

    # Encontrar bounding box del foreground
    rows_with_fg = np.any(fg_mask > 0, axis=1)
    cols_with_fg = np.any(fg_mask > 0, axis=0)

    if not rows_with_fg.any():
        # Fallback: crop central 80%
        ph, pw = img_rgb.shape[:2]
        margin_y, margin_x = int(ph * 0.1), int(pw * 0.1)
        return img_rgb[margin_y:ph-margin_y, margin_x:pw-margin_x]

    row_min, row_max = np.where(rows_with_fg)[0][[0, -1]]
    col_min, col_max = np.where(cols_with_fg)[0][[0, -1]]

    # Pequeño padding
    h, w = img_rgb.shape[:2]
    row_min = max(0, row_min - 5)
    row_max = min(h, row_max + 5)
    col_min = max(0, col_min - 5)
    col_max = min(w, col_max + 5)

    return img_rgb[row_min:row_max, col_min:col_max]


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    CROPPED_DIR.mkdir(exist_ok=True)
    images = sorted(f for f in MIS_HOJAS_DIR.iterdir() if f.suffix.lower() in VALID_EXT)

    print(f"\n{'═'*65}")
    print(f"  Crop inteligente de hojas — {len(images)} imágenes")
    print(f"  Destino: {CROPPED_DIR}")
    print(f"{'═'*65}\n")

    for img_path in images:
        try:
            pil_img  = Image.open(img_path).convert("RGB")
            img_rgb  = np.array(pil_img)
            h, w     = img_rgb.shape[:2]

            # Intentar GrabCut primero
            cropped_arr = crop_grabcut(img_rgb)
            method = "GrabCut"

            if cropped_arr is None:
                cropped_arr = crop_hsv(img_rgb)
                method = "HSV"

            # Asegurarse de que el crop no sea absurdamente pequeño
            ch, cw = cropped_arr.shape[:2]
            if ch < 50 or cw < 50:
                # Fallback: 80% central
                margin_y, margin_x = int(h * 0.10), int(w * 0.10)
                cropped_arr = img_rgb[margin_y:h-margin_y, margin_x:w-margin_x]
                method = "Central80%"

            # Guardar con el mismo nombre (forzar .jpg para uniformidad)
            out_name = img_path.with_suffix(".jpg").name
            out_path = CROPPED_DIR / out_name
            Image.fromarray(cropped_arr).save(out_path, quality=92)

            ch, cw = cropped_arr.shape[:2]
            print(f"  ✅ {img_path.name:<30} [{method}]  {w}×{h} → {cw}×{ch}")

        except Exception as e:
            print(f"  ❌ {img_path.name:<30} Error: {e}")
            traceback.print_exc()

    print(f"\n  Imágenes guardadas en: {CROPPED_DIR}\n")


if __name__ == "__main__":
    main()
