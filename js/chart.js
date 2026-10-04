/**
 * Gráfico del pronóstico con Chart.js.
 * Chart.js se carga por CDN en index.html y queda disponible como global `Chart`.
 * Los colores se leen de las variables CSS para que el gráfico acompañe al tema.
 */

/** @type {Chart | null} Instancia activa; se destruye antes de redibujar. */
let chart = null;

/** Últimos días renderizados; permiten redibujar el gráfico al cambiar el tema. */
let lastDays = null;

/**
 * Dibuja el gráfico de temperaturas máximas y mínimas del pronóstico.
 *
 * @param {Array<object>} days Días de la respuesta de /v1/forecast/coords/...
 */
export function renderForecastChart(days) {
  lastDays = days;
  const labels = days.map((day) => formatDay(day.date));
  const textColor = cssVar('--color-text');
  const mutedColor = cssVar('--color-muted');
  const gridColor = cssVar('--color-border');

  if (chart) {
    chart.destroy();
  }

  chart = new Chart(document.querySelector('#forecast-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Máxima',
          data: days.map((day) => day.temp_max_c),
          borderColor: cssVar('--color-warm'),
          backgroundColor: cssVar('--color-warm'),
          tension: 0.35,
        },
        {
          label: 'Mínima',
          data: days.map((day) => day.temp_min_c),
          borderColor: cssVar('--color-accent'),
          backgroundColor: cssVar('--color-accent'),
          tension: 0.35,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: textColor },
        },
      },
      scales: {
        x: {
          ticks: { color: mutedColor },
          grid: { color: gridColor },
        },
        y: {
          ticks: { color: mutedColor },
          grid: { color: gridColor },
        },
      },
    },
  });
}

/**
 * Formatea "2026-09-25" como "vie 25".
 * Se agrega T00:00:00 para que la fecha no se corra un día por la zona horaria.
 *
 * @param {string} isoDate
 * @returns {string}
 */
function formatDay(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
  });
}

/**
 * Lee el valor actual de una variable CSS del documento.
 *
 * @param {string} name
 * @returns {string}
 */
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Redibuja el gráfico con los colores del tema actual.
 * No hace nada si todavía no se renderizó ningún pronóstico.
 */
export function refreshChartTheme() {
  if (lastDays) {
    renderForecastChart(lastDays);
  }
}
