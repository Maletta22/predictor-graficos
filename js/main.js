// main.js — flujo del juego:
//   1. Se muestra un fragmento aleatorio (60 velas).
//   2. El usuario pulsa "Sube" o "Baja".
//   3. Se revelan las velas siguientes (10, 20, 30 o 50, según los ajustes)
//      y se dice si acertó.
//   4. "Siguiente gráfico" vuelve al paso 1.

import { pickRandomRound, loadAssetList } from "./data.js";
import { createCandleChart, drawCandles, revealCandles } from "./chart.js";
import { loadStats, recordResult, resetStats, coinProbabilityAtLeast } from "./stats.js";
import {
  loadContext, describeRates, isEcbRelevant, eventsInRange, newsSearchUrl, searchName,
} from "./context.js";
import { loadSettings, saveSettings, REVEAL_OPTIONS } from "./settings.js";
import { createLogo } from "./logos.js";
import { drawBackdrop } from "./backdrop.js";
import { launchConfetti } from "./confetti.js";
import { playSound, setSoundEnabled } from "./sounds.js";
import { fillTicker } from "./ticker.js";
import {
  isOnlineConfigured, initOnline, currentPlayer, nicknameError, joinRanking,
  syncStats, fetchRanking, fetchMyPosition, RANKING_MIN_ROUNDS,
} from "./online.js";

// Racha a partir de la cual aparece el fuego 🔥
const FIRE_STREAK = 5;

// Mejor racha mínima para celebrar un récord (🏆 y confeti). Con menos, el
// récord saldría en casi todas las primeras rondas.
const NEW_RECORD_MIN = 3;

// Número de rondas que merecen una insignia 🎯
const ROUND_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];

// Variación (en %) a partir de la cual el movimiento se considera brusco ⚡
const BIG_MOVE_PCT = 10;

// Variación mínima para que la ronda cuente (CLAUDE.md, apartado 3)
const TIE_THRESHOLD_PCT = 0.1;

// Nombres de los mercados para mostrarlos al usuario
const MARKET_NAMES = { bolsa: "Bolsa", forex: "FOREX", crypto: "Crypto", materias: "Materias primas" };

// Elementos de la página que vamos a usar
const message = document.getElementById("message");
const choiceBox = document.getElementById("choice");
const question = document.getElementById("question");
const upButton = document.getElementById("guess-up");
const downButton = document.getElementById("guess-down");
const resultBox = document.getElementById("result");
const resultTitle = document.getElementById("result-title");
const resultChange = document.getElementById("result-change");
const resultAsset = document.getElementById("result-asset");
const resultDates = document.getElementById("result-dates");
const resultPriceStart = document.getElementById("result-price-start");
const resultPriceEnd = document.getElementById("result-price-end");
const resultPriceEndLabel = document.getElementById("result-price-end-label");
const resultBadges = document.getElementById("result-badges");
const nextButton = document.getElementById("next-round");

// Elementos de los ajustes
const revealOptions = document.getElementById("reveal-options");
const assetSelect = document.getElementById("asset-select");
const settingsNote = document.getElementById("settings-note");
const soundToggle = document.getElementById("sound-toggle");
const tickerTrack = document.getElementById("ticker-track");

// Elementos del ranking
const rankingBox = document.getElementById("ranking");
const rankingJoin = document.getElementById("ranking-join");
const joinForm = document.getElementById("join-form");
const nicknameInput = document.getElementById("nickname-input");
const joinError = document.getElementById("join-error");
const rankingMe = document.getElementById("ranking-me");
const rankingBody = document.getElementById("ranking-body");
const rankingRefresh = document.getElementById("ranking-refresh");

// ¿Está conectado Supabase? (si no, el ranking queda oculto)
let onlineReady = false;

// Elementos de las estadísticas
const statPlayed = document.getElementById("stat-played");
const statCorrect = document.getElementById("stat-correct");
const statPct = document.getElementById("stat-pct");
const statStreak = document.getElementById("stat-streak");
const statBest = document.getElementById("stat-best");
const statChance = document.getElementById("stat-chance");
const breakdownTabs = document.getElementById("breakdown-tabs");
const breakdownColumn = document.getElementById("breakdown-column");
const statBreakdown = document.getElementById("stat-breakdown");
const statTies = document.getElementById("stat-ties");
const resetButton = document.getElementById("reset-stats");

