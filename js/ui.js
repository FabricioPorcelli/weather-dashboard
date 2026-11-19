/**
 * Render del panel lateral: tarjeta de clima, estados de carga, error y tema.
 * Todas las actualizaciones usan textContent para insertar los datos como
 * texto plano y evitar inyecciones de HTML.
 */

import { loadTheme, saveTheme } from './storage.js';
import { formatPlaceName, isCoordinateLabel } from './text.js';

const statusEl = document.querySelector('#status');
const liveStatusEl = document.querySelector('#live-status');
const retryEl = document.querySelector('#retry-button');
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
const forecastTabs = [...document.querySelectorAll('.forecast-tab')];
const dailyHeadingIconEl = document.querySelector('#forecast-icon-daily');
const hourlyHeadingIconEl = document.querySelector('#forecast-icon-hourly');
const dailyPanelEl = document.querySelector('#forecast-daily-panel');
const hourlyPanelEl = document.querySelector('#forecast-hourly-panel');
const hourlyDaysEl = document.querySelector('#hourly-days');
const hourlyStatusEl = document.querySelector('#hourly-status');
const daysEl = document.querySelector('#forecast-days');
const themeButton = document.querySelector('#theme-toggle');
const badgesEl = document.querySelector('#cache-badges');
const cacheCurrentEl = document.querySelector('#cache-current');
const cacheForecastEl = document.querySelector('#cache-forecast');
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

let lastUpdatedIso = null;

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
 *
 * @param {string} [message]
 */
export function showLoading(message = 'Consultando la API…') {
  statusEl.classList.remove('panel__hint--error');
  statusEl.textContent = message;
  cardEl.hidden = true;
  forecastCardEl.hidden = true;
  badgesEl.hidden = true;
  retryEl.hidden = true;
  document.dispatchEvent(new CustomEvent('weather:loading'));
}

/**
 * Muestra un aviso sin ocultar los datos que ya están en pantalla.
 *
 * @param {string} text
 * @param {boolean} [isError]
 */
export function showNotice(text, isError = false) {
  statusEl.classList.toggle('panel__hint--error', isError);
  statusEl.textContent = text;
  retryEl.hidden = true;
}

/**
 * Estado de error: mensaje visible y tarjetas ocultas.
 * Acepta un texto ya armado o un error con `status` (ApiError) y lo traduce
 * a un mensaje acorde al código HTTP.
 *
 * @param {string | (Error & { status?: number })} error
 * @param {{ retry?: boolean }} [options]
 */
export function showError(error, { retry = true } = {}) {
  statusEl.classList.add('panel__hint--error');
  statusEl.textContent = typeof error === 'string' ? error : messageForError(error);
  liveStatusEl.textContent = statusEl.textContent;
  cardEl.hidden = true;
  forecastCardEl.hidden = true;
  badgesEl.hidden = true;
  retryEl.hidden = !retry;
  document.dispatchEvent(new CustomEvent('weather:error'));
}

/** Mensajes de la API por código HTTP. El 404 usa el detalle que manda la API. */
const ERROR_MESSAGES = {
  0: 'No pudimos conectarnos con el servicio de clima. Probá de nuevo en unos segundos.',
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
  return ERROR_MESSAGES[error.status] || error.message || 'Ocurrió un error inesperado.';
}

/**
 * Renderiza la tarjeta de clima actual.
 *
 * @param {object} data Respuesta de /v1/weather/coords/...
 * @param {string | null} [label] Nombre de lugar ya resuelto para mostrar.
 */
export function renderCurrentWeather(data, label = null) {
  statusEl.classList.remove('panel__hint--error');
  statusEl.textContent = '';
  locationEl.textContent = resolvePlaceLabel(label, data.location);
  tempEl.textContent = Math.round(data.temperature_c);
  conditionsEl.textContent = data.conditions;
  feelsLikeEl.textContent = `${data.feels_like_c.toFixed(1)} °C`;
  humidityEl.textContent = `${data.humidity} %`;
  windEl.textContent = `${data.wind_speed_kmh.toFixed(1)} km/h`;
  precipEl.textContent = `${data.precipitation_mm.toFixed(1)} mm`;
  lastUpdatedIso = data.updated_at;
  updateUpdatedLabel();
  cardEl.hidden = false;
  retryEl.hidden = true;
  liveStatusEl.textContent = `${locationEl.textContent}: ${Math.round(
    data.temperature_c,
  )} grados, ${data.conditions}.`;
}

