"""
train.py — Loop de entrenamiento con barra de progreso, AMP, W&B y feedback visual
════════════════════════════════════════════════════════════════════════════════════

Ejecutar (run manual sin W&B obligatorio):
    python src/train.py

Ejecutar desde experiments.py (con W&B):
    python src/experiments.py

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
  checkpointing, AMP (mixed precision), W&B tracking y barras de progreso.

Rendimiento esperado en tu MacBook Pro M4 Pro:
  - Batch=64, EfficientNet-B0: ~0.5s/batch → ~55s/epoch → ~27min total (30 épocas)
  - Batch=64, ResNet18: ~0.3s/batch → ~33s/epoch → ~16min total (30 épocas)
"""

import sys
import os
import time
import json
from pathlib import Path
from typing import Dict, Optional, Tuple

import torch
import torch.nn as nn
import torch.optim as optim
from torch.optim.lr_scheduler import ReduceLROnPlateau
from torch.utils.data import DataLoader
from tqdm import tqdm
import numpy as np
from sklearn.metrics import (
    classification_report, confusion_matrix,
    roc_auc_score, roc_curve,
    precision_recall_fscore_support,
)

sys.path.insert(0, str(Path(__file__).parent))

from config import (
    DEVICE, NUM_EPOCHS, LEARNING_RATE, WEIGHT_DECAY, LABEL_SMOOTHING,
    EARLY_STOPPING_PATIENCE, EARLY_STOPPING_DELTA,
    LR_SCHEDULER_PATIENCE, LR_SCHEDULER_FACTOR, LR_SCHEDULER_MIN_LR,
    BATCH_SIZE, CHECKPOINTS_DIR, BEST_MODEL_PATH, LAST_MODEL_PATH,
    RESULTS_DIR, RANDOM_SEED, NUM_CLASSES, MODEL_NAME,
    DATASET_MODE, SPLIT_MODE, BALANCING_MODE,
    FREEZE_BACKBONE, AUGMENTATION_CONFIG,
    WANDB_PROJECT, WANDB_ENTITY,
)
from dataset import get_dataloaders
from model import build_model


# ─── W&B — importación opcional ──────────────────────────────────────────────
#
# Si wandb no está instalado o no está configurado, el training sigue funcionando.
# Solo se desactiva el tracking remoto — todo lo demás es idéntico.

try:
    import wandb
    _WANDB_DISPONIBLE = True
