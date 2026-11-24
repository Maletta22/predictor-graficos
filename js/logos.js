// logos.js — emblema de cada activo (símbolo + colores), que se muestra al
// revelar el resultado y en la tabla de estadísticas.
//
// No usamos los logos oficiales: son marcas registradas y habría que
// descargarlos o pedirlos a un servicio externo. En su lugar, cada activo
// tiene un emblema propio inspirado en sus colores y su símbolo.
//
//   symbol: texto o emoji del emblema
//   background: color o degradado de fondo (cualquier valor CSS válido)
//   color: color del texto

const LOGOS = {
  // Crypto
  BTCUSDT: { symbol: "₿", background: "#f7931a", color: "#fff" },
  ETHUSDT: { symbol: "Ξ", background: "#627eea", color: "#fff" },
  SOLUSDT: { symbol: "◎", background: "linear-gradient(135deg, #9945ff, #14f195)", color: "#fff" },

  // Índices bursátiles
  SPX: { symbol: "S&P", background: "#0b2f6b", color: "#fff" },
  NDX: { symbol: "NDX", background: "#0996c7", color: "#fff" },
  STOXX50: { symbol: "€50", background: "#003399", color: "#ffcc00" },
  DAX: { symbol: "DAX", background: "linear-gradient(#000 0 33%, #dd0000 33% 66%, #ffce00 66%)", color: "#fff" },
  IBEX: { symbol: "35", background: "linear-gradient(#aa151b 0 25%, #f1bf00 25% 75%, #aa151b 75%)", color: "#aa151b" },
  N225: { symbol: "225", background: "#bc002d", color: "#fff" },

  // Acciones de empresas (emblemas propios, no sus logotipos)
  AAPL: { symbol: "🍎", background: "#1d1d1f", color: "#fff" },
  MSFT: { symbol: "MS", background: "linear-gradient(135deg, #f25022 0 25%, #7fba00 25% 50%, #00a4ef 50% 75%, #ffb900 75%)", color: "#fff" },
  NVDA: { symbol: "NV", background: "#76b900", color: "#000" },
  AMZN: { symbol: "📦", background: "#ff9900", color: "#000" },
  GOOGL: { symbol: "G", background: "linear-gradient(135deg, #4285f4, #34a853, #fbbc05, #ea4335)", color: "#fff" },
  META: { symbol: "∞", background: "#0866ff", color: "#fff" },
  TSLA: { symbol: "⚡", background: "#cc0000", color: "#fff" },
  NFLX: { symbol: "N", background: "#000", color: "#e50914" },
  JPM: { symbol: "JPM", background: "#117aca", color: "#fff" },
  KO: { symbol: "🥤", background: "#f40009", color: "#fff" },
  SAN: { symbol: "SAN", background: "#ec0000", color: "#fff" },
  ITX: { symbol: "👕", background: "#1a1a1a", color: "#fff" },
  ASML: { symbol: "AS", background: "#0f238c", color: "#fff" },
  LVMH: { symbol: "LV", background: "#3b2f20", color: "#e0c58f" },
  TSM: { symbol: "💾", background: "#c8102e", color: "#fff" },
  TM: { symbol: "🚗", background: "#eb0a1e", color: "#fff" },

  // FOREX: los símbolos de las dos monedas del par
  EURUSD: { symbol: "€$", background: "#1f4e9c", color: "#fff" },
  GBPUSD: { symbol: "£$", background: "#5b2a86", color: "#fff" },
  USDJPY: { symbol: "$¥", background: "#2e7d32", color: "#fff" },
  USDCHF: { symbol: "$₣", background: "#c62828", color: "#fff" },
  AUDUSD: { symbol: "A$", background: "#00897b", color: "#fff" },
  EURGBP: { symbol: "€£", background: "#37474f", color: "#fff" },

  // Materias primas: símbolos químicos del oro (Au) y la plata (Ag)
  GOLD: { symbol: "Au", background: "linear-gradient(135deg, #f9d976, #c99b2e)", color: "#4a3500" },
  SILVER: { symbol: "Ag", background: "linear-gradient(135deg, #f1f3f5, #9aa3ad)", color: "#2b3138" },
  BRENT: { symbol: "🛢️", background: "#263238", color: "#fff" },
};

// Crea el emblema (un <span> redondo) de un activo.
//   size: "small" (tabla) o "large" (resultado)
export function createLogo(ticker, name, size = "large") {
  const logo = LOGOS[ticker] || {
    // Activo sin emblema definido: sus dos primeras letras sobre el color de acento
    symbol: name.slice(0, 2).toUpperCase(),
    background: "var(--accent)",
    color: "#fff",
  };
  const el = document.createElement("span");
  el.className = `logo logo-${size}`;
  el.textContent = logo.symbol;
  el.style.background = logo.background;
  el.style.color = logo.color;
  // Textos largos ("S&P", "225") con letra más pequeña para que quepan
  if ([...logo.symbol].length >= 3) {
    el.classList.add("logo-long");
  }
  el.setAttribute("aria-hidden", "true"); // decorativo: el nombre ya va al lado
  return el;
}
