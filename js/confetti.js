// confetti.js — lluvia de confeti para celebrar una nueva mejor racha.
// Sin librerías: cada papelito es un <span> que cae con una animación CSS
// (@keyframes confetti-fall en styles.css) y se borra al terminar.

const PIECES = 80;
const COLORS = ["#089981", "#f23645", "#2962ff", "#f7931a", "#ffcc00", "#9945ff"];
const DURATION_MS = 3000;

export function launchConfetti() {
  // Respetar el ajuste de accesibilidad "reducir movimiento"
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const layer = document.createElement("div");
  layer.className = "confetti";
  layer.setAttribute("aria-hidden", "true");

  for (let i = 0; i < PIECES; i++) {
    const piece = document.createElement("span");
    // Cada papelito con posición, color, tamaño, giro y retraso al azar.
    // Las variables "--algo" las usa la animación de styles.css.
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = COLORS[i % COLORS.length];
    piece.style.width = `${6 + Math.random() * 6}px`;
    piece.style.height = `${10 + Math.random() * 8}px`;
    piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 200}px`);
    piece.style.setProperty("--spin", `${(Math.random() - 0.5) * 1440}deg`);
    piece.style.animationDelay = `${Math.random() * 600}ms`;
    piece.style.animationDuration = `${2000 + Math.random() * 1000}ms`;
    layer.appendChild(piece);
  }

  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), DURATION_MS + 700); // limpiar al acabar
}
