/**
 * Render del panel lateral: tarjeta de clima, estados de carga, error y tema.
 * Todas las actualizaciones usan textContent para insertar los datos como
 * texto plano y evitar inyecciones de HTML.
 */

import { loadTheme, saveTheme } from './storage.js';

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
}

/**
 * Estado de error: mensaje visible y tarjeta oculta.
 *
 * @param {string} message
 */
export function showError(message) {
  statusEl.classList.add('panel__hint--error');
  statusEl.textContent = message;
  cardEl.hidden = true;
  forecastCardEl.hidden = true;
}

/**
 * Renderiza la tarjeta de clima actual.
 *
 * @param {object} data Respuesta de /v1/weather/coords/...
 */
export function renderCurrentWeather(data) {
  statusEl.classList.remove('panel__hint--error');
  statusEl.textContent = '';
  locationEl.textContent = data.location;
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
    applyTheme(next);
    saveTheme(next);
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
  });
}

/**
 * Escribe el tema en <html> y actualiza el texto del botón.
 *
 * @param {'dark' | 'light'} theme
 */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const nextThemeName = theme === 'dark' ? 'claro' : 'oscuro';
  themeButton.textContent = `Tema ${nextThemeName}`;
  themeButton.setAttribute('aria-label', `Cambiar a tema ${nextThemeName}`);
}

/**
 * Devuelve el tema preferido por el sistema operativo.
 *
 * @returns {'dark' | 'light'}
 */
function systemTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
