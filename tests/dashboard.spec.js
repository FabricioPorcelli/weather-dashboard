import { test, expect } from '@playwright/test';
import {
  blockExtras,
  currentWeather,
  mockGeocoding,
  mockWeatherApi,
  searchRosario,
} from './helpers.js';

test.beforeEach(async ({ page }) => {
  await blockExtras(page);
  await mockWeatherApi(page);
  await mockGeocoding(page);
});

test('busca una ciudad y muestra el clima y el pronóstico', async ({ page }) => {
  await page.goto('/');
  await searchRosario(page);

  await expect(page.locator('#current-location')).toHaveText('Rosario');
  await expect(page.locator('#current-temp')).toHaveText('31');
  await expect(page.locator('#forecast-card')).toBeVisible();
  await expect(page.locator('.forecast-day')).toHaveCount(5);
  await expect(page.locator('#forecast-icon-daily')).toBeVisible();
  await expect(page.locator('#forecast-icon-hourly')).toBeHidden();

  const dailyOrder = await page
    .locator('.forecast-day')
    .first()
    .locator('.forecast-day__content > *')
    .evaluateAll((elements) => elements.map((element) => element.classList[0]));
  expect(dailyOrder).toEqual([
    'forecast-day__temp',
    'forecast-day__temp',
    'forecast-day__icon',
    'forecast-day__rain',
    'forecast-day__label',
    'forecast-day__date',
  ]);

  const dailyIcons = await page
    .locator('.forecast-day .forecast-day__icon')
    .evaluateAll((elements) =>
      elements.map((element) =>
        [...element.classList].find((name) =>
          name.startsWith('weather-icon--'),
        ),
      ),
    );
  expect(dailyIcons).toEqual([
    'weather-icon--rain',
    'weather-icon--partly',
    'weather-icon--cloud',
    'weather-icon--sun',
    'weather-icon--wind',
  ]);

  await expect(page.locator('#coords')).toBeHidden();
  await expect(page.locator('#cache-badges')).toBeHidden();
  await expect(page.locator('#live-status')).toContainText('Rosario');
  await expect(page.locator('#current-updated')).toHaveText(
    /Actualizado (ahora|hace)/,
  );
  await expect(page.locator('.leaflet-control-attribution')).toContainText(
    'OpenStreetMap contributors',
  );
  await expect(
    page.locator(
      '.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]',
    ),
  ).toBeVisible();
});

test('quita el foco del buscador al buscar o tocar fuera del campo', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByLabel('Nombre de la ciudad o pueblo');

  await input.fill('Rosario');
  await input.press('Enter');
  await expect(page.locator('#current-card')).toBeVisible();
  await expect(input).not.toBeFocused();

  await input.focus();
  await page.locator('.panel__title').click();
  await expect(input).not.toBeFocused();

  await expect(page.locator('.panel')).toHaveCSS('cursor', 'default');
  await expect(page.locator('.panel')).toHaveCSS('user-select', 'none');
  await expect(input).toHaveCSS('cursor', 'text');
  await expect(input).toHaveCSS('user-select', 'text');
});

