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

/** @type {L.LayerGroup | null} Capa de conversaciones guardadas. */
let conversationLayer = null;

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
 * Abre el chat como popup anclado al marcador seleccionado.
 * Si todavía no hay marcador, devuelve false y no muestra nada.
 *
 * @param {HTMLElement} element
 * @returns {boolean}
 */
export function openChatPopup(element) {
  if (!map || !marker) {
    return false;
  }

  const mapRect = map.getContainer().getBoundingClientRect();
  const panelRect = document.querySelector('.panel')?.getBoundingClientRect();
  const panelOnRight =
    panelRect && panelRect.left > mapRect.left + mapRect.width / 2;
  const availableWidth = panelOnRight
    ? panelRect.left - mapRect.left - 32
    : window.innerWidth - 40;
  const maxWidth = Math.max(240, Math.min(460, availableWidth));

  marker
    .bindPopup(element, {
      className: 'chat-popup',
      maxWidth,
      minWidth: Math.min(380, maxWidth),
      autoClose: false,
      closeOnClick: false,
      closeButton: true,
      autoPan: false,
      offset: [0, -6],
    })
    .openPopup();

  // Centra el popup en la pantalla para que no quede cortado por arriba.
  requestAnimationFrame(centerChatPopup);

  return true;
}

/**
 * Ajusta el mapa hasta que el popup del chat quede centrado verticalmente.
 * Se corrige en pasos cortos porque el alto del popup depende del contenido.
 */
function centerChatPopup() {
  if (!map || !marker) {
    return;
  }

  let attempts = 0;

  const centerOnce = () => {
    const popupElement = marker.getPopup()?.getElement();
    if (!popupElement || attempts >= 4) {
      return;
    }

    const mapRect = map.getContainer().getBoundingClientRect();
    const panelRect = document.querySelector('.panel')?.getBoundingClientRect();
    const panelOnRight =
      panelRect && panelRect.left > mapRect.left + mapRect.width / 2;
    const visibleRight = panelOnRight ? panelRect.left - 8 : mapRect.right;
    const visibleCenterX = (mapRect.left + visibleRight) / 2;
    const mapCenterY = mapRect.top + mapRect.height / 2;
    const popupRect = popupElement.getBoundingClientRect();
    const popupCenterX = popupRect.left + popupRect.width / 2;
    const popupCenterY = popupRect.top + popupRect.height / 2;
    const deltaX = popupCenterX - visibleCenterX;
    const deltaY = popupCenterY - mapCenterY;

    if (Math.abs(deltaX) < 4 && Math.abs(deltaY) < 4) {
      return;
    }

    attempts += 1;
    map.once('moveend', centerOnce);
    map.panBy([deltaX, deltaY], { animate: true, duration: 0.25 });
  };

  centerOnce();
}

/**
 * Dibuja los puntos de conversaciones guardadas con un pulso.
 *
 * @param {Array<{ session_id: string, lat: number, lon: number, label?: string | null }>} anchors
 * @param {(anchor: object) => void} onSelect
 */
export function renderConversationAnchors(anchors, onSelect) {
  if (!map) {
    return;
  }

  if (!conversationLayer) {
    conversationLayer = L.layerGroup().addTo(map);
  }
  conversationLayer.clearLayers();

  for (const anchor of anchors) {
    const icon = L.divIcon({
      className: 'chat-anchor',
      html: '<span class="chat-anchor__dot"></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });

    const anchorMarker = L.marker([anchor.lat, anchor.lon], {
      icon,
      bubblingMouseEvents: false,
      title: anchor.label ?? 'Conversación guardada',
      zIndexOffset: 1000,
    }).addTo(conversationLayer);

    anchorMarker.on('click', () => onSelect(anchor));
  }
}

/**
 * Devuelve el nivel de zoom actual del mapa.
 *
 * @returns {number}
 */
export function getZoom() {
  return map.getZoom();
}
