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
} from './api.js';
import { refreshChartTheme, renderForecastChart } from './chart.js';
import {
  initChat,
  openChatWindow,
  resumeConversation,
  setChatLocation,
} from './chat.js';
import { CITY_ZOOM } from './config.js';
import { geocodeCity } from './geocode.js';
import {
  centerOn,
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
import { formatPlaceName } from './text.js';
import {
  initTheme,
  renderCacheBadges,
  renderCurrentWeather,
  renderForecast,
  setSelectedCoords,
  showError,
  showLoading,
} from './ui.js';

const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');

/** Número de la última petición; permite descartar respuestas que llegan tarde. */
let requestId = 0;

/** Ubicación activa del dashboard; se comparte con el chat opcional. */
let currentLocation = null;

/**
 * Clave de la última consulta (coordenadas o ciudad) ya mostrada o en curso,
 * para no repetirla. Se limpia cuando la consulta falla, así se puede reintentar.
 */
let lastQueryKey = null;

/**
 * Pide clima y pronóstico en paralelo y renderiza el resultado.
 * Si mientras tanto se lanzó otra consulta, descarta esta respuesta.
 *
 * @param {Promise<object>} currentPromise Clima actual.
 * @param {Promise<object>} forecastPromise Pronóstico.
 * @returns {Promise<object | null>} Datos del clima actual, o null si no se renderizó.
 */
async function loadWeather(currentPromise, forecastPromise) {
  const currentRequest = ++requestId;
  showLoading();

  try {
    const [current, forecast] = await Promise.all([currentPromise, forecastPromise]);
    if (currentRequest !== requestId) {
      return null;
    }
    renderCurrentWeather(current.data);
    renderForecast(forecast.data);
    renderForecastChart(forecast.data.days);
    renderCacheBadges({ current: current.cache, forecast: forecast.cache });
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
  const location = {
    lat: anchor.lat,
    lon: anchor.lon,
    label: anchor.label ?? null,
  };
  const queryKey = `coords:${anchor.lat},${anchor.lon}`;

  centerOn(anchor.lat, anchor.lon, getZoom());
  placeMarker(anchor.lat, anchor.lon);
  setSelectedCoords(anchor.lat, anchor.lon);
  lastQueryKey = queryKey;

  resumeConversation(anchor);
  setChatLocation(location);
  openChatWindow();

  const current = await loadWeather(
    getCurrentWeather(anchor.lat, anchor.lon),
    getForecast(anchor.lat, anchor.lon),
  );

  if (!current) {
    if (lastQueryKey === queryKey) {
      lastQueryKey = null;
    }
    return;
  }

  currentLocation = {
    lat: anchor.lat,
    lon: anchor.lon,
    label: current.location,
  };
  setChatLocation(currentLocation);
  saveLastLocation({
    lat: anchor.lat,
    lon: anchor.lon,
    label: current.location,
    zoom: getZoom(),
  });
}

initTheme();
initChat({
  openPopup: openChatPopup,
  onAnchorsChanged: refreshChatAnchors,
});
const initialTheme = document.documentElement.dataset.theme;

document.addEventListener('themechange', (event) => {
  setMapTheme(event.detail.theme);
  refreshChartTheme();
});

initMap(async (lat, lon) => {
  const queryKey = `coords:${lat},${lon}`;
  if (queryKey === lastQueryKey) {
    return; // Misma celda (~1 km): ya se mostró o se está pidiendo.
  }
  lastQueryKey = queryKey;

  setSelectedCoords(lat, lon);
  currentLocation = { lat, lon, label: null };
  setChatLocation(currentLocation);

  const current = await loadWeather(getCurrentWeather(lat, lon), getForecast(lat, lon));

  if (!current) {
    if (lastQueryKey === queryKey) {
      lastQueryKey = null; // Permite reintentar el mismo punto.
    }
    return;
  }

  currentLocation = { lat, lon, label: current.location };
  setChatLocation(currentLocation);
  saveLastLocation({ lat, lon, label: current.location, zoom: getZoom() });
}, initialTheme);

refreshChatAnchors();

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const city = formatPlaceName(searchInput.value);
  if (!city) {
    showError('Escribí el nombre de una ciudad para buscar.');
    return;
  }
  searchInput.value = city; // Muestra el texto normalizado en el input.

  const queryKey = `city:${city.toLowerCase()}`;
  if (queryKey === lastQueryKey) {
    return; // Ya se está mostrando esa ciudad.
  }
  lastQueryKey = queryKey;

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

    centerOn(place.lat, place.lon, CITY_ZOOM);
    placeMarker(place.lat, place.lon);
    setSelectedCoords(place.lat, place.lon);
    currentLocation = { lat: place.lat, lon: place.lon, label: city };
    setChatLocation(currentLocation);

    const current = await loadWeather(getCurrentWeatherByCity(city), getForecastByCity(city));
    if (!current) {
      if (lastQueryKey === queryKey) {
        lastQueryKey = null;
      }
      return;
    }

    currentLocation = { lat: place.lat, lon: place.lon, label: current.location };
    setChatLocation(currentLocation);
    saveLastLocation({ lat: place.lat, lon: place.lon, label: current.location, zoom: CITY_ZOOM });
  } catch (error) {
    if (lastQueryKey === queryKey) {
      lastQueryKey = null;
    }
    showError(error);
  }
});

/**
 * Restaura la última ubicación guardada al abrir el dashboard.
 */
async function restoreLastLocation() {
  const saved = loadLastLocation();
  if (!saved) {
    return;
  }

  centerOn(saved.lat, saved.lon, saved.zoom);
  placeMarker(saved.lat, saved.lon);
  setSelectedCoords(saved.lat, saved.lon);
  currentLocation = { lat: saved.lat, lon: saved.lon, label: saved.label ?? null };
  setChatLocation(currentLocation);

  const current = await loadWeather(
    getCurrentWeather(saved.lat, saved.lon),
    getForecast(saved.lat, saved.lon),
  );

  if (current) {
    currentLocation = { lat: saved.lat, lon: saved.lon, label: current.location };
    setChatLocation(currentLocation);
    // Evita repetir la consulta si el primer clic cae en la misma celda.
    lastQueryKey = `coords:${saved.lat},${saved.lon}`;
  }
}

restoreLastLocation();
