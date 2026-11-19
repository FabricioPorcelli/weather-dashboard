/**
 * Punto de entrada del dashboard.
 * Conecta los eventos de la interfaz (clic en el mapa y búsqueda por ciudad)
 * con los módulos de mapa, API, storage y render.
 * Los módulos script type="module" se ejecutan después de parsear el HTML,
 * así que el DOM ya está disponible acá.
 */

import {
  getCurrentWeather,
  getCurrentWeatherByCity,
  getForecast,
  getForecastByCity,
  getHourly,
  getHourlyByCity,
} from './api.js';
import {
  initChat,
  openChatWindow,
  resumeConversation,
  setChatLocation,
} from './chat.js';
import {
  CITY_ZOOM,
  COORD_DECIMALS,
  GEOLOCATION_COORD_DECIMALS,
} from './config.js';
import { geocodeCity, reverseGeocode } from './geocode.js';
import {
  centerOn,
  closeChatPopup,
  getZoom,
  initMap,
  openChatPopup,
  placeMarker,
  renderConversationAnchors,
  setMapTheme,
} from './map.js';
import {
  loadChatAnchors,
  loadLastLocation,
  saveLastLocation,
} from './storage.js';
import { formatPlaceName, isCoordinateLabel } from './text.js';
import {
  getForecastTab,
  initForecastTabs,
  initPanelSheet,
  initTheme,
  renderCacheBadges,
  renderCurrentWeather,
  renderForecast,
  renderHourly,
  setCurrentPlaceLabel,
  setSelectedCoords,
  showError,
  showHourlyError,
  showHourlyLoading,
  showLoading,
  showNotice,
} from './ui.js';

const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');
const locateButton = document.querySelector('#locate-button');
const retryButton = document.querySelector('#retry-button');

/** Número de la última petición; permite descartar respuestas que llegan tarde. */
let requestId = 0;

/** Ubicación activa del dashboard; se comparte con el chat opcional. */
let currentLocation = null;

/**
 * Clave de la última consulta (coordenadas o ciudad) ya mostrada o en curso,
 * para no repetirla. Se limpia cuando la consulta falla, así se puede reintentar.
 */
let lastQueryKey = null;

/** Acción que ejecuta el botón “Reintentar” después de un error. */
let lastRetryAction = null;

/** Última consulta válida, usada para pedir el pronóstico horario. */
let currentQuery = null;

/** Caché en memoria del pronóstico horario por ubicación. */
const hourlyCache = new Map();

/** Peticiones horarias en curso, para no duplicarlas. */
const hourlyPending = new Map();

/** Descarta respuestas horarias viejas si cambió la ubicación. */
let hourlyRequestId = 0;

/**
 * Devuelve un nombre de lugar utilizable, descartando coordenadas viejas.
 *
 * @param {string | null | undefined} label
 * @returns {string | null}
 */
function usablePlaceLabel(label) {
  return label && !isCoordinateLabel(label) ? formatPlaceName(label) : null;
}

/**
 * Redondea una coordenada a la celda que usa la API para cachear.
 *
 * @param {number} value
 * @returns {number}
 */
function roundCoord(value) {
  return Number(value.toFixed(COORD_DECIMALS));
}

/**
 * @param {{ type: 'city', city: string } | { type: 'coords', lat: number, lon: number }} query
 * @returns {string}
 */
function hourlyKey(query) {
  return query.type === 'city'
    ? `city:${query.city.toLowerCase()}`
    : `coords:${query.lat},${query.lon}`;
}

/**
 * Obtiene el pronóstico horario, reutilizando la caché o una petición en curso.
 *
 * @param {{ type: 'city', city: string } | { type: 'coords', lat: number, lon: number }} query
 * @returns {Promise<object>}
 */
function fetchHourly(query) {
  const key = hourlyKey(query);
  const cached = hourlyCache.get(key);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = hourlyPending.get(key);
  if (pending) {
    return pending;
  }

  const promise = (
    query.type === 'city'
      ? getHourlyByCity(query.city)
      : getHourly(query.lat, query.lon)
  )
    .then((result) => {
      hourlyCache.set(key, result.data);
      return result.data;
    })
    .finally(() => {
      hourlyPending.delete(key);
    });

  hourlyPending.set(key, promise);
  return promise;
}

/**
 * Muestra el pronóstico horario de la consulta activa cuando la pestaña
 * está seleccionada. La caché evita repetir llamados al cambiar de pestaña.
 */
