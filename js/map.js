/**
 * Inicialización y control del mapa Leaflet.
 * Leaflet se carga por CDN en index.html y queda disponible como global `L`.
 */

import { COORD_DECIMALS, INITIAL_VIEW } from './config.js';

/** @type {L.Map | null} Instancia del mapa (null hasta llamar a initMap). */
let map = null;

/** @type {L.Marker | null} Marcador de la ubicación elegida. */
let marker = null;

/**
 * Crea el mapa en el contenedor #map y registra el evento de clic.
 *
 * @param {(lat: number, lon: number) => void} onLocationSelected
 *   Callback que se ejecuta al hacer clic, con las coordenadas del punto.
 */
export function initMap(onLocationSelected) {
  map = L.map('map').setView([INITIAL_VIEW.lat, INITIAL_VIEW.lon], INITIAL_VIEW.zoom);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  map.on('click', (event) => {
    const lat = roundCoord(event.latlng.lat);
    const lon = roundCoord(event.latlng.lng);
    placeMarker(lat, lon);
    onLocationSelected(lat, lon);
  });
}

/**
 * Redondea una coordenada a la precisión que usa la API.
 * Así el marcador, las coordenadas mostradas y la consulta coinciden, y los
 * clics dentro de la misma celda (~1 km) no generan requests distintos.
 *
 * @param {number} value
 * @returns {number}
 */
function roundCoord(value) {
  return Number(value.toFixed(COORD_DECIMALS));
}

/**
 * Coloca el marcador en la posición indicada o lo mueve si ya existe.
 *
 * @param {number} lat
 * @param {number} lon
 */
export function placeMarker(lat, lon) {
  if (marker) {
    marker.setLatLng([lat, lon]);
    return;
  }
  marker = L.marker([lat, lon]).addTo(map);
}
