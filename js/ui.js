/**
 * Render del panel lateral: tarjeta de clima, estados de carga, error y tema.
 * Todas las actualizaciones usan textContent para insertar los datos como
 * texto plano y evitar inyecciones de HTML.
 */

import { loadTheme, saveTheme } from './storage.js';
import { formatPlaceName } from './text.js';

const statusEl = document.querySelector('#status');
const coordsEl = document.querySelector('#coords');
const cardEl = document.querySelector('#current-card');
const locationEl = document.querySelector('#current-location');
const tempEl = document.querySelector('#current-temp');
const conditionsEl = document.querySelector('#current-conditions');
const feelsLikeEl = document.querySelector('#current-feels-like');
const humidityEl = document.querySelector('#current-humidity');
const windEl = document.querySelector('#current-wind');
const precipEl = document.querySelector('#current-precip');
const updatedEl = document.querySelector('#current-updated');
const forecastCardEl = document.querySelector('#forecast-card');
const daysEl = document.querySelector('#forecast-days');
const themeButton = document.querySelector('#theme-toggle');
const badgesEl = document.querySelector('#cache-badges');
const cacheCurrentEl = document.querySelector('#cache-current');
const cacheForecastEl = document.querySelector('#cache-forecast');

/**
 * Muestra las coordenadas de la ubicación elegida.
 *
 * @param {number} lat
 * @param {number} lon
 */