async function ensureHourly() {
  if (getForecastTab() !== 'hourly' || !currentQuery) {
    return;
  }

  const query = currentQuery;
  const key = hourlyKey(query);
  const cached = hourlyCache.get(key);
  if (cached) {
    renderHourly(cached);
    return;
  }

  const request = ++hourlyRequestId;
  showHourlyLoading();

  try {
    const data = await fetchHourly(query);
    if (
      request !== hourlyRequestId ||
      getForecastTab() !== 'hourly' ||
      !currentQuery ||
      hourlyKey(currentQuery) !== key
    ) {
      return;
    }
    renderHourly(data);
  } catch (error) {
    if (
      request !== hourlyRequestId ||
      getForecastTab() !== 'hourly' ||
      !currentQuery ||
      hourlyKey(currentQuery) !== key
    ) {
      return;
    }
    showHourlyError(error);
  }
}

/**
 * Pide clima y pronóstico en paralelo y renderiza el resultado.
 * Si mientras tanto se lanzó otra consulta, descarta esta respuesta.
 *
 * @param {Promise<object>} currentPromise Clima actual.
 * @param {Promise<object>} forecastPromise Pronóstico.
 * @param {Promise<string | null> | null} [labelPromise] Nombre del lugar en resolución.
 * @param {string | null} [fallbackLabel] Nombre a mostrar mientras se resuelve.
 * @param {Promise<object> | null} [hourlyPromise] Pronóstico horario en paralelo.
 * @returns {Promise<object | null>} Datos del clima actual, o null si no se renderizó.
 */
async function loadWeather(
  currentPromise,
  forecastPromise,
  labelPromise = null,
  fallbackLabel = null,
  hourlyPromise = null,
) {
  const currentRequest = ++requestId;
  showLoading();

  if (hourlyPromise && getForecastTab() === 'hourly') {
    showHourlyLoading();
  }

  try {
    const [current, forecast] = await Promise.all([currentPromise, forecastPromise]);
    if (currentRequest !== requestId) {
      return null;
    }
    renderCurrentWeather(current.data, fallbackLabel);
    renderForecast(forecast.data);
    renderCacheBadges({ current: current.cache, forecast: forecast.cache });

    if (hourlyPromise) {
      hourlyPromise
        .then((data) => {
          if (currentRequest === requestId && getForecastTab() === 'hourly') {
            renderHourly(data);
          }
        })
        .catch((error) => {
          if (currentRequest === requestId && getForecastTab() === 'hourly') {
            showHourlyError(error);
          }
        });
    }

    if (labelPromise) {
      labelPromise
        .then((label) => {
          if (currentRequest === requestId && label) {
            setCurrentPlaceLabel(label);
          }
        })
        .catch(() => {
          // Si falla la geocodificación inversa, queda el nombre de respaldo.
        });
    }

    return current.data;
  } catch (error) {
    if (currentRequest !== requestId) {
      return null;
    }
    showError(error);
    return null;
  }
}

/**
 * Vuelve a dibujar los puntos de conversaciones guardadas.
 */
function refreshChatAnchors() {
  renderConversationAnchors(loadChatAnchors(), resumeFromAnchor);
}

/**
 * Retoma una conversación desde un punto guardado en el mapa.
 *
 * @param {{ session_id: string, lat: number, lon: number, label?: string | null }} anchor
 */
async function resumeFromAnchor(anchor) {
  const savedLabel = usablePlaceLabel(anchor.label);
  const queryLat = roundCoord(anchor.lat);
  const queryLon = roundCoord(anchor.lon);
  const labelPromise = savedLabel ? null : reverseGeocode(anchor.lat, anchor.lon);
  const location = {
    lat: anchor.lat,
    lon: anchor.lon,
    label: savedLabel ?? 'Lugar seleccionado',
  };
  const queryKey = `coords:${queryLat},${queryLon}`;

  centerOn(anchor.lat, anchor.lon, getZoom());
  placeMarker(anchor.lat, anchor.lon);
  setSelectedCoords(queryLat, queryLon);
  lastQueryKey = queryKey;
  currentQuery = { type: 'coords', lat: queryLat, lon: queryLon };
  const hourlyPromise = fetchHourly(currentQuery);

  resumeConversation(anchor);
  setChatLocation(location);
  openChatWindow();
  lastRetryAction = () => resumeFromAnchor(anchor);

  const current = await loadWeather(
    getCurrentWeather(queryLat, queryLon),
    getForecast(queryLat, queryLon),
    labelPromise,
    savedLabel ?? 'Lugar seleccionado',
    hourlyPromise,
  );

  if (!current) {
    if (lastQueryKey === queryKey) {
      lastQueryKey = null;
    }
    return;
  }

  const label = labelPromise ? await labelPromise.catch(() => null) : savedLabel;
  if (lastQueryKey !== queryKey) {
    return;
  }
  const placeLabel =
    usablePlaceLabel(label) ??
    usablePlaceLabel(current.location) ??
    'Lugar seleccionado';

  currentLocation = {
    lat: anchor.lat,
    lon: anchor.lon,
    label: placeLabel,
  };
  setChatLocation(currentLocation);
  saveLastLocation({
    lat: anchor.lat,
    lon: anchor.lon,
    label: placeLabel,
    zoom: getZoom(),
  });
}

