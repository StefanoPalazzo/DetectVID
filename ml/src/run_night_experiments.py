#!/usr/bin/env python3
"""
run_night_experiments.py — Lanzador automático para dejar entrenando toda la noche.
Ejecuta 4 experimentos inyectando variables de entorno para sobreescribir config.py.

Uso:
    cd ml
    python src/run_night_experiments.py
"""

import os
import subprocess
import sys
from pathlib import Path

# Lista de experimentos a correr
# Cada string corresponde a un valor que config.py va a leer en OVERRIDE_EXP
EXPERIMENTS = [
    "exp28", # Zoom extremo + Color leve
    "exp29", # Zoom extremo + Local Sun Glare
    "exp30", # Zoom extremo + Gaussian Blur
    "exp31", # Zoom extremo sin color (solo recortes geométricos)
]

def run():
    print("===============================================================")
    print(" INICIANDO BATERÍA DE EXPERIMENTOS NOCTURNOS")
    print(f" Experimentos programados: {len(EXPERIMENTS)}")
    print("===============================================================\n")

    project_root = Path(__file__).parent.parent

    for exp in EXPERIMENTS:
        print(f"\n>>> ARRANCANDO {exp.upper()} <<<")
        
        # Copiamos el entorno actual para no perder el virtualenv ni wandb credentials
        env = os.environ.copy()
        env["OVERRIDE_EXP"] = exp
        
        # Comando para entrenar
        cmd = ["python", "src/train.py"]
        
        try:
            # Ejecutamos train.py con el env modificado
            # subprocess.run bloqueará hasta que termine el entrenamiento de este experimento
            result = subprocess.run(cmd, env=env, cwd=project_root)
            
            if result.returncode != 0:
                print(f"\n[!] El experimento {exp} falló con código {result.returncode}. Pasando al siguiente...")
            else:
                print(f"\n[✓] Experimento {exp} completado exitosamente.")
                
        except KeyboardInterrupt:
            print("\n[!] Batería de experimentos cancelada por el usuario.")
            sys.exit(1)
        except Exception as e:
            print(f"\n[!] Error inesperado al correr {exp}: {e}")

    print("\n===============================================================")
    print(" BATERÍA DE EXPERIMENTOS NOCTURNOS FINALIZADA")
    print(" ¡A revisar los _best.pth mañana a la mañana!")
    print("===============================================================\n")


if __name__ == "__main__":
    run()
