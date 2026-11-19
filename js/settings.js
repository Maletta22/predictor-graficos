// settings.js — ajustes de la partida, guardados en el navegador
// (igual que las estadísticas, en localStorage).

const STORAGE_KEY = "predictor-settings-v1";

export const REVEAL_OPTIONS = [10, 20, 30, 50];

const DEFAULT_SETTINGS = {
  revealCount: 20, // velas que se revelan tras responder
  ticker: "",      // qué activos salen: "" = cualquiera, "market:bolsa" = un
                   // mercado entero, "SPX" = un activo concreto
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