initTheme();
initPanelSheet();
initForecastTabs(ensureHourly);
initChat({
  openPopup: openChatPopup,
  closePopup: closeChatPopup,
  onAnchorsChanged: refreshChatAnchors,
});
const initialTheme = document.documentElement.dataset.theme;

document.addEventListener('themechange', (event) => {
  setMapTheme(event.detail.theme);
});

/**
 * Consulta el clima para un par de coordenadas y actualiza todo el panel.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {{
 *   force?: boolean,
 *   markerLat?: number,
 *   markerLon?: number,
 * }} [options]
 */
async function selectCoordinates(
  lat,
  lon,
  { force = false, markerLat = lat, markerLon = lon } = {},
) {
  const queryLat = roundCoord(lat);
  const queryLon = roundCoord(lon);
  const queryKey = `coords:${queryLat},${queryLon}`;
  if (!force && queryKey === lastQueryKey) {
    // Misma celda de caché: el pin ya se movió, pero no repetimos la consulta.
    if (currentLocation) {
      currentLocation = {
        ...currentLocation,
        lat: markerLat,
        lon: markerLon,
      };
      setChatLocation(currentLocation);
      saveLastLocation({
        lat: markerLat,
        lon: markerLon,
        label: currentLocation.label ?? null,
        zoom: getZoom(),
      });
    }
    return;
  }
  lastQueryKey = queryKey;
  currentQuery = { type: 'coords', lat: queryLat, lon: queryLon };
  const hourlyPromise = fetchHourly(currentQuery);
  lastRetryAction = () =>
    selectCoordinates(queryLat, queryLon, {
      force: true,
      markerLat,
      markerLon,
    });

  setSelectedCoords(queryLat, queryLon);
  const labelPromise = reverseGeocode(markerLat, markerLon);
  currentLocation = {
    lat: markerLat,
    lon: markerLon,
    label: 'Lugar seleccionado',
  };
  setChatLocation(currentLocation);

  const current = await loadWeather(
    getCurrentWeather(queryLat, queryLon),
    getForecast(queryLat, queryLon),
    labelPromise,
    'Lugar seleccionado',
    hourlyPromise,
  );

  if (!current) {
    if (lastQueryKey === queryKey) {
      lastQueryKey = null; // Permite reintentar el mismo punto.
    }
    return;
  }

  const label = await labelPromise.catch(() => null);
  if (lastQueryKey !== queryKey) {
    return;
  }
  const placeLabel =
    usablePlaceLabel(label) ??
    usablePlaceLabel(current.location) ??
    'Lugar seleccionado';

  currentLocation = { lat: markerLat, lon: markerLon, label: placeLabel };
  setChatLocation(currentLocation);
  saveLastLocation({
    lat: markerLat,
    lon: markerLon,
    label: placeLabel,
    zoom: getZoom(),
  });
  lastRetryAction = null;
}

initMap(async (lat, lon, exact) => {
  window.umami?.track('map-click');
  await selectCoordinates(lat, lon, {
    markerLat: exact.lat,
    markerLon: exact.lon,
  });
}, initialTheme);

refreshChatAnchors();

/**
 * Busca un lugar por nombre y actualiza el mapa y el panel.
 *
 * @param {string} city
 */
async function searchPlace(city) {
  const queryKey = `city:${city.toLowerCase()}`;
  if (queryKey === lastQueryKey) {
    return; // Ya se está mostrando esa ciudad.
  }
  lastQueryKey = queryKey;
  const query = { type: 'city', city };
  currentQuery = query;
  lastRetryAction = () => searchPlace(city);

  showLoading();

  try {
    const place = await geocodeCity(city);
    if (!place) {
      if (lastQueryKey === queryKey) {
        lastQueryKey = null;
      }
      showError(`No encontramos “${city}”. Probá con otro nombre.`);
      return;
    }

    const placeLabel = usablePlaceLabel(place.label) ?? formatPlaceName(city);

    centerOn(place.lat, place.lon, CITY_ZOOM);
    placeMarker(place.lat, place.lon);
    setSelectedCoords(place.lat, place.lon);
    currentLocation = { lat: place.lat, lon: place.lon, label: placeLabel };
    setChatLocation(currentLocation);

    const hourlyPromise = fetchHourly(query);
    const current = await loadWeather(
      getCurrentWeatherByCity(city),
      getForecastByCity(city),
      null,
      placeLabel,
      hourlyPromise,
    );
    if (!current) {
      if (lastQueryKey === queryKey) {
        lastQueryKey = null;
      }
      return;
    }

    currentLocation = { lat: place.lat, lon: place.lon, label: placeLabel };
    setChatLocation(currentLocation);
    saveLastLocation({
      lat: place.lat,
      lon: place.lon,
      label: placeLabel,
      zoom: CITY_ZOOM,
    });
    lastRetryAction = null;
    window.umami?.track('search');
  } catch (error) {
    if (lastQueryKey === queryKey) {
      lastQueryKey = null;
    }
    showError(error);
  }
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const city = formatPlaceName(searchInput.value);
  if (!city) {
    showError('Escribí el nombre de un lugar para buscar.', { retry: false });
    return;
  }
  searchInput.value = city; // Muestra el texto normalizado en el input.
  searchInput.blur(); // Cierra el teclado y quita el cursor titilante en móvil.
  searchPlace(city);
});

