/**
 * Normalización de texto para nombres de lugares.
 * Se usa tanto para lo que escribe el usuario como para lo que devuelve la
 * API: el proveedor puede repetir la capitalización de la consulta (por
 * ejemplo "ROsario") y esa respuesta queda guardada en la caché de la API.
 */

/** Partículas que van en minúscula dentro de un nombre, salvo al inicio. */
const PARTICLES = new Set([
  'de',
  'del',
  'la',
  'las',
  'los',
  'y',
  'e',
  'en',
  'da',
  'do',
  'dos',
  'das',
  'van',
  'von',
]);

/**
 * Normaliza un nombre de lugar: colapsa espacios y capitaliza cada palabra,
 * dejando en minúscula las partículas ("San Nicolás de los Arroyos").
 * Conserva las siglas de hasta 4 letras en mayúsculas ("CABA", "USA") y las
 * abreviaturas con punto ("EE.UU.").
 *
 * @param {string} value
 * @returns {string}
 */
export function formatPlaceName(value) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word, index) => {
      const isAcronym =
        word.includes('.') || (word.length <= 4 && word === word.toLocaleUpperCase('es'));
      if (isAcronym) {
        return word;
      }
      const lower = word.toLocaleLowerCase('es');
      if (index > 0 && PARTICLES.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1);
    })
    .join(' ');
}
