// chart.js — dibujar el gráfico de velas con Lightweight Charts.
//
// Problema: la librería necesita una fecha para cada vela, pero no podemos
// enseñar las fechas reales. Solución: numeramos las posiciones del eje
// ("Día 1", "Día 2"...) y se las damos a la librería como fechas inventadas.
//
// Cierres normales (fines de semana, festivos): no dejan hueco, las velas van
// seguidas como en cualquier gráfico. Cierres excepcionales (p. ej. tras el
// 11-S): dejan un hueco vacío por cada día laborable sin cotizar.

import { daysBetween } from "./data.js";

const SECONDS_PER_DAY = 24 * 60 * 60;

// Más de 4 días naturales entre dos velas = cierre excepcional.
// (Un fin de semana largo con festivo dura como máximo 4: de jueves a lunes.)
const EXCEPTIONAL_GAP_DAYS = 4;

// Colores claros para las velas reveladas, para distinguirlas de las que
// el usuario ya veía antes de decidir.
const REVEALED_UP_COLOR = "#a5d6d1";
const REVEALED_DOWN_COLOR = "#f5b1b0";

let chart = null;
let series = null;
let decisionLine = null; // línea horizontal en el precio de la decisión (100)

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
    layout: { background: { color: "#ffffff" }, textColor: "#333" },
    grid: {
      vertLines: { color: "#f0f0f0" },
      horzLines: { color: "#f0f0f0" },
    },
    localization: {
      locale: "es-ES",
      timeFormatter: timeToLabel, // etiqueta al pasar el ratón
    },
    timeScale: {
      tickMarkFormatter: timeToLabel, // etiquetas del eje horizontal
    },
  });

  series = chart.addSeries(LightweightCharts.CandlestickSeries, {
    upColor: "#26a69a", // verde: la vela cerró más alta de lo que abrió
    downColor: "#ef5350", // rojo: cerró más baja
    wickUpColor: "#26a69a",
    wickDownColor: "#ef5350",
    borderVisible: false,
    priceFormat: { type: "price", precision: 2, minMove: 0.01 },
  });
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
      if (daysBetween(previous.t, candle.t) > EXCEPTIONAL_GAP_DAYS) {
        // Cierre excepcional: un hueco por cada día laborable sin cotizar.
        // Un punto con solo "time" es un hueco vacío para la librería.
        const closedDays = countWeekdaysBetween(previous.t, candle.t);
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
    // Vela revelada: color claro (cuerpo y mecha)
    if (i >= revealFrom) {
      const color = candle.c >= candle.o ? REVEALED_UP_COLOR : REVEALED_DOWN_COLOR;
      point.color = color;
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

// Dibuja las velas visibles de una ronda nueva (sustituye a lo anterior)
export function drawCandles(candles) {
  removeDecisionLine();
  series.setData(toChartData(candles));
  chart.timeScale().fitContent(); // encajar todas las velas en pantalla
}

// Tras la decisión: dibuja las velas visibles + las reveladas, y una línea
// discontinua en 100 (el precio en el momento de decidir) como referencia.
export function revealCandles(visible, hidden) {
  removeDecisionLine();
  series.setData(toChartData([...visible, ...hidden], visible.length));
  decisionLine = series.createPriceLine({
    price: 100,
    color: "#888",
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    axisLabelVisible: false,
    title: "Tu decisión",
  });
  chart.timeScale().fitContent();
}
