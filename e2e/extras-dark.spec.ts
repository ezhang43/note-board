import { expect, test, type Page } from '@playwright/test';
import { DARK_PALETTE } from '../src/model/theme';
import { add, columns, freshBoardEachTest, looseCards } from './helpers';

// Owner request: dark mode with a toggle in the toolbar. Starts following the computer's setting;
// pressing the toggle is remembered on this device.

freshBoardEachTest();

const toggle = (page: Page) => page.locator('header.toolbar').getByRole('button', { name: 'Dark mode' });
const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/** Rough brightness 0–255 of a computed rgb() colour. */
function brightness(rgb: string) {
  const [r, g, b] = rgb.match(/\d+(\.\d+)?/g)!.map(Number);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function hexToRgb(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

test('the toggle switches the whole app to dark and back, and is remembered after a reload', async ({ page }) => {
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  expect(brightness(await bodyBg(page))).toBeGreaterThan(200);

  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(async () => brightness(await bodyBg(page))).toBeLessThan(50);
  const toolbarBg = await page.locator('header.toolbar').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(brightness(toolbarBg)).toBeLessThan(60);

  await page.reload();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  expect(brightness(await bodyBg(page))).toBeLessThan(50);

  await toggle(page).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(async () => brightness(await bodyBg(page))).toBeGreaterThan(200);
});

test('in dark mode cards are dark with light text, and columns use deep shades of their colour', async ({ page }) => {
  await toggle(page).click();
  await add(page, 'Note');
  const card = looseCards(page).first();
  const cardStyle = await card.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, ink: getComputedStyle(el).color }));
  expect(brightness(cardStyle.bg)).toBeLessThan(60);
  expect(brightness(cardStyle.ink)).toBeGreaterThan(200);

  await add(page, 'New column');
  await page.getByRole('button', { name: 'Colour of selected block' }).click();
  await page.getByRole('button', { name: 'Rose' }).click();
  await expect(columns(page).first()).toHaveCSS('background-color', hexToRgb(DARK_PALETTE.rose.bg));
});

test('undo does not switch the mode back', async ({ page }) => {
  await add(page, 'Note');
  await toggle(page).click();
  await page.keyboard.press('Control+z');
  await expect(looseCards(page)).toHaveCount(0);
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
});

test('the toolbar, with the toggle, still fits a 1280px-wide window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const fits = await page.locator('header.toolbar').evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(fits).toBe(true);
  const right = (await toggle(page).boundingBox())!;
  expect(right.x + right.width).toBeLessThanOrEqual(1280);
});

test.describe('on a computer set to dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('a first visit starts dark; choosing light is remembered over the computer setting', async ({ page }) => {
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    expect(brightness(await bodyBg(page))).toBeLessThan(50);
    await toggle(page).click();
    await page.reload();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    expect(brightness(await bodyBg(page))).toBeGreaterThan(200);
  });
});
