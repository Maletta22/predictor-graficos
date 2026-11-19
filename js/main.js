// main.js — flujo del juego:
//   1. Se muestra un fragmento aleatorio (60 velas).
//   2. El usuario pulsa "Sube" o "Baja".
//   3. Se revelan las 20 velas siguientes y se dice si acertó.
//   4. "Siguiente gráfico" vuelve al paso 1.

import { pickRandomRound } from "./data.js";
import { createCandleChart, drawCandles, revealCandles } from "./chart.js";
import { loadStats, recordResult, resetStats, coinProbabilityAtLeast } from "./stats.js";

// Variación mínima para que la ronda cuente (CLAUDE.md, apartado 3)
const TIE_THRESHOLD_PCT = 0.1;

// Nombres de los mercados para mostrarlos al usuario
const MARKET_NAMES = { crypto: "Crypto", bolsa: "Bolsa", forex: "FOREX" };

// Elementos de la página que vamos a usar
const message = document.getElementById("message");
const choiceBox = document.getElementById("choice");
const upButton = document.getElementById("guess-up");
const downButton = document.getElementById("guess-down");
const resultBox = document.getElementById("result");
const resultTitle = document.getElementById("result-title");
const resultChange = document.getElementById("result-change");
const resultAsset = document.getElementById("result-asset");
const resultDates = document.getElementById("result-dates");
const resultPriceStart = document.getElementById("result-price-start");
const resultPriceEnd = document.getElementById("result-price-end");
const nextButton = document.getElementById("next-round");

// Elementos de las estadísticas
const statPlayed = document.getElementById("stat-played");
const statCorrect = document.getElementById("stat-correct");
const statPct = document.getElementById("stat-pct");
const statStreak = document.getElementById("stat-streak");
const statBest = document.getElementById("stat-best");
const statChance = document.getElementById("stat-chance");
const statMarkets = document.getElementById("stat-markets");
const statTies = document.getElementById("stat-ties");
const resetButton = document.getElementById("reset-stats");

// La ronda que se está jugando ahora mismo (null = ya respondida)
let currentRound = null;

// Estadísticas guardadas en el navegador
let stats = loadStats();

createCandleChart(document.getElementById("chart"));

// ---------------------------------------------------------------------------
// Lógica del juego (sin tocar la página)
// ---------------------------------------------------------------------------

// Decide el resultado de una ronda.
//   guess: "up" (sube) o "down" (baja)
// Devuelve { outcome: "correct" | "wrong" | "tie", changePct }
function evaluateGuess(round, guess) {
  const lastVisibleClose = round.visible[round.visible.length - 1].c; // = 100
  const lastRevealedClose = round.hidden[round.hidden.length - 1].c;
  const changePct = ((lastRevealedClose - lastVisibleClose) / lastVisibleClose) * 100;

  if (Math.abs(changePct) < TIE_THRESHOLD_PCT) {
    return { outcome: "tie", changePct };
  }
  const wentUp = changePct > 0;
  const guessedUp = guess === "up";
  return { outcome: wentUp === guessedUp ? "correct" : "wrong", changePct };
}

// ---------------------------------------------------------------------------
// Formatos en español
// ---------------------------------------------------------------------------

// 3.2549 → "3,25 %"
function formatPct(value) {
  return `${value.toLocaleString("es-ES", { maximumFractionDigits: 2 })} %`;
}

// Precio real con separadores españoles. Los precios pequeños (divisas como
// EUR/USD ≈ 1,08) necesitan 4 decimales; el resto, 2.
// 8169.87 → "8.169,87"   1.0835 → "1,0835"
function formatPrice(value) {
  const decimals = value < 10 ? 4 : 2;
  return value.toLocaleString("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// "2021-03-01" → "1 de marzo de 2021"
function formatDate(isoDate) {
  return new Date(isoDate).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC", // las fechas son días, sin hora: evitar desfases de zona horaria
  });
}

// ---------------------------------------------------------------------------
// Pasos del juego (actualizan la página)
// ---------------------------------------------------------------------------

// Paso 1: nueva ronda
async function newRound() {
  message.textContent = "";
  resultBox.classList.add("hidden");
  choiceBox.classList.remove("hidden");
  upButton.disabled = true; // desactivados hasta que el gráfico esté listo
  downButton.disabled = true;

  try {
    currentRound = await pickRandomRound();
    drawCandles(currentRound.visible);
    upButton.disabled = false;
    downButton.disabled = false;
  } catch (error) {
    message.textContent = `Error al cargar los datos: ${error.message}`;
    console.error(error);
  }
}