// Elementos del contexto del periodo
const contextBox = document.getElementById("context");
const contextFed = document.getElementById("context-fed");
const contextEvents = document.getElementById("context-events");
const contextNews = document.getElementById("context-news");

// La ronda que se está jugando ahora mismo (null = ya respondida)
let currentRound = null;

// ¿Se han cargado los datos de contexto (FED y eventos)?
let contextReady = false;

// Estadísticas y ajustes guardados en el navegador
let stats = loadStats();

// Cómo se agrupa la tabla de detalle: "byMarket", "byHorizon" o "byAsset"
let breakdownGroup = "byMarket";

// Nombre de cada activo por su ticker ("GOLD" → "Oro (fondo GLD)"),
// para la tabla por activo. Lo rellena fillAssetSelect().
const assetNames = {};
const settings = loadSettings();

createCandleChart(document.getElementById("chart"));
drawBackdrop(document.getElementById("backdrop"));

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
  settingsNote.textContent = ""; // los ajustes nuevos ya se aplican en esta ronda
  resultBox.classList.add("hidden");
  contextBox.classList.add("hidden");
  choiceBox.classList.remove("hidden");
  upButton.disabled = true; // desactivados hasta que el gráfico esté listo
  downButton.disabled = true;

  try {
    currentRound = await pickRandomRound(settings.revealCount, settings.ticker);
    question.textContent =
      `¿Qué hará el precio en las próximas ${currentRound.hidden.length} velas?`;
    drawCandles(currentRound.visible);
    upButton.disabled = false;
    downButton.disabled = false;
  } catch (error) {
    message.textContent = `Error al cargar los datos: ${error.message}`;
    console.error(error);
  }
}

// Pasos 2 y 3: el usuario responde y se revela el resultado.
// Es "async" porque espera (await) a que termine la animación de las velas.
async function answer(guess) {
  const round = currentRound;
  if (round === null) {
    return; // ya respondida: evita apuntarla dos veces
  }
  currentRound = null;

  const { outcome, changePct } = evaluateGuess(round, guess);
  const previousBest = stats.bestStreak; // para detectar un récord nuevo
  // Se guarda ya (por si se cierra la página), pero NO se muestra hasta el
  // final de la animación: las estadísticas destriparían el resultado.
  recordResult(stats, round, outcome);

  // Suspense: las velas aparecen una a una mientras los botones esperan
  upButton.disabled = true;
  downButton.disabled = true;
  question.textContent = "Revelando…";
  await revealCandles(round.visible, round.hidden, round.decisionPrice);

  renderStats();
  renderBadges(outcome, changePct, previousBest);
  syncAndRenderRanking(); // sube las estadísticas al ranking (si te has unido)
  playSound(outcome);
  if (stats.bestStreak > previousBest && stats.bestStreak >= NEW_RECORD_MIN) {
    launchConfetti(); // 🎉 nueva mejor racha
  }

  if (outcome === "correct") {
    resultTitle.textContent = "✅ ¡Acierto!";
  } else if (outcome === "wrong") {
    resultTitle.textContent = "❌ Fallo";
  } else {
    resultTitle.textContent = "➖ Empate: esta ronda no cuenta";
  }
  resultTitle.className = `result-title ${outcome}`;
  resultBox.className = `card panel ${outcome}`; // franja de color arriba

  const revealed = round.hidden.length;
  const direction = changePct > 0 ? "subió" : "bajó";
  resultChange.textContent =
    `En las ${revealed} velas siguientes el precio ${direction} un ${formatPct(Math.abs(changePct))}.` +
    (outcome === "tie" ? ` (Menos de un ${TIE_THRESHOLD_PCT.toLocaleString("es-ES")} % se considera empate.)` : "");

  const firstDate = round.visible[0].t;
  const decisionDate = round.visible[round.visible.length - 1].t;
  const lastDate = round.hidden[round.hidden.length - 1].t;
  // Emblema del activo + nombre y mercado
  resultAsset.innerHTML = "";
  resultAsset.className = "with-logo";
  resultAsset.appendChild(createLogo(round.ticker, round.name, "large"));
  resultAsset.appendChild(element("span", "", `${round.name} (${MARKET_NAMES[round.market]})`));
  resultDates.textContent = `Del ${formatDate(firstDate)} al ${formatDate(lastDate)}`;
  resultPriceStart.textContent = `${formatPrice(round.decisionPrice)} (${formatDate(decisionDate)})`;
  resultPriceEndLabel.textContent = `Precio ${revealed} velas después`;
  resultPriceEnd.textContent = `${formatPrice(round.finalPrice)} (${formatDate(lastDate)})`;

  choiceBox.classList.add("hidden");
  resultBox.classList.remove("hidden");
  renderContext(round);
}

