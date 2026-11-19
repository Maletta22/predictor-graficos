// context.js — contexto educativo que se muestra DESPUÉS de responder:
//   - tipos de interés de la FED (y del BCE en activos europeos) al
//     principio y al final del periodo
//   - grandes eventos de esas fechas (data/events.json)
//   - un enlace para buscar noticias de esas fechas
//
// Nunca se muestra antes de responder: delataría el activo y las fechas.

import { loadJson } from "./data.js";

// Diferencia mínima (en puntos porcentuales) para decir que los tipos
// "subieron" o "bajaron". Por debajo, los consideramos estables.
// - FED: su tipo "efectivo" es una media mensual que oscila un poco aunque la
//   FED no haga nada, así que exigimos 0,2 puntos.
// - BCE: es un tipo oficial que solo cambia cuando el BCE lo decide, así que
//   cualquier cambio es real (p. ej. de 0 % a −0,10 % en 2014).
const RATE_CHANGE_THRESHOLD = { fed: 0.2, ecb: 0.01 };

// Tipos de interés: { values: [ { t: "1954-07-01", v: 0.8 }, ... ] }
let rates = null; // { fed: {...}, ecb: {...} }
let events = null; // [ { date, markets, title, text }, ... ]

// Activos europeos o con el euro: en ellos se muestran también los tipos del BCE
const ECB_TICKERS = ["EURUSD", "EURGBP", "STOXX50", "DAX", "IBEX", "SAN"];

export function isEcbRelevant(ticker) {
  return ECB_TICKERS.includes(ticker);
}

// Carga los datos de contexto (una sola vez)
export async function loadContext() {
  if (rates === null) {
    // Promise.all descarga los tres archivos a la vez, en paralelo
    const [fed, ecb, eventList] = await Promise.all([
      loadJson("data/fed_funds.json"),
      loadJson("data/ecb_rate.json"),
      loadJson("data/events.json"),
    ]);
    rates = { fed, ecb };
    events = eventList;
  }
}

// Tipo de interés del mes de una fecha "AAAA-MM-DD". Si ese mes aún no tiene
// dato (FRED publica con retraso), usa el último mes disponible. Si la fecha
// es anterior a la serie (p. ej. el BCE antes de 1999), devuelve null.
function rateAt(series, date) {
  const monthStart = `${date.slice(0, 7)}-01`; // "2021-03-15" → "2021-03-01"
  let rate = null;
  for (const entry of series.values) {
    if (entry.t > monthStart) {
      break; // los datos están ordenados: a partir de aquí son meses posteriores
    }
    rate = entry.v;
  }
  return rate;
}

// Cómo cambiaron los tipos de un banco central ("fed" o "ecb") entre dos fechas.
// Devuelve { start, end, trend: "up" | "down" | "flat" }, o null si no hay datos.
export function describeRates(bank, firstDate, lastDate) {
  const start = rateAt(rates[bank], firstDate);
  const end = rateAt(rates[bank], lastDate);
  if (start === null || end === null) {
    return null;
  }
  let trend = "flat";
  const threshold = RATE_CHANGE_THRESHOLD[bank];
  if (end - start >= threshold) {
    trend = "up";
  } else if (start - end >= threshold) {
    trend = "down";
  }
  return { start, end, trend };
}

// Eventos entre dos fechas que afectan a un mercado ("bolsa", "forex", "crypto")
export function eventsInRange(firstDate, lastDate, market) {
  return events.filter(
    (event) =>
      event.date >= firstDate &&
      event.date <= lastDate &&
      (event.markets.includes("all") || event.markets.includes(market))
  );
}

// Nombre del activo pensado para buscar en Google: sin aclaraciones entre
// paréntesis ni el "/ USD" de las crypto.
//   "Oro (fondo GLD)" → "Oro"   "Bitcoin / USD" → "Bitcoin"   "Euro / Dólar" → "Euro Dólar"
export function searchName(name) {
  return name
    .replace(/\s*\(.*\)/, "")  // quita "(fondo GLD)", "(Alemania)"...
    .replace(/ \/ USD$/, "")   // "Bitcoin / USD" → "Bitcoin"
    .replace(" / ", " ");      // "Euro / Dólar" → "Euro Dólar"
}

// Enlace a una búsqueda de Google con el texto dado
// (p. ej. "S&P 500 noticias 23 de marzo de 2020").
// URLSearchParams se encarga de codificar espacios, tildes y "&" para la URL.
export function newsSearchUrl(text) {
  const params = new URLSearchParams({ q: text });
  return `https://www.google.com/search?${params}`;
}
