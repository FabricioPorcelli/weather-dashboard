/**
 * Configuración global del dashboard.
 * Centraliza los valores compartidos entre módulos y los que podrían
 * cambiar según el entorno.
 */

/** URL base de la Weather API (ver README del repo weather-api). */
export const API_BASE_URL = 'http://localhost:8000';

/**
 * URL base del asistente conversacional.
 * Es opcional: si no está corriendo, el dashboard sigue funcionando sin él.
 */
export const ASSISTANT_BASE_URL = 'http://localhost:8100';

/** Días de pronóstico solicitados a la API (rango permitido: 1 a 15). */
export const FORECAST_DAYS = 5;

/**
 * Decimales a los que se redondean las coordenadas en el frontend.
 * Coincide con la precisión de la API (2 decimales, ~1 km): clics dentro de
 * la misma celda consultan el mismo punto y aprovechan la caché.
 */
export const COORD_DECIMALS = 2;

/** Zoom al que se centra una ciudad buscada por nombre. */
export const CITY_ZOOM = 13;

/**
 * Distancia máxima para seguir la misma conversación al mover el mapa.
 * Dentro de este radio los datos climáticos son prácticamente iguales;
 * fuera, el chat empieza una conversación nueva.
 */
export const CHAT_LOCATION_RADIUS_KM = 5;

/** Vista inicial del mapa: Buenos Aires. */
export const INITIAL_VIEW = {
  lat: -34.6,
  lon: -58.38,
  zoom: 12,
};

/**
 * Claves de localStorage con prefijo propio, para no chocar con otros
 * proyectos servidos desde el mismo origen.
 */
export const STORAGE_KEYS = {
  theme: 'weather-dashboard:theme',
  lastLocation: 'weather-dashboard:last-location',
  chatAnchors: 'weather-dashboard:chat-anchors',
  userId: 'weather-dashboard:user-id',
};
