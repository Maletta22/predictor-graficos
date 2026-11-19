// chart.js — dibujar el gráfico de velas con Lightweight Charts.
//
// Problema: la librería necesita una fecha para cada vela, pero no podemos
// enseñar las fechas reales. Solución: numeramos las posiciones del eje
// ("Día 1", "Día 2"...) y se las damos a la librería como fechas inventadas.
//
// Cierres normales (fines de semana, festivos): no dejan hueco, las velas van
// seguidas como en cualquier gráfico. Cierres excepcionales (p. ej. tras el
// 11-S): dejan un hueco vacío por cada día laborable sin cotizar.

const SECONDS_PER_DAY = 24 * 60 * 60;

// 4 o más días LABORABLES sin cotizar entre dos velas = cierre excepcional
// (el 11-S fueron 4). Los festivos normales dejan como mucho 3 (Navidad en
// Europa, Golden Week en Japón), salvo el Año Nuevo japonés, que cierra 4 y
// por eso se excluye aparte (ver isNewYearClosure).
const EXCEPTIONAL_CLOSED_WEEKDAYS = 4;

// Ancho mínimo de cada vela en píxeles, para que siempre se vea su cuerpo
const MIN_BAR_SPACING = 7;

let chart = null;
let series = null;
let decisionLine = null; // línea horizontal en el precio de la decisión (100)

// Lo último que se dibujó, para poder repintarlo si cambia el tema
let lastCandles = null;
let lastRevealFrom = 0;

// Lee un color de las variables CSS de styles.css (p. ej. "--up")
function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Opciones de color del gráfico y de las velas, según el tema actual
function chartColors() {
  return {
    layout: { background: { color: cssColor("--surface") }, textColor: cssColor("--muted") },
    grid: {
      vertLines: { color: cssColor("--grid") },
      horzLines: { color: cssColor("--grid") },
    },
    rightPriceScale: { borderColor: cssColor("--border") },
    timeScale: { borderColor: cssColor("--border") },
  };
}

function seriesColors() {
  return {
    upColor: cssColor("--up"), // verde: la vela cerró más alta de lo que abrió
    downColor: cssColor("--down"), // rojo: cerró más baja
    wickUpColor: cssColor("--up"),
    wickDownColor: cssColor("--down"),
    borderUpColor: cssColor("--up"), // borde del cuerpo, para que se vea nítido
    borderDownColor: cssColor("--down"),
  };
}

// Aplica los colores del tema actual y repinta lo que hubiera dibujado
function applyTheme() {
  chart.applyOptions(chartColors());
  series.applyOptions(seriesColors());
  if (lastCandles !== null) {
    series.setData(toChartData(lastCandles, lastRevealFrom));
  }
  if (decisionLine !== null) {
    decisionLine.applyOptions({ color: cssColor("--muted") });
  }
}

// Convierte el número de día (0, 1, 2...) en el "tiempo" que pide la librería
// (segundos desde 1970). El 1 de enero de 1970 es solo un origen arbitrario.
function dayToTime(day) {
  return day * SECONDS_PER_DAY;
}

// Y al revés: de "tiempo" a etiqueta visible ("Día 1" es el primer día)
function timeToLabel(time) {
  return `Día ${time / SECONDS_PER_DAY + 1}`;
}

// Crea el gráfico vacío dentro del elemento HTML "container"
export function createCandleChart(container) {
  chart = LightweightCharts.createChart(container, {
    autoSize: true, // se adapta al tamaño del contenedor
    localization: {
      locale: "es-ES",
      timeFormatter: timeToLabel, // etiqueta al pasar el ratón
    },
    timeScale: {
      tickMarkFormatter: timeToLabel, // etiquetas del eje horizontal
    },
  });

  series = chart.addSeries(LightweightCharts.CandlestickSeries, {
    borderVisible: true,
    priceFormat: { type: "price", precision: 2, minMove: 0.01 },
  });

  applyTheme();

  // Si el usuario cambia entre tema claro y oscuro, repintar con los colores nuevos
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
}

