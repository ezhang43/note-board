import { expect, test, type Page } from '@playwright/test';
import { add, cards, expectNoOverlaps, freshBoardEachTest } from './helpers';

// Daily journal (owner request, 2026-10-18): the Journal button opens the Journal board and puts
// today's dated note at the top, or goes back to it.

freshBoardEachTest();

const dock = (page: Page) => page.locator('.corner-controls');
const boardName = (page: Page) => page.getByLabel('Board name');
const noteText = (page: Page) => page.getByLabel('Note text');
const DATE_LINE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\n\n$/;

test('Journal opens a board called Journal with today’s dated note, the cursor in it ready to type', async ({ page }) => {
  await expect(dock(page).getByRole('button', { name: 'Journal', exact: true })).toHaveText('Journal');
  await dock(page).getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(boardName(page)).toHaveValue('Journal');
  await expect(cards(page)).toHaveCount(1);
  await expect(noteText(page)).toHaveValue(DATE_LINE);
  await expect(noteText(page)).toBeFocused();
  // The cursor is at the end, so typing goes under the date.
  await page.keyboard.type('Went for a walk');
  await expect(noteText(page)).toHaveValue(/\n\nWent for a walk$/);
  // The home board has a board card that opens it.
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'Journal' })).toBeVisible();
});

test('pressing Journal again the same day adds no second note; it goes back to the first', async ({ page }) => {
  await dock(page).getByRole('button', { name: 'Journal', exact: true }).click();
  await page.keyboard.type('morning');
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 300);
  await expect(noteText(page)).not.toBeFocused();
  await dock(page).getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(noteText(page)).toBeFocused();
  await page.keyboard.type(' and evening');
  await expect(noteText(page)).toHaveValue(/morning and evening$/);
});

test('from another board, Journal goes back to the one Journal board', async ({ page }) => {
  await dock(page).getByRole('button', { name: 'Journal', exact: true }).click();
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'New board' }).click();
  await expect(boardName(page)).toHaveValue('');
  await dock(page).getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(boardName(page)).toHaveValue('Journal');
  await expect(cards(page)).toHaveCount(1);
  await expect(noteText(page)).toBeFocused();
});

test('Ctrl+Z takes today’s note away in one step, and Journal puts it back', async ({ page }) => {
  await dock(page).getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(cards(page)).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(cards(page)).toHaveCount(0);
  await expect(boardName(page)).toHaveValue('Journal');
  await dock(page).getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(cards(page)).toHaveCount(1);
});

test('the Journal card lands in Home’s usual spot whatever board was showing; Ctrl+Z on Home takes it away, the board stays', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.type('on home');
  await page.keyboard.press('Escape');
  const boardsMenu = page.getByRole('menu', { name: 'Boards' });
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await boardsMenu.getByRole('menuitem', { name: 'New board' }).click();
  await expect(boardName(page)).toHaveValue('');
  // Pan far away on the other board.
  await page.mouse.move(640, 400);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(3000, 3000);
  await dock(page).getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(boardName(page)).toHaveValue('Journal');
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await boardsMenu.getByRole('menuitem', { name: 'My first board' }).click();
  const journalCard = cards(page).filter({ has: page.getByRole('button', { name: 'Open board' }) });
  await expect(journalCard).toBeInViewport();
  await expect(cards(page).filter({ hasText: 'on home' })).toBeInViewport();
  await expectNoOverlaps(page);
  // Ctrl+Z on Home takes the card away, as after Add a sub-board; the Journal board is kept.
  await page.keyboard.press('Control+z');
  await expect(journalCard).toHaveCount(0);
  await expect(cards(page)).toHaveCount(1);
  await dock(page).getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(boardName(page)).toHaveValue('Journal');
  await expect(cards(page)).toHaveCount(1);
});

test('the Journal board and its note are kept after a reload', async ({ page }) => {
  await dock(page).getByRole('button', { name: 'Journal', exact: true }).click();
  await page.keyboard.type('kept');
  await page.waitForTimeout(400);
  await page.reload();
  await expect(boardName(page)).toHaveValue('Journal');
  await expect(noteText(page)).toHaveValue(/kept$/);
});

test('the panel buttons still fit beside the other controls at 1280px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const right = await dock(page).evaluate((el) => {
    const parts = [...el.children].map((c) => c.getBoundingClientRect());
    return { left: Math.min(...parts.map((r) => r.left)), right: Math.max(...parts.map((r) => r.right)), width: window.innerWidth };
  });
  expect(right.left).toBeGreaterThanOrEqual(0);
  expect(right.right).toBeLessThanOrEqual(right.width);
  const wrapped = await dock(page).locator('.dock-tools > *').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
  expect(wrapped).toBe(1);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('⋯ → Journal opens the Journal board with today’s note', async ({ page }) => {
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).locator('.phone-tiles').getByRole('button', { name: 'Journal', exact: true }).tap();
    await expect(page.getByRole('dialog', { name: 'More' })).toHaveCount(0);
    await expect(page.getByLabel('Board name')).toHaveValue('Journal');
    await expect(cards(page)).toHaveCount(1);
    await expect(noteText(page)).toHaveValue(DATE_LINE);
  });
});
