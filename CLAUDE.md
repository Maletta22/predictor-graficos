# UpDown — especificación del proyecto

> Nombre del juego: **UpDown**. (El repositorio y la carpeta siguen llamándose
> `predictor-graficos`.)

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
| Activos | todos | El usuario elige **uno o varios** mercados y/o activos a la vez (p. ej. Crypto + Apple + EUR/USD) |
| Fechas | sin límite | Rango por años (Desde / Hasta); las 60 + N velas deben caer dentro |
| Criterio "sube" | cierre de la última vela revelada > cierre de la última vela visible | |
| Empate | variación absoluta < 0,1 % → la ronda no cuenta | Evita castigar por ruido |
| Temporalidad | diaria | Más adelante: 1h, 4h, semanal |

- **Días con el mercado cerrado**: los cierres *normales* (fines de semana,
  festivos) NO se muestran; las velas van seguidas, como en cualquier gráfico.
  Los cierres *excepcionales* (p. ej. tras el 11-S) SÍ se muestran como huecos
  vacíos, porque es didáctico ver cómo "salta" el mercado al reabrir. Criterio:
  **4 o más días laborables sin cotizar** entre dos velas = cierre excepcional
  (el 11-S fueron 4), salvo si el cierre abarca el cambio de año (el Año Nuevo
  japonés cierra 4 laborables y es normal). Los festivos normales dejan como
  mucho 3 (Semana Santa y Navidad en Europa, Golden Week en Japón). Se dibuja un
  hueco por cada día laborable sin cotizar. Las 60 velas visibles son velas
  *con cotización*; los huecos no cuentan.
- Fragmentos con un salto de más de 7 días naturales entre dos velas se
  descartan: son agujeros en los datos, no cierres reales (el cierre tras el
  11-S, de 7 días, sí se mantiene).
- Los ajustes (velas reveladas, activo y fechas) se guardan en `localStorage`
  y se aplican **en el siguiente gráfico**, nunca en el actual: así no sirven
  para saltarse un gráfico difícil. Excepción: si los filtros estaban
  bloqueando el juego (no había ronda), el cambio se aplica al momento.
- Selector de activos (`<details>` plegable): plegado, una línea con el
  resumen («Apple y Crypto»); desplegado, una fila por mercado con un botón
  para el mercado entero y una pastilla por activo. Se guarda en
  `settings.tickers` (`[]` = todos; si se eligen todos, se guarda `[]`). Un
  mercado elegido solo en parte se marca con borde discontinuo. Los ajustes
  antiguos (`ticker`, un solo valor) se convierten al cargar.
- Filtro de fechas: los activos sin datos suficientes en el rango aparecen
  apagados y tachados en el selector (siguen pudiéndose pulsar). Un aviso
  rojo bloquea el juego si ningún activo elegido tiene datos (o si «desde» >
  «hasta»); uno azul informa de qué activos quedan fuera. La comprobación es
  una estimación con `first`/`last` de `data/index.json` (crypto: 1 día por
  vela; resto: 1,5 días), y `pickRandomRound` comprueba las velas reales.
- Velas japonesas con cuerpo y borde visibles: mínimo 7 px por vela. Si no
  caben todas (móvil, 50 velas reveladas), se ven las más recientes y el
  gráfico se puede arrastrar.
- El activo y las fechas **no se muestran** hasta después de responder.
- El eje de precios se **normaliza** (la última vela visible vale 100) para que
  no se pueda reconocer el activo por su precio. **Al revelar**, el eje pasa al
  precio real (formato español, 4 decimales si el precio es menor de 10).
- Tras revelar: mostrar acierto/fallo, variación en %, activo, fechas reales y
  precios reales (al decidir y N velas después), en un panel lateral junto
  al gráfico (debajo en móvil).

## 4. Estadísticas (v1)

- Rondas jugadas, aciertos, % de acierto, racha actual y mejor racha.
- Totales comunes (aciertos y fallos de todas las rondas) y, debajo, una tabla
  de **detalle** con pestañas: por **mercado** (índices / acciones / FOREX /
  crypto / materias primas; las rondas guardadas con el antiguo mercado
  `bolsa` salen en una fila «Bolsa (rondas antiguas)»), por **plazo** (10 / 20 / 30 / 50 velas reveladas) o por
  **activo**. Cada fila incluye su propia comparación con la moneda y un aviso
  de que con menos de ~30 rondas por grupo no hay que sacar conclusiones.
- Formato guardado: `byMarket`, `byHorizon` y `byAsset`, cada uno
  `{ clave: { played, correct } }`; las entradas se crean al jugar.