/**
 * Actualiza solo el nombre del lugar cuando la geocodificación inversa
 * termina después de que ya se renderizó el clima.
 *
 * @param {string | null} label
 */
export function setCurrentPlaceLabel(label) {
  if (label && label.trim()) {
    locationEl.textContent =
      label === 'Lugar seleccionado' ? label : formatPlaceName(label);
  }
}

/**
 * Decide qué nombre mostrar: label resuelto, location de la API si no son
 * coordenadas, o un texto genérico.
 *
 * @param {string | null} label
 * @param {string} fallback
 * @returns {string}
 */
function resolvePlaceLabel(label, fallback) {
  if (label && label.trim()) {
    return label === 'Lugar seleccionado' ? label : formatPlaceName(label);
  }
  if (fallback && !isCoordinateLabel(fallback)) {
    return fallback === 'Lugar seleccionado'
      ? fallback
      : formatPlaceName(fallback);
  }
  return 'Lugar seleccionado';
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
 * Actualiza la etiqueta de “Actualizado…” usando tiempo relativo.
 */
function updateUpdatedLabel() {
  if (!lastUpdatedIso) {
    return;
  }
  updatedEl.textContent = formatRelativeTime(lastUpdatedIso);
}

/**
 * Formatea una fecha como “Actualizado ahora”, “hace 5 min” o “hace 2 h”.
 *
 * @param {string} isoDate
 * @returns {string}
 */
function formatRelativeTime(isoDate) {
  const timestamp = new Date(isoDate).getTime();
  if (!Number.isFinite(timestamp)) {
    return 'Actualizado ahora';
  }

  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) {
    return 'Actualizado ahora';
  }
  if (minutes < 60) {
    return `Actualizado hace ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Actualizado hace ${hours} h`;
  }

  const days = Math.floor(hours / 24);
  return `Actualizado hace ${days} d`;
}

// Mantiene el tiempo relativo al día aunque la página quede abierta.
window.setInterval(updateUpdatedLabel, 60000);

/** Íconos SVG estáticos para acompañar cada día del pronóstico. */
const WEATHER_ICON_PATHS = {
  sun: `
    <g class="weather-icon__sun">
      <circle cx="12" cy="12" r="4"></circle>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.42-1.42"></path>
    </g>
  `,
  cloud:
    '<path class="weather-icon__cloud" d="M17.5 19H7a4.5 4.5 0 0 1-.8-8.93A6 6 0 0 1 18 9.5a4.75 4.75 0 0 1-.5 9.5Z"></path>',
  rain: `
    <path class="weather-icon__cloud" d="M17.5 16H7a4.5 4.5 0 0 1-.8-8.93A6 6 0 0 1 18 6.5a4.75 4.75 0 0 1-.5 9.5Z"></path>
    <path class="weather-icon__rain weather-icon__rain--1" d="M8 19v2"></path>
    <path class="weather-icon__rain weather-icon__rain--2" d="M12 19v2"></path>
    <path class="weather-icon__rain weather-icon__rain--3" d="M16 19v2"></path>
  `,
  storm: `
    <path class="weather-icon__cloud" d="M17.5 15H7a4.5 4.5 0 0 1-.8-8.93A6 6 0 0 1 18 5.5a4.75 4.75 0 0 1-.5 9.5Z"></path>
    <path class="weather-icon__bolt" d="m13 16-2 3h3l-1 3"></path>
    <path class="weather-icon__rain weather-icon__rain--1" d="M8 19v2"></path>
    <path class="weather-icon__rain weather-icon__rain--3" d="M16 19v2"></path>
  `,
  snow: `
    <path class="weather-icon__cloud" d="M17.5 15H7a4.5 4.5 0 0 1-.8-8.93A6 6 0 0 1 18 5.5a4.75 4.75 0 0 1-.5 9.5Z"></path>
    <path class="weather-icon__snow" d="M8 19h.01M12 19h.01M16 19h.01M8 22h.01M12 22h.01M16 22h.01"></path>
  `,
  fog: '<path class="weather-icon__fog" d="M4 10h16M4 14h16M4 18h10"></path>',
};

