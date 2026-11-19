// data.js — cargar los datos y elegir un fragmento al azar.

// Reglas del juego (ver CLAUDE.md, apartado 3)
export const VISIBLE_CANDLES = 60;   // velas que ve el usuario
export const REVEALED_CANDLES = 20;  // velas que se revelan después
const MAX_GAP_DAYS = 7;              // saltos mayores = agujero en los datos
const MAX_TRIES = 50;                // intentos antes de rendirse

// Guardamos lo ya descargado para no pedirlo dos veces al servidor
let assetList = null;
const assetCache = {};

// Descarga un archivo JSON y lo convierte en un objeto de JavaScript.
// Se exporta porque context.js también la usa.
export async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${path} (error ${response.status})`);
  }
  return response.json();
}

// Lista de activos disponibles (data/index.json)
async function loadAssetList() {
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

// Elige un activo y un fragmento al azar. Devuelve:
//   visible: las 60 velas que ve el usuario (normalizadas)
//   hidden:  las 20 velas siguientes, para revelar después (Fase 3)
//   decisionPrice / finalPrice: precios REALES de cierre al decidir y
//     20 velas después (solo se muestran tras responder)
//   y los datos del activo (nombre, mercado...), que NO se muestran aún.
export async function pickRandomRound() {
  const list = await loadAssetList();
  const totalCandles = VISIBLE_CANDLES + REVEALED_CANDLES;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    // 1. Un activo al azar (todos con la misma probabilidad)
    const info = list[randomInt(list.length)];
    const asset = await loadAsset(info.file);

    // 2. Un punto de inicio al azar, dejando sitio para las 80 velas
    const start = randomInt(asset.candles.length - totalCandles + 1);
    const windowCandles = asset.candles.slice(start, start + totalCandles);

    // 3. Si el fragmento tiene un agujero en los datos, probar otro
    if (hasBigGap(windowCandles)) {
      continue;
    }

    // 4. Separar lo visible de lo oculto y normalizar
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
