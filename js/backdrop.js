// backdrop.js — fondo decorativo de la página: una cuadrícula tipo terminal
// de bolsa y un gráfico de velas INVENTADO (distinto en cada visita), en tinta.
//
// Se dibuja con SVG (gráficos vectoriales: líneas y rectángulos descritos con
// código). Los colores salen de las clases CSS "bd-*" de styles.css, así que
// se adaptan solos al modo oscuro. Es muy tenue para no distraer del juego.

const SVG_NS = "http://www.w3.org/2000/svg"; // necesario para crear elementos SVG

const WIDTH = 1600;  // tamaño del "lienzo" del dibujo (se estira a la pantalla)
const HEIGHT = 900;
const GRID_STEP = 80;
const CANDLE_COUNT = 64;

// Crea un elemento SVG con sus atributos: svgElement("rect", { x: 0, ... })
function svgElement(tag, attributes) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  return el;
}

// Número al azar entre min y max
function random(min, max) {
  return min + Math.random() * (max - min);
}

export function drawBackdrop(container) {
  const svg = svgElement("svg", {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    preserveAspectRatio: "xMidYMid slice", // cubrir toda la pantalla, recortando lo que sobre
  });

  // 1. Cuadrícula
  for (let x = 0; x <= WIDTH; x += GRID_STEP) {
    svg.appendChild(svgElement("line", { x1: x, y1: 0, x2: x, y2: HEIGHT, class: "bd-grid" }));
  }
  for (let y = 0; y <= HEIGHT; y += GRID_STEP) {
    svg.appendChild(svgElement("line", { x1: 0, y1: y, x2: WIDTH, y2: y, class: "bd-grid" }));
  }

  // 2. Velas inventadas: un "paseo aleatorio" con ligera tendencia alcista,
  //    de abajo a la izquierda hacia arriba a la derecha
  const spacing = WIDTH / CANDLE_COUNT;
  let price = HEIGHT * 0.78; // en SVG, la "y" crece hacia abajo
  const closes = [];
  for (let i = 0; i < CANDLE_COUNT; i++) {
    const open = price;
    const close = open + random(-34, 26); // un poco más de velas alcistas
    const high = Math.min(open, close) - random(4, 22);
    const low = Math.max(open, close) + random(4, 22);
    const x = i * spacing + spacing / 2;
    const isUp = close < open; // sube si la "y" disminuye
    const kind = isUp ? "bd-up" : "bd-down";

    svg.appendChild(svgElement("line", { x1: x, y1: high, x2: x, y2: low, class: `${kind} bd-wick` }));
    svg.appendChild(svgElement("rect", {
      x: x - spacing * 0.3,
      y: Math.min(open, close),
      width: spacing * 0.6,
      height: Math.max(Math.abs(close - open), 2),
      class: kind,
    }));
    closes.push(`${x},${close}`);
    price = close;
  }

  // 3. Línea de tendencia que une los cierres
  svg.appendChild(svgElement("polyline", { points: closes.join(" "), class: "bd-line" }));

  container.appendChild(svg);
}