// ---------------------------------------------------------------------------
// Insignias del resultado (recursos estéticos)
// ---------------------------------------------------------------------------

// Añade al resultado insignias como "🔥 ¡5 seguidas!" o "🏆 ¡Nueva mejor racha!"
function renderBadges(outcome, changePct, previousBest) {
  const badges = [];

  if (outcome === "correct" && stats.currentStreak >= FIRE_STREAK) {
    badges.push(`🔥 ¡${stats.currentStreak} seguidas!`);
  }
  // Récord nuevo (solo a partir de 3, para que no salga en las primeras rondas)
  if (stats.bestStreak > previousBest && stats.bestStreak >= NEW_RECORD_MIN) {
    badges.push("🏆 ¡Nueva mejor racha!");
  }
  if (outcome !== "tie" && ROUND_MILESTONES.includes(stats.played)) {
    badges.push(`🎯 ¡${stats.played} rondas jugadas!`);
  }
  if (Math.abs(changePct) >= BIG_MOVE_PCT) {
    badges.push(`⚡ Movimiento brusco: más del ${BIG_MOVE_PCT} %`);
  }

  resultBadges.innerHTML = "";
  for (const text of badges) {
    resultBadges.appendChild(element("span", "badge", text));
  }
}

// ---------------------------------------------------------------------------
// Contexto del periodo (FED, eventos, noticias)
// ---------------------------------------------------------------------------

