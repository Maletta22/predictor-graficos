// main.js — flujo del juego.
// Fase 2: mostrar un fragmento aleatorio. Los botones Sube/Baja llegan en la Fase 3.

import { pickRandomRound } from "./data.js";
import { createCandleChart, drawCandles } from "./chart.js";

const message = document.getElementById("message");
const newRoundButton = document.getElementById("new-round");

createCandleChart(document.getElementById("chart"));

// Elige un fragmento nuevo y lo dibuja
async function newRound() {
  message.textContent = "";
  try {
    const round = await pickRandomRound();
    drawCandles(round.visible);
  } catch (error) {
    message.textContent = `Error al cargar los datos: ${error.message}`;
    console.error(error);
  }
}

newRoundButton.addEventListener("click", newRound);
newRound(); // primer gráfico al abrir la página
