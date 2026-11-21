import { expect, test, type Page } from '@playwright/test';
import { freshBoardEachTest } from './helpers';

// Typed lists in the Journal (owner request, 2026-11-21): "1. " or "1) " at the start of a plain line starts a
// numbered list, "- " or "* " a bulleted one, as in Google Docs; deeper numbered levels go 1. a. i.

freshBoardEachTest();

const panel = (page: Page) => page.getByRole('complementary', { name: 'Journal' });
const editor = (page: Page) => panel(page).getByRole('textbox', { name: /^Journal, / }).first();
const blocks = (page: Page) => editor(page).locator(':scope > div');
const openJournal = (page: Page) => page.locator('.corner-controls').getByRole('button', { name: 'Journal', exact: true }).click();
const savedNote = (page: Page) =>
  page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
    const board = Object.values(raw.boards).find((b) => (b as { name: string }).name === 'Journal') as { cards: Record<string, { text: string; rich?: unknown }> };
    return Object.values(board.cards)[0];
  });
const markers = (page: Page) => blocks(page).evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.marker ?? ''));

test('"1. " starts a numbered list; Tab goes to a. then i.; Shift+Tab back; Enter continues; kept after a reload', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('1. one');
  await expect(blocks(page).first()).toHaveAttribute('data-type', 'number');
  await expect(blocks(page).first()).toHaveText('one');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('sub');
  await page.keyboard.press('Enter');
  await page.keyboard.type('sub two');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('deep');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type('two');
  await expect.poll(() => markers(page)).toEqual(['1.', 'a.', 'b.', 'i.', '2.']);
  await page.waitForTimeout(400);
  expect((await savedNote(page)).text.split('\n').slice(2)).toEqual(['1. one', '  a. sub', '  b. sub two', '    i. deep', '2. two']);
  await page.reload();
  await openJournal(page);
  await expect.poll(() => markers(page)).toEqual(['1.', 'a.', 'b.', 'i.', '2.']);
});

test('"1) " starts the ) style, which nests as a) and i) and stays after a reload', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('1) one');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('sub');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('deep');
  await expect.poll(() => markers(page)).toEqual(['1)', 'a)', 'i)']);
  await page.waitForTimeout(400);
  const saved = await savedNote(page);
  expect(saved.text.split('\n').slice(2)).toEqual(['1) one', '  a) sub', '    i) deep']);
  await page.reload();
  await openJournal(page);
  await expect.poll(() => markers(page)).toEqual(['1)', 'a)', 'i)']);
});

test('"- " and "* " start a bulleted list', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('- milk');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('* eggs');
  await expect(blocks(page).nth(0)).toHaveAttribute('data-type', 'bullet');
  await expect(blocks(page).nth(1)).toHaveAttribute('data-type', 'bullet');
  await expect(editor(page)).toHaveText('milkeggs');
});

test('Ctrl+Z right after brings back "1. " as words, the cursor after them', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('1. ');
  await expect(blocks(page).first()).toHaveAttribute('data-type', 'number');
  await page.keyboard.press('Control+z');
  await expect(blocks(page).first()).toHaveAttribute('data-type', 'p');
  await expect(editor(page)).toHaveText('1. ');
  // The cursor is after the words it brought back, so typing goes on after them.
  await page.keyboard.type('x');
  await expect(editor(page)).toHaveText('1. x');
});

test('"1. " mid-line, on a heading or inside a list, and "2. ", stay words', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('see 1. here');
  await page.keyboard.press('Enter');
  await page.keyboard.type('2. two');
  await page.keyboard.press('Enter');
  await page.keyboard.type('10. ten');
  await expect(blocks(page)).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(blocks(page).nth(i)).toHaveAttribute('data-type', 'p');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- a');
  await page.keyboard.press('Enter');
  await page.keyboard.type('1. b');
  await expect(blocks(page).nth(4)).toHaveAttribute('data-type', 'bullet');
  await expect(blocks(page).nth(4)).toHaveText('1. b');
});

test('the Numbered list button nests with letters too, and Backspace outdents then ends the item', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.press('Control+Shift+7');
  await page.keyboard.type('one');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('sub');
  await expect.poll(() => markers(page)).toEqual(['1.', 'a.']);
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await expect.poll(() => markers(page)).toEqual(['1.', '2.']);
  await page.keyboard.press('Backspace');
  await expect(blocks(page).nth(1)).toHaveAttribute('data-type', 'p');
});
