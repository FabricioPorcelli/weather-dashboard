/**
 * Geocodificación de ciudades con Nominatim (OpenStreetMap).
 * Convierte el nombre escrito por el usuario en coordenadas para recentrar
 * el mapa. Política de uso: máximo 1 request por segundo y no usarlo para
 * autocompletado; por eso se consulta únicamente al presionar Enter/botón y
 * se cachea el resultado de cada término.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

/** @type {Map<string, {lat: number, lon: number, displayName: string} | null>} */
const cache = new Map();

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
 * Busca una ciudad y devuelve sus coordenadas.
 *
 * @param {string} query Nombre de la ciudad, por ejemplo "Madrid".
 * @returns {Promise<{ lat: number, lon: number, displayName: string } | null>}
 *   Coordenadas y nombre completo, o null si no hay resultados.
 * @throws {GeocodeError} Si no se puede consultar el servicio.
 */
export async function geocodeCity(query) {
  const cacheKey = query.trim().toLowerCase();
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  await waitForRateLimit();

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');

  let response;
  try {
    response = await fetch(url, { headers: { 'Accept-Language': 'es' } });
  } catch {
    throw new GeocodeError('No se pudo buscar la ciudad. Revisá tu conexión.');
  }

  if (!response.ok) {
    throw new GeocodeError(
      'No se pudo buscar la ciudad. Esperá unos segundos y probá de nuevo.',
    );
  }

  let results;
  try {
    results = await response.json();
  } catch {
    throw new GeocodeError('La respuesta del buscador no fue válida. Probá de nuevo.');
  }

  const place = results[0];
  const result = place
    ? {
        lat: Number(place.lat),
        lon: Number(place.lon),
        displayName: place.display_name,
      }
    : null;

  cache.set(cacheKey, result);
  return result;
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
