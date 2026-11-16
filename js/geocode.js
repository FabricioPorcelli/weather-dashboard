/**
 * Geocodificación de lugares con Nominatim (OpenStreetMap), con Open-Meteo
 * como fallback para la búsqueda por nombre.
 * Convierte el nombre escrito por el usuario en coordenadas y viceversa.
 * Política de uso: máximo 1 request por segundo y no usarlo para
 * autocompletado; por eso se consulta únicamente al presionar Enter/botón o
 * al elegir un punto en el mapa, y se cachea el resultado.
 */

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const OPEN_METEO_SEARCH_URL = 'https://geocoding-api.open-meteo.com/v1/search';

/**
 * @type {Map<string, {
 *   lat: number,
 *   lon: number,
 *   displayName: string,
 *   label: string,
 * } | null>}
 */
const searchCache = new Map();

/** @type {Map<string, string | null>} */
const reverseCache = new Map();

/** Momento (ms) de la última consulta, para respetar 1 request/segundo. */
let lastRequestAt = 0;

/**
 * Error de geocodificación con un mensaje mostrable al usuario.
 */
export class GeocodeError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = 'GeocodeError';
  }
}

/**
 * Busca una ciudad o pueblo y devuelve sus coordenadas y un nombre corto.
 *
 * @param {string} query Nombre del lugar, por ejemplo "Rosario".
 * @returns {Promise<{
 *   lat: number,
 *   lon: number,
 *   displayName: string,
 *   label: string,
 * } | null>}
 *   Coordenadas y nombre completo, o null si no hay resultados.
 * @throws {GeocodeError} Si no se puede consultar el servicio.
 */
export async function geocodeCity(query) {
  const cacheKey = query.trim().toLowerCase();
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey);
  }

  let result = null;
  try {
    result = await searchWithNominatim(query);
  } catch {
    // Si Nominatim falla por red, CORS o rate limit, se prueba Open-Meteo.
  }

  if (!result) {
    try {
      result = await searchWithOpenMeteo(query);
    } catch {
      throw new GeocodeError(
        'No pudimos conectar con el buscador. Probá de nuevo en unos segundos.',
      );
    }
  }

  searchCache.set(cacheKey, result);
  return result;
}

/**
 * Búsqueda principal con Nominatim.
 *
 * @param {string} query
 * @returns {Promise<{
 *   lat: number,
 *   lon: number,
 *   displayName: string,
 *   label: string,
 * } | null>}
 */
async function searchWithNominatim(query) {
  await waitForRateLimit();

  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'es');

  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  let results;
  try {
    results = await response.json();
  } catch {
    return null;
  }

  const place = results[0];
  if (!place) {
    return null;
  }

  return {
    lat: Number(place.lat),
    lon: Number(place.lon),
    displayName: place.display_name,
    label:
      shortPlaceName(place) ??
      place.display_name.split(',')[0].trim(),
  };
}

/**
 * Fallback de búsqueda con Open-Meteo, que tiene CORS abierto y no requiere
 * clave. Se usa cuando Nominatim no responde o no encuentra el lugar.
 *
 * @param {string} query
 * @returns {Promise<{
 *   lat: number,
 *   lon: number,
 *   displayName: string,
 *   label: string,
 * } | null>}
 */
async function searchWithOpenMeteo(query) {
  const url = new URL(OPEN_METEO_SEARCH_URL);
  url.searchParams.set('name', query);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'es');
  url.searchParams.set('format', 'json');

  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return null;
  }

  const place = data.results?.[0];
  if (!place) {
    return null;
  }

  const lat = Number(place.latitude);
  const lon = Number(place.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const displayName = [
    place.name,
    place.admin2,
    place.admin1,
    place.country,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    lat,
    lon,
    displayName,
    label: place.name?.trim() || query,
  };
}

/**
 * Convierte coordenadas en un nombre corto de lugar.
 * Se usa al hacer clic en el mapa para mostrar "Rosario" en vez de
 * "-32.95, -60.66". Si Nominatim no responde, devuelve null y la interfaz
 * muestra un texto genérico.
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<string | null>}
 */
export async function reverseGeocode(lat, lon) {
  const cacheKey = `reverse:${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (reverseCache.has(cacheKey)) {
    return reverseCache.get(cacheKey);
  }

  await waitForRateLimit();

  const url = new URL(NOMINATIM_REVERSE_URL);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('zoom', '10');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'es');

  let response;
  try {
    response = await fetch(url);
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  let place;
  try {
    place = await response.json();
  } catch {
    return null;
  }

  if (!place || place.error) {
    reverseCache.set(cacheKey, null);
    return null;
  }

  const label = shortPlaceName(place);
  reverseCache.set(cacheKey, label);
  return label;
}

/**
 * Elige el nombre más útil de una respuesta de Nominatim.
 * Prioriza ciudad, pueblo o aldea sobre departamento/provincia.
 *
 * @param {object} place
 * @returns {string | null}
 */
function shortPlaceName(place) {
  const address = place?.address ?? {};
  const candidates = [
    address.city,
    address.town,
    address.village,
    address.hamlet,
    address.municipality,
    address.county,
    address.state,
    place?.name,
    place?.display_name?.split(',')[0],
  ];
  const label = candidates.find(
    (candidate) => typeof candidate === 'string' && candidate.trim(),
  );
  return label ? label.trim() : null;
}

/**
 * Espera lo necesario antes de la próxima consulta a Nominatim (1 req/s).
 */
async function waitForRateLimit() {
  const remaining = 1000 - (Date.now() - lastRequestAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
  lastRequestAt = Date.now();
}