- **Comparación con el azar**: probabilidad de obtener ese número de aciertos
  o más lanzando una moneda (test binomial unilateral, p = 0,5). Mostrarlo en
  lenguaje claro: "Con 34 de 60, una moneda lo haría igual de bien o mejor el 18 % de las veces".
- Las estadísticas se guardan en `localStorage` (sin cuentas en v1).
- Recursos estéticos: 🔥 en la racha desde 5 aciertos seguidos (🔥🔥 desde 10);
  insignias en el resultado (🔥 racha, 🏆 nueva mejor racha, 🎯 hitos de rondas
  jugadas, ⚡ movimiento de más del 10 %); comentarios en la frase de la moneda
  a partir de 20 rondas. Animaciones suaves que respetan "reducir movimiento".
- Más recursos: logotipo "Up▲Down▼"; las velas reveladas aparecen una a una
  (1,2 s en total); confeti al batir la mejor racha (desde 3); cinta de
  activos arriba; sonidos al acertar/fallar con botón 🔊/🔇 (se guarda).
- Estilo visual "periódico financiero": letra Times New Roman (sin fuentes
  externas), papel marfil y tinta azul marino, filetes dorados, títulos en
  versalitas, cabecera centrada con doble línea; en modo oscuro, fondo noche
  con acento dorado (`--on-accent` es el color del texto sobre el acento).
  El fondo decorativo son velas en tinta (huecas las que suben).
- La ronda se guarda al responder, pero resultado, estadísticas, insignias,
  sonido y confeti se muestran **al terminar la animación** (si no, las
  estadísticas destriparían el resultado).

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
│   ├── logos.js        # emblema propio de cada activo (NO logos oficiales:
│   │                   # son marcas registradas)
│   ├── backdrop.js     # fondo decorativo: velas inventadas, cuadrícula, flechas
│   ├── ticker.js       # cinta decorativa con los activos (sin precios inventados)
│   ├── confetti.js     # confeti al batir la mejor racha
│   ├── sounds.js       # sonidos sintetizados (Web Audio, sin archivos)
│   ├── context.js      # contexto tras revelar: FED, BCE, eventos, enlace a noticias
│   ├── online.js       # cuentas por apodo y ranking (Supabase)
│   └── config.js       # URL y clave pública de Supabase (vacías = sin ranking)
├── data/
│   ├── index.json      # lista de activos disponibles y su mercado
│   ├── <ticker>.json   # velas OHLC de cada activo
│   ├── fed_funds.json  # tipos de la FED, media mensual (FRED, lo genera el script)
│   ├── ecb_rate.json   # tipo de depósito del BCE, fin de mes (FRED, lo genera el script)
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
- **Hosting**: GitHub Pages (gratis). Se publica desde la rama `main`, carpeta
  raíz, sin Jekyll (`.nojekyll`). Web: https://maletta22.github.io/predictor-graficos/
  Cada `git push` a `main` la actualiza en 1-2 minutos. GitHub Pages guarda
  copias en caché unos 10 minutos: tras un cambio, recargar con Ctrl+F5.

## 6. Fuentes de datos

| Mercado | Fuente | Herramienta |
|---|---|---|
| Crypto | API pública de Binance (klines) | Python + `requests` |
| Bolsa (índices y acciones) | Yahoo Finance | Python + `yfinance` |
| FOREX | Yahoo Finance (`EURUSD=X`, etc.) | Python + `yfinance` |
| Tipos de la FED | FRED (serie `FEDFUNDS`, pública, sin cuenta) | Python + `requests` |
| Tipos del BCE | FRED (serie `ECBDFR`, facilidad de depósito, desde 1999) | Python + `requests` |

Activos incluidos (34), en la lista `ASSETS` de `download_data.py`:
- **Crypto**: Bitcoin, Ethereum, Solana.
- **Índices bursátiles** (`market: "indices"`): S&P 500, Nasdaq 100, Euro Stoxx 50,
  DAX, IBEX 35, Nikkei 225.
- **Acciones de empresas** (`market: "acciones"`): Apple, Microsoft, NVIDIA,
  Amazon, Alphabet, Meta, Tesla, Netflix, JPMorgan, Coca-Cola, Santander,
  Inditex, ASML, LVMH, TSMC (ADR en EE. UU.), Toyota.
  Antes índices y acciones eran un único mercado `bolsa`; `events.json` sigue
  usando `"bolsa"`, que `eventsInRange` aplica a los dos.
- **FOREX**: EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, EUR/GBP.
- **Materias primas** (`market: "materias"`): oro, plata y petróleo Brent.