test('carga el pronóstico horario junto con la ciudad y lo cachea', async ({
  page,
}) => {
  let hourlyRequests = 0;
  const apiPaths = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/v1/')) {
      return;
    }
    apiPaths.push(url.pathname);
    if (url.pathname.startsWith('/v1/hourly/')) {
      hourlyRequests += 1;
    }
  });

  await page.goto('/');
  const hourlyRequest = page.waitForRequest((request) =>
    request.url().includes('/v1/hourly/'),
  );
  await searchRosario(page);
  await hourlyRequest;

  await expect(page.getByRole('tab', { name: '5 días' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(apiPaths.some((path) => path.startsWith('/v1/weather/'))).toBe(true);
  expect(apiPaths.some((path) => path.startsWith('/v1/forecast/'))).toBe(true);
  expect(hourlyRequests).toBe(1);

  const dailyPanelHeight = await page
    .locator('#forecast-daily-panel')
    .evaluate((element) => element.getBoundingClientRect().height);
  const dailyDashboardHeight = await page
    .locator('.panel')
    .evaluate((element) => element.getBoundingClientRect().height);

  await page.getByRole('tab', { name: 'Por hora' }).click();
  await expect(page.locator('#forecast-hourly-panel')).toBeVisible();
  await expect(page.locator('.hourly-hour')).toHaveCount(24);
  await expect(page.locator('#forecast-icon-hourly')).toBeVisible();
  await expect(page.locator('#forecast-icon-daily')).toBeHidden();
  expect(hourlyRequests).toBe(1);

  const hourlyPanelAnimation = await page
    .locator('#forecast-hourly-panel')
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(hourlyPanelAnimation).toBe('forecast-panel-in');

  const hourlyScroll = await page.locator('.hourly-scroll').evaluate((element) => ({
    paddingBottom: getComputedStyle(element).paddingBottom,
  }));
  expect(hourlyScroll.paddingBottom).toBe('4px');

  await expect(page.locator('#hourly-scrollbar')).toBeVisible();
  const hourlyScrollbar = await page.locator('#hourly-scrollbar').evaluate((element) => ({
    marginTop: getComputedStyle(element).marginTop,
    height: element.getBoundingClientRect().height,
    thumbWidth: element
      .querySelector('.hourly-scrollbar__thumb')
      .getBoundingClientRect().width,
  }));
  expect(hourlyScrollbar.marginTop).toBe('10px');
  expect(hourlyScrollbar.height).toBeGreaterThan(0);
  expect(hourlyScrollbar.thumbWidth).toBeGreaterThan(0);

  const hourlyPanelHeight = await page
    .locator('#forecast-hourly-panel')
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(Math.abs(hourlyPanelHeight - dailyPanelHeight)).toBeLessThanOrEqual(1);

  const hourlyDashboardHeight = await page
    .locator('.panel')
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(
    Math.abs(hourlyDashboardHeight - dailyDashboardHeight),
  ).toBeLessThanOrEqual(1);

  const hourlyOrder = await page
    .locator('.hourly-hour')
    .first()
    .locator('.hourly-hour__content > *')
    .evaluateAll((elements) => elements.map((element) => element.classList[0]));
  expect(hourlyOrder).toEqual([
    'hourly-hour__temp',
    'forecast-day__icon',
    'hourly-hour__rain',
    'hourly-hour__time',
  ]);

  const hourlyIcons = await page
    .locator('.hourly-hour .forecast-day__icon')
    .evaluateAll((elements) =>
      elements.map((element) =>
        [...element.classList].find((name) =>
          name.startsWith('weather-icon--'),
        ),
      ),
    );
  expect(hourlyIcons).toEqual(
    expect.arrayContaining([
      'weather-icon--rain',
      'weather-icon--storm',
      'weather-icon--partly',
      'weather-icon--sun',
      'weather-icon--moon',
      'weather-icon--partly-night',
      'weather-icon--wind',
    ]),
  );

  const moonAnimation = await page
    .locator('.hourly-hour .weather-icon__moon')
    .first()
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(moonAnimation).toBe('weather-moon-glow');

  const iconColors = await page
    .locator('.hourly-hour .weather-icon--rain')
    .first()
    .evaluate((icon) => {
      const rain = icon.querySelector('.weather-icon__rain');
      const cloud = icon.querySelector('.weather-icon__cloud');
      return [
        getComputedStyle(rain).color,
        getComputedStyle(cloud).color,
      ];
    });
  expect(iconColors[0]).not.toBe(iconColors[1]);

  const rainAnimation = await page
    .locator('.hourly-hour .weather-icon__rain')
    .first()
    .evaluate((element) => getComputedStyle(element).animationName);
  const boltAnimation = await page
    .locator('.hourly-hour .weather-icon__bolt')
    .first()
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(rainAnimation).toBe('weather-rain');
  expect(boltAnimation).toBe('weather-bolt');

  await page.getByRole('tab', { name: '5 días' }).click();
  await expect(page.locator('#forecast-icon-daily')).toBeVisible();
  await page.getByRole('tab', { name: 'Por hora' }).click();

  await expect(page.locator('.hourly-hour')).toHaveCount(24);
  expect(hourlyRequests).toBe(1);
});

test('carga el clima al hacer clic en el mapa y consulta la celda redondeada', async ({
  page,
}) => {
  let weatherUrl = '';
  page.on('request', (request) => {
    if (request.url().includes('/v1/weather/coords/')) {
      weatherUrl = request.url();
    }
  });

  await page.goto('/');
  await page.locator('#map').click({ position: { x: 500, y: 350 } });

  await expect(page.locator('#current-card')).toBeVisible();
  await expect(page.locator('#current-location')).toHaveText('Rosario');
  await expect(page.locator('#current-temp')).toHaveText('31');
  expect(weatherUrl).toMatch(
    /\/v1\/weather\/coords\/-?\d+(\.\d{1,2})?\/-?\d+(\.\d{1,2})?$/,
  );
});

test('usa Open-Meteo cuando Nominatim falla', async ({ page }) => {
  await page.unroute('https://nominatim.openstreetmap.org/search**');
  await page.unroute('https://nominatim.openstreetmap.org/reverse**');
  await mockGeocoding(page, { nominatimFails: true });

  await page.goto('/');
  await searchRosario(page);

  await expect(page.locator('#current-location')).toHaveText('Rosario');
  await expect(page.locator('#current-card')).toBeVisible();
});

test('cambia el tema y lo conserva al recargar', async ({ page }) => {
  await page.goto('/');

  const html = page.locator('html');
  const attribution = page.locator('.leaflet-control-attribution');
  await expect(attribution).toBeVisible();
  const initialTheme = await html.getAttribute('data-theme');
  const nextTheme = initialTheme === 'dark' ? 'light' : 'dark';

  await page.locator('#theme-toggle').click();
  await expect(html).toHaveAttribute('data-theme', nextTheme);
  await expect(attribution).toHaveCSS(
    'background-color',
    nextTheme === 'dark'
      ? 'rgba(17, 17, 17, 0.94)'
      : 'rgba(243, 238, 227, 0.96)',
  );

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', nextTheme);
});

test('usa la ubicación del navegador', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -32.9594, longitude: -60.6617 });

  await page.goto('/');
  await page.locator('#locate-button').click();

  await expect(page.locator('#current-card')).toBeVisible();
  await expect(page.locator('#current-location')).toHaveText('Rosario');
});

