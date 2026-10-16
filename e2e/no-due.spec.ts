import { expect, test } from '@playwright/test';
import { add, cards, freshBoardEachTest } from './helpers';

// Due dates are gone (owner, 2026-10-16): no calendar button on items, no date chips, no Due
// button or panel. Due dates saved before are erased when the boards load.

freshBoardEachTest();

test('no due-date buttons, chips or panel anywhere', async ({ page }) => {
  await add(page, 'Checklist');
  const row = cards(page).first().locator('[data-item-id]').first();
  await row.getByLabel('Item text').fill('Pay rent');
  await row.hover();
  await expect(row.getByRole('button', { name: 'Delete item' })).toBeVisible();
  await expect(row.getByRole('button', { name: /due/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Due/ })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Due' })).toHaveCount(0);
});

test('a board saved with due dates loads fine, shows no date, and the next save drops it', async ({ page }) => {
  await add(page, 'Checklist');
  await cards(page).first().getByLabel('Item text').first().fill('Pay rent');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('note-board:v1') ?? '')).toContain('Pay rent');
  const saved = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
    const board = raw.boards[raw.home];
    board.cards[board.order[0]].items[0].due = '2026-10-07';
    return JSON.stringify(raw);
  });
  // Put in before the app starts (it saves its own board as the page closes).
  await page.addInitScript((raw) => localStorage.setItem('note-board:v1', raw), saved);
  await page.reload();
  const row = cards(page).first().locator('[data-item-id]').first();
  await expect(row.getByLabel('Item text')).toHaveValue('Pay rent');
  await expect(row.locator('button', { hasText: /Oct|Today|Yesterday|Tomorrow/ })).toHaveCount(0);
  await row.getByLabel('Item text').fill('Pay rent now');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('note-board:v1') ?? '')).toContain('Pay rent now');
  expect(await page.evaluate(() => localStorage.getItem('note-board:v1'))).not.toContain('"due"');
});

test('the About page no longer mentions due dates', async ({ page }) => {
  await page.goto('/about/');
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/due date|due list|due today/i);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('the More menu has no Due item', async ({ page }) => {
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    const menu = page.getByRole('dialog', { name: 'More' });
    await expect(menu.getByRole('button', { name: 'Search' })).toBeVisible();
    await expect(menu.getByRole('button', { name: /due/i })).toHaveCount(0);
  });
});
