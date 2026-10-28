/**
 * Persistencia en localStorage.
 * Envuelve JSON.stringify/parse y tolera que localStorage no esté disponible
 * (por ejemplo, en modo privado con almacenamiento bloqueado).
 */

import { STORAGE_KEYS } from './config.js';

/** Temas válidos que entiende la interfaz. */
const THEMES = ['dark', 'light'];

/**
 * Lee y parsea un valor de localStorage.
 *
 * @param {string} key
 * @returns {*} Valor parseado, o null si no existe o está corrupto.
 */
function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Serializa y guarda un valor en localStorage.
 * Si el almacenamiento falla, la app sigue funcionando sin persistir.
 *
 * @param {string} key
 * @param {*} value
 */
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento disponible: no hay nada que hacer.
  }
}

/**
 * Devuelve el tema guardado, o null si no hay ninguno válido.
 *
 * @returns {'dark' | 'light' | null}
 */
export function loadTheme() {
  const value = read(STORAGE_KEYS.theme);
  return THEMES.includes(value) ? value : null;
}

/**
 * Guarda el tema elegido por el usuario.
 *
 * @param {'dark' | 'light'} theme
 */
export function saveTheme(theme) {
  write(STORAGE_KEYS.theme, theme);
}

/**
 * Devuelve la última ubicación guardada, o null si no hay una válida.
 *
 * @returns {{ lat: number, lon: number, label?: string, zoom?: number } | null}
 */
export function loadLastLocation() {
  const value = read(STORAGE_KEYS.lastLocation);
  if (typeof value?.lat !== 'number' || typeof value?.lon !== 'number') {
    return null;
  }
  return value;
}

/**
 * Guarda la última ubicación consultada con éxito.
 *
 * @param {{ lat: number, lon: number, label?: string, zoom?: number }} location
 */
export function saveLastLocation(location) {
  write(STORAGE_KEYS.lastLocation, location);
}

/** Cantidad máxima de conversaciones marcadas en el mapa. */
const MAX_CHAT_ANCHORS = 20;

/**
 * Devuelve el identificador anónimo del navegador o lo crea.
 *
 * @returns {string}
 */
export function loadUserId() {
  const stored = read(STORAGE_KEYS.userId);
  if (typeof stored === 'string' && stored) {
    return stored;
  }

  const userId = crypto.randomUUID();
  write(STORAGE_KEYS.userId, userId);
  return userId;
}

/**
 * Devuelve los puntos de conversaciones guardadas.
 * Descarta entradas incompletas para no romper el mapa.
 *
 * @returns {Array<{ session_id: string, lat: number, lon: number, label?: string | null, updated_at?: string }>}
 */
export function loadChatAnchors() {
  const value = read(STORAGE_KEYS.chatAnchors);
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (anchor) =>
      typeof anchor?.session_id === 'string' &&
      typeof anchor?.lat === 'number' &&
      typeof anchor?.lon === 'number',
  );
}

/**
 * Guarda o actualiza el punto de una conversación.
 * Se conservan las últimas 20, ordenadas por actualización más reciente.
 *
 * @param {{ session_id: string, lat: number, lon: number, label?: string | null, updated_at?: string }} anchor
 */
export function saveChatAnchor(anchor) {
  if (!anchor?.session_id) {
    return;
  }

  const anchors = loadChatAnchors();
  const index = anchors.findIndex(
    (item) => item.session_id === anchor.session_id,
  );

  if (index >= 0) {
    anchors[index] = { ...anchors[index], ...anchor };
  } else {
    anchors.push(anchor);
  }

  anchors.sort(
    (a, b) =>
      new Date(b.updated_at ?? 0).getTime() -
      new Date(a.updated_at ?? 0).getTime(),
  );
  write(STORAGE_KEYS.chatAnchors, anchors.slice(0, MAX_CHAT_ANCHORS));
}