test('abre el chat, muestra sugerencias y lo cierra tocando el marcador', async ({
  page,
}) => {
  await page.goto('/');
  await searchRosario(page);

  await page.locator('#chat-open').click();
  await expect(page.locator('.leaflet-popup')).toHaveCount(1);
  await expect(page.locator('.chat__suggestions')).toBeVisible();

  await page.locator('.location-marker').dispatchEvent('click');
  await expect(page.locator('.leaflet-popup')).toHaveCount(0);

  await page.locator('#chat-open').click();
  await expect(page.locator('.leaflet-popup')).toHaveCount(1);
});

test('expone el chat como diálogo y lo cierra con Escape', async ({ page }) => {
  await page.goto('/');
  await searchRosario(page);

  await page.locator('#chat-open').click();
  const panel = page.locator('#chat-panel');
  await expect(panel).toHaveAttribute('role', 'dialog');
  await expect(panel).toHaveAttribute(
    'aria-label',
    'Preguntas sobre el clima',
  );
  await expect(page.locator('#chat-input')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.locator('.leaflet-popup')).toHaveCount(0);
  await expect(page.locator('#chat-open')).toBeFocused();
});

test('ofrece un landmark principal y un enlace de salto', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('main#main-content')).toBeVisible();

  await page.keyboard.press('Tab');
  const skipLink = page.locator('.skip-link');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();

  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});

test('reduce el movimiento decorativo cuando el sistema lo pide', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await searchRosario(page);

  await expect(page.locator('.panel')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.location-marker__pulse')).toHaveCSS(
    'animation-name',
    'none',
  );

  await page.locator('#chat-open').click();
  await expect(page.locator('#chat-panel')).toHaveCSS('animation-name', 'none');
});

test('descarta conversaciones viejas al reabrir el chat', async ({ page }) => {
  await page.addInitScript(() => {
    const updatedAt = new Date(
      Date.now() - 3 * 60 * 60 * 1000,
    ).toISOString();
    localStorage.setItem(
      'weather-dashboard:chat-anchors',
      JSON.stringify([
        {
          session_id: 'ses_vieja',
          lat: -32.94682,
          lon: -60.63932,
          label: 'Rosario',
          messages: [
            { role: 'user', text: 'Pregunta vieja' },
            { role: 'assistant', text: 'Respuesta vieja' },
          ],
          updated_at: updatedAt,
        },
      ]),
    );
  });

  await page.goto('/');
  await searchRosario(page);
  await page.locator('#chat-open').click();

  await expect(page.locator('.chat__suggestions')).toBeVisible();
  await expect(page.locator('.chat__message')).toHaveCount(0);
});

test('muestra Reintentar y recupera la consulta después de un error', async ({
  page,
}) => {
  let attempts = 0;
  await page.unroute('http://localhost:8000/v1/weather/**');
  await page.route('http://localhost:8000/v1/weather/**', (route) => {
    attempts += 1;
    if (attempts === 1) {
      return route.fulfill({
        status: 502,
        headers: {
          'access-control-allow-origin': '*',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ detail: 'Proveedor caído' }),
      });
    }
    return route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'content-type': 'application/json',
        'x-cache': 'HIT',
      },
      body: JSON.stringify(currentWeather),
    });
  });

  await page.goto('/');
  await page.getByLabel('Nombre de la ciudad o pueblo').fill('Rosario');
  await page.getByRole('button', { name: 'Buscar' }).click();

  await expect(page.locator('#retry-button')).toBeVisible();
  await page.locator('#retry-button').click();

  await expect(page.locator('#current-card')).toBeVisible();
  await expect(page.locator('#current-location')).toHaveText('Rosario');
});
