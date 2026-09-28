/**
 * Punto de entrada del dashboard.
 * Conecta los eventos de la interfaz con los módulos de mapa, API y render.
 * Los módulos script type="module" se ejecutan después de parsear el HTML,
 * así que el DOM ya está disponible acá.
 */

import { getCurrentWeather, getForecast } from './api.js';
import { renderForecastChart } from './chart.js';
import { initMap } from './map.js';
import {
  renderCurrentWeather,
  renderForecast,
  setSelectedCoords,
  showError,
  showLoading,
} from './ui.js';

/** Número de la última petición; permite descartar respuestas que llegan tarde. */
let requestId = 0;

/** Último punto pedido; evita repetir la consulta si el clic no cambió de celda. */
let lastRequestedKey = null;

initMap(async (lat, lon) => {
  const coordsKey = `${lat},${lon}`;
  if (coordsKey === lastRequestedKey) {
    return; // Misma celda (~1 km): ya se mostró o se está pidiendo.
  }
  lastRequestedKey = coordsKey;

  setSelectedCoords(lat, lon);
  showLoading();

  const currentRequest = ++requestId;

  try {
    const [current, forecast] = await Promise.all([
      getCurrentWeather(lat, lon),
      getForecast(lat, lon),
    ]);

    if (currentRequest !== requestId) {
      return; // Hay un clic más nuevo: esta respuesta quedó vieja.
    }

    renderCurrentWeather(current.data);
    renderForecast(forecast.data);
    renderForecastChart(forecast.data.days);
  } catch (error) {
    if (currentRequest !== requestId) {
      return;
    }
    lastRequestedKey = null; // Permite reintentar el mismo punto.
    showError(error.message);
  }
});
