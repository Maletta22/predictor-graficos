// settings.js — ajustes de la partida, guardados en el navegador
// (igual que las estadísticas, en localStorage).

const STORAGE_KEY = "predictor-settings-v1";

export const REVEAL_OPTIONS = [10, 20, 30, 50];

const DEFAULT_SETTINGS = {
  revealCount: 20, // velas que se revelan tras responder
  timeframe: "1d", // temporalidad: "1d" (velas diarias) o "1w" (semanales)
  tickers: [],     // qué activos salen: [] = todos; si no, la lista elegida,
                   // p. ej. ["AAPL", "EURUSD"]. (Antes era "ticker", con un
                   // solo valor: main.js convierte los ajustes antiguos.)
  fromYear: "",    // rango de fechas: año inicial ("" = sin límite)
  toYear: "",      // año final ("" = sin límite)
  sound: true,     // sonidos al acertar / fallar
};

export function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      const settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      // Por si se guardó un valor que ya no existe
      if (!REVEAL_OPTIONS.includes(settings.revealCount)) {
        settings.revealCount = DEFAULT_SETTINGS.revealCount;
      }
      if (!["1d", "1w"].includes(settings.timeframe)) {
        settings.timeframe = DEFAULT_SETTINGS.timeframe;
      }
      return settings;
    }
  } catch (error) {
    console.warn("No se pudieron leer los ajustes:", error);
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("No se pudieron guardar los ajustes:", error);
  }
}
