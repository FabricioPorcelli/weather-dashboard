/**
 * Punto de entrada del dashboard.
 * Conecta los eventos de la interfaz con los módulos de mapa, API y render.
 * Los módulos script type="module" se ejecutan después de parsear el HTML,
 * así que el DOM ya está disponible acá.
 */

import { getCurrentWeather } from './api.js';
import { initMap } from './map.js';
import { renderCurrentWeather, setSelectedCoords, showError, showLoading } from './ui.js';

/** Número de la última petición; permite descartar respuestas que llegan tarde. */
let requestId = 0;

initMap(async (lat, lon) => {
  setSelectedCoords(lat, lon);
  showLoading();

  const currentRequest = ++requestId;

  try {
    const { data } = await getCurrentWeather(lat, lon);
    if (currentRequest !== requestId) {
      return; // Hay un clic más nuevo: esta respuesta quedó vieja.
    }
    renderCurrentWeather(data);
  } catch (error) {
    if (currentRequest !== requestId) {
      return;
    }
    showError(error.message);
  }
});
