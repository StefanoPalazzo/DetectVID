FROM python:3.10-slim

WORKDIR /app

# Instalar dependencias del sistema requeridas por algunas librerías (ej. OpenCV si se usara, o para compilar)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Instalar versión CPU de PyTorch para ahorrar muchísimo espacio (~2GB) y RAM en el despliegue
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Instalar el resto de requerimientos sin machacar las versiones CPU de PyTorch
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código fuente (sin checkpoints, que irán por volumen o copiados manuales si no pesan)
COPY api/ ./api/
COPY src/ ./src/

# Exponer el puerto de FastAPI
EXPOSE 8000

# Añadir PYTHONPATH para que los imports de src y api funcionen desde /app
ENV PYTHONPATH=/app

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
