import { test, expect } from '@playwright/test';
import {
  blockExtras,
  mockGeocoding,
  mockWeatherApi,
  searchRosario,
} from './helpers.js';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

test.beforeEach(async ({ page }) => {
  await blockExtras(page);
  await mockWeatherApi(page);
  await mockGeocoding(page);
});

test('colapsa el panel mostrando resumen y detalles, y lo expande', async ({
  page,
}) => {
  await page.goto('/');
  await searchRosario(page);

  const panel = page.locator('.panel');
  await expect(panel).not.toHaveClass(/panel--collapsed/);

  await page.locator('#panel-handle').click();
  await expect(panel).toHaveClass(/panel--collapsed/);
  await expect(page.locator('#current-location')).toHaveText('Rosario');
  await expect(page.locator('#current-temp')).toHaveText('31');
  await expect(page.locator('#current-feels-like')).toBeVisible();
  await expect(page.locator('#current-updated')).toBeHidden();
  await expect(page.locator('.panel__collapsible--bottom')).toHaveCSS(
    'opacity',
    '0',
  );

  await page.locator('#panel-handle').click();
  await expect(panel).not.toHaveClass(/panel--collapsed/);
  await expect(page.locator('#forecast-card')).toBeVisible();
});

test('permite colapsar y expandir el panel con las flechas del teclado', async ({
  page,
}) => {
  await page.goto('/');
  await searchRosario(page);

  const panel = page.locator('.panel');
  await page.locator('#panel-handle').focus();
  await page.keyboard.press('ArrowDown');
  await expect(panel).toHaveClass(/panel--collapsed/);
  await page.keyboard.press('ArrowUp');
  await expect(panel).not.toHaveClass(/panel--collapsed/);
});

test('muestra el pronóstico horario en la vista móvil', async ({ page }) => {
  await page.goto('/');
  await searchRosario(page);

  await page.getByRole('tab', { name: 'Por hora' }).click();

  await expect(page.locator('#forecast-hourly-panel')).toBeVisible();
  await expect(page.locator('.hourly-hour')).toHaveCount(24);
  await expect(page.locator('.hourly-group__label').first()).toHaveText('Hoy');

  const hourlyScroll = await page.locator('.hourly-scroll').evaluate((element) => ({
    scrollbarWidth: getComputedStyle(element).scrollbarWidth,
    paddingBottom: getComputedStyle(element).paddingBottom,
  }));
  expect(hourlyScroll.scrollbarWidth).toBe('none');
  expect(hourlyScroll.paddingBottom).toBe('4px');
  await expect(page.locator('#hourly-scrollbar')).toBeHidden();
});

test('anima la apertura y el cierre del chat móvil', async ({ page }) => {
  await page.goto('/');
  await searchRosario(page);

  await page.locator('#chat-open').click();
  const panel = page.locator('#chat-panel');
  await expect(panel).toHaveClass(/chat-panel--mobile/);
  await expect(panel).toHaveCSS('animation-name', 'chat-panel-in');
  await expect(panel).toHaveCSS('user-select', 'none');
  await expect(page.locator('#chat-messages')).toHaveCSS('user-select', 'none');
  await expect(page.locator('#map')).toHaveCSS('pointer-events', 'none');
  await expect(page.locator('body')).toHaveCSS('user-select', 'none');
  await expect(page.locator('body')).toHaveCSS('touch-action', 'none');

  const mapPane = page.locator('.leaflet-map-pane');
  const mapTransform = await mapPane.evaluate((element) => element.style.transform);
  await page.mouse.move(200, 80);
  await page.mouse.down();
  await page.mouse.move(260, 130, { steps: 6 });
  await page.mouse.up();
  await page.mouse.move(200, 500);
  await page.mouse.down();
  await page.mouse.move(250, 550, { steps: 6 });
  await page.mouse.up();
  expect(await mapPane.evaluate((element) => element.style.transform)).toBe(
    mapTransform,
  );
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await panel.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  const box = await panel.boundingBox();
  expect(box.height).toBeLessThan(844 * 0.9);
  expect(box.height).toBeGreaterThan(844 * 0.7);
  expect(box.y).toBeGreaterThan(40);

  const closeAnimation = await panel.evaluate((element) => {
    element.classList.add('chat-panel--closing');
    const name = getComputedStyle(element).animationName;
    element.classList.remove('chat-panel--closing');
    return name;
  });
  expect(closeAnimation).toBe('chat-panel-out');

  await page.locator('#chat-close').click();
  await expect(panel).toBeHidden();
  await expect(page.locator('#map')).toHaveCSS('pointer-events', 'auto');
});

test('el botón atrás cierra el chat sin salir de la app', async ({ page }) => {
  await page.goto('/');
  await searchRosario(page);

  await page.locator('#chat-open').click();
  const panel = page.locator('#chat-panel');
  await expect(panel).toBeVisible();
  const url = page.url();

  await page.evaluate(() => history.back());

  await expect(panel).toBeHidden();
  expect(page.url()).toBe(url);
});

test('mantiene el foco dentro del chat móvil', async ({ page }) => {
  await page.goto('/');
  await searchRosario(page);

  await page.locator('#chat-open').click();
  await expect(page.locator('#chat-panel')).toHaveClass(/chat-panel--mobile/);

  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
  }

  const focusInsideChat = await page.evaluate(() =>
    document.querySelector('#chat-panel').contains(document.activeElement),
  );
  expect(focusInsideChat).toBe(true);
});
