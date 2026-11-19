// ticker.js — cinta decorativa que desfila arriba, como las pantallas de
// Wall Street. Muestra los activos del juego y desde cuándo hay datos.
//
// No muestra precios ni subidas: serían inventados y podrían confundir.
// Las flechas ▲▼ entre activos son solo separadores decorativos.

import { createLogo } from "./logos.js";

// "1962-01-02" → "1962"
function year(isoDate) {
  return isoDate.slice(0, 4);
}

// Crea los elementos de la cinta para una lista de activos
function tickerItems(assets) {
  const fragment = document.createDocumentFragment();
  assets.forEach((asset, i) => {
    const item = document.createElement("span");
    item.className = "ticker-item";
    item.appendChild(createLogo(asset.ticker, asset.name, "small"));
    item.appendChild(document.createTextNode(` ${asset.name} · desde ${year(asset.first)}`));
    fragment.appendChild(item);

    const arrow = document.createElement("span");
    arrow.className = i % 2 === 0 ? "ticker-arrow up" : "ticker-arrow down";
    arrow.textContent = i % 2 === 0 ? "▲" : "▼";
    fragment.appendChild(arrow);
  });
  return fragment;
}

export function fillTicker(track, assets) {
  // El contenido va DOS veces seguidas: la animación desplaza la cinta la
  // mitad de su ancho y vuelve a empezar, y así parece un bucle sin cortes.
  track.appendChild(tickerItems(assets));
  track.appendChild(tickerItems(assets));
}
