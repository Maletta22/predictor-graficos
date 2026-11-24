// data.js — cargar los datos y elegir un fragmento al azar.

// Reglas del juego (ver CLAUDE.md, apartado 3)
export const VISIBLE_CANDLES = 60;   // velas que ve el usuario
// Las velas que se revelan después (10, 20, 30 o 50) las elige el usuario
const MAX_TRIES = 50;                // intentos antes de rendirse

// Temporalidades: cuánto dura cada vela.
//   maxGapDays: un salto mayor entre dos velas seguidas = agujero en los datos
//   daysPerCandle: días naturales que "ocupa" cada vela, para estimar si un
//     activo tiene datos suficientes en unas fechas (ver isAssetAvailable).
//     En la diaria, las crypto cotizan todos los días y el resto unos 5 de
//     cada 7 (y algún festivo): les pedimos un 50 % más de días por si acaso.
export const TIMEFRAMES = {
  "1d": { name: "Diaria", unit: "velas", maxGapDays: 7, daysPerCandle: { crypto: 1, other: 1.5 } },
  "1w": { name: "Semanal", unit: "semanas", maxGapDays: 14, daysPerCandle: { crypto: 7, other: 7 } },
};

// Guardamos lo ya descargado para no pedirlo dos veces al servidor
let assetList = null;
const assetCache = {};

const MAX_ATTEMPTS = 3; // intentos de descarga antes de dar error

// Espera "ms" milisegundos
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Descarga un archivo JSON y lo convierte en un objeto de JavaScript.
// Si la conexión se corta (p. ej. mala cobertura en el móvil), lo reintenta
// hasta MAX_ATTEMPTS veces, esperando un poco más cada vez.
// Se exporta porque context.js también la usa.
export async function loadJson(path) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`No se pudo cargar ${path} (error ${response.status})`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      console.warn(`Intento ${attempt} de ${MAX_ATTEMPTS} fallido para ${path}:`, error.message);
      await wait(300 * attempt); // 0,3 s, 0,6 s...
    }
  }
  throw lastError;
}

// Lista de activos disponibles (data/index.json).
// Se exporta para rellenar el desplegable "Activo".
export async function loadAssetList() {
  if (assetList === null) {
    assetList = await loadJson("data/index.json");
  }
  return assetList;
}

// Velas de un activo concreto (data/<ticker>.json)
async function loadAsset(file) {
  if (!(file in assetCache)) {
    const asset = await loadJson(`data/${file}`);
    asset.candles = asset.candles.map(unpackCandle);
    assetCache[file] = asset;
  }
  return assetCache[file];
}

// En los archivos, cada vela es una lista corta para que pesen menos:
//   ["2021-03-01", 45000, 49800, 44900, 49600]  (fecha, o, h, l, c)
// El resto del código usa objetos con nombre, así que la convertimos:
//   { t: "2021-03-01", o: 45000, h: 49800, l: 44900, c: 49600 }
// (Si ya viene como objeto, formato antiguo, se deja igual.)
function unpackCandle(candle) {
  if (!Array.isArray(candle)) {
    return candle;
  }
  const [t, o, h, l, c] = candle;
  return { t, o, h, l, c };
}

// Número entero al azar entre 0 y max-1
function randomInt(max) {
  return Math.floor(Math.random() * max);
}

// Días naturales entre dos fechas "AAAA-MM-DD"
export function daysBetween(dateA, dateB) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((new Date(dateB) - new Date(dateA)) / MS_PER_DAY);
}

// ¿Hay algún salto de más de "maxGapDays" entre dos velas seguidas?
function hasBigGap(candles, maxGapDays) {
  for (let i = 1; i < candles.length; i++) {
    if (daysBetween(candles[i - 1].t, candles[i].t) > maxGapDays) {
      return true;
    }
  }
  return false;
}

// Lunes de la semana de una fecha: "2024-03-14" (jueves) → "2024-03-11"
function mondayOf(isoDate) {
  const day = new Date(isoDate);
  const daysSinceMonday = (day.getUTCDay() + 6) % 7; // lunes 0, martes 1... domingo 6
  day.setUTCDate(day.getUTCDate() - daysSinceMonday);
  return day.toISOString().slice(0, 10);
}

