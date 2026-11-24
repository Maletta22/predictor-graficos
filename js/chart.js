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

// Duración total de la animación del revelado (da igual si son 10 o 50 velas)
const REVEAL_DURATION_MS = 1200;

// Cada revelado lleva un número. Si empieza otra ronda a mitad de animación,
// el número cambia y la animación anterior se detiene.
let revealRun = 0;

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
    layout: {
      background: { color: cssColor("--surface") },
      textColor: cssColor("--muted"),
      fontFamily: cssColor("--font-serif"), // la misma letra que la página
    },
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
      priceFormatter: formatAxisPrice, // precios con coma decimal
    },
    timeScale: {
      tickMarkFormatter: timeToLabel, // etiquetas del eje horizontal
    },
  });

  series = chart.addSeries(LightweightCharts.CandlestickSeries, {
    borderVisible: true,
    priceFormat: priceFormatFor(100),
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

// Encuadra "barCount" posiciones del eje (aunque aún no estén todas dibujadas,
// como durante el revelado), sin que cada vela baje de MIN_BAR_SPACING píxeles:
// por debajo, el cuerpo de la vela desaparece y parece un palito.
// Si no caben todas (p. ej. en un móvil), se ven las más recientes y se puede
// arrastrar el gráfico para ver las anteriores.
function fitCandles(barCount) {
  const timeScale = chart.timeScale();
  const barsThatFit = Math.floor(timeScale.width() / MIN_BAR_SPACING);
  const from = barCount <= barsThatFit ? 0 : barCount - barsThatFit;
  // El rango "lógico" va por posiciones: 0 es la primera vela. El medio punto
  // de margen evita que la primera y la última vela queden cortadas.
  timeScale.setVisibleLogicalRange({ from: from - 0.5, to: barCount - 0.5 });
}

// Espera "ms" milisegundos (para la animación del revelado)
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Decimales del eje de precios en cada momento (2 en base 100)
let pricePrecision = 2;

// Formato del eje de precios: 4 decimales para precios pequeños (divisas
// como EUR/USD ≈ 1,08), 2 para el resto (y para la base 100)
function priceFormatFor(price) {
  pricePrecision = price < 10 ? 4 : 2;
  return { type: "price", precision: pricePrecision, minMove: 1 / 10 ** pricePrecision };
}

// Escribe los precios del eje en formato español, igual que el panel del
// resultado: coma decimal y punto de miles (97672.4 → "97.672,40")
function formatAxisPrice(price) {
  return price.toLocaleString("es-ES", {
    minimumFractionDigits: pricePrecision,
    maximumFractionDigits: pricePrecision,
  });
}

// Convierte velas normalizadas (base 100) a precios reales.
// Se normalizaron como: real / precioDecisión × 100, así que para deshacerlo
// se multiplica por precioDecisión / 100.
function toRealPrices(candles, decisionPrice) {
  const factor = decisionPrice / 100;
  return candles.map((candle) => ({
    t: candle.t,
    o: candle.o * factor,
    h: candle.h * factor,
    l: candle.l * factor,
    c: candle.c * factor,
  }));
}

// Dibuja las velas visibles de una ronda nueva (sustituye a lo anterior)
export function drawCandles(candles) {
  revealRun++; // si había un revelado en marcha, se detiene
  removeDecisionLine();
  series.applyOptions({ priceFormat: priceFormatFor(100) }); // eje en base 100
  lastCandles = candles;
  lastRevealFrom = candles.length;
  const data = toChartData(candles);
  series.setData(data);
  fitCandles(data.length);
}

// Tras la decisión: el eje pasa de la base 100 al PRECIO REAL, y se añaden
// las velas reveladas UNA A UNA (con suspense), con una línea discontinua en
// el precio al decidir como referencia.
//   decisionPrice: precio real de cierre de la última vela visible
// Es "async": devuelve una promesa que se cumple cuando termina la animación,
// para que main.js muestre el resultado justo después.
export async function revealCandles(visible, hidden, decisionPrice) {
  const run = ++revealRun; // número de este revelado
  removeDecisionLine();
  series.applyOptions({ priceFormat: priceFormatFor(decisionPrice) });
  const realVisible = toRealPrices(visible, decisionPrice);
  lastCandles = [...realVisible, ...toRealPrices(hidden, decisionPrice)];
  lastRevealFrom = visible.length;
  const data = toChartData(lastCandles, lastRevealFrom);
  // Cuántos puntos del gráfico son de la parte visible (incluidos sus huecos)
  const firstRevealed = toChartData(realVisible).length;

  decisionLine = series.createPriceLine({
    price: decisionPrice,
    color: cssColor("--muted"),
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    axisLabelVisible: false,
    title: "Tu decisión",
  });

  // Sin animación si el sistema pide "reducir movimiento": todo de golpe
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    series.setData(data);
    fitCandles(data.length);
    return;
  }

  series.setData(data.slice(0, firstRevealed));
  fitCandles(data.length); // encuadre final desde el principio: sin saltos de zoom
  const delay = REVEAL_DURATION_MS / (data.length - firstRevealed);
  for (let i = firstRevealed; i < data.length; i++) {
    await wait(delay);
    if (run !== revealRun) {
      return; // empezó otra ronda mientras tanto: dejar de animar esta
    }
    series.update(data[i]); // añade una vela (o un hueco) al final
  }
}
