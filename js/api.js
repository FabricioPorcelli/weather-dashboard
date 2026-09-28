/**
 * Comunicación con la Weather API.
 * Centraliza las peticiones HTTP, la lectura del header X-Cache y la
 * traducción de errores a objetos ApiError con un mensaje mostrable.
 */

import { API_BASE_URL, FORECAST_DAYS } from './config.js';

/**
 * Error de la API con el código HTTP asociado.
 * Un status 0 significa que no hubo respuesta (API apagada, sin red o CORS).
 */
export class ApiError extends Error {
  /**
   * @param {string} message Mensaje mostrable al usuario.
   * @param {number} status Código HTTP o 0 si no hubo respuesta.
   */
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Hace una petición GET a la API y normaliza la respuesta.
 *
 * @param {string} path Ruta relativa, por ejemplo "/v1/weather/coords/-34.6/-58.38".
 * @returns {Promise<{ data: object, cache: string | null }>} Datos y valor de X-Cache.
 * @throws {ApiError} Si la API responde con error o no se puede conectar.
 */
async function request(path) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`);
  } catch {
    throw new ApiError('No se pudo conectar con la API. ¿Está corriendo?', 0);
  }

  const cache = response.headers.get('X-Cache');

  if (!response.ok) {
    throw new ApiError(await readErrorDetail(response), response.status);
  }

  return { data: await response.json(), cache };
}

/**
 * Extrae el mensaje de error del cuerpo JSON de la API.
 * Las respuestas de error tienen la forma { "detail": "..." }.
 *
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function readErrorDetail(response) {
  try {
    const body = await response.json();
    if (typeof body?.detail === 'string') {
      return body.detail;
    }
  } catch {
    // El cuerpo no era JSON válido: se usa el mensaje genérico.
  }
  return `Error ${response.status} de la API.`;
}

/**
 * Obtiene el clima actual para un par de coordenadas.
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{ data: object, cache: string | null }>}
 */
export function getCurrentWeather(lat, lon) {
  return request(`/v1/weather/coords/${lat}/${lon}`);
}

/**
 * Obtiene el pronóstico de los próximos días para un par de coordenadas.
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{ data: object, cache: string | null }>}
 */
export function getForecast(lat, lon) {
  return request(`/v1/forecast/coords/${lat}/${lon}?days=${FORECAST_DAYS}`);
}

/**
 * Obtiene el clima actual para una ciudad.
 *
 * @param {string} city
 * @returns {Promise<{ data: object, cache: string | null }>}
 */
export function getCurrentWeatherByCity(city) {
  return request(`/v1/weather/${encodeURIComponent(city)}`);
}

/**
 * Obtiene el pronóstico para una ciudad.
 *
 * @param {string} city
 * @returns {Promise<{ data: object, cache: string | null }>}
 */
export function getForecastByCity(city) {
  return request(`/v1/forecast/${encodeURIComponent(city)}?days=${FORECAST_DAYS}`);
}