// Cuenta los días laborables (lunes a viernes) que hay ENTRE dos fechas,
// sin contar ninguna de las dos.
function countWeekdaysBetween(dateA, dateB) {
  let count = 0;
  const day = new Date(dateA);
  const end = new Date(dateB);
  day.setUTCDate(day.getUTCDate() + 1);
  while (day < end) {
    const weekday = day.getUTCDay(); // 0 = domingo, 6 = sábado
    if (weekday !== 0 && weekday !== 6) {
      count++;
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return count;
}

// ¿El cierre abarca el cambio de año? (cierre de Año Nuevo: normal, no excepcional)
function isNewYearClosure(dateA, dateB) {
  return dateA.slice(0, 4) !== dateB.slice(0, 4); // "2012-12-28" → "2012"
}

// Prepara las velas para la librería: cada vela ocupa la siguiente posición
// del eje, salvo tras un cierre excepcional, donde se dejan huecos vacíos.
// Las velas a partir de "revealFrom" se pintan con colores claros.
// Se exporta para poder probarla desde la consola del navegador.
export function toChartData(candles, revealFrom = candles.length) {
  const data = [];
  let position = 0;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    if (i > 0) {
      const previous = candles[i - 1];
      const closedDays = countWeekdaysBetween(previous.t, candle.t);
      if (closedDays >= EXCEPTIONAL_CLOSED_WEEKDAYS && !isNewYearClosure(previous.t, candle.t)) {
        // Cierre excepcional: un hueco por cada día laborable sin cotizar.
        // Un punto con solo "time" es un hueco vacío para la librería.
        for (let k = 0; k < closedDays; k++) {
          data.push({ time: dayToTime(position) });
          position++;
        }
      }
    }

    const point = {
      time: dayToTime(position),
      open: candle.o,
      high: candle.h,
      low: candle.l,
      close: candle.c,
    };
    // Vela revelada: color claro (cuerpo, borde y mecha)
    if (i >= revealFrom) {
      const color = candle.c >= candle.o ? cssColor("--up-soft") : cssColor("--down-soft");
      point.color = color;
      point.borderColor = color;
      point.wickColor = color;
    }
    data.push(point);
    position++;
  }
  return data;
}

// Quita la línea de la decisión, si la hay
function removeDecisionLine() {
  if (decisionLine !== null) {
    series.removePriceLine(decisionLine);
    decisionLine = null;
  }
}

// Encaja las velas en pantalla, pero sin que cada una baje de MIN_BAR_SPACING
// píxeles: por debajo, el cuerpo de la vela desaparece y parece un palito.
// Si no caben todas (p. ej. en un móvil), se ven las más recientes y se puede
// arrastrar el gráfico para ver las anteriores.
function fitCandles(barCount) {
  const timeScale = chart.timeScale();
  const spacing = timeScale.width() / barCount;
  if (spacing >= MIN_BAR_SPACING) {
    timeScale.fitContent(); // caben todas
  } else {
    timeScale.applyOptions({ barSpacing: MIN_BAR_SPACING });
    timeScale.scrollToRealTime(); // ir al final (las velas más recientes)
  }
}

// Dibuja las velas visibles de una ronda nueva (sustituye a lo anterior)
export function drawCandles(candles) {
  removeDecisionLine();
  lastCandles = candles;
  lastRevealFrom = candles.length;
  const data = toChartData(candles);
  series.setData(data);
  fitCandles(data.length);
}

// Tras la decisión: dibuja las velas visibles + las reveladas, y una línea
// discontinua en 100 (el precio en el momento de decidir) como referencia.
export function revealCandles(visible, hidden) {
  removeDecisionLine();
  lastCandles = [...visible, ...hidden];
  lastRevealFrom = visible.length;
  const data = toChartData(lastCandles, lastRevealFrom);
  series.setData(data);
  decisionLine = series.createPriceLine({
    price: 100,
    color: cssColor("--muted"),
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    axisLabelVisible: false,
    title: "Tu decisión",
  });
  fitCandles(data.length);
}