// Junta las velas diarias en velas semanales (de lunes a domingo):
//   apertura = la del primer día de la semana, cierre = la del último,
//   máximo y mínimo = los extremos de toda la semana.
// Cada vela semanal lleva la fecha de su primer día con cotización.
export function toWeekly(dailyCandles) {
  const weeks = [];
  let currentMonday = null;
  for (const candle of dailyCandles) {
    const monday = mondayOf(candle.t);
    if (monday !== currentMonday) {
      // Empieza una semana nueva: copia de la vela del primer día
      weeks.push({ ...candle });
      currentMonday = monday;
    } else {
      // Misma semana: ampliar máximo y mínimo, y el cierre pasa a ser el de hoy
      const week = weeks[weeks.length - 1];
      week.h = Math.max(week.h, candle.h);
      week.l = Math.min(week.l, candle.l);
      week.c = candle.c;
    }
  }
  return weeks;
}

// Convierte los precios para que "base" valga 100.
// Así no se puede reconocer el activo por su precio.
function normalize(candles, base) {
  return candles.map((candle) => ({
    t: candle.t,
    o: (candle.o / base) * 100,
    h: (candle.h / base) * 100,
    l: (candle.l / base) * 100,
    c: (candle.c / base) * 100,
  }));
}

// ---------------------------------------------------------------------------
// Filtros: activo (o mercado) y rango de fechas
// ---------------------------------------------------------------------------

// Rango de fechas a partir de los años elegidos ("" = sin límite).
//   rangeFromYears("2008", "2010") → { from: "2008-01-01", to: "2010-12-31" }
// Las fechas "AAAA-MM-DD" se pueden comparar como texto.
export function rangeFromYears(fromYear, toYear) {
  return {
    from: fromYear === "" ? "0000-01-01" : `${fromYear}-01-01`,
    to: toYear === "" ? "9999-12-31" : `${toYear}-12-31`,
  };
}

// Activos que encajan con los elegidos en el selector:
//   []                 → todos (aleatorio)
//   ["AAPL", "EURUSD"] → solo esos (pueden ser de mercados distintos)
// Elegir un mercado entero equivale a elegir todos sus activos.
export function assetsForChoice(assets, tickers) {
  if (tickers.length === 0) {
    return assets;
  }
  return assets.filter((a) => tickers.includes(a.ticker));
}

// ¿Tiene el activo datos suficientes en el rango para una ronda de
// "totalCandles" velas? Es una estimación rápida con las fechas de
// data/index.json (sin descargar las velas): mira cuántos días naturales
// hay en común entre el rango y los datos del activo, y cuántos días
// "ocupa" cada vela en esa temporalidad (ver TIMEFRAMES).
export function isAssetAvailable(info, range, totalCandles, timeframe = "1d") {
  const start = info.first > range.from ? info.first : range.from; // la fecha más tardía
  const end = info.last < range.to ? info.last : range.to;         // la más temprana
  if (start > end) {
    return false; // no hay ningún día en común
  }
  const perCandle = TIMEFRAMES[timeframe].daysPerCandle;
  const daysPerCandle = info.market === "crypto" ? perCandle.crypto : perCandle.other;
  return daysBetween(start, end) >= totalCandles * daysPerCandle;
}

// Probabilidad de que salga cada mercado (en %). Sin esto, cada ACTIVO
// tendría la misma probabilidad y saldrían sobre todo acciones (hay 16).
// Solo se usan en el modo "Todos". Si el filtro de fechas deja fuera algún
// mercado, los que quedan se reparten en la misma proporción.
// En una selección personal, todos los mercados elegidos valen lo mismo
// (2 mercados → 50 % y 50 %; 3 → 33 % cada uno...).
export const MARKET_WEIGHTS = {
  indices: 22.5,
  acciones: 22.5,
  forex: 22.5,
  crypto: 22.5,
  materias: 10,
};
const DEFAULT_WEIGHT = 22.5; // para un mercado nuevo que no esté en la lista

