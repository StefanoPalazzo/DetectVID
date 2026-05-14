"""
train.py — Loop de entrenamiento con barra de progreso, AMP y feedback visual
═══════════════════════════════════════════════════════════════════════════════

Ejecutar:
    python src/train.py

¿Cómo funciona un training loop?
  Es un ciclo que se repite N épocas. Cada época tiene dos fases:

  1. TRAIN: el modelo ve todas las imágenes de entrenamiento en batches
     - Forward pass: imagen → modelo → predicción
     - Loss: ¿qué tan lejos está la predicción de la realidad?
     - Backward pass: calcular gradientes (¿cómo ajustar cada peso?)
     - Optimizer step: ajustar los pesos del modelo

  2. VALIDATE: el modelo ve las imágenes de validación SIN actualizar pesos
     - Solo forward pass → calcular loss y accuracy
     - Sirve para detectar overfitting: si train_loss baja pero val_loss sube,
       el modelo está memorizando en vez de aprendiendo.

  Referencia del notebook Clase_VC:
      for epoch in range(num_epochs):
          train_loss, train_acc = train(model, train_dataloader, criterion, optimizer, device)
          val_loss, val_acc = validate(model, val_dataloader, criterion, device)

  Nuestro loop hace lo mismo pero agrega: early stopping, LR scheduling,
  checkpointing, AMP (mixed precision), y barras de progreso.

Rendimiento esperado en tu MacBook Pro M4 Pro:
  - Batch=64, EfficientNet-B0: ~0.5s/batch → ~55s/epoch → ~27min total (30 épocas)
  - Batch=64, ResNet18: ~0.3s/batch → ~33s/epoch → ~16min total (30 épocas)
"""

import sys
import os
import time
import json
from pathlib import Path
from typing import Dict, Tuple

import torch
import torch.nn as nn
import torch.optim as optim
from torch.optim.lr_scheduler import ReduceLROnPlateau
from torch.utils.data import DataLoader
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).parent))

from config import (
    DEVICE, NUM_EPOCHS, LEARNING_RATE, WEIGHT_DECAY, LABEL_SMOOTHING,
    EARLY_STOPPING_PATIENCE, EARLY_STOPPING_DELTA,
    LR_SCHEDULER_PATIENCE, LR_SCHEDULER_FACTOR, LR_SCHEDULER_MIN_LR,
    BATCH_SIZE, CHECKPOINTS_DIR, BEST_MODEL_PATH, LAST_MODEL_PATH,
    RESULTS_DIR, RANDOM_SEED, NUM_CLASSES, MODEL_NAME,
)
from dataset import get_dataloaders
from model import build_model


# ─── Reproducibilidad ────────────────────────────────────────────────────────

def set_seed(seed: int = RANDOM_SEED) -> None:
    import random
    import numpy as np
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    # cuDNN: selecciona el algoritmo más rápido para cada operación
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = True


# ─── AMP (Automatic Mixed Precision) ─────────────────────────────────────────

def _setup_amp(device: str):
    """
    Configura AMP (Automatic Mixed Precision) según el dispositivo.

    ¿Qué es AMP?
    Normalmente los cálculos usan float32 (32 bits por número).
    AMP mezcla float32 con float16 (16 bits) donde es seguro hacerlo.
    Resultado: ~1.5x más rápido, ~2x menos memoria, sin pérdida de accuracy.

    En CUDA: autocast + GradScaler (float16 necesita scaling para estabilidad)
    En MPS:  autocast SOLAMENTE — GradScaler no está soportado en Metal
    En CPU:  desactivado — no hay beneficio sin hardware especializado

    El bug del código anterior:
        use_amp = (str(device) == "cuda")  # ← MPS quedaba EXCLUIDO
        scaler = torch.amp.GradScaler("cuda", enabled=use_amp)  # ← "cuda" hardcodeado

    La corrección:
        MPS SÍ soporta autocast desde PyTorch 2.0
        Solo GradScaler está limitado a CUDA
    """
    device_type = str(device).split(":")[0]

    if device_type == "cuda":
        # CUDA: AMP completo con GradScaler
        use_autocast = True
        scaler = torch.amp.GradScaler("cuda")
        print(f"  AMP       : ✓ CUDA (autocast + GradScaler)")
    elif device_type == "mps":
        # MPS: solo autocast, sin GradScaler
        use_autocast = True
        scaler = None
        print(f"  AMP       : ✓ MPS (autocast solamente)")
    else:
        use_autocast = False
        scaler = None
        print(f"  AMP       : ✗ CPU (desactivado)")

    return use_autocast, scaler, device_type