except ImportError:
    _WANDB_DISPONIBLE = False
    print("[W&B] wandb no instalado — training sin tracking remoto")
    print("      Para instalar: pip install wandb")


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
    """
    device_type = str(device).split(":")[0]

    if device_type == "cuda":
        use_autocast = True
        scaler = torch.amp.GradScaler("cuda")
        print(f"  AMP       : ✓ CUDA (autocast + GradScaler)")
    elif device_type == "mps":
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
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)

        optimizer.zero_grad()

        with torch.amp.autocast(device_type=device_type, enabled=use_autocast):
            outputs = model(images)
            loss    = criterion(outputs, labels)

        if scaler is not None:
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            scaler.step(optimizer)
            scaler.update()
        else:
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

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

@torch.no_grad()
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
    """
    model.eval()
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
    experiment_id:  str           = "manual_run",
    dataset_mode:   str           = DATASET_MODE,
    split_mode:     Optional[str] = SPLIT_MODE,
    balancing_mode: str           = BALANCING_MODE,
    model_name:     str           = MODEL_NAME,
    num_epochs:     int           = NUM_EPOCHS,
    batch_size:     int           = BATCH_SIZE,
    learning_rate:  float         = LEARNING_RATE,
    device:         str           = DEVICE,
    wandb_enabled:  bool          = True,
) -> Dict:
    """
    Loop de entrenamiento principal con soporte W&B.

    Equivalente al bloque del notebook Clase_VC:
        for epoch in range(num_epochs):
            train_loss, train_acc = train(model, train_dataloader, criterion, optimizer, device)
            val_loss, val_acc = validate(model, val_dataloader, criterion, device)
            if val_loss < best_val_loss:
                torch.save(model.state_dict(), checkpoint_path)

    Pero con: AMP, early stopping, LR scheduling, W&B tracking y logging detallado.

    Args:
        experiment_id:  nombre del experimento (se usa como nombre del run en W&B)
        dataset_mode:   qué clases/fuentes incluir ("3cls_no_zenodo", "3cls_zenodo", "4cls_zenodo")
        split_mode:     estrategia de split (None, "split_respected", "split_mixed")
        balancing_mode: estrategia de balanceo ("weighted_full", "undersampled")
        model_name:     arquitectura ("efficientnet_b0", "resnet18")
        num_epochs:     épocas máximas de entrenamiento
        batch_size:     tamaño del batch
        learning_rate:  tasa de aprendizaje inicial
        device:         dispositivo ("cuda", "mps", "cpu")
        wandb_enabled:  True = loguear a W&B si está disponible

    Returns:
        Dict con historial de métricas (train_loss, val_loss, etc.)
    """
    set_seed()

    # ── Calcular NUM_CLASSES según el modo ─────────────────────────────────
    num_classes = 4 if dataset_mode == "4cls_zenodo" else 3

    # ── Inicializar W&B ────────────────────────────────────────────────────
    # Si wandb no está disponible o no está configurado, continuamos sin él.
    _wandb_activo = False

    if wandb_enabled and _WANDB_DISPONIBLE:
        try:
            init_kwargs = dict(
                project=WANDB_PROJECT,
                name=experiment_id,
                config={
                    "model_name":       model_name,
                    "dataset_mode":     dataset_mode,
                    "split_mode":       split_mode,
                    "balancing_mode":   balancing_mode,
                    "num_epochs":       num_epochs,
                    "batch_size":       batch_size,
                    "learning_rate":    learning_rate,
                    "weight_decay":     WEIGHT_DECAY,
                    "label_smoothing":  LABEL_SMOOTHING,
                    "freeze_backbone":  FREEZE_BACKBONE,
                    "num_classes":      num_classes,
                    "augmentation":     AUGMENTATION_CONFIG,
                    "device":           str(device),
                },
                tags=[
                    model_name,
                    dataset_mode,
                    split_mode or "no_split",
                    balancing_mode,
                ],
            )
            # Solo pasar entity si está configurado — si es None lo omitimos
            # para que wandb use el default configurado en el sistema
            if WANDB_ENTITY is not None:
                init_kwargs["entity"] = WANDB_ENTITY

            wandb.init(**init_kwargs)
            _wandb_activo = True
            print(f"[W&B] ✓ Run iniciado: {experiment_id} | Proyecto: {WANDB_PROJECT}")

        except Exception as e:
            print(f"[W&B] ⚠️  No se pudo inicializar W&B: {e}")
            print(f"[W&B]    Continuando sin tracking remoto")
            _wandb_activo = False

    # ── AMP setup ─────────────────────────────────────────────────────────
    use_autocast, scaler, device_type = _setup_amp(device)

    CHECKPOINTS_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\n{'═'*70}")
    print(f"  DetectVID — Entrenamiento")
    print(f"  Experimento : {experiment_id}")
    print(f"  Dataset     : {dataset_mode} | Split: {split_mode} | Balanceo: {balancing_mode}")
    print(f"  Dispositivo : {device.upper()}")
    print(f"  Modelo      : {model_name} | Clases: {num_classes}")
    print(f"  Épocas máx  : {num_epochs}  |  Batch size : {batch_size}  |  LR : {learning_rate:.1e}")
    print(f"{'═'*70}\n")

    # ── Datos ─────────────────────────────────────────────────────────────
    train_loader, val_loader, test_loader, split_info = get_dataloaders(
        batch_size=batch_size,
        dataset_mode=dataset_mode,
        split_mode=split_mode,
        balancing_mode=balancing_mode,
    )
    class_weights = split_info["class_weights"].to(device)

    # ── Modelo ────────────────────────────────────────────────────────────
    model = build_model(model_name=model_name, num_classes=num_classes, device=device)

    # ── Loss function ─────────────────────────────────────────────────────
    # CrossEntropyLoss: la función de pérdida estándar para clasificación multiclase.
    #
    # label_smoothing=0.1: en vez de target=[0, 1, 0], usa target=[0.033, 0.933, 0.033]
    # Esto previene que el modelo sea "demasiado seguro" → mejor calibración.
    #
    # weight=class_weights: penaliza más los errores en clases minoritarias.
    criterion = nn.CrossEntropyLoss(
        label_smoothing=LABEL_SMOOTHING,
        weight=class_weights,
    )

    # ── Optimizer ─────────────────────────────────────────────────────────
    # AdamW: la versión mejorada de Adam con weight decay correctamente implementado.
    optimizer = optim.AdamW(
        model.parameters(),
        lr=learning_rate,
        weight_decay=WEIGHT_DECAY,
    )

    # ── LR Scheduler ──────────────────────────────────────────────────────
    scheduler = ReduceLROnPlateau(
        optimizer,
        mode="min",
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
    best_val_acc   = 0.0
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

        # ── Loguear a W&B ─────────────────────────────────────────────────
        if _wandb_activo:
            try:
                wandb.log({
                    "epoch":        epoch,
                    "train/loss":   train_loss,
                    "train/acc":    train_acc,
                    "val/loss":     val_loss,
                    "val/acc":      val_acc,
                    "learning_rate": current_lr,
                })
            except Exception as e:
                print(f"[W&B] ⚠️  Error al loguear época {epoch}: {e}")

        # ── ¿Es el mejor modelo? ─────────────────────────────────────────
        is_best = val_loss < best_val_loss - EARLY_STOPPING_DELTA

        if is_best:
            best_val_loss = val_loss
            best_val_acc  = val_acc
            # Nombre de checkpoint por experimento para no sobreescribir entre runs
            checkpoint_path = CHECKPOINTS_DIR / f"{experiment_id}_best.pth"
            torch.save(
                {
                    "epoch":            epoch,
                    "model_state_dict": model.state_dict(),
                    "optimizer_state":  optimizer.state_dict(),
                    "val_loss":         val_loss,
                    "val_acc":          val_acc,
                    "train_loss":       train_loss,
                    "train_acc":        train_acc,
                    "model_name":       model_name,
                    "dataset_mode":     dataset_mode,
                    "split_mode":       split_mode,
                    "balancing_mode":   balancing_mode,
                    "num_classes":      num_classes,
                    "experiment_id":    experiment_id,
                },
                checkpoint_path,
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
        lr_tag   = f"  ↓LR {prev_lr:.1e}→{current_lr:.1e}" if current_lr < prev_lr else ""
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
    last_checkpoint_path = CHECKPOINTS_DIR / f"{experiment_id}_last.pth"
    torch.save(
        {
            "epoch":            last_epoch,
            "model_state_dict": model.state_dict(),
            "val_loss":         val_loss,
            "val_acc":          val_acc,
            "model_name":       model_name,
            "experiment_id":    experiment_id,
        },
        last_checkpoint_path,
    )

    total_time = time.time() - training_start
    total_min, total_sec = divmod(int(total_time), 60)

    print(f"\n{'═'*70}")
    print(f"  Entrenamiento finalizado en {total_min}m {total_sec:02d}s")
    print(f"  Mejor val_loss : {best_val_loss:.4f}  |  Mejor val_acc: {best_val_acc:.3f}")
    print(f"  Checkpoint     : {CHECKPOINTS_DIR / (experiment_id + '_best.pth')}")
    print(f"{'═'*70}\n")

    # ── Evaluación final en test set ──────────────────────────────────────────
    print("\n[Test] Evaluando modelo final en test set...")
    best_checkpoint = CHECKPOINTS_DIR / f"{experiment_id}_best.pth"
    if best_checkpoint.exists():
        checkpoint = torch.load(best_checkpoint, map_location=DEVICE)
        model.load_state_dict(checkpoint["model_state_dict"])
        print(f"  Cargado mejor checkpoint: época {checkpoint['epoch']}")

    model.eval()
    all_preds   = []
    all_labels  = []
    all_probs   = []  # probabilidades por clase para ROC

    with torch.no_grad():
        for images, labels in test_loader:
            images = images.to(DEVICE)
            with torch.autocast(device_type=DEVICE.split(":")[0], enabled=(DEVICE != "cpu")):
                outputs = model(images)
            probs = torch.softmax(outputs, dim=1)
            preds = probs.argmax(dim=1)
            all_preds.extend(preds.cpu().numpy())
            all_labels.extend(labels.numpy())
            all_probs.extend(probs.cpu().numpy())

    all_preds  = np.array(all_preds)
    all_labels = np.array(all_labels)
    all_probs  = np.array(all_probs)

    # Métricas por clase
    precision, recall, f1, support = precision_recall_fscore_support(
        all_labels, all_preds, average=None, zero_division=0
    )
    precision_macro, recall_macro, f1_macro, _ = precision_recall_fscore_support(
        all_labels, all_preds, average="macro", zero_division=0
    )
    test_acc = (all_preds == all_labels).mean()

    print(f"\n  Test accuracy : {test_acc:.4f}")
    print(f"  F1 macro      : {f1_macro:.4f}")
    print(f"  Precision macro: {precision_macro:.4f}")
    print(f"  Recall macro   : {recall_macro:.4f}")
    print("\n" + classification_report(all_labels, all_preds, zero_division=0))

    # ROC AUC (OvR multiclass)
    try:
        if num_classes == 2:
            roc_auc = roc_auc_score(all_labels, all_probs[:, 1])
        else:
            roc_auc = roc_auc_score(all_labels, all_probs, multi_class="ovr", average="macro")
    except Exception:
        roc_auc = None

    # Loguear todo a W&B
    if _wandb_activo:
        try:
            # Métricas escalares
            wandb.summary["test_acc"]        = float(test_acc)
            wandb.summary["test_f1_macro"]   = float(f1_macro)
            wandb.summary["test_precision"]  = float(precision_macro)
            wandb.summary["test_recall"]     = float(recall_macro)
            if roc_auc is not None:
                wandb.summary["test_roc_auc"] = float(roc_auc)

            # Métricas por clase
            class_names = list(range(num_classes))
            for i, name in enumerate(class_names):
                wandb.summary[f"test_f1_cls{name}"]        = float(f1[i])
                wandb.summary[f"test_precision_cls{name}"] = float(precision[i])
                wandb.summary[f"test_recall_cls{name}"]    = float(recall[i])

            # Matriz de confusión como imagen W&B
            cm = confusion_matrix(all_labels, all_preds)
            wandb.log({
                "test/confusion_matrix": wandb.plot.confusion_matrix(
                    probs=None,
                    y_true=all_labels.tolist(),
                    preds=all_preds.tolist(),
                    class_names=[str(i) for i in range(num_classes)],
                ),
                "test/acc":       float(test_acc),
                "test/f1_macro":  float(f1_macro),
                "test/precision": float(precision_macro),
                "test/recall":    float(recall_macro),
            })
            if roc_auc is not None:
                wandb.log({"test/roc_auc": float(roc_auc)})

            print("[W&B] ✓ Métricas de test logueadas")
        except Exception as e:
            print(f"[W&B] ⚠️  Error al loguear métricas de test: {e}")

    # ── Summary de W&B ────────────────────────────────────────────────────
    if _wandb_activo:
        try:
            wandb.summary["best_val_loss"]  = best_val_loss
            wandb.summary["best_val_acc"]   = best_val_acc
            wandb.summary["total_epochs"]   = last_epoch
            wandb.summary["total_time_min"] = round(total_time / 60, 2)
            wandb.finish()
            print(f"[W&B] ✓ Run finalizado: {experiment_id}")
        except Exception as e:
            print(f"[W&B] ⚠️  Error al finalizar run: {e}")

    # ── Guardar historia ──────────────────────────────────────────────────
    history_path = RESULTS_DIR / f"{experiment_id}_history.json"
    with open(history_path, "w") as f:
        json.dump(history, f, indent=2)

    return history


# ─── Entrypoint ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os
    from config import EXPERIMENT_ID
    
    # Si hay un override, usamos el nombre de experimento de config.py
    # Si no, caemos en el default "manual_run"
    override = os.environ.get("OVERRIDE_EXP", None)
    exp_id = EXPERIMENT_ID if override else "manual_run"

    # Compatibilidad hacia atrás: python src/train.py arranca un run manual
    # con los parámetros del config. W&B es opcional — si no está configurado, sigue.
    history = train(
        experiment_id=exp_id,
        wandb_enabled=True,  # intenta conectar pero no falla si no puede
    )
