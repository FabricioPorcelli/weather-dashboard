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
