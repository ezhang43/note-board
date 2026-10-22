import { expect, test, type Page } from '@playwright/test';
import { add, cards, columns, freshBoardEachTest } from './helpers';

// Templates and the example board (owner request, job #162, 2026-10-22): an empty board shows six
// template tiles and the Weekend in Lisbon example; the Boards menu has "New from a template…".

freshBoardEachTest();

const boardName = (page: Page) => page.getByLabel('Board name');
const picks = (page: Page) => page.locator('.empty-start');
const boardsMenu = (page: Page) => page.getByRole('menu', { name: 'Boards' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Start a board' });
async function openBoardsMenu(page: Page) {
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(boardsMenu(page)).toBeVisible();
}

test('an empty board shows the six templates and the example, and they go once anything is on the board', async ({ page }) => {
  await expect(picks(page).getByRole('heading', { name: 'Start from a template' })).toBeVisible();
  for (const name of ['Weekly plan', 'Project plan', 'Trip plan', 'Reading list', 'Mood board', 'Study plan']) {
    await expect(picks(page).getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await expect(picks(page).getByRole('button', { name: /^Weekend in Lisbon/ })).toBeVisible();
  await add(page, 'Note');
  await expect(picks(page)).toHaveCount(0);
});

test('picking a template fills the empty board, fits it on screen, names it, and Ctrl+Z gives the empty board back', async ({ page }) => {
  await picks(page).getByRole('button', { name: /^Trip plan/ }).click();
  await expect(boardName(page)).toHaveValue('Trip plan');
  await expect(columns(page)).toHaveCount(4);
  await expect(picks(page)).toHaveCount(0);
  await expect(page.getByLabel('Container title').first()).toHaveValue('Before we go');
  // All four containers are on screen.
  const view = page.viewportSize()!;
  for (const box of await columns(page).evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right }; }))) {
    expect(box.l).toBeGreaterThanOrEqual(0);
    expect(box.r).toBeLessThanOrEqual(view.width);
  }
  await page.keyboard.press('Control+z');
  await expect(columns(page)).toHaveCount(0);
  await expect(boardName(page)).toHaveValue('My first board');
  await expect(picks(page)).toBeVisible();
});

test('a template is kept after a reload', async ({ page }) => {
  await picks(page).getByRole('button', { name: /^Weekly plan/ }).click();
  await expect(columns(page)).toHaveCount(4);
  await page.waitForTimeout(600);
  await page.reload();
  await expect(boardName(page)).toHaveValue('Weekly plan');
  await expect(columns(page)).toHaveCount(4);
});

test('the example opens as a board of its own, and the empty home board stays', async ({ page }) => {
  await picks(page).getByRole('button', { name: /^Weekend in Lisbon/ }).click();
  await expect(boardName(page)).toHaveValue('Weekend in Lisbon');
  await expect(columns(page)).toHaveCount(4);
  await expect(page.getByText('Opened “Weekend in Lisbon”')).toBeVisible();
  await openBoardsMenu(page);
  await expect(boardsMenu(page).getByRole('menuitem', { name: 'My first board' })).toBeVisible();
  await expect(boardsMenu(page).getByRole('menuitem', { name: 'Weekend in Lisbon' })).toHaveAttribute('aria-current', 'true');
});

test('the Boards menu has "New from a template…", which opens the dialog; Escape closes it and focus goes back', async ({ page }) => {
  await add(page, 'Note');
  await openBoardsMenu(page);
  await boardsMenu(page).getByRole('menuitem', { name: 'New from a template…' }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: /^Weekend in Lisbon/ })).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: /Mood board/ })).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: /^Weekly plan/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Boards', exact: true })).toBeFocused();
});

