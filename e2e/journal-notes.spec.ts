import { expect, test, type Page } from '@playwright/test';
import { freshBoardEachTest } from './helpers';

// General notes in the Journal panel (owner request, 2026-10-29): a section at the top, open whenever
// the panel opens, for notes not tied to a day. It is one note on the Journal board, made on first typing.

freshBoardEachTest();

const panel = (page: Page) => page.getByRole('complementary', { name: 'Journal' });
const openJournal = (page: Page) => page.locator('.corner-controls').getByRole('button', { name: 'Journal', exact: true }).click();
const header = (page: Page) => panel(page).getByRole('button', { name: /^General notes/ });
const notes = (page: Page) => panel(page).getByRole('textbox', { name: 'General notes' });
const today = (page: Page) => panel(page).locator('.journal-page').getByRole('textbox');
const savedJournal = (page: Page) =>
  page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
    const board = Object.values(raw.boards).find((b) => (b as { name: string }).name === 'Journal') as { cards: Record<string, { text: string }> };
    return Object.values(board.cards).map((c) => c.text).sort();
  });

test('the general notes are open at the top; typing in them saves one note, kept after a reload, never a day, and the Journal board stays hidden', async ({ page }) => {
  await openJournal(page);
  await expect(header(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(notes(page)).toBeVisible();
  // Above today's page, and today's page still has the cursor.
  const [n, t] = [await notes(page).boundingBox(), await today(page).boundingBox()];
  expect(n!.y).toBeLessThan(t!.y);
  await expect(today(page)).toBeFocused();
  // Opening adds nothing for them.
  await page.waitForTimeout(400);
  expect(await savedJournal(page)).toHaveLength(1);
  await notes(page).click();
  await page.keyboard.type('Call the plumber');
  await page.waitForTimeout(400);
  const saved = await savedJournal(page);
  expect(saved).toHaveLength(2);
  expect(saved).toContain('General notes\n\nCall the plumber');
  await page.reload();
  await openJournal(page);
  await expect(notes(page)).toHaveText('Call the plumber');
  // Not a day: no group, no count, no timeline row for it.
  await expect(panel(page).locator('.jg-head:not(.jg-day):not(.jg-notes)')).toHaveCount(0);
  await expect(panel(page).locator('.journal-row')).toHaveCount(0);
  // The Journal board is still left out of the Boards menu.
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'Journal' })).toHaveCount(0);
});

test('the header folds them (click, Enter or Space), bringing today’s page up, and they are open again the next time the panel opens', async ({ page }) => {
  await openJournal(page);
  const before = (await today(page).boundingBox())!.y;
  await header(page).click();
  await expect(header(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(notes(page)).toHaveCount(0);
  expect((await today(page).boundingBox())!.y).toBeLessThan(before);
  await header(page).press('Enter');
  await expect(header(page)).toHaveAttribute('aria-expanded', 'true');
  await header(page).press(' ');
  await expect(header(page)).toHaveAttribute('aria-expanded', 'false');
  await openJournal(page); // closes
  await expect(panel(page)).toHaveCount(0);
  await openJournal(page);
  await expect(header(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(notes(page)).toBeVisible();
});

test('Ctrl+Z in them undoes the typing and the note together; the Formatting bar acts on them', async ({ page }) => {
  await openJournal(page);
  await notes(page).click();
  await page.keyboard.type('stamps');
  await page.keyboard.press('Control+a');
  await panel(page).getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(notes(page).locator('[data-b]')).toHaveText('stamps');
  await page.keyboard.press('Control+z');
  await expect(notes(page).locator('[data-b]')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(notes(page)).toHaveText('');
  await page.waitForTimeout(400);
  expect(await savedJournal(page)).toHaveLength(1);
  await page.keyboard.press('Control+y');
  await expect(notes(page)).toHaveText('stamps');
});

test('folded, the header shows their first line', async ({ page }) => {
  await openJournal(page);
  await notes(page).click();
  await page.keyboard.type('Call the plumber\nBuy stamps');
  await header(page).click();
  await expect(header(page).locator('.jg-peek')).toHaveText('Call the plumber');
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('the full-screen panel has them on top, with a header at least 44px tall', async ({ page }) => {
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).locator('.phone-tiles').getByRole('button', { name: 'Journal', exact: true }).tap();
    await expect(header(page)).toHaveAttribute('aria-expanded', 'true');
    expect((await header(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await header(page).tap();
    await expect(notes(page)).toHaveCount(0);
  });
});