/**
 * Quita el foco de un campo de texto al tocar fuera de él.
 * Evita que el cursor siga titilando mientras se recorre el dashboard.
 *
 * @param {PointerEvent} event
 */
function blurActiveInputOnPointerDown(event) {
  const active = document.activeElement;
  if (
    !(active instanceof HTMLInputElement) &&
    !(active instanceof HTMLTextAreaElement)
  ) {
    return;
  }

  const target = event.target;
  if (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable="true"]')
  ) {
    return;
  }

  active.blur();
}

document.addEventListener('pointerdown', blurActiveInputOnPointerDown);

locateButton.addEventListener('click', () => {
  window.umami?.track('geolocation');

  if (!navigator.geolocation) {
    showError('Tu navegador no permite obtener la ubicación.', { retry: false });
    return;
  }

  locateButton.disabled = true;
  showNotice('Buscando tu ubicación…');

  navigator.geolocation.getCurrentPosition(
    (position) => {
      locateButton.disabled = false;
      const lat = Number(
        position.coords.latitude.toFixed(GEOLOCATION_COORD_DECIMALS),
      );
      const lon = Number(
        position.coords.longitude.toFixed(GEOLOCATION_COORD_DECIMALS),
      );

      centerOn(lat, lon, CITY_ZOOM);
      placeMarker(lat, lon);
      selectCoordinates(lat, lon, { force: true });
    },
    (error) => {
      locateButton.disabled = false;
      lastRetryAction = null;
      const message =
        error.code === error.PERMISSION_DENIED
          ? 'No diste permiso para usar tu ubicación. Podés habilitarlo desde el navegador.'
          : 'No pudimos obtener tu ubicación. Probá de nuevo.';
      showNotice(message, true);
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
  );
});

retryButton.addEventListener('click', () => {
  if (!lastRetryAction) {
    return;
  }
  window.umami?.track('retry');
  lastRetryAction();
});

/**
 * Restaura la última ubicación guardada al abrir el dashboard.
 */
async function restoreLastLocation() {
  const saved = loadLastLocation();
  if (!saved) {
    return;
  }

  const savedLabel = usablePlaceLabel(saved.label);
  const queryLat = roundCoord(saved.lat);
  const queryLon = roundCoord(saved.lon);
  const labelPromise = savedLabel ? null : reverseGeocode(saved.lat, saved.lon);
  const fallbackLabel = savedLabel ?? 'Lugar seleccionado';
  const restoreQueryKey = `coords:${queryLat},${queryLon}`;

  centerOn(saved.lat, saved.lon, saved.zoom);
  placeMarker(saved.lat, saved.lon);
  setSelectedCoords(queryLat, queryLon);
  currentLocation = { lat: saved.lat, lon: saved.lon, label: fallbackLabel };
  setChatLocation(currentLocation);
  currentQuery = { type: 'coords', lat: queryLat, lon: queryLon };
  const hourlyPromise = fetchHourly(currentQuery);
  lastRetryAction = () =>
    selectCoordinates(queryLat, queryLon, {
      force: true,
      markerLat: saved.lat,
      markerLon: saved.lon,
    });

  const current = await loadWeather(
    getCurrentWeather(queryLat, queryLon),
    getForecast(queryLat, queryLon),
    labelPromise,
    fallbackLabel,
    hourlyPromise,
  );

  if (current) {
    const label = labelPromise ? await labelPromise.catch(() => null) : savedLabel;
    if (lastQueryKey && lastQueryKey !== restoreQueryKey) {
      return;
    }
    const placeLabel =
      usablePlaceLabel(label) ??
      usablePlaceLabel(current.location) ??
      fallbackLabel;

    currentLocation = { lat: saved.lat, lon: saved.lon, label: placeLabel };
    setChatLocation(currentLocation);
    saveLastLocation({
      lat: saved.lat,
      lon: saved.lon,
      label: placeLabel,
      zoom: saved.zoom,
    });
    // Evita repetir la consulta si el primer clic cae en la misma celda.
    lastQueryKey = restoreQueryKey;
  }
}

restoreLastLocation();