# ─── Paso de entrenamiento (1 época) ─────────────────────────────────────────

def train_one_epoch(
    model:     nn.Module,
    loader:    DataLoader,
    criterion: nn.Module,
    optimizer: optim.Optimizer,
    device:    str,
    epoch:     int,
    num_epochs: int,
    use_autocast: bool = False,
    scaler=None,
    device_type: str = "cpu",
) -> Tuple[float, float]:
    """
    Entrena el modelo por una época completa.

    Paso a paso por cada batch (referencia: función train() del notebook Clase_VC):

    1. images, labels = next(batch)       → cargar batch del DataLoader
    2. images = images.to(device)         → mover a GPU (MPS/CUDA)
    3. optimizer.zero_grad()              → limpiar gradientes del paso anterior
    4. outputs = model(images)            → forward pass (predicción)
    5. loss = criterion(outputs, labels)  → calcular error
    6. loss.backward()                    → backward pass (calcular gradientes)
    7. optimizer.step()                   → actualizar pesos del modelo

    Returns:
        (loss_promedio, accuracy) de la época
    """
    model.train()  # Modo entrenamiento: activa Dropout, BatchNorm en modo train
    running_loss = 0.0
    correct = 0
    total   = 0

    pbar = tqdm(
        loader,
        desc=f"  Época {epoch:02d}/{num_epochs} [train]",
        unit="batch",
        leave=False,
        dynamic_ncols=True,
        colour="blue",
    )

    for images, labels in pbar:
        # 1. Mover datos al dispositivo (GPU)
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)

        # 2. Limpiar gradientes del paso anterior
        optimizer.zero_grad()

        # 3. Forward pass con AMP (mixed precision)
        with torch.amp.autocast(device_type=device_type, enabled=use_autocast):
            outputs = model(images)
            loss    = criterion(outputs, labels)

        # 4. Backward pass + optimizer step
        if scaler is not None:
            # CUDA con GradScaler: escala la loss para estabilidad en float16
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            scaler.step(optimizer)
            scaler.update()
        else:
            # MPS / CPU: backward directo sin scaling
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

        # 5. Acumular métricas
        running_loss += loss.item() * images.size(0)
        preds    = outputs.argmax(dim=1)
        correct += (preds == labels).sum().item()
        total   += labels.size(0)

        pbar.set_postfix({
            "loss": f"{running_loss / total:.4f}",
            "acc":  f"{correct / total:.3f}",
        })

    return running_loss / total, correct / total


# ─── Paso de validación ───────────────────────────────────────────────────────

@torch.no_grad()  # Desactiva cálculo de gradientes → más rápido, menos memoria
def validate(
    model:     nn.Module,
    loader:    DataLoader,
    criterion: nn.Module,
    device:    str,
    epoch:     int,
    num_epochs: int,
) -> Tuple[float, float]:
    """
    Evalúa el modelo sobre el set de validación SIN actualizar pesos.

    ¿Por qué @torch.no_grad()?
    En validación no necesitamos gradientes (no vamos a hacer backward).
    Desactivarlos ahorra ~50% de memoria y es ~30% más rápido.

    Referencia del notebook Clase_VC:
        def validate(model, val_dataloader, criterion, device):
            model.eval()
            with torch.no_grad():
                for images, labels in val_dataloader:
                    outputs = model(images)
                    loss = criterion(outputs, labels)
    """
    model.eval()  # Modo evaluación: desactiva Dropout, BatchNorm en modo eval
    running_loss = 0.0
    correct = 0
    total   = 0

    pbar = tqdm(
        loader,
        desc=f"  Época {epoch:02d}/{num_epochs} [val]  ",
        unit="batch",
        leave=False,
        dynamic_ncols=True,
        colour="cyan",
    )

    for images, labels in pbar:
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)

        outputs = model(images)
        loss    = criterion(outputs, labels)

        running_loss += loss.item() * images.size(0)
        preds    = outputs.argmax(dim=1)
        correct += (preds == labels).sum().item()
        total   += labels.size(0)

        pbar.set_postfix({
            "loss": f"{running_loss / total:.4f}",
            "acc":  f"{correct / total:.3f}",
        })

    return running_loss / total, correct / total


# ─── Early Stopping ───────────────────────────────────────────────────────────

