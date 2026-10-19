import { expect, test, type Page } from '@playwright/test';
import { DARK_PALETTE } from '../src/model/theme';
import { add, appearance, columns, freshBoardEachTest, looseCards, toggleDark } from './helpers';

// Owner request: dark mode with a switch in the toolbar's Appearance menu. Starts following the computer's setting;
// pressing the switch is remembered on this device.

freshBoardEachTest();

const appearanceButton = (page: Page) => page.locator('header.toolbar').getByRole('button', { name: 'Appearance', exact: true });
/** Checks the Dark mode switch in the Appearance menu (opening it, then closing it again). */
async function isDark(page: Page, on: boolean) {
  const menu = await appearance(page);
  await expect(menu.getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', String(on));
  await page.keyboard.press('Escape');
}
const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/** Rough brightness 0–255 of a computed rgb() color. */
function brightness(rgb: string) {
  const [r, g, b] = rgb.match(/\d+(\.\d+)?/g)!.map(Number);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function hexToRgb(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

test('the toggle switches the whole app to dark and back, and is remembered after a reload', async ({ page }) => {
  await isDark(page, false);
  expect(brightness(await bodyBg(page))).toBeGreaterThan(200);

  await toggleDark(page);
  await isDark(page, true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(async () => brightness(await bodyBg(page))).toBeLessThan(50);
  const toolbarBg = await page.locator('header.toolbar').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(brightness(toolbarBg)).toBeLessThan(60);

  await page.reload();
  await isDark(page, true);
  expect(brightness(await bodyBg(page))).toBeLessThan(50);

  await toggleDark(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(async () => brightness(await bodyBg(page))).toBeGreaterThan(200);
});

test('in dark mode cards are dark with light text, and columns use deep shades of their color', async ({ page }) => {
  await toggleDark(page);
  await add(page, 'Note');
  const card = looseCards(page).first();
  const cardStyle = await card.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, ink: getComputedStyle(el).color }));
  expect(brightness(cardStyle.bg)).toBeLessThan(60);
  expect(brightness(cardStyle.ink)).toBeGreaterThan(200);

  await add(page, 'New container');
  await page.getByRole('button', { name: 'Color of selected cards and containers' }).click();
  await page.getByRole('button', { name: 'Rose' }).click();
  await expect(columns(page).first()).toHaveCSS('background-color', hexToRgb(DARK_PALETTE.rose.bg));
});

test('undo does not switch the mode back', async ({ page }) => {
  await add(page, 'Note');
  await toggleDark(page);
  await page.keyboard.press('Control+z');
  await expect(looseCards(page)).toHaveCount(0);
  await isDark(page, true);
});

test('the toolbar, with the toggle, still fits a 1280px-wide window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const fits = await page.locator('header.toolbar').evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(fits).toBe(true);
  const right = (await appearanceButton(page).boundingBox())!;
  expect(right.x + right.width).toBeLessThanOrEqual(1280);
});

test.describe('on a computer set to dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('a first visit starts dark; choosing light is remembered over the computer setting', async ({ page }) => {
    await isDark(page, true);
    expect(brightness(await bodyBg(page))).toBeLessThan(50);
    await toggleDark(page);
    await page.reload();
    await isDark(page, false);
    expect(brightness(await bodyBg(page))).toBeGreaterThan(200);
  });
});
