# UpDown

**Juega aquí: https://maletta22.github.io/predictor-graficos/**

Juego web: ves un fragmento de gráfico de velas real (bolsa, FOREX o crypto),
sin saber qué activo es ni de qué fechas, y tienes que adivinar si el precio
**sube** o **baja**. Después se revela la continuación y se compara tu
resultado con el azar.

La especificación completa está en [CLAUDE.md](CLAUDE.md).

## Probarlo en tu ordenador

Desde la carpeta del proyecto:

```
.venv\Scripts\python.exe scripts\serve.py
```

y abre http://127.0.0.1:8000 en el navegador.

## Actualizar los datos

```
.venv\Scripts\python.exe scripts\download_data.py
```