// Pasos 2 y 3: el usuario responde y se revela el resultado
function answer(guess) {
  const round = currentRound;
  if (round === null) {
    return; // ya respondida: evita apuntarla dos veces
  }
  currentRound = null;

  const { outcome, changePct } = evaluateGuess(round, guess);
  recordResult(stats, round.market, outcome);
  renderStats();

  revealCandles(round.visible, round.hidden);

  if (outcome === "correct") {
    resultTitle.textContent = "✅ ¡Acierto!";
  } else if (outcome === "wrong") {
    resultTitle.textContent = "❌ Fallo";
  } else {
    resultTitle.textContent = "➖ Empate: esta ronda no cuenta";
  }
  resultTitle.className = `result-title ${outcome}`;

  const direction = changePct > 0 ? "subió" : "bajó";
  resultChange.textContent =
    `En las 20 velas siguientes el precio ${direction} un ${formatPct(Math.abs(changePct))}.` +
    (outcome === "tie" ? ` (Menos de un ${TIE_THRESHOLD_PCT.toLocaleString("es-ES")} % se considera empate.)` : "");

  const firstDate = round.visible[0].t;
  const decisionDate = round.visible[round.visible.length - 1].t;
  const lastDate = round.hidden[round.hidden.length - 1].t;
  resultAsset.textContent = `${round.name} (${MARKET_NAMES[round.market]})`;
  resultDates.textContent = `Del ${formatDate(firstDate)} al ${formatDate(lastDate)}`;
  resultPriceStart.textContent = `${formatPrice(round.decisionPrice)} (${formatDate(decisionDate)})`;
  resultPriceEnd.textContent = `${formatPrice(round.finalPrice)} (${formatDate(lastDate)})`;

  choiceBox.classList.add("hidden");
  resultBox.classList.remove("hidden");
}

// ---------------------------------------------------------------------------
// Estadísticas (Fase 4)
// ---------------------------------------------------------------------------

// % de acierto redondeado, o "–" si aún no hay rondas
function hitRate(correct, played) {
  return played === 0 ? "–" : formatPct(Math.round((correct / played) * 100));
}

// Frase de comparación con el azar (test binomial, ver stats.js)
function chanceSentence(correct, played) {
  if (played === 0) {
    return "Juega unas rondas y te comparo con una moneda lanzada al aire.";
  }
  const probability = coinProbabilityAtLeast(correct, played);
  const pct = Math.round(probability * 100);
  const howOften = probability < 0.01 ? "menos del 1 %" : `el ${formatPct(pct)}`;
  return `Con ${correct} de ${played}, una moneda lo haría igual de bien o mejor ${howOften} de las veces.`;
}

// Escribe las estadísticas en la página
function renderStats() {
  statPlayed.textContent = stats.played;
  statCorrect.textContent = stats.correct;
  statPct.textContent = hitRate(stats.correct, stats.played);
  statStreak.textContent = stats.currentStreak;
  statBest.textContent = stats.bestStreak;
  statChance.textContent = chanceSentence(stats.correct, stats.played);

  // Una fila de la tabla por mercado
  statMarkets.innerHTML = "";
  for (const market of Object.keys(MARKET_NAMES)) {
    const { played, correct } = stats.byMarket[market];
    const row = document.createElement("tr");
    for (const text of [MARKET_NAMES[market], played, correct, hitRate(correct, played)]) {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.appendChild(cell);
    }
    statMarkets.appendChild(row);
  }

  statTies.textContent = stats.ties > 0 ? `Empates (no cuentan): ${stats.ties}` : "";
}

function onResetStats() {
  // confirm() muestra una ventana de "Aceptar / Cancelar" del navegador
  if (confirm("¿Seguro que quieres borrar todas tus estadísticas?")) {
    stats = resetStats();
    renderStats();
  }
}

upButton.addEventListener("click", () => answer("up"));
downButton.addEventListener("click", () => answer("down"));
nextButton.addEventListener("click", newRound);
resetButton.addEventListener("click", onResetStats);

renderStats();
newRound(); // primera ronda al abrir la página