class EarlyStopping:
    """
    Detiene el entrenamiento si val_loss no mejora en N épocas.

    ¿Por qué?
    Si el modelo ya convergió (val_loss se estancó), seguir entrenando
    solo hace que memorice el training set → overfitting.
    Es como estudiar de memoria en vez de entender el concepto.
    """
    def __init__(self, patience: int = EARLY_STOPPING_PATIENCE, delta: float = EARLY_STOPPING_DELTA):
        self.patience  = patience
        self.delta     = delta
        self.best_loss = float("inf")
        self.counter   = 0
        self.stop      = False

    def __call__(self, val_loss: float) -> bool:
        if val_loss < self.best_loss - self.delta:
            self.best_loss = val_loss
            self.counter   = 0
        else:
            self.counter += 1
            if self.counter >= self.patience:
                self.stop = True
        return self.stop


# ─── Training loop principal ─────────────────────────────────────────────────

def train(
    num_epochs:    int   = NUM_EPOCHS,
    batch_size:    int   = BATCH_SIZE,
    learning_rate: float = LEARNING_RATE,
    device:        str   = DEVICE,
) -> Dict:
    """
    Loop de entrenamiento principal.

    Equivalente al bloque del notebook Clase_VC:
        for epoch in range(num_epochs):
            train_loss, train_acc = train(model, train_dataloader, criterion, optimizer, device)
            val_loss, val_acc = validate(model, val_dataloader, criterion, device)
            if val_loss < best_val_loss:
                torch.save(model.state_dict(), checkpoint_path)

    Pero con: AMP, early stopping, LR scheduling, logging detallado.
    """
    set_seed()

    # ── AMP setup ─────────────────────────────────────────────────────────
    use_autocast, scaler, device_type = _setup_amp(device)

    CHECKPOINTS_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\n{'═'*70}")
    print(f"  DetectVID — Entrenamiento")
    print(f"  Dispositivo : {device.upper()}")
    print(f"  Modelo      : {MODEL_NAME}")
    print(f"  Épocas máx  : {num_epochs}  |  Batch size : {batch_size}  |  LR : {learning_rate:.1e}")
    print(f"{'═'*70}\n")

    # ── Datos ─────────────────────────────────────────────────────────────
    train_loader, val_loader, test_loader, split_info = get_dataloaders(batch_size=batch_size)
    class_weights = split_info["class_weights"].to(device)

    # ── Modelo ────────────────────────────────────────────────────────────
    model = build_model(model_name=MODEL_NAME, device=device)

    # ── Loss function ─────────────────────────────────────────────────────
    # CrossEntropyLoss: la función de pérdida estándar para clasificación multiclase.
    #
    # ¿Cómo funciona?
    # 1. Toma los logits del modelo (3 valores por imagen)
    # 2. Les aplica softmax para convertirlos en probabilidades
    # 3. Calcula -log(probabilidad de la clase correcta)
    # 4. Mientras más seguro está el modelo de la respuesta correcta, menor la loss
    #
    # label_smoothing=0.1: en vez de target=[0, 1, 0], usa target=[0.033, 0.933, 0.033]
    # Esto previene que el modelo sea "demasiado seguro" → mejor calibración.
    #
    # weight=class_weights: penaliza más los errores en clases minoritarias (oidio).
    criterion = nn.CrossEntropyLoss(
        label_smoothing=LABEL_SMOOTHING,
        weight=class_weights,
    )

    # ── Optimizer ─────────────────────────────────────────────────────────
    # AdamW: la versión mejorada de Adam con weight decay correctamente implementado.
    #
    # ¿Qué hace un optimizer?
    # Toma los gradientes calculados en backward() y decide CUÁNTO ajustar cada peso.
    # Adam mantiene promedios móviles de gradientes → steps más estables.
    #
    # Referencia Clase_VC: optimizer = optim.Adam(model.parameters(), lr=0.001)
    # Nosotros usamos lr=1e-4 (10x menor) porque hacemos fine-tuning, no training from scratch.
    optimizer = optim.AdamW(
        model.parameters(),
        lr=learning_rate,
        weight_decay=WEIGHT_DECAY,
    )

    # ── LR Scheduler ──────────────────────────────────────────────────────
    # Reduce el learning rate automáticamente cuando val_loss se estanca.
    # Analogía: al principio caminás con pasos grandes (lr alto) para llegar rápido
    # cerca del objetivo. Cuando estás cerca, achicás los pasos (lr bajo) para no
    # pasarte de largo.
    scheduler = ReduceLROnPlateau(
        optimizer,
        mode="min",         # minimizar val_loss
        patience=LR_SCHEDULER_PATIENCE,
        factor=LR_SCHEDULER_FACTOR,
        min_lr=LR_SCHEDULER_MIN_LR,
    )

    early_stopping = EarlyStopping()

    history = {
        "train_loss": [], "train_acc": [],
        "val_loss":   [], "val_acc":   [],
        "lr":         [],
    }

    best_val_loss  = float("inf")
    training_start = time.time()
    epoch_times    = []

    # ── Barra exterior: progreso de épocas ────────────────────────────────
    epoch_pbar = tqdm(
        range(1, num_epochs + 1),
        desc="Progreso total",
        unit="época",
        dynamic_ncols=True,
        colour="green",
        position=0,
    )

    print()
    last_epoch = 1

    for epoch in epoch_pbar:
        last_epoch  = epoch
        epoch_start = time.time()

        # ── FASE 1: TRAIN ─────────────────────────────────────────────────
        train_loss, train_acc = train_one_epoch(
            model, train_loader, criterion, optimizer, device, epoch, num_epochs,
            use_autocast=use_autocast, scaler=scaler, device_type=device_type,
        )

        # ── FASE 2: VALIDATE ──────────────────────────────────────────────
        val_loss, val_acc = validate(
            model, val_loader, criterion, device, epoch, num_epochs
        )

        epoch_time = time.time() - epoch_start
        epoch_times.append(epoch_time)
        avg_epoch_time = sum(epoch_times) / len(epoch_times)

        # ── LR scheduling ─────────────────────────────────────────────────
        prev_lr    = optimizer.param_groups[0]["lr"]
        scheduler.step(val_loss)
        current_lr = optimizer.param_groups[0]["lr"]

        history["train_loss"].append(train_loss)
        history["train_acc"].append(train_acc)
        history["val_loss"].append(val_loss)
        history["val_acc"].append(val_acc)
        history["lr"].append(current_lr)

        # ── ¿Es el mejor modelo? ─────────────────────────────────────────
        is_best = val_loss < best_val_loss - EARLY_STOPPING_DELTA

        if is_best:
            best_val_loss = val_loss
            torch.save(
                {
                    "epoch":            epoch,
                    "model_state_dict": model.state_dict(),
                    "optimizer_state":  optimizer.state_dict(),
                    "val_loss":         val_loss,
                    "val_acc":          val_acc,
                    "train_loss":       train_loss,
                    "train_acc":        train_acc,
                    "model_name":       MODEL_NAME,
                },
                BEST_MODEL_PATH,
            )

        # ── ETA ───────────────────────────────────────────────────────────
        epochs_remaining  = num_epochs - epoch
        eta_seconds       = epochs_remaining * avg_epoch_time
        eta_min, eta_sec  = divmod(int(eta_seconds), 60)

        epoch_pbar.set_postfix({
            "val_loss": f"{val_loss:.4f}",
            "val_acc":  f"{val_acc:.3f}",
            "ETA":      f"{eta_min}m{eta_sec:02d}s",
        })

        # ── Resumen de la época ───────────────────────────────────────────
        lr_tag  = f"  ↓LR {prev_lr:.1e}→{current_lr:.1e}" if current_lr < prev_lr else ""
        best_tag = "  ★ MEJOR" if is_best else ""
        tqdm.write(
            f"  Época {epoch:02d}/{num_epochs} │ "
            f"loss {train_loss:.4f}→{val_loss:.4f} │ "
            f"acc  {train_acc:.3f}→{val_acc:.3f} │ "
            f"{epoch_time:.0f}s{lr_tag}{best_tag}"
        )

        # ── Early stopping ────────────────────────────────────────────────
        if early_stopping(val_loss):
            tqdm.write(
                f"\n  [EarlyStopping] Sin mejora en {early_stopping.patience} épocas. "
                f"Deteniendo en época {epoch}."
            )
            break

    epoch_pbar.close()

    # ── Último checkpoint ─────────────────────────────────────────────────
    torch.save(
        {
            "epoch":            last_epoch,
            "model_state_dict": model.state_dict(),
            "val_loss":         val_loss,
            "val_acc":          val_acc,
            "model_name":       MODEL_NAME,
        },
        LAST_MODEL_PATH,
    )

    total_time = time.time() - training_start
    total_min, total_sec = divmod(int(total_time), 60)

    print(f"\n{'═'*70}")
    print(f"  Entrenamiento finalizado en {total_min}m {total_sec:02d}s")
    print(f"  Mejor val_loss : {best_val_loss:.4f}")
    print(f"  Checkpoint     : {BEST_MODEL_PATH}")
    print(f"{'═'*70}\n")
    print("  Para evaluar sobre el test set:")
    print("    python src/evaluate.py\n")

    # ── Guardar historia ──────────────────────────────────────────────────
    history_path = RESULTS_DIR / "training_history.json"
    with open(history_path, "w") as f:
        json.dump(history, f, indent=2)

    return history


# ─── Entrypoint ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    history = train()
