/**
 * Punto de entrada del dashboard.
 * Conecta los eventos de la interfaz con los módulos de mapa, API y render.
 * Los módulos script type="module" se ejecutan después de parsear el HTML,
 * así que el DOM ya está disponible acá.
 */

import { initMap } from './map.js';

const statusEl = document.querySelector('#status');
const coordsEl = document.querySelector('#coords');

/**
 * Formatea coordenadas con cuatro decimales para mostrarlas en el panel.
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {string}
 */
function formatCoords(lat, lon) {
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

initMap((lat, lon) => {
  statusEl.textContent = 'Coordenadas seleccionadas:';
  coordsEl.textContent = formatCoords(lat, lon);
  console.log('Clic en el mapa:', lat, lon);
});