export function setSelectedCoords(lat, lon) {
  coordsEl.textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

/**
 * Estado de carga: mensaje en el panel y tarjeta oculta.
 */
export function showLoading() {
  statusEl.classList.remove('panel__hint--error');
  statusEl.textContent = 'Consultando la API…';
  cardEl.hidden = true;
  forecastCardEl.hidden = true;
  badgesEl.hidden = true;
}

/**
 * Estado de error: mensaje visible y tarjetas ocultas.
 * Acepta un texto ya armado o un error con `status` (ApiError) y lo traduce
 * a un mensaje acorde al código HTTP.
 *
 * @param {string | (Error & { status?: number })} error
 */
export function showError(error) {
  statusEl.classList.add('panel__hint--error');
  statusEl.textContent = typeof error === 'string' ? error : messageForError(error);
  cardEl.hidden = true;
  forecastCardEl.hidden = true;
  badgesEl.hidden = true;
}

/** Mensajes de la API por código HTTP. El 404 usa el detalle que manda la API. */
const ERROR_MESSAGES = {
  0: 'No se pudo conectar con la API. ¿Está corriendo?',
  422: 'Los datos enviados no son válidos.',
  429: 'Demasiadas solicitudes. Esperá un minuto y probá de nuevo.',
  502: 'El proveedor del clima no está disponible. Probá más tarde.',
  504: 'El proveedor tardó demasiado. Probá de nuevo.',
};

/**
 * Traduce un error de la API a un mensaje mostrable.
 *
 * @param {Error & { status?: number }} error
 * @returns {string}
 */
function messageForError(error) {
  return ERROR_MESSAGES[error.status] ?? error.message ?? 'Ocurrió un error inesperado.';
}

/**
 * Renderiza la tarjeta de clima actual.
 *
 * @param {object} data Respuesta de /v1/weather/coords/...
 */
export function renderCurrentWeather(data) {
  statusEl.classList.remove('panel__hint--error');
  statusEl.textContent = '';
  locationEl.textContent = formatPlaceName(data.location);
  tempEl.textContent = Math.round(data.temperature_c);
  conditionsEl.textContent = data.conditions;
  feelsLikeEl.textContent = `${data.feels_like_c.toFixed(1)} °C`;
  humidityEl.textContent = `${data.humidity} %`;
  windEl.textContent = `${data.wind_speed_kmh.toFixed(1)} km/h`;
  precipEl.textContent = `${data.precipitation_mm.toFixed(1)} mm`;
  updatedEl.textContent = `Actualizado: ${formatDateTime(data.updated_at)}`;
  cardEl.hidden = false;
}

/**
 * Actualiza los badges con el estado de caché de cada respuesta.
 *
 * @param {{ current: string | null, forecast: string | null }} caches
 *   Valores del header X-Cache ("HIT" o "MISS") de cada endpoint.
 */
export function renderCacheBadges(caches) {
  setBadge(cacheCurrentEl, 'Actual', caches.current);
  setBadge(cacheForecastEl, 'Pronóstico', caches.forecast);
  badgesEl.hidden = false;
}

/**
 * Escribe un badge de caché y le asigna el color según HIT o MISS.
 *
 * @param {HTMLElement} element
 * @param {string} label
 * @param {string | null} value
 */
function setBadge(element, label, value) {
  element.textContent = `${label}: ${value ?? '—'}`;
  element.classList.toggle('cache__badge--hit', value === 'HIT');
  element.classList.toggle('cache__badge--miss', value === 'MISS');
}

/**
 * Formatea una fecha ISO en formato local, por ejemplo "25/09/2026, 09:00".
 *
 * @param {string} isoDate
 * @returns {string}
 */
function formatDateTime(isoDate) {
  return new Date(isoDate).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Renderiza la lista de días del pronóstico.
 *
 * @param {object} data Respuesta de /v1/forecast/coords/...
 */
export function renderForecast(data) {
  daysEl.replaceChildren(...data.days.map(createDayItem));
  forecastCardEl.hidden = false;
}

/**
 * Crea el elemento <li> de un día del pronóstico.
 *
 * @param {object} day Día de la respuesta de /v1/forecast/coords/...
 * @returns {HTMLLIElement}
 */
function createDayItem(day) {
  const item = document.createElement('li');
  item.className = 'day';

  const info = document.createElement('div');
  info.className = 'day__info';

  const date = document.createElement('span');
  date.className = 'day__date';
  date.textContent = formatDayLong(day.date);

  const conditions = document.createElement('span');
  conditions.className = 'day__conditions';
  conditions.textContent = `${day.conditions} · Lluvia ${day.precipitation_probability}%`;

  info.append(date, conditions);

  const temps = document.createElement('div');
  temps.className = 'day__temps';
  temps.textContent = `${Math.round(day.temp_max_c)}° / ${Math.round(day.temp_min_c)}°`;

  item.append(info, temps);
  return item;
}

/**
 * Formatea "2026-09-25" como "viernes 25 sep" en horario local.
 * Se agrega T00:00:00 para que la fecha no se corra un día por la zona horaria.
 *
 * @param {string} isoDate
 * @returns {string}
 */
function formatDayLong(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Aplica el tema guardado o el preferido por el sistema, y conecta el botón
 * de cambio. Precedencia: tema guardado > preferencia del sistema > oscuro.
 * Avisa del cambio con el evento "themechange" para que otros módulos
 * (por ejemplo el gráfico) se actualicen sin acoplarse a este módulo.
 */
export function initTheme() {
  applyTheme(loadTheme() ?? systemTheme());

  themeButton.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    switchTheme(next);
  });
}

/**
 * Cambia el tema con un fundido: cubre la pantalla con el color de fondo del
 * tema saliente, aplica el tema nuevo por debajo y desvanece la capa. Así no
 * se anima la tipografía (que al terminar se re-renderiza y parpadea).
 * Si el usuario prefiere menos movimiento, el cambio es instantáneo.
 *
 * @param {'dark' | 'light'} theme
 */
function switchTheme(theme) {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    applyTheme(theme);
    saveTheme(theme);
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
    return;
  }

  const oldBackground = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-bg')
    .trim();

  const overlay = document.createElement('div');
  overlay.className = 'theme-fade';
  overlay.style.backgroundColor = oldBackground;
  document.body.append(overlay);

  // Fuerza un reflow para que la capa ya esté pintada antes de desvanecerse.
  overlay.getBoundingClientRect();

  applyTheme(theme);
  saveTheme(theme);
  document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));

  overlay.classList.add('theme-fade--out');
  overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  setTimeout(() => overlay.remove(), 600);
}

/**
 * Escribe el tema en <html> y actualiza el texto del botón.
 *
 * @param {'dark' | 'light'} theme
 */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const nextThemeName = theme === 'dark' ? 'claro' : 'oscuro';
  themeButton.setAttribute('aria-label', `Cambiar a tema ${nextThemeName}`);
  themeButton.title = `Cambiar a tema ${nextThemeName}`;
}

/**
 * Devuelve el tema preferido por el sistema operativo.
 *
 * @returns {'dark' | 'light'}
 */
function systemTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
