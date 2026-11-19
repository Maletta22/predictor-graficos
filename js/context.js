// context.js — contexto educativo que se muestra DESPUÉS de responder:
//   - tipos de interés de la FED al principio y al final del periodo
//   - grandes eventos de esas fechas (data/events.json)
//   - un enlace para buscar noticias de esas fechas
//
// Nunca se muestra antes de responder: delataría el activo y las fechas.

import { loadJson } from "./data.js";

// Diferencia mínima (en puntos porcentuales) para decir que los tipos
// "subieron" o "bajaron". Por debajo, los consideramos estables.
const FED_CHANGE_THRESHOLD = 0.2;

let fedFunds = null; // { values: [ { t: "1954-07-01", v: 0.8 }, ... ] }
let events = null;   // [ { date, markets, title, text }, ... ]

// Carga los datos de contexto (una sola vez)
export async function loadContext() {
  if (fedFunds === null) {
    // Promise.all descarga los dos archivos a la vez, en paralelo
    [fedFunds, events] = await Promise.all([
      loadJson("data/fed_funds.json"),
      loadJson("data/events.json"),
    ]);
  }
}

// Tipo de la FED del mes de una fecha "AAAA-MM-DD". Si ese mes aún no tiene
// dato (FRED publica con retraso), usa el último mes disponible.
function fedRateAt(date) {
  const monthStart = `${date.slice(0, 7)}-01`; // "2021-03-15" → "2021-03-01"
  let rate = null;
  for (const entry of fedFunds.values) {
    if (entry.t > monthStart) {
      break; // los datos están ordenados: a partir de aquí son meses posteriores
    }
    rate = entry.v;
  }
  return rate;
}

// Cómo cambiaron los tipos de la FED entre dos fechas.
// Devuelve { start, end, trend: "up" | "down" | "flat" }, o null si no hay datos.
export function describeFed(firstDate, lastDate) {
  const start = fedRateAt(firstDate);
  const end = fedRateAt(lastDate);
  if (start === null || end === null) {
    return null;
  }
  let trend = "flat";
  if (end - start >= FED_CHANGE_THRESHOLD) {
    trend = "up";
  } else if (start - end >= FED_CHANGE_THRESHOLD) {
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

// Enlace a Google Noticias con la búsqueda limitada a esas fechas.
// Google pide las fechas como mes/día/año.
export function newsSearchUrl(query, fromDate, toDate) {
  const toUsDate = (iso) => {
    const [year, month, day] = iso.split("-");
    return `${Number(month)}/${Number(day)}/${year}`;
  };
  const params = new URLSearchParams({
    q: query,
    tbm: "nws", // pestaña "Noticias"
    tbs: `cdr:1,cd_min:${toUsDate(fromDate)},cd_max:${toUsDate(toDate)}`, // rango de fechas
  });
  return `https://www.google.com/search?${params}`;
}