test('from the dialog, a template on a board with cards makes a new board and leaves this one alone', async ({ page }) => {
  await boardName(page).fill('Home');
  await add(page, 'Note');
  await openBoardsMenu(page);
  await boardsMenu(page).getByRole('menuitem', { name: 'New from a template…' }).click();
  await dialog(page).getByRole('button', { name: /^Reading list/ }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(boardName(page)).toHaveValue('Reading list');
  await expect(columns(page)).toHaveCount(4);
  await openBoardsMenu(page);
  await boardsMenu(page).getByRole('menuitem', { name: 'Home' }).click();
  await expect(boardName(page)).toHaveValue('Home');
  await expect(cards(page)).toHaveCount(1);
  await expect(columns(page)).toHaveCount(0);
});

test('Tab never reaches the toolbar or board behind the dialog, and Escape closing it does not clear the board selection behind', async ({ page }) => {
  await add(page, 'Note');
  await openBoardsMenu(page);
  await boardsMenu(page).getByRole('menuitem', { name: 'New from a template…' }).click();
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    // Inside the dialog, or (after its last button) out of the page: never on the toolbar or the board.
    expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement?.closest('[role="dialog"]') != null)).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(cards(page)).toHaveCount(1);
});

test('the dialog closes with its × button and by clicking outside it', async ({ page }) => {
  await add(page, 'Note');
  await openBoardsMenu(page);
  await boardsMenu(page).getByRole('menuitem', { name: 'New from a template…' }).click();
  await dialog(page).getByRole('button', { name: 'Close' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await openBoardsMenu(page);
  await boardsMenu(page).getByRole('menuitem', { name: 'New from a template…' }).click();
  await page.mouse.click(8, 400);
  await expect(dialog(page)).toHaveCount(0);
});

test('"Blank board" in the dialog makes an empty board', async ({ page }) => {
  await boardName(page).fill('Home');
  await add(page, 'Note');
  await openBoardsMenu(page);
  await boardsMenu(page).getByRole('menuitem', { name: 'New from a template…' }).click();
  await dialog(page).getByRole('button', { name: 'Blank board' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(boardName(page)).toHaveValue('');
  await expect(cards(page)).toHaveCount(0);
});

test.describe('in dark mode', () => {
  test.use({ colorScheme: 'dark' });
  test('the tiles and their pictures use the dark colors', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const tile = picks(page).locator('.tpl-tile').first();
    const bg = await tile.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg).toBe('rgb(42, 40, 36)'); // --card-bg in dark
    const col = picks(page).locator('.tpl-thumb i').first();
    expect(await col.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe('rgb(255, 243, 207)'); // not the light Butter
  });
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('the tiles fit two across with no sideways scroll; a tap fills the board', async ({ page }) => {
    const grid = picks(page).locator('.tpl-grid');
    const [first, second] = await picks(page).locator('.tpl-tile').evaluateAll((els) => els.slice(0, 2).map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top }; }));
    expect(second.l).toBeGreaterThan(first.r - 1);
    expect(second.t).toBeCloseTo(first.t, 0);
    expect(await grid.evaluate((e) => e.getBoundingClientRect().right)).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await picks(page).getByRole('button', { name: /^Study plan/ }).tap();
    await expect(boardName(page)).toHaveValue('Study plan');
    await expect(columns(page)).toHaveCount(4);
  });

  test('on a short screen the picks scroll, so the example can still be reached', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 600 });
    const picksBox = picks(page);
    expect(await picksBox.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
    await picksBox.getByRole('button', { name: /^Weekend in Lisbon/ }).tap();
    await expect(boardName(page)).toHaveValue('Weekend in Lisbon');
  });

  test('the dialog is a bottom sheet with 44px touch targets', async ({ page }) => {
    await page.getByRole('button', { name: 'Boards', exact: true }).tap();
    await boardsMenu(page).getByRole('menuitem', { name: 'New from a template…' }).tap();
    const sheet = dialog(page);
    await expect(sheet).toBeVisible();
    const box = (await sheet.boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.width).toBe(390);
    expect(Math.round(box.y + box.height)).toBe(844); // sits on the bottom edge
    const close = (await sheet.getByRole('button', { name: 'Close' }).boundingBox())!;
    expect(close.width).toBeGreaterThanOrEqual(44);
    expect(close.height).toBeGreaterThanOrEqual(44);
    expect((await sheet.getByRole('button', { name: 'Blank board' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await sheet.getByRole('button', { name: /^Mood board/ }).tap();
    await expect(sheet).toHaveCount(0);
    await expect(boardName(page)).toHaveValue('Mood board');
  });
});
