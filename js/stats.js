// stats.js — estadísticas del jugador y comparación con el azar.
//
// Las estadísticas se guardan en localStorage: un pequeño almacén del
// navegador que conserva datos aunque cierres la página. Cada navegador
// tiene el suyo (no se comparte entre ordenadores).

const STORAGE_KEY = "predictor-stats-v1";

// Estadísticas vacías, para un jugador nuevo.
// Los grupos (byMarket, byHorizon, byTimeframe, byAsset) guardan { played, correct } por
// cada mercado, plazo o activo, y se van creando a medida que se juega:
//   byMarket:  { "acciones": {...}, "crypto": {...} }
//   byHorizon: { "10": {...}, "20": {...} }    (velas reveladas)
//   byTimeframe: { "1d": {...}, "1w": {...} }   (diaria / semanal)
//   byAsset:   { "BTCUSDT": {...}, "GOLD": {...} }
function emptyStats() {
  return {
    played: 0,        // rondas que cuentan (sin empates)
    correct: 0,       // aciertos
    ties: 0,          // empates (no cuentan para el % de acierto)
    currentStreak: 0, // aciertos seguidos ahora mismo
    bestStreak: 0,    // mejor racha de aciertos seguidos
    byMarket: {},
    byHorizon: {},
    byTimeframe: {},
    byAsset: {},
  };
}

// Suma una ronda a un grupo, creando la entrada si aún no existe
function addToGroup(group, key, isCorrect) {
  if (!(key in group)) {
    group[key] = { played: 0, correct: 0 };
  }
  group[key].played++;
  if (isCorrect) {
    group[key].correct++;
  }
}

// Lee las estadísticas guardadas. Si no hay, o no se pueden leer
// (p. ej. navegación privada), empieza de cero.
export function loadStats() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      // Mezclamos con unas vacías por si faltara algún campo
      return { ...emptyStats(), ...JSON.parse(saved) };
    }
  } catch (error) {
    console.warn("No se pudieron leer las estadísticas:", error);
  }
  return emptyStats();
}

function saveStats(stats) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch (error) {
    console.warn("No se pudieron guardar las estadísticas:", error);
  }
}

// Apunta el resultado de una ronda y lo guarda.
//   round: la ronda jugada (de ella sacamos mercado, activo y velas reveladas)
//   outcome: "correct" | "wrong" | "tie"
export function recordResult(stats, round, outcome) {
  if (outcome === "tie") {
    // El empate no cuenta: ni suma rondas ni rompe la racha
    stats.ties++;
  } else {
    const isCorrect = outcome === "correct";
    stats.played++;
    addToGroup(stats.byMarket, round.market, isCorrect);
    addToGroup(stats.byHorizon, String(round.hidden.length), isCorrect);
    addToGroup(stats.byTimeframe, round.timeframe, isCorrect);
    addToGroup(stats.byAsset, round.ticker, isCorrect);
    if (isCorrect) {
      stats.correct++;
      stats.currentStreak++;
      stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
    } else {
      stats.currentStreak = 0;
    }
  }
  saveStats(stats);
}

// Borra todas las estadísticas
export function resetStats() {
  const stats = emptyStats();
  saveStats(stats);
  return stats;
}

// ---------------------------------------------------------------------------
// Test binomial unilateral (p = 0,5)
// ---------------------------------------------------------------------------
//
// Pregunta: si en vez de pensar lanzaras una moneda en cada ronda, ¿qué
// probabilidad hay de acertar "correct" veces o más de "played"?
//
//   P(X ≥ k) = suma, para i de k a n, de  C(n, i) · 0,5ⁿ
//
// C(n, i) ("n sobre i") se hace enorme enseguida (C(1000, 500) tiene 300
// cifras), así que trabajamos con logaritmos, que convierten los productos
// en sumas y mantienen los números pequeños.

// ln(n!) = ln(1) + ln(2) + ... + ln(n)
function logFactorial(n) {
  let sum = 0;
  for (let i = 2; i <= n; i++) {
    sum += Math.log(i);
  }
  return sum;
}

// Probabilidad de acertar k o más de n lanzando una moneda
export function coinProbabilityAtLeast(k, n) {
  const logNFact = logFactorial(n);
  let probability = 0;
  for (let i = k; i <= n; i++) {
    // ln( C(n,i) · 0,5ⁿ ) = ln(n!) − ln(i!) − ln((n−i)!) − n·ln(2)
    const logTerm = logNFact - logFactorial(i) - logFactorial(n - i) - n * Math.LN2;
    probability += Math.exp(logTerm);
  }
  return Math.min(probability, 1); // por redondeos podría pasar de 1 por muy poco
}
