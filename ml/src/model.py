"""
model.py — Arquitectura del modelo de clasificación de hojas de vid
═══════════════════════════════════════════════════════════════════════

Transfer Learning: usamos un modelo PRE-ENTRENADO en ImageNet y lo adaptamos.

¿Qué es Transfer Learning?
  Imaginate que querés aprender a jugar al fútbol de salón después de haber
  jugado fútbol 11 toda tu vida. No arrancás de cero — ya sabés patear, pasar,
  controlar la pelota. Solo necesitás adaptar esas habilidades al nuevo formato.

  Lo mismo con las redes neuronales: un modelo entrenado en ImageNet (1.2M fotos,
  1000 clases) ya aprendió a detectar bordes, texturas, formas, colores.
  Nosotros solo le enseñamos: "estas texturas = oidio, estas otras = peronospora".

Fine-tuning vs Feature Extraction:
  - Fine-tuning (FREEZE_BACKBONE=False): re-entrena TODO el modelo.
    Las capas del backbone se ajustan a nuestro dominio (hojas de vid).
    Más potente pero más lento.

  - Feature Extraction (FREEZE_BACKBONE=True): congela el backbone y solo
    entrena las capas finales. Más rápido pero menos flexible.
    Útil si el dataset fuera muy chico (<500 imágenes).

Modelos disponibles:
  1. EfficientNet-B0 (default): Mejor ratio accuracy/parámetros.
     Usa Squeeze-and-Excite blocks para atención por canal.
     5.3M params totales, 1280 features de salida.

  2. ResNet18: Arquitectura más simple y directa.
     Residual connections para entrenar redes profundas sin vanishing gradients.
     11.7M params totales, 512 features de salida.
     Es el modelo usado en el notebook Clase_VC de la materia.

Referencia del notebook Clase_VC:
    class ResNet18(nn.Module):
        def __init__(self):
            super().__init__()
            self.base_model = models.resnet18(pretrained=True)
            self.base_model.fc = nn.Linear(self.base_model.fc.in_features, 1)
        def forward(self, x):
            return torch.sigmoid(self.base_model(x))

Nuestro modelo sigue el mismo patrón pero con 3 clases y CrossEntropyLoss
(en vez de BCELoss con sigmoid, porque tenemos clasificación multiclase).
"""

import torch
import torch.nn as nn
from torchvision import models
from typing import Optional

from config import NUM_CLASSES, FREEZE_BACKBONE, MODEL_NAME, USE_COMPILE