// Elige un activo de "list": primero un mercado y después, dentro de ese
// mercado, un activo cualquiera (todos con la misma probabilidad).
//   useWeights: true  → cada mercado según MARKET_WEIGHTS (modo "Todos")
//               false → todos los mercados con la misma probabilidad
export function pickWeightedAsset(list, useWeights = true) {
  const markets = [...new Set(list.map((a) => a.market))]; // mercados presentes, sin repetir
  const weightOf = (market) => (useWeights ? MARKET_WEIGHTS[market] ?? DEFAULT_WEIGHT : 1);
  const total = markets.reduce((sum, market) => sum + weightOf(market), 0);

  // "Ruleta": un número al azar entre 0 y el total; cada mercado ocupa un
  // tramo tan largo como su peso, y gana aquel en cuyo tramo cae el número.
  let ticket = Math.random() * total;
  let chosenMarket = markets[markets.length - 1];
  for (const market of markets) {
    ticket -= weightOf(market);
    if (ticket < 0) {
      chosenMarket = market;
      break;
    }
  }

  const inMarket = list.filter((a) => a.market === chosenMarket);
  return inMarket[randomInt(inMarket.length)];
}

// Elige un activo y un fragmento al azar.
//   revealCount: cuántas velas se revelarán después (10, 20, 30 o 50)
//   tickers: qué activos pueden salir ([] = todos, ver assetsForChoice)
//   range: rango de fechas { from, to } (ver rangeFromYears)
//   timeframe: "1d" (velas diarias) o "1w" (semanales), ver TIMEFRAMES
// Devuelve:
//   visible: las 60 velas que ve el usuario (normalizadas)
//   hidden:  las "revealCount" velas siguientes, para revelar después
//   decisionPrice / finalPrice: precios REALES de cierre al decidir y
//     al final (solo se muestran tras responder)
//   y los datos del activo (nombre, mercado...), que NO se muestran aún.
export async function pickRandomRound(revealCount, tickers = [], range = rangeFromYears("", ""), timeframe = "1d") {
  const totalCandles = VISIBLE_CANDLES + revealCount;
  const fullList = await loadAssetList();
  // Solo los activos elegidos que tienen datos en el rango
  const list = assetsForChoice(fullList, tickers).filter((info) =>
    isAssetAvailable(info, range, totalCandles, timeframe)
  );
  if (list.length === 0) {
    throw new Error("No hay datos para esa combinación de activo y fechas");
  }

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    // 1. Un activo al azar: primero el mercado y luego un activo de ese
    //    mercado. Pesos de MARKET_WEIGHTS solo en el modo "Todos" (tickers = [])
    const info = pickWeightedAsset(list, tickers.length === 0);
    const asset = await loadAsset(info.file);

    // 2. Las velas que caen dentro del rango de fechas (en la semanal, se
    //    juntan después las diarias de cada semana)
    const dailyInRange = asset.candles.filter((c) => c.t >= range.from && c.t <= range.to);
    const inRange = timeframe === "1w" ? toWeekly(dailyInRange) : dailyInRange;
    if (inRange.length < totalCandles) {
      continue; // la estimación falló por poco: probar otro activo
    }

    // 3. Un punto de inicio al azar, dejando sitio para todas las velas
    const start = randomInt(inRange.length - totalCandles + 1);
    const windowCandles = inRange.slice(start, start + totalCandles);

    // 4. Si el fragmento tiene un agujero en los datos, probar otro
    if (hasBigGap(windowCandles, TIMEFRAMES[timeframe].maxGapDays)) {
      continue;
    }

    // 5. Separar lo visible de lo oculto y normalizar
    const visible = windowCandles.slice(0, VISIBLE_CANDLES);
    const hidden = windowCandles.slice(VISIBLE_CANDLES);
    const base = visible[visible.length - 1].c; // cierre de la última vela visible

    return {
      ticker: asset.ticker,
      name: asset.name,
      market: asset.market,
      timeframe, // "1d" o "1w"
      visible: normalize(visible, base),
      hidden: normalize(hidden, base),
      decisionPrice: base,
      finalPrice: hidden[hidden.length - 1].c,
    };
  }

  throw new Error("No se encontró ningún fragmento válido");
}
