// sounds.js — sonidos cortos al acertar, fallar o empatar.
//
// No usamos archivos de audio: los sonidos se "sintetizan" con la Web Audio
// API del navegador. Un oscilador genera una onda de una frecuencia (una
// nota) y un control de volumen (gain) la hace sonar y apagarse suavemente.

let audioContext = null;
let enabled = true;

export function setSoundEnabled(value) {
  enabled = value;
}

// Toca una nota: frecuencia en Hz, cuándo empieza y cuánto dura (en segundos)
function playNote(frequency, start, duration, type = "sine") {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;

  const t0 = audioContext.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.15, t0 + 0.02); // entrada rápida
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration); // salida suave

  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(t0);
  oscillator.stop(t0 + duration);
}

// kind: "correct" | "wrong" | "tie"
export function playSound(kind) {
  if (!enabled) {
    return;
  }
  try {
    // El navegador solo deja crear el audio tras una acción del usuario
    // (un clic o una tecla), y esto siempre se llama después de responder.
    if (audioContext === null) {
      audioContext = new AudioContext();
    }
    if (kind === "correct") {
      playNote(660, 0, 0.15);     // mi
      playNote(880, 0.12, 0.25);  // la, más agudo: suena "alegre"
    } else if (kind === "wrong") {
      playNote(220, 0, 0.18, "triangle");    // la grave
      playNote(165, 0.15, 0.3, "triangle");  // mi más grave: suena "triste"
    } else {
      playNote(440, 0, 0.15); // una sola nota neutra
    }
  } catch (error) {
    console.warn("No se pudo reproducir el sonido:", error);
  }
}