/**
 * Renderiza la tira de días del pronóstico.
 *
 * @param {object} data Respuesta de /v1/forecast/coords/...
 */
export function renderForecast(data) {
  retryEl.hidden = true;
  daysEl.replaceChildren(
    ...data.days.map((day, index) =>
      createDayItem(day, {
        index,
        isToday: index === 0,
      }),
    ),
  );
  forecastCardEl.hidden = false;
}

let activeForecastTab = 'daily';
let hourlyRequestCallback = null;

/**
 * Conecta las pestañas de pronóstico diario y horario.
 *
 * @param {() => void} onHourlyRequest
 */
export function initForecastTabs(onHourlyRequest) {
  hourlyRequestCallback = onHourlyRequest ?? null;

  for (const tab of forecastTabs) {
    tab.addEventListener('click', () => {
      activateForecastTab(tabNameFor(tab), true);
    });

    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }
      event.preventDefault();
      const index = forecastTabs.indexOf(tab);
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const nextIndex =
        (index + direction + forecastTabs.length) % forecastTabs.length;
      const next = forecastTabs[nextIndex];
      activateForecastTab(tabNameFor(next), true);
      next.focus();
    });
  }

  activateForecastTab('daily', false);
}

/**
 * @returns {'daily' | 'hourly'}
 */
export function getForecastTab() {
  return activeForecastTab;
}

/**
 * @param {HTMLElement} tab
 * @returns {'daily' | 'hourly'}
 */
function tabNameFor(tab) {
  return tab.id === 'forecast-tab-hourly' ? 'hourly' : 'daily';
}

/**
 * @param {'daily' | 'hourly'} tabName
 * @param {boolean} notify
 */
function activateForecastTab(tabName, notify) {
  activeForecastTab = tabName;

  for (const tab of forecastTabs) {
    const selected = tabNameFor(tab) === tabName;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }

  dailyPanelEl.hidden = tabName !== 'daily';
  hourlyPanelEl.hidden = tabName !== 'hourly';
  dailyHeadingIconEl.classList.toggle(
    'forecast-heading__svg--hidden',
    tabName !== 'daily',
  );
  hourlyHeadingIconEl.classList.toggle(
    'forecast-heading__svg--hidden',
    tabName !== 'hourly',
  );

  if (tabName === 'hourly' && notify) {
    hourlyRequestCallback?.();
  }
}

/**
 * Muestra el estado de carga dentro de la pestaña horaria.
 */
export function showHourlyLoading() {
  hourlyDaysEl.replaceChildren();
  hourlyStatusEl.classList.remove('hourly-status--error');
  hourlyStatusEl.textContent = 'Cargando próximas 24 horas…';
  hourlyStatusEl.hidden = false;
}

/**
 * Muestra un error dentro de la pestaña horaria sin afectar el resto.
 *
 * @param {string | Error} error
 */
export function showHourlyError(error) {
  hourlyDaysEl.replaceChildren();
  hourlyStatusEl.classList.add('hourly-status--error');
  hourlyStatusEl.textContent =
    typeof error === 'string' ? error : messageForError(error);
  hourlyStatusEl.hidden = false;
}

/**
 * Renderiza la tira de horas agrupada por día.
 *
 * @param {object} data Respuesta de /v1/hourly/...
 */
