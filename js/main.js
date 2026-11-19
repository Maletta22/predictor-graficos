// main.js — flujo del juego:
//   1. Se muestra un fragmento aleatorio (60 velas).
//   2. El usuario pulsa "Sube" o "Baja".
//   3. Se revelan las 20 velas siguientes y se dice si acertó.
//   4. "Siguiente gráfico" vuelve al paso 1.

import { pickRandomRound } from "./data.js";
import { createCandleChart, drawCandles, revealCandles } from "./chart.js";

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
const nextButton = document.getElementById("next-round");

// La ronda que se está jugando ahora mismo
let currentRound = null;

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
  const { outcome, changePct } = evaluateGuess(round, guess);

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
  const lastDate = round.hidden[round.hidden.length - 1].t;
  resultAsset.textContent =
    `Era ${round.name} (${MARKET_NAMES[round.market]}), ` +
    `del ${formatDate(firstDate)} al ${formatDate(lastDate)}.`;

  choiceBox.classList.add("hidden");
  resultBox.classList.remove("hidden");
}

upButton.addEventListener("click", () => answer("up"));
downButton.addEventListener("click", () => answer("down"));
nextButton.addEventListener("click", newRound);

newRound(); // primera ronda al abrir la página
