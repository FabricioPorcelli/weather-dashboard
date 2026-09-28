/**
 * Render del panel lateral: tarjeta de clima, estados de carga y error.
 * Todas las actualizaciones usan textContent para insertar los datos como
 * texto plano y evitar inyecciones de HTML.
 */

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