export function renderHourly(data) {
  const hours = Array.isArray(data?.hours) ? data.hours : [];
  if (hours.length === 0) {
    showHourlyError('No hay pronóstico horario disponible.');
    return;
  }

  hourlyStatusEl.hidden = true;
  hourlyStatusEl.textContent = '';
  hourlyStatusEl.classList.remove('hourly-status--error');

  const groups = new Map();
  for (const hour of hours) {
    const day = String(hour.datetime ?? '').slice(0, 10);
    if (!groups.has(day)) {
      groups.set(day, []);
    }
    groups.get(day).push(hour);
  }

  const sections = [...groups.entries()].map(([day, dayHours], groupIndex) => {
    const section = document.createElement('section');
    section.className = 'hourly-group';

    const label = document.createElement('h3');
    label.className = 'hourly-group__label';
    label.textContent =
      groupIndex === 0
        ? 'Hoy'
        : groupIndex === 1
          ? 'Mañana'
          : formatDayNumber(day);

    const row = document.createElement('div');
    row.className = 'hourly-group__hours';

    dayHours.forEach((hour, hourIndex) => {
      const isNow = groupIndex === 0 && hourIndex === 0;
      const time = isNow ? 'Ahora' : formatHourLabel(hour.datetime);
      const rain = hour.precipitation_probability ?? 0;

      const card = document.createElement('article');
      card.className = 'hourly-hour';
      card.classList.toggle('hourly-hour--now', isNow);
      card.setAttribute(
        'aria-label',
        `${time}: ${Math.round(hour.temperature_c)} grados, ${rain}% de probabilidad de lluvia, ${hour.conditions}`,
      );

      const content = document.createElement('div');
      content.className = 'hourly-hour__content';
      content.setAttribute('aria-hidden', 'true');

      const tempEl = document.createElement('span');
      tempEl.className = 'hourly-hour__temp';
      tempEl.textContent = `${Math.round(hour.temperature_c)}°`;

      const icon = createWeatherIcon(hour.conditions ?? '');

      const rainEl = document.createElement('span');
      rainEl.className = 'hourly-hour__rain';
      const rainDot = document.createElement('span');
      rainDot.className = 'forecast-day__rain-dot';
      rainEl.append(rainDot, document.createTextNode(`${rain}%`));

      const timeEl = document.createElement('span');
      timeEl.className = 'hourly-hour__time';
      timeEl.textContent = time;

      content.append(tempEl, icon, rainEl, timeEl);
      card.append(content);
      row.append(card);
    });

    section.append(label, row);
    return section;
  });

  hourlyDaysEl.replaceChildren(...sections);
}

/**
 * @param {string} datetime
 * @returns {string}
 */
function formatHourLabel(datetime) {
  const match = String(datetime).match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '';
}

/**
 * @param {object} day
 * @param {object} context
 * @returns {HTMLLIElement}
 */
function createDayItem(day, { index, isToday }) {
  const item = document.createElement('li');
  item.className = 'forecast-day';
  item.classList.toggle('forecast-day--today', isToday);
  item.style.setProperty('--i', String(index));

  const dayName = isToday ? 'Hoy' : formatDayName(day.date);
  const ariaLabel = [
    `${dayName}, ${formatDayNumber(day.date)}:`,
    `máxima ${Math.round(day.temp_max_c)} grados,`,
    `mínima ${Math.round(day.temp_min_c)} grados,`,
    `${day.precipitation_probability}% de probabilidad de lluvia,`,
    day.conditions,
  ].join(' ');
  item.setAttribute('aria-label', ariaLabel);

  const content = document.createElement('div');
  content.className = 'forecast-day__content';
  content.setAttribute('aria-hidden', 'true');

  const max = document.createElement('span');
  max.className = 'forecast-day__temp forecast-day__temp--max';
  max.textContent = `${Math.round(day.temp_max_c)}°`;

  const min = document.createElement('span');
  min.className = 'forecast-day__temp forecast-day__temp--min';
  min.textContent = `${Math.round(day.temp_min_c)}°`;

  const icon = createWeatherIcon(day.conditions);

  const rain = document.createElement('span');
  rain.className = 'forecast-day__rain';
  const rainDot = document.createElement('span');
  rainDot.className = 'forecast-day__rain-dot';
  rain.append(
    rainDot,
    document.createTextNode(`${day.precipitation_probability}%`),
  );

  const label = document.createElement('span');
  label.className = 'forecast-day__label';
  label.textContent = dayName;

  const date = document.createElement('span');
  date.className = 'forecast-day__date';
  date.textContent = formatDayNumber(day.date);

  content.append(max, min, icon, rain, label, date);
  item.append(content);
  return item;
}

