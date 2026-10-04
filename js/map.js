/**
 * Inicialización y control del mapa Leaflet.
 * Leaflet se carga por CDN en index.html y queda disponible como global `L`.
 * Se usan tiles de OpenStreetMap para ambos temas; en modo oscuro se aplica
 * un filtro CSS sobre la capa de tiles (ver styles.css), porque hoy los
 * proveedores de tiles oscuros requieren API key.
 */

import { COORD_DECIMALS, INITIAL_VIEW } from './config.js';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** @type {L.Map | null} Instancia del mapa (null hasta llamar a initMap). */
let map = null;

/** @type {L.Marker | null} Marcador de la ubicación elegida. */
let marker = null;

/**
 * Crea el mapa en el contenedor #map y registra el evento de clic.
 *
 * @param {(lat: number, lon: number) => void} onLocationSelected
 *   Callback que se ejecuta al hacer clic, con las coordenadas del punto.
 * @param {'dark' | 'light'} theme Tema inicial de los tiles.
 */
export function initMap(onLocationSelected, theme) {
  map = L.map('map').setView([INITIAL_VIEW.lat, INITIAL_VIEW.lon], INITIAL_VIEW.zoom);

  L.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: TILE_ATTRIBUTION,
  }).addTo(map);

  setMapTheme(theme);

  map.on('click', (event) => {
    const lat = roundCoord(event.latlng.lat);
    const lon = roundCoord(event.latlng.lng);
    placeMarker(lat, lon);
    onLocationSelected(lat, lon);
  });
}

/**
 * Ajusta la apariencia del mapa al tema activo.
 * En oscuro se agrega una clase al contenedor y el filtro CSS definido en
 * styles.css invierte los tiles; el marcador y los controles no se afectan
 * porque viven en otros panes de Leaflet.
 *
 * @param {'dark' | 'light'} theme
 */
export function setMapTheme(theme) {
  map.getContainer().classList.toggle('map--dark-tiles', theme === 'dark');
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

/**
 * Centra el mapa en un punto. Si no se indica zoom, mantiene el actual pero
 * con un mínimo de 10 para que el resultado se vea a escala de ciudad.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {number} [zoom]
 */
export function centerOn(lat, lon, zoom) {
  map.setView([lat, lon], zoom ?? Math.max(map.getZoom(), 10));
}

/**
 * Devuelve el nivel de zoom actual del mapa.
 *
 * @returns {number}
 */
export function getZoom() {
  return map.getZoom();
}
