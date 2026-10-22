import { expect, test, type Page } from '@playwright/test';
import { add, cards, clickEmpty, freshBoardEachTest } from './helpers';

// Interface review U8 and U9 (job 174): the text format bar can be reached from the keyboard (Alt+F10),
// and the Keyboard shortcuts list covers the board like Send feedback does.

freshBoardEachTest();

const bar = (page: Page) => page.getByRole('toolbar', { name: 'Text format' });
const list = (page: Page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' });
const inside = (page: Page, sel: string) => page.evaluate((s) => !!document.activeElement?.closest(s), sel);
/** Focus never reached the board: it is in the panel, or off the page (the browser's own bar, as in feedback.spec.ts). */
const notOnBoard = (page: Page, sel: string) => page.evaluate((s) => document.activeElement === document.body || !!document.activeElement?.closest(s), sel);

/** A note saying "hello", all of it highlighted, the cursor still in it. */
async function highlighted(page: Page) {
  await add(page, 'Note');
  await page.keyboard.type('hello');
  await page.keyboard.press('Shift+Home');
  await expect(bar(page)).toBeVisible();
  return page.getByLabel('Note text');
}

test('Alt+F10 moves into the format bar; arrows and Tab stay inside it; the Font menu works by keyboard', async ({ page }) => {
  const note = await highlighted(page);
  await page.keyboard.press('Alt+F10');
  await expect(bar(page).getByRole('button', { name: 'Bold' })).toBeFocused();
  // Tab goes round inside the bar and never out to the board.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await inside(page, '.format-bar')).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await inside(page, '.format-bar')).toBe(true);
  // Arrows walk along it: Bold, Italic, the three sizes, then Font.
  await bar(page).getByRole('button', { name: 'Bold' }).focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  const font = bar(page).getByRole('button', { name: 'Font' });
  await expect(font).toBeFocused();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: 'Fonts' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitemradio', { name: 'Plex Sans' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitemradio', { name: 'Serif' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect.poll(() => note.evaluate((el) => getComputedStyle(el).fontFamily.toLowerCase())).toContain('serif');
  await expect(font).toBeFocused();
  await expect(bar(page)).toBeVisible();
});

test('Escape in the bar goes back to the text with the highlight kept; keys in the bar leave the board alone', async ({ page }) => {
  const note = await highlighted(page);
  await page.keyboard.press('Alt+F10');
  await expect(bar(page).getByRole('button', { name: 'Bold' })).toBeFocused();
  // Delete, Backspace and the tool keys on a bar button don't act on the board behind it.
  for (const key of ['Delete', 'Backspace', 'v']) await page.keyboard.press(key);
  await expect(cards(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(note).toBeFocused();
  await expect(bar(page)).toBeVisible();
  expect(await note.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 5]);
  await expect(page.locator('.card.selected')).toHaveCount(1);
  // Typing replaces the highlighted text, so the selection really was kept.
  await page.keyboard.type('x');
  await expect(note).toHaveValue('x');
});

test('Escape in the Font menu closes only the menu', async ({ page }) => {
  await highlighted(page);
  await page.keyboard.press('Alt+F10');
  await bar(page).getByRole('button', { name: 'Font' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: 'Fonts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Fonts' })).toHaveCount(0);
  await expect(bar(page).getByRole('button', { name: 'Font' })).toBeFocused();
  await expect(bar(page)).toBeVisible();
});

test('Alt+F10 does nothing when no text is highlighted, and the bar still goes when focus leaves it by mouse', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.type('hello');
  await page.keyboard.press('Alt+F10');
  await expect(bar(page)).toHaveCount(0);
  await expect(page.getByLabel('Note text')).toBeFocused();
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Alt+F10');
  await expect(bar(page).getByRole('button', { name: 'Bold' })).toBeFocused();
  await clickEmpty(page);
  await expect(bar(page)).toHaveCount(0);
});

test('the shortcuts list names the format bar key', async ({ page }) => {
  await page.keyboard.press('?');
  await expect(list(page)).toContainText('Alt+F10');
});

test('with the shortcuts list open, board keys leave the board alone, focus is inside it and Tab stays there', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  await expect(page.locator('.card.selected')).toHaveCount(1);
  await page.keyboard.press('?');
  await expect(list(page)).toHaveAttribute('aria-modal', 'true');
  expect(await inside(page, '.shortcuts-panel')).toBe(true);
  await expect(page.locator('header.toolbar')).toHaveJSProperty('inert', true); // Tab and clicks can't reach the board
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  await expect(cards(page)).toHaveCount(1);
  for (let i = 0; i < 70; i++) {
    await page.keyboard.press('Tab');
    expect(await notOnBoard(page, '.shortcuts-panel')).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await notOnBoard(page, '.shortcuts-panel')).toBe(true);
  // Escape closes it, and the board's keys work again.
  await page.keyboard.press('Escape');
  await expect(list(page)).toHaveCount(0);
  await expect(cards(page)).toHaveCount(1);
  await page.keyboard.press('Delete');
  await expect(cards(page)).toHaveCount(0);
});

test('the ? key closes the list too, and Escape puts focus back on the ? button that opened it', async ({ page }) => {
  await page.keyboard.press('?');
  await expect(list(page)).toBeVisible();
  await page.keyboard.press('?');
  await expect(list(page)).toHaveCount(0);
  const help = page.getByRole('button', { name: 'Keyboard shortcuts' });
  await help.focus();
  await page.keyboard.press('Enter');
  await expect(list(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list(page)).toHaveCount(0);
  await expect(help).toBeFocused();
});

test('recording a key: Escape cancels the recording first, then a second Escape closes the list', async ({ page }) => {
  await page.keyboard.press('?');
  await list(page).locator('.key-button').first().click();
  await expect(list(page).locator('.key-button[aria-pressed="true"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(list(page).locator('.key-button[aria-pressed="true"]')).toHaveCount(0);
  await expect(list(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list(page)).toHaveCount(0);
});

test('in the format bar: Alt+F10 again keeps the way back, and undoing the note the bar formats takes the bar away', async ({ page }) => {
  const note = await highlighted(page);
  await page.keyboard.press('Alt+F10');
  await page.keyboard.press('Alt+F10');
  await page.keyboard.press('Escape');
  await expect(note).toBeFocused();
  // Undo while the keyboard is in the bar: once the note it formats is gone, so is the bar.
  await page.keyboard.press('Alt+F10');
  await expect(bar(page).getByRole('button', { name: 'Bold' })).toBeFocused();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Control+z'); // the typing, then the note itself
  await expect(cards(page)).toHaveCount(0);
  await expect(bar(page)).toHaveCount(0);
});
