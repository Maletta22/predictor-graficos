# Predictor de gráficos — especificación del proyecto

> Este archivo es el contexto permanente del proyecto para Claude Code.
> Léelo entero antes de cada tarea y respeta las decisiones que aquí se fijan.

## 1. Qué es

Un juego web en el que el usuario ve un fragmento de gráfico de velas real
(bolsa, FOREX o crypto) de un periodo elegido al azar, con el activo y las
fechas ocultos. Debe predecir si el precio **sube** o **baja**. Después se
revela la continuación del gráfico y se le dice si acertó.

Objetivo secundario, educativo: mostrar al usuario que acertar de forma
consistente es muy difícil y comparar su resultado con el azar (50 %).

## 2. Sobre el autor (importante para Claude Code)

- Soy estudiante de Economía y **estoy aprendiendo a programar con este proyecto**.
- Explícame en español y con lenguaje sencillo qué haces y por qué en cada cambio.
- Prefiere soluciones simples y legibles a soluciones "elegantes" o abstractas.
- Avanza en pasos pequeños. Después de cada paso, dime cómo probarlo.
- Pregúntame antes de añadir dependencias, servicios externos o cuentas.
- No borres ni reescribas archivos enteros sin avisarme.

## 3. Reglas del juego (v1)

| Parámetro | Valor por defecto | Notas |
|---|---|---|
| Velas visibles | 60 | Lo que ve el usuario antes de decidir |
| Velas reveladas | 20 | El usuario elige 10 (corto plazo), 20, 30 o 50 |
| Activo | aleatorio | El usuario puede fijar un solo activo |
| Criterio "sube" | cierre de la última vela revelada > cierre de la última vela visible | |
| Empate | variación absoluta < 0,1 % → la ronda no cuenta | Evita castigar por ruido |
| Temporalidad | diaria | Más adelante: 1h, 4h, semanal |

- **Días con el mercado cerrado**: los cierres *normales* (fines de semana,
  festivos) NO se muestran; las velas van seguidas, como en cualquier gráfico.
  Los cierres *excepcionales* (p. ej. tras el 11-S) SÍ se muestran como huecos
  vacíos, porque es didáctico ver cómo "salta" el mercado al reabrir. Criterio:
  más de 4 días naturales entre dos velas = cierre excepcional (un fin de semana
  largo con festivo dura como máximo 4), y se dibuja un hueco por cada día
  laborable sin cotizar. Las 60 velas visibles son velas *con cotización*; los
  huecos no cuentan.
- Fragmentos con un salto de más de 7 días naturales entre dos velas se
  descartan: son agujeros en los datos, no cierres reales (el cierre tras el
  11-S, de 7 días, sí se mantiene).
- Los ajustes (velas reveladas y activo) se guardan en `localStorage` y se
  aplican **en el siguiente gráfico**, nunca en el actual: así no sirven para
  saltarse un gráfico difícil.
- Velas japonesas con cuerpo y borde visibles: mínimo 7 px por vela. Si no
  caben todas (móvil, 50 velas reveladas), se ven las más recientes y el
  gráfico se puede arrastrar.
- El activo y las fechas **no se muestran** hasta después de responder.
- El eje de precios se **normaliza** (la última vela visible vale 100) para que
  no se pueda reconocer el activo por su precio.
- Tras revelar: mostrar acierto/fallo, variación en %, activo, fechas reales y
  precios reales (al decidir y 20 velas después), en un panel lateral junto
  al gráfico (debajo en móvil).

## 4. Estadísticas (v1)

- Rondas jugadas, aciertos, % de acierto, racha actual y mejor racha.
- Desglose por mercado (bolsa / FOREX / crypto).
- **Comparación con el azar**: probabilidad de obtener ese número de aciertos
  o más lanzando una moneda (test binomial unilateral, p = 0,5). Mostrarlo en
  lenguaje claro: "Con 34 de 60, una moneda lo haría igual de bien o mejor el 18 % de las veces".
- Las estadísticas se guardan en `localStorage` (sin cuentas en v1).
- Recursos estéticos: 🔥 en la racha desde 5 aciertos seguidos (🔥🔥 desde 10);
  insignias en el resultado (🔥 racha, 🏆 nueva mejor racha, 🎯 hitos de rondas
  jugadas, ⚡ movimiento de más del 10 %); comentarios en la frase de la moneda
  a partir de 20 rondas. Animaciones suaves que respetan "reducir movimiento".

## 5. Arquitectura

**v1 = web estática, sin servidor ni base de datos.**

```
/
├── CLAUDE.md
├── index.html          # la página del juego
├── styles.css
├── js/
│   ├── main.js         # flujo del juego (ronda, respuesta, revelar)
│   ├── chart.js        # dibujar el gráfico
│   ├── data.js         # cargar datos y elegir fragmentos al azar
│   ├── stats.js        # estadísticas y test binomial
│   ├── settings.js     # ajustes de la partida (velas reveladas, activo)
│   └── context.js      # contexto tras revelar: FED, eventos, enlace a noticias
├── data/
│   ├── index.json      # lista de activos disponibles y su mercado
│   ├── <ticker>.json   # velas OHLC de cada activo
│   ├── fed_funds.json  # tipos de la FED, media mensual (FRED, lo genera el script)
│   └── events.json     # grandes eventos, escrito A MANO (fecha, mercados, título, texto)
└── scripts/
    ├── download_data.py  # descarga y prepara los datos (se ejecuta a mano)
    └── serve.py          # servidor local para probar (envía en trozos de 64 KB;
                          # `python -m http.server` corta descargas en este PC)
```

