import { expect, test, type Page } from '@playwright/test';
import { add, appearance, clickEmpty, fontsLoaded, freshBoardEachTest, toggleDark } from './helpers';

// Color themes (job 112, owner choices): Honey (today's look) plus five more. Each changes the accent and
// the board's tint, light and dark; cards stay as they are. Picked from an Appearance menu (which also holds
// the Dark mode switch) and remembered on this device only, like dark mode.

freshBoardEachTest();

const toolbar = (page: Page) => page.locator('header.toolbar');
const themes = (page: Page) => page.getByRole('group', { name: 'Color theme', exact: true });
const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('the Appearance button replaces the moon: it opens a menu with the Dark mode switch and six themes', async ({ page }) => {
  await expect(toolbar(page).getByRole('button', { name: 'Dark mode' })).toHaveCount(0);
  const button = toolbar(page).getByRole('button', { name: 'Appearance', exact: true });
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  const menu = await appearance(page);
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', 'false');
  const names = await themes(page).getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(names).toEqual(['Honey', 'Ocean', 'Forest', 'Lavender', 'Rose', 'Slate']);
  await expect(themes(page).getByRole('button', { name: 'Honey' })).toHaveAttribute('aria-pressed', 'true');
  await expect(themes(page).getByRole('button', { name: 'Ocean' })).toHaveAttribute('aria-pressed', 'false');
  // The menu stays open while it is used; a click on the board closes it; Escape closes it and returns to the button.
  await themes(page).getByRole('button', { name: 'Ocean' }).click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();
  await appearance(page);
  await clickEmpty(page);
  await expect(menu).toBeHidden();
});

test('Honey is the default and looks as it always has', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'honey');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(248, 245, 238)');
  await expect(toolbar(page)).toHaveCSS('background-color', 'rgb(255, 253, 248)');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--honey').trim().toLowerCase())).toBe('#f2b62b');
});

test('picking Ocean tints the board and changes the accent, but cards stay white', async ({ page }) => {
  await add(page, 'Note');
  await clickEmpty(page);
  const card = page.locator('.card.loose');
  await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await (await appearance(page)).getByRole('button', { name: 'Ocean' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'ocean');
  await expect(themes(page).getByRole('button', { name: 'Ocean' })).toHaveAttribute('aria-pressed', 'true');
  await expect(themes(page).getByRole('button', { name: 'Honey' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(241, 246, 249)');
  // The Share button takes the theme's accent (it was honey).
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--honey').trim().toLowerCase())).toBe('#62b6e8');
  await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', /^#FAFDFF$/i);
});

test('every theme has its own tint, in light and in dark', async ({ page }) => {
  const seen = new Set<string>();
  for (const dark of [false, true]) {
    for (const name of ['Honey', 'Ocean', 'Forest', 'Lavender', 'Rose', 'Slate']) {
      await (await appearance(page)).getByRole('button', { name, exact: true }).click();
      await page.keyboard.press('Escape');
      seen.add(`${dark}:${await bodyBg(page)}`);
    }
    if (!dark) await toggleDark(page);
  }
  expect(seen.size).toBe(12);
});

test('the choice is remembered on this device after a reload, and is not saved with the board', async ({ page }) => {
  await add(page, 'Note');
  await (await appearance(page)).getByRole('button', { name: 'Forest' }).click();
  await page.reload();
  await fontsLoaded(page);
  await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'forest');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(242, 246, 239)');
  await appearance(page);
  await expect(themes(page).getByRole('button', { name: 'Forest' })).toHaveAttribute('aria-pressed', 'true');
  const stored = await page.evaluate(() => ({ theme: localStorage.getItem('note-board:color-theme'), board: localStorage.getItem('note-board:v1') ?? '' }));
  expect(stored.theme).toBe('forest');
  expect(stored.board).not.toContain('forest');
  // Not undoable: Undo (the Note just added) leaves the theme alone.
  await page.keyboard.press('Control+z');
  await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'forest');
});

test('a broken saved choice falls back to Honey', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('note-board:color-theme', 'neon'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'honey');
});

test('Dark mode still works from the menu, and a theme has its own dark version; cards stay as dark mode has them', async ({ page }) => {
  await add(page, 'Note');
  await clickEmpty(page);
  await (await appearance(page)).getByRole('button', { name: 'Ocean' }).click();
  await (await appearance(page)).getByRole('button', { name: 'Dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(21, 25, 28)');
  await expect(page.locator('.card.loose')).toHaveCSS('background-color', 'rgb(42, 40, 36)');
  await page.keyboard.press('Escape');
  await page.reload();
  await fontsLoaded(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'ocean');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(21, 25, 28)');
  // Back to Honey: today's dark look.
  await (await appearance(page)).getByRole('button', { name: 'Honey' }).click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(27, 26, 23)');
  await expect(toolbar(page)).toHaveCSS('background-color', 'rgb(36, 34, 30)');
});

test('the menu opens fully on screen at 1280px and the toolbar still fits', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const menu = await appearance(page);
  const m = (await menu.boundingBox())!;
  expect(m.x).toBeGreaterThanOrEqual(0);
  expect(m.x + m.width).toBeLessThanOrEqual(1280);
  expect(await toolbar(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  const openMore = async (page: Page) => {
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: 'More' });
    await expect(sheet).toBeVisible();
    return sheet;
  };

  test('⋯ More has an Appearance row (no separate Dark mode row) that opens the switch and themes inside the panel', async ({ page }) => {
    const sheet = await openMore(page);
    const rest = sheet.locator('.phone-rest');
    await expect(rest.getByRole('button', { name: 'Dark mode' })).toHaveCount(0);
    const row = rest.getByRole('button', { name: 'Appearance', exact: true });
    await row.scrollIntoViewIfNeeded();
    await row.tap();
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    const group = rest.getByRole('group', { name: 'Appearance', exact: true });
    await expect(group.getByRole('button', { name: 'Dark mode' })).toBeVisible();
    await expect(group.getByRole('group', { name: 'Color theme' }).getByRole('button')).toHaveCount(6);
    // Everything fits the panel and is big enough to tap.
    const panel = (await sheet.boundingBox())!;
    for (const b of await group.getByRole('button').all()) {
      const r = (await b.boundingBox())!;
      expect(r.height).toBeGreaterThanOrEqual(44);
      expect(r.x).toBeGreaterThanOrEqual(panel.x);
      expect(r.x + r.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
    }
    await group.getByRole('button', { name: 'Lavender' }).tap();
    await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'lavender');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(246, 243, 250)');
    await group.getByRole('button', { name: 'Dark mode' }).tap();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(24, 22, 28)');
    // Remembered after a reload.
    await page.reload();
    await fontsLoaded(page);
    await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'lavender');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('the Appearance panel fits a 320px phone with no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const sheet = await openMore(page);
    const row = sheet.locator('.phone-rest').getByRole('button', { name: 'Appearance', exact: true });
    await row.scrollIntoViewIfNeeded();
    await row.tap();
    expect(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