/**
 * Crea un ícono SVG decorativo según las condiciones del día.
 *
 * @param {string} conditions
 * @returns {SVGSVGElement}
 */
function createWeatherIcon(conditions) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const kind = weatherIconKind(conditions);
  svg.classList.add('forecast-day__icon', `weather-icon--${kind}`);
  // El contenido es SVG estático; no se interpola texto de la API.
  svg.innerHTML = WEATHER_ICON_PATHS[kind];
  return svg;
}

/**
 * Traduce las condiciones de la API a uno de los íconos disponibles.
 *
 * @param {string} conditions
 * @returns {keyof typeof WEATHER_ICON_PATHS}
 */
function weatherIconKind(conditions) {
  const value = conditions.toLocaleLowerCase('es');
  if (/tormenta|trueno|rayo/.test(value)) {
    return 'storm';
  }
  if (/nieve|nevada|granizo/.test(value)) {
    return 'snow';
  }
  if (/lluvia|llovizna|chubasco/.test(value)) {
    return 'rain';
  }
  if (/niebla|neblina|bruma/.test(value)) {
    return 'fog';
  }
  if (/nublado|nubes|nuboso|parcialmente/.test(value)) {
    return 'cloud';
  }
  if (/sol|despejado|clear/.test(value)) {
    return 'sun';
  }
  return 'cloud';
}

/**
 * Formatea "2026-09-25" como "vie" en horario local.
 *
 * @param {string} isoDate
 * @returns {string}
 */
function formatDayName(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('es-AR', {
    weekday: 'short',
  });
}

/**
 * Formatea "2026-09-25" como "25 sep" en horario local.
 *
 * @param {string} isoDate
 * @returns {string}
 */
