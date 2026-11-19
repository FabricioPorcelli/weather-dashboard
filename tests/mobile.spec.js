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
