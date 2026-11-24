// tour.js — visita guiada de 3 pasos que aparece encima del gráfico la
// primera vez que alguien abre el juego. Se puede volver a ver con el botón
// "¿Cómo se juega?" de la cabecera.
//
// Se recuerda que ya se vio con una marca en localStorage, como los ajustes.

const STORAGE_KEY = "updown-tour-done";

// Los pasos: título, texto y qué parte de la página se resalta (selector CSS)
const STEPS = [
  {
    title: "Un gráfico real, sin pistas",
    text:
      "Ves 60 velas de un activo real (bolsa, divisas, crypto o materias primas) " +
      "de unas fechas elegidas al azar. El activo y las fechas están ocultos, y el " +
      "precio está convertido para que la última vela valga 100. Los huecos en el " +
      "gráfico son cierres excepcionales del mercado, como tras el 11-S.",
    highlight: "#chart",
  },
  {
    title: "¿Sube o baja?",
    text:
      "Decide si unas velas después (20 si no cambias nada) el precio estará más " +
      "arriba o más abajo que ahora. Pulsa ▲ Sube o ▼ Baja, o las flechas del " +
      "teclado. Si se mueve menos de un 0,1 %, es empate y la ronda no cuenta.",
    highlight: "#choice",
  },
  {
    title: "Compárate con una moneda",
    text:
      "Se revela la continuación, con el activo, las fechas y qué pasaba entonces. " +
      "Tus estadísticas te dicen si lo haces mejor que lanzar una moneda al aire. " +
      "Arriba puedes cambiar el tipo de velas, cuántas se revelan, los activos y las fechas.",
    highlight: ".settings",
  },
];

const tour = document.getElementById("tour");
const counter = document.getElementById("tour-counter");
const title = document.getElementById("tour-title");
const text = document.getElementById("tour-text");
const nextButton = document.getElementById("tour-next");
const skipButton = document.getElementById("tour-skip");

let step = 0;

// ¿Ya vio la visita? (si localStorage falla, p. ej. en modo privado, decimos que no)
function tourDone() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markTourDone() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Sin localStorage la visita volverá a salir la próxima vez: no pasa nada
  }
}

// Quita el resaltado de cualquier parte de la página
function clearHighlight() {
  for (const el of document.querySelectorAll(".tour-highlight")) {
    el.classList.remove("tour-highlight");
  }
}

function showStep() {
  const current = STEPS[step];
  counter.textContent = `Paso ${step + 1} de ${STEPS.length}`;
  title.textContent = current.title;
  text.textContent = current.text;
  const isLast = step === STEPS.length - 1;
  nextButton.textContent = isLast ? "¡A jugar!" : "Siguiente →";
  skipButton.classList.toggle("hidden", isLast); // en el último paso sobra "Saltar"

  clearHighlight();
  document.querySelector(current.highlight)?.classList.add("tour-highlight");
}

export function openTour() {
  step = 0;
  showStep();
  tour.classList.remove("hidden");
  nextButton.focus(); // para poder avanzar con Enter
}

function closeTour() {
  tour.classList.add("hidden");
  clearHighlight();
  markTourDone();
}

function onNext() {
  if (step < STEPS.length - 1) {
    step++;
    showStep();
  } else {
    closeTour();
  }
}

// Conecta los botones y, si es la primera visita, abre la guía
export function initTour(openButton) {
  nextButton.addEventListener("click", onNext);
  skipButton.addEventListener("click", closeTour);
  openButton.addEventListener("click", openTour);
  if (!tourDone()) {
    openTour();
  }
}