function formatDayNumber(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('es-AR', {
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
  window.umami?.track('theme-change', { theme });
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
 * Escribe el tema en <html>, actualiza el color de la barra del navegador
 * (theme-color) y los textos accesibles del botón.
 *
 * @param {'dark' | 'light'} theme
 */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;

  if (themeColorMeta) {
    const background = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-bg')
      .trim();
    themeColorMeta.setAttribute('content', background);
  }

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

/** Alto del panel colapsado: handle + ubicación + condiciones + temperatura. */
const COLLAPSED_PANEL_HEIGHT = 236;

/**
 * Activa la hoja inferior móvil: arrastre desde el handle y toque para
 * colapsar/expandir. En escritorio el handle queda oculto y no hace nada.
 */
export function initPanelSheet() {
  const panel = document.querySelector('.panel');
  const handle = document.querySelector('#panel-handle');
  if (!panel || !handle) {
    return;
  }

  const mobileQuery = window.matchMedia('(max-width: 640px)');
  const collapsibleParts = panel.querySelectorAll('.panel__collapsible');
  let collapsed = false;
  let dragging = false;
  let moved = false;
  let suppressClick = false;
  let startY = 0;
  let startHeight = 0;
  let pointerId = null;

  const canCollapse = () => {
    const card = document.querySelector('#current-card');
    return Boolean(card && !card.hidden);
  };

  const expandedHeight = () => Math.min(window.innerHeight * 0.68, 620);

  const updateHandle = () => {
    handle.setAttribute('aria-expanded', String(!collapsed));
    handle.setAttribute(
      'aria-label',
      collapsed ? 'Expandir panel' : 'Colapsar panel',
    );
    handle.title = collapsed ? 'Expandir panel' : 'Colapsar panel';
  };

  const setCollapsed = (next) => {
    if (next && !canCollapse()) {
      return;
    }

    collapsed = next;
    panel.classList.toggle('panel--collapsed', collapsed);
    panel.classList.remove('panel--dragging');
    panel.style.height = mobileQuery.matches
      ? `${collapsed ? COLLAPSED_PANEL_HEIGHT : expandedHeight()}px`
      : '';
    collapsibleParts.forEach((part) => {
      part.inert = collapsed;
    });
    window.umami?.track('panel-toggle', { collapsed });
    updateHandle();
  };

  const resetDrag = () => {
    dragging = false;
    pointerId = null;
    panel.classList.remove('panel--dragging');
  };

  /**
   * @param {PointerEvent} event
   */
  const onPointerDown = (event) => {
    if (!mobileQuery.matches || !canCollapse()) {
      return;
    }
    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    dragging = true;
    moved = false;
    suppressClick = false;
    startY = event.clientY;
    startHeight = panel.getBoundingClientRect().height;
    pointerId = event.pointerId;

    if (collapsed) {
      panel.classList.remove('panel--collapsed');
    }
    panel.classList.add('panel--dragging');
    panel.style.height = `${startHeight}px`;
    try {
      handle.setPointerCapture?.(event.pointerId);
    } catch {
      // Algunos navegadores no permiten capturar un puntero sintético.
    }
  };

  /**
   * @param {PointerEvent} event
   */
  const onPointerMove = (event) => {
    if (!dragging || event.pointerId !== pointerId) {
      return;
    }

    const delta = startY - event.clientY;
    if (Math.abs(delta) > 6) {
      moved = true;
    }

    const nextHeight = Math.min(
      Math.max(startHeight + delta, COLLAPSED_PANEL_HEIGHT),
      expandedHeight(),
    );
    panel.style.height = `${nextHeight}px`;
  };

  /**
   * @param {PointerEvent} event
   * @param {boolean} cancelled
   */
  const finishDrag = (event, cancelled) => {
    if (!dragging || event.pointerId !== pointerId) {
      return;
    }

    try {
      if (handle.hasPointerCapture?.(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
    } catch {
      // El puntero ya pudo haberse liberado.
    }

    const currentHeight = panel.getBoundingClientRect().height;
    resetDrag();

    if (cancelled) {
      setCollapsed(collapsed);
      return;
    }

    if (!moved) {
      // Un toque sin desplazamiento deja que el click haga el toggle.
      panel.classList.toggle('panel--collapsed', collapsed);
      panel.style.height = `${
        collapsed ? COLLAPSED_PANEL_HEIGHT : expandedHeight()
      }px`;
      return;
    }

    const shouldCollapse =
      currentHeight < (COLLAPSED_PANEL_HEIGHT + expandedHeight()) / 2;
    suppressClick = true;
    window.setTimeout(() => {
      suppressClick = false;
    }, 350);
    setCollapsed(shouldCollapse);
  };

  const onPointerUp = (event) => finishDrag(event, false);
  const onPointerCancel = (event) => finishDrag(event, true);

  const onClick = () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (!mobileQuery.matches || !canCollapse()) {
      return;
    }
    setCollapsed(!collapsed);
  };

  /**
   * @param {MediaQueryListEvent} event
   */
  const onMobileChange = (event) => {
    if (!event.matches) {
      collapsed = false;
      panel.classList.remove('panel--collapsed', 'panel--dragging');
      panel.style.height = '';
      collapsibleParts.forEach((part) => {
        part.inert = false;
      });
      updateHandle();
      return;
    }

    panel.style.height = collapsed ? `${COLLAPSED_PANEL_HEIGHT}px` : '';
    updateHandle();
  };

  const onResize = () => {
    if (!mobileQuery.matches || dragging) {
      return;
    }
    panel.style.height = collapsed ? `${COLLAPSED_PANEL_HEIGHT}px` : '';
  };

  /**
   * @param {KeyboardEvent} event
   */
  const onHandleKeyDown = (event) => {
    if (!mobileQuery.matches) {
      return;
    }
    if (event.key === 'ArrowDown' && !collapsed) {
      event.preventDefault();
      setCollapsed(true);
    } else if (event.key === 'ArrowUp' && collapsed) {
      event.preventDefault();
      setCollapsed(false);
    }
  };

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  const expandForRequest = () => {
    if (mobileQuery.matches && collapsed) {
      setCollapsed(false);
    }
  };

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('pointercancel', onPointerCancel);
  handle.addEventListener('click', onClick);
  handle.addEventListener('keydown', onHandleKeyDown);
  document.addEventListener('weather:loading', expandForRequest);
  document.addEventListener('weather:error', expandForRequest);
  mobileQuery.addEventListener('change', onMobileChange);
  window.addEventListener('resize', onResize);
  updateHandle();
}
