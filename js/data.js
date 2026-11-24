// data.js — cargar los datos y elegir un fragmento al azar.

// Reglas del juego (ver CLAUDE.md, apartado 3)
export const VISIBLE_CANDLES = 60;   // velas que ve el usuario
// Las velas que se revelan después (10, 20, 30 o 50) las elige el usuario
const MAX_GAP_DAYS = 7;              // saltos mayores = agujero en los datos
const MAX_TRIES = 50;                // intentos antes de rendirse

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
    assetCache[file] = await loadJson(`data/${file}`);
  }
  return assetCache[file];
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

// ¿Hay algún salto de más de MAX_GAP_DAYS entre dos velas seguidas?
function hasBigGap(candles) {
  for (let i = 1; i < candles.length; i++) {
    if (daysBetween(candles[i - 1].t, candles[i].t) > MAX_GAP_DAYS) {
      return true;
    }
  }
  return false;
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
// hay en común entre el rango y los datos del activo. Las crypto cotizan
// todos los días; el resto, unos 5 de cada 7 (y algún festivo), así que les
// pedimos un 50 % más de días por si acaso.
export function isAssetAvailable(info, range, totalCandles) {
  const start = info.first > range.from ? info.first : range.from; // la fecha más tardía
  const end = info.last < range.to ? info.last : range.to;         // la más temprana
  if (start > end) {
    return false; // no hay ningún día en común
  }
  const daysPerCandle = info.market === "crypto" ? 1 : 1.5;
  return daysBetween(start, end) >= totalCandles * daysPerCandle;
}

// Elige un activo y un fragmento al azar.
//   revealCount: cuántas velas se revelarán después (10, 20, 30 o 50)
//   tickers: qué activos pueden salir ([] = todos, ver assetsForChoice)
//   range: rango de fechas { from, to } (ver rangeFromYears)
// Devuelve:
//   visible: las 60 velas que ve el usuario (normalizadas)
//   hidden:  las "revealCount" velas siguientes, para revelar después
//   decisionPrice / finalPrice: precios REALES de cierre al decidir y
//     al final (solo se muestran tras responder)
//   y los datos del activo (nombre, mercado...), que NO se muestran aún.
export async function pickRandomRound(revealCount, tickers = [], range = rangeFromYears("", "")) {
  const totalCandles = VISIBLE_CANDLES + revealCount;
  const fullList = await loadAssetList();
  // Solo los activos elegidos que tienen datos en el rango
  const list = assetsForChoice(fullList, tickers).filter((info) =>
    isAssetAvailable(info, range, totalCandles)
  );
  if (list.length === 0) {
    throw new Error("No hay datos para esa combinación de activo y fechas");
  }

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    // 1. Un activo al azar (todos con la misma probabilidad)
    const info = list[randomInt(list.length)];
    const asset = await loadAsset(info.file);

    // 2. Las velas que caen dentro del rango de fechas
    const inRange = asset.candles.filter((c) => c.t >= range.from && c.t <= range.to);
    if (inRange.length < totalCandles) {
      continue; // la estimación falló por poco: probar otro activo
    }

    // 3. Un punto de inicio al azar, dejando sitio para todas las velas
    const start = randomInt(inRange.length - totalCandles + 1);
    const windowCandles = inRange.slice(start, start + totalCandles);

    // 4. Si el fragmento tiene un agujero en los datos, probar otro
    if (hasBigGap(windowCandles)) {
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
      visible: normalize(visible, base),
      hidden: normalize(hidden, base),
      decisionPrice: base,
      finalPrice: hidden[hidden.length - 1].c,
    };
  }

  throw new Error("No se encontró ningún fragmento válido");
}