- **Gráfico**: librería Lightweight Charts de TradingView (gratuita, Apache 2.0),
  cargada desde CDN con versión fija.
- **Datos**: se descargan **una vez** con `scripts/download_data.py` y se guardan
  en `data/`. La web nunca llama a APIs externas en v1.
- **Formato de cada archivo de datos**:
  ```json
  { "ticker": "BTCUSDT", "name": "Bitcoin / USD", "market": "crypto",
    "interval": "1d",
    "candles": [ { "t": "2021-03-01", "o": 45000, "h": 49800, "l": 44900, "c": 49600 } ] }
  ```
- **Hosting**: GitHub Pages (gratis). Se publica desde la rama `main`.

## 6. Fuentes de datos

| Mercado | Fuente | Herramienta |
|---|---|---|
| Crypto | API pública de Binance (klines) | Python + `requests` |
| Bolsa (índices y acciones) | Yahoo Finance | Python + `yfinance` |
| FOREX | Yahoo Finance (`EURUSD=X`, etc.) | Python + `yfinance` |
| Tipos de la FED | FRED (serie `FEDFUNDS`, pública, sin cuenta) | Python + `requests` |

Activos iniciales (ampliable): BTC, ETH, SOL · S&P 500, IBEX 35, Nasdaq 100,
Apple, Santander · EUR/USD, GBP/USD, USD/JPY.

Ampliación prevista (más adelante): materias primas como **oro** (`GC=F`),
plata y petróleo; más índices y mercados (DAX, Nikkei, Euro Stoxx 50,
emergentes) y más divisas (USD/CHF, AUD/USD, EUR/GBP...). Basta con añadirlos a
la lista `ASSETS` de `download_data.py`; si son de otro tipo, añadir un nuevo
valor de `market` (p. ej. "materias primas").

El script debe: descargar, limpiar huecos y valores nulos, y guardar en el
formato del apartado 5. Mínimo 5 años de datos diarios por activo.

Aviso: los datos de Yahoo son para uso personal/educativo. Si la web se hace
pública con fines comerciales, revisar licencias.

## 7. Hoja de ruta

- [x] **Fase 0** – Preparar entorno: Git, repositorio en GitHub, Python, este archivo.
- [x] **Fase 1** – `download_data.py` funcionando con 3 activos de prueba.
- [x] **Fase 2** – Mostrar un fragmento aleatorio con Lightweight Charts.
- [x] **Fase 3** – Botones Sube/Baja, revelar continuación, acierto/fallo.
- [x] **Fase 4** – Estadísticas, rachas y comparación con el azar.
- [ ] **Fase 5** – Diseño cuidado, móvil, publicar en GitHub Pages.
- [ ] **Fase 6+** – Ideas futuras (no empezar sin pedirlo):
  - Elegir mercado y temporalidad. (Hecho: elegir un activo concreto y las
    velas reveladas. Pendiente: temporalidad 1h/4h/semanal.)
  - Estadísticas separadas por número de velas reveladas (ahora van juntas).
  - Modo "cuánto sube": el usuario estima el % de variación.
  - Indicadores opcionales (medias móviles, RSI) para ver si ayudan.
  - Cuentas de usuario y ranking (Supabase).
  - Más activos y mercados: oro y materias primas, más índices y divisas (ver apartado 6).
  - **Noticias del periodo tras responder** (objetivo: pasar de "juego" a
    herramienta educativa). Solo se muestra *después* de responder, porque antes
    delataría el activo. Se hace por fases:
    - [x] **Fase A, gratis**: tarjeta "¿Qué pasaba en ese periodo?" con los tipos
      de la FED (FRED), los grandes eventos de `data/events.json` filtrados por
      mercado, un enlace a Google Noticias limitado a las fechas reveladas y un
      aviso de que coincidencia no es causalidad.
    - [ ] **Fase B, con LLM** (pendiente, el usuario quiere hacerla): resumen de
      noticias del activo y del contexto macro (decisiones de la FED, etc.) con
      fuentes. La web estática no puede llamar a un LLM (expondría la clave de
      API), así que hay que generar los resúmenes **por adelantado** con un
      script (LLM con búsqueda web) y guardarlos en `data/`. Como los fragmentos
      son aleatorios, un resumen **por activo y mes** (~1.000 en total).
      Requiere cuenta de API de pago: preguntar y calcular el coste antes.
    - Idea relacionada: tipos del BCE para las rondas de EUR/USD.

## 8. Convenciones

- Código y nombres de variables en inglés; comentarios y textos de la web en español.
- JavaScript moderno sin frameworks en v1 (nada de React todavía).
- Un commit por cada paso que funcione, con mensaje claro en español.
- Antes de dar algo por terminado: abrirlo en el navegador y comprobar que no hay
  errores en la consola.
