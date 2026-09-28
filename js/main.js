/**
 * Punto de entrada del dashboard.
 * Conecta los eventos de la interfaz (clic en el mapa y búsqueda por ciudad)
 * con los módulos de mapa, API y render.
 * Los módulos script type="module" se ejecutan después de parsear el HTML,
 * así que el DOM ya está disponible acá.
 */

import {
  getCurrentWeather,
  getCurrentWeatherByCity,
  getForecast,
  getForecastByCity,
} from './api.js';
import { renderForecastChart } from './chart.js';
import { CITY_ZOOM } from './config.js';
import { geocodeCity } from './geocode.js';
import { centerOn, initMap, placeMarker } from './map.js';
import {
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
 * @returns {Promise<boolean>} true si el resultado se llegó a renderizar.
 */
async function loadWeather(currentPromise, forecastPromise) {
  const currentRequest = ++requestId;
  showLoading();

  try {
    const [current, forecast] = await Promise.all([currentPromise, forecastPromise]);
    if (currentRequest !== requestId) {
      return false;
    }
    renderCurrentWeather(current.data);
    renderForecast(forecast.data);
    renderForecastChart(forecast.data.days);
    return true;
  } catch (error) {
    if (currentRequest !== requestId) {
      return false;
    }
    showError(error.message);
    return false;
  }
}

initMap(async (lat, lon) => {
  const queryKey = `coords:${lat},${lon}`;
  if (queryKey === lastQueryKey) {
    return; // Misma celda (~1 km): ya se mostró o se está pidiendo.
  }
  lastQueryKey = queryKey;

  setSelectedCoords(lat, lon);
  const ok = await loadWeather(getCurrentWeather(lat, lon), getForecast(lat, lon));
  if (!ok) {
    lastQueryKey = null; // Permite reintentar el mismo punto.
  }
});

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const city = searchInput.value.trim();
  if (!city) {
    showError('Escribí el nombre de una ciudad para buscar.');
    return;
  }

  const queryKey = `city:${city.toLowerCase()}`;
  if (queryKey === lastQueryKey) {
    return; // Ya se está mostrando esa ciudad.
  }
  lastQueryKey = queryKey;

  showLoading();

  try {
    const place = await geocodeCity(city);
    if (!place) {
      lastQueryKey = null;
      showError(`No encontramos “${city}”. Probá con otro nombre.`);
      return;
    }

    centerOn(place.lat, place.lon, CITY_ZOOM);
    placeMarker(place.lat, place.lon);
    setSelectedCoords(place.lat, place.lon);

    const ok = await loadWeather(getCurrentWeatherByCity(city), getForecastByCity(city));
    if (!ok) {
      lastQueryKey = null;
    }
  } catch (error) {
    lastQueryKey = null;
    showError(error.message);
  }
});