class VidLeafClassifier(nn.Module):
    """
    Clasificador de hojas de vid.

    Soporta dos backbones:
    - EfficientNet-B0: más eficiente, mejor accuracy con datasets medianos
    - ResNet18: más simple, más rápido en MPS (Apple Silicon)

    Arquitectura del classifier head:
        Dropout(0.3)         ← previene overfitting desactivando 30% de neuronas
        Linear(N → 512)      ← capa intermedia — aprende features específicas de vid
        ReLU                  ← activación no-lineal
        Dropout(0.2)         ← segundo dropout más suave
        Linear(512 → 3)      ← salida: 3 logits, uno por clase

    ¿Por qué 2 capas en el head y no 1?
    Saltar de 1280 (EfficientNet) → 3 es demasiado abrupto.
    La capa intermedia de 512 le da al modelo espacio para aprender
    representaciones intermedias específicas de nuestro dominio.

    ¿Por qué NO hay Softmax al final?
    CrossEntropyLoss de PyTorch incluye LogSoftmax internamente.
    Si pusiéramos Softmax acá, estaríamos aplicando Softmax dos veces → error.
    """

    def __init__(
        self,
        model_name: str   = MODEL_NAME,
        num_classes: int  = NUM_CLASSES,
        pretrained:  bool = True,
        freeze_backbone: bool = FREEZE_BACKBONE,
    ):
        super().__init__()
        self.model_name = model_name

        if model_name == "efficientnet_b0":
            self._build_efficientnet(num_classes, pretrained, freeze_backbone)
        elif model_name == "resnet18":
            self._build_resnet18(num_classes, pretrained, freeze_backbone)
        else:
            raise ValueError(f"Modelo '{model_name}' no soportado. Usar 'efficientnet_b0' o 'resnet18'.")

    def _build_efficientnet(self, num_classes, pretrained, freeze_backbone):
        """Construye backbone EfficientNet-B0 con head personalizado."""
        weights = models.EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None
        self.backbone = models.efficientnet_b0(weights=weights)

        if freeze_backbone:
            for param in self.backbone.features.parameters():
                param.requires_grad = False

        # EfficientNet-B0: in_features = 1280
        in_features = self.backbone.classifier[1].in_features
        self.backbone.classifier = nn.Sequential(
            nn.Dropout(p=0.3),
            nn.Linear(in_features, 512),
            nn.ReLU(),
            nn.Dropout(p=0.2),
            nn.Linear(512, num_classes),
        )

    def _build_resnet18(self, num_classes, pretrained, freeze_backbone):
        """
        Construye backbone ResNet18 con head personalizado.

        Basado en el notebook Clase_VC:
            self.base_model = models.resnet18(pretrained=True)
            self.base_model.fc = nn.Linear(self.base_model.fc.in_features, 1)

        Diferencia: usamos 3 clases con head de 2 capas en vez de 1 clase binaria.
        """
        weights = models.ResNet18_Weights.IMAGENET1K_V1 if pretrained else None
        self.backbone = models.resnet18(weights=weights)

        if freeze_backbone:
            # Congela todo excepto layer4 y fc
            for name, param in self.backbone.named_parameters():
                if "layer4" not in name and "fc" not in name:
                    param.requires_grad = False

        # ResNet18: in_features = 512
        in_features = self.backbone.fc.in_features
        self.backbone.fc = nn.Sequential(
            nn.Dropout(p=0.3),
            nn.Linear(in_features, 256),
            nn.ReLU(),
            nn.Dropout(p=0.2),
            nn.Linear(256, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass: imagen → logits.

        Input:  tensor de forma (batch_size, 3, 224, 224) — imágenes normalizadas
        Output: tensor de forma (batch_size, 3) — logits crudos (sin softmax)

        Para obtener probabilidades: torch.softmax(output, dim=1)
        Para obtener predicción:     output.argmax(dim=1)
        """
        return self.backbone(x)


# ─── Factory functions ────────────────────────────────────────────────────────

def build_model(
    model_name: str   = MODEL_NAME,
    num_classes: int  = NUM_CLASSES,
    pretrained:  bool = True,
    freeze_backbone: bool = FREEZE_BACKBONE,
    device: Optional[str] = None,
) -> VidLeafClassifier:
    """
    Construye el modelo, lo mueve al dispositivo y opcionalmente lo compila.

    torch.compile() (PyTorch 2.x):
      Analiza el grafo de operaciones del modelo y genera código optimizado.
      En MPS da ~1.3x speedup fusionando kernels de Metal.
      En CUDA da ~1.5-2x con triton.

    Args:
        model_name: "efficientnet_b0" o "resnet18"
        num_classes: número de clases de salida (3)
        pretrained: usar pesos ImageNet (True para transfer learning)
        freeze_backbone: congelar capas del backbone
        device: "cuda", "mps", o "cpu" (None = autodetect)

    Returns:
        Modelo listo para entrenar
    """
    if device is None:
        from config import DEVICE
        device = DEVICE

    model = VidLeafClassifier(
        model_name=model_name,
        num_classes=num_classes,
        pretrained=pretrained,
        freeze_backbone=freeze_backbone,
    )
    model = model.to(device)

    # torch.compile() para optimización de kernels
    if USE_COMPILE and hasattr(torch, "compile"):
        try:
            model = torch.compile(model)
            print(f"[Model] ✓ torch.compile() activado")
        except Exception as e:
            print(f"[Model] ⚠️  torch.compile() no disponible: {e}")

    # Conteo de parámetros
    total     = sum(p.numel() for p in model.parameters())
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    frozen    = total - trainable
    print(f"[Model] {model_name} | Total: {total:,} params | Entrenables: {trainable:,} | Congelados: {frozen:,}")

    return model


def load_model(
    checkpoint_path: str,
    model_name: str  = MODEL_NAME,
    num_classes: int = NUM_CLASSES,
    device: Optional[str] = None,
) -> VidLeafClassifier:
    """
    Carga un modelo desde un checkpoint guardado.

    El checkpoint puede ser:
    - state_dict puro (solo pesos)
    - dict con metadatos: {model_state_dict, epoch, val_loss, ...}
    """
    if device is None:
        from config import DEVICE
        device = DEVICE

    model = VidLeafClassifier(model_name=model_name, num_classes=num_classes, pretrained=False)

    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)

    if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
        state_dict = checkpoint["model_state_dict"]
        epoch = checkpoint.get("epoch", "?")
        val_loss = checkpoint.get("val_loss", "?")
        print(f"[Model] Cargando checkpoint — Época: {epoch} | Val Loss: {val_loss:.4f}")
    else:
        state_dict = checkpoint

    model.load_state_dict(state_dict)
    model = model.to(device)
    model.eval()

    print(f"[Model] ✓ Modelo cargado desde {checkpoint_path}")
    return model
