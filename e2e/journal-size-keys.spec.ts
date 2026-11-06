import { expect, test, type Page } from '@playwright/test';
import { add, clickEmpty, freshBoardEachTest } from './helpers';

// The Google Docs size keys in the Journal (owner request, 2026-11-06): Ctrl+Shift+. larger, Ctrl+Shift+, smaller
// (⌘ on a Mac), the same steps as the Aa menu's + and −.

freshBoardEachTest();

const panel = (page: Page) => page.getByRole('complementary', { name: 'Journal' });
const editor = (page: Page) => panel(page).getByRole('textbox', { name: /^Journal, / }).first();
const openJournal = (page: Page) => page.locator('.corner-controls').getByRole('button', { name: 'Journal', exact: true }).click();
async function selectLetters(page: Page, from: number, to: number) {
  await page.keyboard.press('Home');
  for (let i = 0; i < from; i++) await page.keyboard.press('ArrowRight');
  for (let i = from; i < to; i++) await page.keyboard.press('Shift+ArrowRight');
}
const quiet = (page: Page) => editor(page).locator('[data-size]');

test('Ctrl+Shift+. / Ctrl+Shift+, step the selected words through the size list, like + and −', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('a quiet day');
  await selectLetters(page, 2, 7);
  await page.keyboard.press('Control+Shift+Period');
  await expect(quiet(page)).toHaveAttribute('data-size', '18');
  await expect(quiet(page)).toHaveText('quiet');
  await page.keyboard.press('Control+Shift+Period');
  await expect(quiet(page)).toHaveAttribute('data-size', '20');
  await page.keyboard.press('Control+Shift+Comma');
  await expect(quiet(page)).toHaveAttribute('data-size', '18');
  await page.keyboard.press('Control+Shift+Comma');
  await expect(quiet(page)).toHaveCount(0); // back to 16: no size mark
  await page.keyboard.press('Control+Shift+Comma');
  await expect(quiet(page)).toHaveAttribute('data-size', '14');
  // The words stay selected and the cursor stays in the note.
  await expect(editor(page)).toBeFocused();
  expect(await page.evaluate(() => document.getSelection()?.toString())).toBe('quiet');
});

test('⌘+Shift+. / ⌘+Shift+, work too', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('a quiet day');
  await selectLetters(page, 2, 7);
  await page.keyboard.press('Meta+Shift+Period');
  await expect(quiet(page)).toHaveAttribute('data-size', '18');
  await page.keyboard.press('Meta+Shift+Comma');
  await page.keyboard.press('Meta+Shift+Comma');
  await expect(quiet(page)).toHaveAttribute('data-size', '14');
});

test('nothing happens past 10 or 36, and each press is one Ctrl+Z step', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('a quiet day');
  await selectLetters(page, 2, 7);
  for (let i = 0; i < 9; i++) await page.keyboard.press('Control+Shift+Period'); // 18, 20, 24, 28, 32, 36, then three more
  await expect(quiet(page)).toHaveAttribute('data-size', '36');
  await page.keyboard.press('Control+z'); // the presses at the limit made no step: this goes back from 36 to 32
  await expect(quiet(page)).toHaveAttribute('data-size', '32');
  await page.keyboard.press('Control+z');
  await expect(quiet(page)).toHaveAttribute('data-size', '28');
  for (let i = 0; i < 9; i++) await page.keyboard.press('Control+Shift+Comma');
  await expect(quiet(page)).toHaveAttribute('data-size', '10');
  await page.keyboard.press('Control+z');
  await expect(quiet(page)).toHaveAttribute('data-size', '12');
});

test('with nothing selected, the keys set the size of what is typed next', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('big ');
  await page.keyboard.press('Control+Shift+Period');
  await page.keyboard.type('words');
  await expect(quiet(page)).toHaveAttribute('data-size', '18');
  await expect(quiet(page)).toHaveText('words');
});

test('in the Journal the keys leave the selected board card alone', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Checklist', { stayInTitle: true });
  await page.keyboard.type('Groceries');
  const id = await page.locator('.card.selected').getAttribute('data-card-id');
  const title = page.locator(`[data-card-id="${id}"]`).getByLabel('List title');
  const before = await title.evaluate((el) => getComputedStyle(el).fontSize);
  await openJournal(page);
  await page.keyboard.type('a quiet day');
  await selectLetters(page, 2, 7);
  await page.keyboard.press('Control+Shift+Period');
  await expect(quiet(page)).toHaveAttribute('data-size', '18');
  await page.keyboard.press('Meta+Shift+Period');
  await expect(quiet(page)).toHaveAttribute('data-size', '20');
  await page.getByRole('complementary', { name: 'Journal' }).getByRole('button', { name: 'Close journal' }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(title).toHaveValue('Groceries');
  expect(await title.evaluate((el) => getComputedStyle(el).fontSize)).toBe(before);
});