// 5.33 → "5,33 %"
function formatRate(value) {
  return `${value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

// Crea un elemento HTML con una clase y un texto
function element(tag, className, text) {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}

// Frase sobre los tipos de un banco central ("fed" o "ecb") en esas fechas.
//   ofBank: "de la FED" o "del BCE" (para que la frase quede bien en español)
function rateSentence(bank, ofBank, firstDate, lastDate) {
  const rates = describeRates(bank, firstDate, lastDate);
  if (rates === null && bank === "ecb") {
    return "Aún no existían los tipos del BCE (el euro y el BCE empezaron en 1999).";
  }
  if (rates === null) {
    return `No hay datos de tipos ${ofBank} para estas fechas.`;
  }
  const trendText = { up: "subieron", down: "bajaron", flat: "se mantuvieron estables" }[rates.trend];
  return `Tipos de interés ${ofBank}: ${formatRate(rates.start)} al inicio del gráfico ` +
    `y ${formatRate(rates.end)} al final (${trendText}).`;
}

function renderContext(round) {
  if (!contextReady) {
    return; // sin datos de contexto, el juego sigue funcionando sin la tarjeta
  }
  const firstDate = round.visible[0].t;
  const decisionDate = round.visible[round.visible.length - 1].t;
  const lastDate = round.hidden[round.hidden.length - 1].t;

  // 1. Tipos de interés: la FED siempre; el BCE en activos europeos o con euro
  const lines = [rateSentence("fed", "de la FED", firstDate, lastDate)];
  if (isEcbRelevant(round.ticker)) {
    lines.push(rateSentence("ecb", "del BCE", firstDate, lastDate));
  }
  contextFed.textContent = lines.join(" ");

  // 2. Grandes eventos de esas fechas
  contextEvents.innerHTML = "";
  const found = eventsInRange(firstDate, lastDate, round.market);
  if (found.length === 0) {
    contextEvents.appendChild(element("li", "no-events",
      "No hay grandes eventos registrados en estas fechas. " +
      "Aun así el precio se movió: el día a día del mercado también mueve los precios."));
  }
  for (const event of found) {
    const item = document.createElement("li");
    item.appendChild(element("span", "event-date", formatDate(event.date)));
    if (event.date > decisionDate) {
      item.appendChild(element("span", "event-tag", "tras tu decisión"));
    }
    item.appendChild(element("span", "event-title", event.title));
    item.appendChild(element("p", "event-text", event.text));
    contextEvents.appendChild(item);
  }

  // 3. Enlace a Google: activo + "noticias" + el día de tu decisión
  //    (p. ej. "S&P 500 noticias 23 de marzo de 2020")
  const searchText = `${searchName(round.name)} noticias ${formatDate(decisionDate)}`;
  contextNews.href = newsSearchUrl(searchText);
  contextNews.textContent = `Buscar en Google: «${searchText}» ↗`;

  contextBox.classList.remove("hidden");
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
  let sentence =
    `🪙 Con ${correct} de ${played}, una moneda lo haría igual de bien o mejor ${howOften} de las veces.`;

  // Comentarios extra, solo con suficientes rondas para que signifiquen algo
  if (played >= 20 && probability < 0.05) {
    sentence += " 🧠 Con tantas rondas, ya es difícil atribuirlo solo a la suerte.";
  } else if (played >= 20 && correct / played < 0.45) {
    sentence += " 🙃 Vas peor que la moneda: ¿y si apostaras justo lo contrario?";
  }
  return sentence;
}

// Racha con fuego a partir de FIRE_STREAK (🔥), doble a partir del doble (🔥🔥)
function renderStreak(streak) {
  statStreak.textContent = streak;
  if (streak >= FIRE_STREAK) {
    const flames = streak >= FIRE_STREAK * 2 ? "🔥🔥" : "🔥";
    statStreak.appendChild(element("span", "flame", ` ${flames}`));
  }
}

// Escribe las estadísticas en la página
function renderStats() {
  statPlayed.textContent = stats.played;
  statCorrect.textContent = stats.correct;
  statPct.textContent = hitRate(stats.correct, stats.played);
  renderStreak(stats.currentStreak);
  statBest.textContent = stats.bestStreak;
  statChance.textContent = chanceSentence(stats.correct, stats.played);

  renderBreakdown();

  statTies.textContent = stats.ties > 0 ? `Empates (no cuentan): ${stats.ties}` : "";
}

// Filas de la tabla de detalle según la pestaña elegida.
// Devuelve una lista de [etiqueta, { played, correct }, ticker]
// (el ticker solo en la tabla por activo, para dibujar su emblema).
function breakdownRows() {
  const group = stats[breakdownGroup];
  const entry = (key) => group[key] || { played: 0, correct: 0 };

  if (breakdownGroup === "byMarket") {
    // Todos los mercados, aunque aún no se hayan jugado
    return Object.keys(MARKET_NAMES).map((market) => [MARKET_NAMES[market], entry(market)]);
  }
  if (breakdownGroup === "byHorizon") {
    const labels = { 10: "10 velas (corto plazo)", 50: "50 velas (largo plazo)" };
    return REVEAL_OPTIONS.map((n) => [labels[n] || `${n} velas`, entry(String(n))]);
  }
  // byAsset: solo los activos jugados, de más a menos rondas
  return Object.keys(group)
    .sort((a, b) => group[b].played - group[a].played)
    .map((ticker) => [assetNames[ticker] || ticker, group[ticker], ticker]);
}

// "Moneda*": probabilidad de que una moneda lo haga igual de bien o mejor
function coinCell(correct, played) {
  if (played === 0) {
    return "–";
  }
  const probability = coinProbabilityAtLeast(correct, played);
  return probability < 0.01 ? "< 1 %" : formatPct(Math.round(probability * 100));
}

// Rellena la tabla de detalle y marca la pestaña elegida
function renderBreakdown() {
  for (const button of breakdownTabs.querySelectorAll("button")) {
    const isActive = button.dataset.group === breakdownGroup;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive);
  }
  breakdownColumn.textContent = { byMarket: "Mercado", byHorizon: "Plazo", byAsset: "Activo" }[breakdownGroup];

  statBreakdown.innerHTML = "";
  const rows = breakdownRows();
  if (rows.length === 0) {
    const row = document.createElement("tr");
    const cell = element("td", "empty", "Aún no hay rondas apuntadas por activo.");
    cell.colSpan = 5; // la celda ocupa las 5 columnas
    row.appendChild(cell);
    statBreakdown.appendChild(row);
  }
  for (const [label, { played, correct }, ticker] of rows) {
    const row = document.createElement("tr");

    // Primera celda: el nombre, con su emblema si es la tabla por activo
    const nameCell = document.createElement("td");
    if (ticker !== undefined) {
      const wrapper = element("span", "with-logo", "");
      wrapper.appendChild(createLogo(ticker, label, "small"));
      wrapper.appendChild(document.createTextNode(label));
      nameCell.appendChild(wrapper);
    } else {
      nameCell.textContent = label;
    }
    row.appendChild(nameCell);

    for (const text of [played, correct, hitRate(correct, played), coinCell(correct, played)]) {
      row.appendChild(element("td", "", text));
    }
    statBreakdown.appendChild(row);
  }
}

function onBreakdownTabClick(event) {
  const button = event.target.closest("button");
  if (button !== null) {
    breakdownGroup = button.dataset.group;
    renderBreakdown();
  }
}

function onResetStats() {
  // confirm() muestra una ventana de "Aceptar / Cancelar" del navegador
  if (confirm("¿Seguro que quieres borrar todas tus estadísticas?")) {
    stats = resetStats();
    syncAndRenderRanking(); // en el ranking también vuelves a 0 rondas
    renderStats();
  }
}

// ---------------------------------------------------------------------------
// Ajustes: velas a revelar y activo
// ---------------------------------------------------------------------------

// Marca en la página los ajustes actuales
function renderSettings() {
  for (const button of revealOptions.querySelectorAll("button")) {
    const isActive = Number(button.dataset.value) === settings.revealCount;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive);
  }
  assetSelect.value = settings.ticker;

  // Botón de sonido: 🔊 activado, 🔇 silenciado
  soundToggle.textContent = settings.sound ? "🔊" : "🔇";
  soundToggle.setAttribute("aria-label", settings.sound ? "Silenciar sonidos" : "Activar sonidos");
  setSoundEnabled(settings.sound);
}

// El sonido no afecta a la partida: se aplica al momento, sin aviso
function onSoundToggle() {
  settings.sound = !settings.sound;
  saveSettings(settings);
  renderSettings();
}

// Guarda un ajuste cambiado y avisa de que se aplicará en el siguiente gráfico
// (si se aplicara ya, se podría usar para saltarse un gráfico difícil)
function changeSetting(key, value) {
  settings[key] = value;
  saveSettings(settings);
  renderSettings();
  settingsNote.textContent = "Se aplicará en el siguiente gráfico.";
}

function onRevealOptionClick(event) {
  const button = event.target.closest("button");
  if (button !== null) {
    changeSetting("revealCount", Number(button.dataset.value));
  }
}

// Crea una opción del desplegable
function selectOption(value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}

// Rellena el desplegable con los activos de data/index.json, agrupados por
// mercado (<optgroup>). En cada grupo, primero "cualquiera de ese mercado"
// (valor "market:bolsa"...) y luego cada activo (valor "SPX"...).
// También guarda los nombres para la tabla de estadísticas.
async function fillAssetSelect() {
  const assets = await loadAssetList();
  const validChoices = [""]; // "" = aleatorio entre todos
  for (const market of Object.keys(MARKET_NAMES)) {
    const group = document.createElement("optgroup");
    group.label = MARKET_NAMES[market];
    group.appendChild(selectOption(`market:${market}`, `🎲 Cualquiera de ${MARKET_NAMES[market]}`));
    validChoices.push(`market:${market}`);
    for (const asset of assets.filter((a) => a.market === market)) {
      group.appendChild(selectOption(asset.ticker, asset.name));
      validChoices.push(asset.ticker);
      assetNames[asset.ticker] = asset.name;
    }
    assetSelect.appendChild(group);
  }
  renderStats(); // ahora la tabla "por activo" ya puede mostrar los nombres
  fillTicker(tickerTrack, assets); // cinta decorativa de arriba
  // Si la opción guardada ya no existe, volver a "Aleatorio"
  if (!validChoices.includes(settings.ticker)) {
    settings.ticker = "";
  }
  renderSettings();
}

// ---------------------------------------------------------------------------
// Ranking online (js/online.js)
// ---------------------------------------------------------------------------

// Medallas para los tres primeros puestos
const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

// Dibuja el ranking: formulario de apodo o tu situación, y la tabla
async function renderRanking() {
  if (!onlineReady) {
    return;
  }
  const player = currentPlayer();
  rankingJoin.classList.toggle("hidden", player !== null);

  try {
    // Tu situación
    if (player === null) {
      rankingMe.textContent = "";
    } else if (stats.played < RANKING_MIN_ROUNDS) {
      rankingMe.textContent =
        `Juegas como ${player.nickname}. Te faltan ${RANKING_MIN_ROUNDS - stats.played} ` +
        "rondas para aparecer en el ranking.";
    } else {
      const position = await fetchMyPosition(stats);
      rankingMe.textContent = `Juegas como ${player.nickname}: vas en la posición ${position}.`;
    }

    // La tabla
    const rows = await fetchRanking();
    rankingBody.innerHTML = "";
    if (rows.length === 0) {
      const row = document.createElement("tr");
      const cell = element("td", "empty", `Aún nadie ha llegado a ${RANKING_MIN_ROUNDS} rondas. ¡Sé el primero!`);
      cell.colSpan = 5;
      row.appendChild(cell);
      rankingBody.appendChild(row);
    }
    rows.forEach((entry, i) => {
      const position = i + 1;
      const row = document.createElement("tr");
      if (player !== null && entry.id === player.id) {
        row.className = "me"; // resaltar tu fila
      }
      row.appendChild(element("td", "position", MEDALS[position] || position));
      row.appendChild(element("td", "", entry.nickname));
      row.appendChild(element("td", "", entry.played));
      row.appendChild(element("td", "", hitRate(entry.correct, entry.played)));
      row.appendChild(element("td", "", coinCell(entry.correct, entry.played)));
      rankingBody.appendChild(row);
    });
  } catch (error) {
    console.warn("No se pudo cargar el ranking:", error);
    rankingMe.textContent = "No se pudo cargar el ranking. Prueba a actualizarlo en un rato.";
  }
}

// Tras una ronda (o al borrar estadísticas): subir datos y redibujar
async function syncAndRenderRanking() {
  if (!onlineReady) {
    return;
  }
  try {
    await syncStats(stats);
  } catch (error) {
    console.warn("No se pudieron subir las estadísticas:", error);
  }
  renderRanking();
}

async function onJoinSubmit(event) {
  event.preventDefault(); // que el formulario no recargue la página
  const nickname = nicknameInput.value.trim();
  const problem = nicknameError(nickname);
  if (problem !== null) {
    joinError.textContent = problem;
    return;
  }
  joinError.textContent = "";
  try {
    await joinRanking(nickname, stats);
    renderRanking();
  } catch (error) {
    joinError.textContent = error.message || "No se pudo crear la cuenta. Inténtalo de nuevo.";
    console.warn(error);
  }
}

// Conecta con Supabase al abrir la página (solo si config.js tiene los datos)
async function startOnline() {
  if (!isOnlineConfigured()) {
    return; // sin configurar: el ranking queda oculto y el juego sigue igual
  }
  try {
    await initOnline();
    onlineReady = true;
    rankingBox.classList.remove("hidden");
    renderRanking();
  } catch (error) {
    console.warn("No se pudo conectar con Supabase:", error);
  }
}

// ---------------------------------------------------------------------------
// Teclado
// ---------------------------------------------------------------------------

// Atajos de teclado: ↑ sube, ↓ baja, Enter siguiente gráfico
function onKeyDown(event) {
  // En el desplegable, las flechas cambian la opción: no son atajos
  // Tampoco al escribir en un campo de texto (el apodo del ranking)
  if (event.target.tagName === "SELECT" || event.target.tagName === "INPUT") {
    return;
  }
  const choosing = !choiceBox.classList.contains("hidden") && !upButton.disabled;
  const showingResult = !resultBox.classList.contains("hidden");

  if (choosing && event.key === "ArrowUp") {
    event.preventDefault(); // que la flecha no mueva la página
    answer("up");
  } else if (choosing && event.key === "ArrowDown") {
    event.preventDefault();
    answer("down");
  } else if (showingResult && event.key === "Enter") {
    // Si el foco está en un botón, Enter ya lo pulsa él solo: no repetir
    if (event.target.tagName === "BUTTON") {
      return;
    }
    newRound();
  }
}

upButton.addEventListener("click", () => answer("up"));
downButton.addEventListener("click", () => answer("down"));
nextButton.addEventListener("click", newRound);
resetButton.addEventListener("click", onResetStats);
revealOptions.addEventListener("click", onRevealOptionClick);
breakdownTabs.addEventListener("click", onBreakdownTabClick);
soundToggle.addEventListener("click", onSoundToggle);
joinForm.addEventListener("submit", onJoinSubmit);
rankingRefresh.addEventListener("click", renderRanking);
assetSelect.addEventListener("change", () => changeSetting("ticker", assetSelect.value));
document.addEventListener("keydown", onKeyDown);

renderSettings();
renderStats();
fillAssetSelect().catch((error) => console.warn("No se pudo cargar la lista de activos:", error));
newRound(); // primera ronda al abrir la página

startOnline(); // ranking online, si está configurado

// Datos de contexto en segundo plano. Si fallan, el juego sigue sin la tarjeta.
loadContext()
  .then(() => {
    contextReady = true;
  })
  .catch((error) => console.warn("No se pudo cargar el contexto:", error));
