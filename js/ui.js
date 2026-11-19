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
    <circle cx="12" cy="12" r="4"></circle>
    <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.42-1.42"></path>
  `,
  cloud:
    '<path d="M17.5 19H7a4.5 4.5 0 0 1-.8-8.93A6 6 0 0 1 18 9.5a4.75 4.75 0 0 1-.5 9.5Z"></path>',
  rain: `
    <path d="M17.5 16H7a4.5 4.5 0 0 1-.8-8.93A6 6 0 0 1 18 6.5a4.75 4.75 0 0 1-.5 9.5Z"></path>
    <path d="M8 19v2M12 19v2M16 19v2"></path>
  `,
  storm: `
    <path d="M17.5 15H7a4.5 4.5 0 0 1-.8-8.93A6 6 0 0 1 18 5.5a4.75 4.75 0 0 1-.5 9.5Z"></path>
    <path d="m13 16-2 3h3l-1 3"></path>
  `,
  snow: `
    <path d="M17.5 15H7a4.5 4.5 0 0 1-.8-8.93A6 6 0 0 1 18 5.5a4.75 4.75 0 0 1-.5 9.5Z"></path>
    <path d="M8 19h.01M12 19h.01M16 19h.01M8 22h.01M12 22h.01M16 22h.01"></path>
  `,
  fog: '<path d="M4 10h16M4 14h16M4 18h10"></path>',
};

/**
 * Renderiza la tira de días del pronóstico.
 *
 * @param {object} data Respuesta de /v1/forecast/coords/...
 */
export function renderForecast(data) {
  retryEl.hidden = true;
  const temperatures = data.days.flatMap((day) => [
    day.temp_min_c,
    day.temp_max_c,
  ]);
  const minTemp = Math.min(...temperatures);
  const maxTemp = Math.max(...temperatures);
  const range = Math.max(maxTemp - minTemp, 1);

  daysEl.replaceChildren(
    ...data.days.map((day, index) =>
      createDayItem(day, {
        minTemp,
        range,
        index,
        isToday: index === 0,
      }),
    ),
  );
  forecastCardEl.hidden = false;
}

/**
 * Crea una tarjeta de día con una barra que representa el rango térmico.
 *
 * @param {object} day Día de la respuesta de /v1/forecast/coords/...
 * @param {{ minTemp: number, range: number, index: number, isToday: boolean }} context
 * @returns {HTMLLIElement}
 */
function createDayItem(day, { minTemp, range, index, isToday }) {
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

  const label = document.createElement('span');
  label.className = 'forecast-day__label';
  label.textContent = dayName;

  const date = document.createElement('span');
  date.className = 'forecast-day__date';
  date.textContent = formatDayNumber(day.date);

  const icon = createWeatherIcon(day.conditions);

  const max = document.createElement('span');
  max.className = 'forecast-day__temp forecast-day__temp--max';
  max.textContent = `${Math.round(day.temp_max_c)}°`;

  const bar = document.createElement('div');
  bar.className = 'forecast-day__bar';

  const fill = document.createElement('span');
  fill.className = 'forecast-day__range';
  const bottom = ((day.temp_min_c - minTemp) / range) * 100;
  const height = Math.max(
    ((day.temp_max_c - day.temp_min_c) / range) * 100,
    8,
  );
  const visibleBottom = Math.min(Math.max(bottom, 0), 100 - height);
  fill.style.setProperty('--bar-bottom', `${visibleBottom}%`);
  fill.style.setProperty('--bar-height', `${height}%`);
  bar.append(fill);

  const min = document.createElement('span');
  min.className = 'forecast-day__temp forecast-day__temp--min';
  min.textContent = `${Math.round(day.temp_min_c)}°`;

  const rain = document.createElement('span');
  rain.className = 'forecast-day__rain';
  const rainDot = document.createElement('span');
  rainDot.className = 'forecast-day__rain-dot';
  rain.append(
    rainDot,
    document.createTextNode(`${day.precipitation_probability}%`),
  );

  content.append(label, date, icon, max, bar, min, rain);
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
  svg.classList.add('forecast-day__icon');
  // El contenido es SVG estático; no se interpola texto de la API.
  svg.innerHTML = WEATHER_ICON_PATHS[weatherIconKind(conditions)];
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