Decisiones sobre las fuentes:
- Oro y plata: ETF **GLD** y **SLV** (compran el metal físico) en vez de los
  futuros `GC=F`/`SI=F`, que en Yahoo tienen cientos de días sin datos. El
  precio mostrado es el de una participación del fondo, no el de una onza.
- Petróleo: **Brent** (`BZ=F`) y no WTI, que cotizó en negativo en abril de
  2020 y rompería la normalización a 100.
- Divisas: en Yahoo, el "cierre" diario es en realidad el precio al empezar
  el día (desde ~2021, apertura = cierre en >80 % de los días: velas sin
  cuerpo). `rebuild_forex_closes` usa como cierre la apertura del día
  siguiente (mercado 24 h) y descarta la última vela.
- El script avisa de movimientos diarios de más del 30 % para revisar a mano
  si son reales (crash COVID, FTX...) o errores (p. ej. *splits* sin ajustar).

Para añadir más activos (p. ej. emergentes) basta con añadirlos a `ASSETS`; si
son de un tipo nuevo, añadir también su `market` a `MARKET_NAMES` en `main.js`.

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
- [x] **Fase 5** – Diseño cuidado, móvil, publicar en GitHub Pages.
- [ ] **Fase 6+** – Ideas futuras (no empezar sin pedirlo):
  - Elegir mercado y temporalidad. (Hecho: elegir un activo concreto y las
    velas reveladas. Pendiente: temporalidad 1h/4h/semanal.)
  - Modo "cuánto sube": el usuario estima el % de variación.
  - Indicadores opcionales (medias móviles, RSI) para ver si ayudan.
  - [x] **Cuentas y ranking (Supabase)**. Activo y probado por el usuario en
    la web publicada (unirse con apodo, subir rondas, fila en `players`).
    Proyecto configurado en `js/config.js`; la tabla se crea con
    `supabase/setup.sql` (incluye los `grant`, necesarios en proyectos nuevos).
    Decisiones:
    - Cuenta = usuario **anónimo** de Supabase + **apodo** (sin email ni
      contraseña). Queda ligada al navegador: si se borran sus datos, se pierde.
      Hay que activar "Allow anonymous sign-ins" en Supabase.
    - Ranking ordenado por **menor probabilidad de suerte** (`luck_prob`, test
      binomial), con mínimo 30 rondas. Top 20 + tu posición.
    - Las estadísticas siguen guardándose en el navegador; tras cada ronda se
      suben a la tabla `players`. Reglas de seguridad (RLS): todos leen, cada
      uno solo escribe su fila.
    - Limitación conocida: el juego corre en el navegador, así que alguien con
      conocimientos podría subir estadísticas falsas. Evitarlo exigiría un
      servidor que lleve la partida. Aceptado para un juego educativo.
    - Librería `@supabase/supabase-js@2.118.0` desde CDN, que solo se carga si
      `config.js` está relleno.
  - [x] Tipos del BCE en el contexto de los activos europeos o con euro
    (EUR/USD, EUR/GBP, Euro Stoxx 50, DAX, IBEX 35, Santander, Inditex, ASML, LVMH).
  - Más activos: bolsas emergentes (pendiente; el resto de la ampliación está hecha).
  - **Noticias del periodo tras responder** (objetivo: pasar de "juego" a
    herramienta educativa). Solo se muestra *después* de responder, porque antes
    delataría el activo. Se hace por fases:
    - [x] **Fase A, gratis**: tarjeta "¿Qué pasaba en ese periodo?" con los tipos
      de la FED (FRED), los grandes eventos de `data/events.json` filtrados por
      mercado, un enlace a Google con la búsqueda «activo noticias día de la
      decisión» (p. ej. «S&P 500 noticias 23 de marzo de 2020») y un aviso de
      que coincidencia no es causalidad.
    - [ ] **Fase B, con LLM** (pendiente, el usuario quiere hacerla): resumen de
      noticias del activo y del contexto macro (decisiones de la FED, etc.) con
      fuentes. La web estática no puede llamar a un LLM (expondría la clave de
      API), así que hay que generar los resúmenes **por adelantado** con un
      script (LLM con búsqueda web) y guardarlos en `data/`. Como los fragmentos
      son aleatorios, un resumen **por activo y mes** (~1.000 en total).
      Requiere cuenta de API de pago: preguntar y calcular el coste antes.
    - Tipos del BCE: hecho (ver más abajo).

## 8. Convenciones

- Código y nombres de variables en inglés; comentarios y textos de la web en español.
- JavaScript moderno sin frameworks en v1 (nada de React todavía).
- Un commit por cada paso que funcione, con mensaje claro en español.
- Antes de dar algo por terminado: abrirlo en el navegador y comprobar que no hay
  errores en la consola.
