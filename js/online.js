// online.js — cuentas por apodo y ranking, con Supabase.
//
// Cómo funciona:
//   1. El jugador elige un apodo. Supabase le crea un usuario "anónimo"
//      (sin email ni contraseña) que queda guardado en este navegador.
//   2. Se crea su fila en la tabla "players" (ver supabase/setup.sql).
//   3. Tras cada ronda se suben sus estadísticas (las mismas que se guardan
//      en el navegador) y el ranking se actualiza.
//
// Si config.js está vacío, nada de esto se carga y el juego funciona igual.

import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import { coinProbabilityAtLeast } from "./stats.js";

// Librería oficial de Supabase, versión fija (ver CLAUDE.md)
const SUPABASE_SCRIPT =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.min.js";

export const RANKING_MIN_ROUNDS = 30; // rondas mínimas para aparecer en el ranking
const RANKING_SIZE = 20;              // jugadores que se muestran

// Mismas reglas que en supabase/setup.sql
const NICKNAME_PATTERN = /^[A-Za-z0-9_ÁÉÍÓÚÜÑáéíóúüñ-]+$/;

let client = null; // conexión con Supabase
let player = null; // { id, nickname } si este navegador ya se unió al ranking

export function isOnlineConfigured() {
  return SUPABASE_URL !== "" && SUPABASE_KEY !== "";
}

export function currentPlayer() {
  return player;
}

// Carga un archivo JavaScript externo (la librería de Supabase) solo cuando
// hace falta, para no hacer más lenta la página si el ranking no se usa
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error("No se pudo cargar la librería de Supabase"));
    document.head.appendChild(script);
  });
}

// Conecta con Supabase y recupera el jugador de este navegador, si existe
export async function initOnline() {
  await loadScript(SUPABASE_SCRIPT);
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data } = await client.auth.getSession();
  if (data.session !== null) {
    const { data: row, error } = await client
      .from("players")
      .select("id, nickname")
      .eq("id", data.session.user.id)
      .maybeSingle(); // una fila o null
    if (error) {
      throw error;
    }
    player = row;
  }
  return player;
}

// Resumen de las estadísticas que se guarda en Supabase
function statsRow(stats) {
  return {
    played: stats.played,
    correct: stats.correct,
    best_streak: stats.bestStreak,
    luck_prob: stats.played === 0 ? 1 : coinProbabilityAtLeast(stats.correct, stats.played),
    updated_at: new Date().toISOString(),
  };
}

// Devuelve un mensaje si el apodo no es válido, o null si está bien
export function nicknameError(nickname) {
  if (nickname.length < 3 || nickname.length > 20) {
    return "El apodo debe tener entre 3 y 20 caracteres.";
  }
  if (!NICKNAME_PATTERN.test(nickname)) {
    return "Usa solo letras, números, _ o - (sin espacios).";
  }
  return null;
}

// Se une al ranking con un apodo, subiendo las estadísticas actuales
export async function joinRanking(nickname, stats) {
  let { data } = await client.auth.getSession();
  if (data.session === null) {
    // Crea el usuario anónimo (queda guardado en este navegador)
    const result = await client.auth.signInAnonymously();
    if (result.error) {
      throw result.error;
    }
    data = result.data;
  }

  const row = { id: data.session.user.id, nickname, ...statsRow(stats) };
  const { error } = await client.from("players").insert(row);
  if (error) {
    // 23505 = código de PostgreSQL para "ese valor ya existe" (apodo repetido)
    if (error.code === "23505") {
      throw new Error("Ese apodo ya está cogido. Prueba con otro.");
    }
    throw error;
  }
  player = { id: row.id, nickname };
}

// Sube las estadísticas actuales del jugador (si se ha unido al ranking)
export async function syncStats(stats) {
  if (player === null) {
    return;
  }
  const { error } = await client.from("players").update(statsRow(stats)).eq("id", player.id);
  if (error) {
    throw error;
  }
}

// Los mejores jugadores: menor probabilidad de que una moneda los iguale.
// Si empatan, va primero quien ha jugado más rondas.
export async function fetchRanking() {
  const { data, error } = await client
    .from("players")
    .select("id, nickname, played, correct, best_streak, luck_prob")
    .gte("played", RANKING_MIN_ROUNDS)
    .order("luck_prob", { ascending: true })
    .order("played", { ascending: false })
    .limit(RANKING_SIZE);
  if (error) {
    throw error;
  }
  return data;
}

// Posición del jugador en el ranking (o null si aún no tiene las rondas mínimas):
// cuántos jugadores tienen una probabilidad menor que la suya, más uno.
export async function fetchMyPosition(stats) {
  if (player === null || stats.played < RANKING_MIN_ROUNDS) {
    return null;
  }
  const { count, error } = await client
    .from("players")
    .select("id", { count: "exact", head: true }) // solo contar, sin descargar filas
    .gte("played", RANKING_MIN_ROUNDS)
    .lt("luck_prob", statsRow(stats).luck_prob);
  if (error) {
    throw error;
  }
  return count + 1;
}
