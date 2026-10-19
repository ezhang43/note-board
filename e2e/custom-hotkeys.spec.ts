import { expect, test, type Page } from '@playwright/test';
import { add, cards, clickEmpty, freshBoardEachTest } from './helpers';

// Custom hotkeys (job 118): the tools and the block shortcuts can be re-mapped in the Keyboard shortcuts
// panel (click a key, press the new one; Escape cancels; Reset). Kept on this device only.

freshBoardEachTest();

const panel = (page: Page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' });
const hand = (page: Page) => page.getByRole('button', { name: /^Hand \(/ });
const select = (page: Page) => page.getByRole('button', { name: /^Select \(/ });
const keyRow = (page: Page, name: string) => panel(page).getByRole('button', { name: new RegExp(`^${name}:`) });

async function openPanel(page: Page) {
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(panel(page)).toBeVisible();
}

test('the panel shows the keys as they are, and clicking one records a new key for the Hand tool', async ({ page }) => {
  await openPanel(page);
  await expect(keyRow(page, 'Hand tool')).toHaveText('H');
  await expect(keyRow(page, 'Duplicate')).toHaveText('Ctrl+D');
  await keyRow(page, 'Hand tool').click();
  await expect(keyRow(page, 'Hand tool')).toHaveText('Press a key…');
  await page.keyboard.press('g');
  await expect(keyRow(page, 'Hand tool')).toHaveText('G');
  // The tooltips and names follow, and the panel is still open (the pressed key did nothing else).
  await expect(panel(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hand (G)' })).toHaveAttribute('title', /^Hand \(G\)/);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  // G now picks the Hand tool; H no longer does.
  await select(page).click();
  await expect(select(page)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('h');
  await expect(select(page)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('g');
  await expect(hand(page)).toHaveAttribute('aria-pressed', 'true');
});

test('the new key is kept for next time, on this device only, and Reset puts the usual keys back', async ({ page }) => {
  await openPanel(page);
  await keyRow(page, 'Select tool').click();
  await page.keyboard.press('Control+k');
  await expect(keyRow(page, 'Select tool')).toHaveText('Ctrl+K');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Select (Ctrl+K)' })).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(select(page)).toHaveAttribute('aria-pressed', 'true');
  // Not part of the board: the board's own saved data has no hotkeys.
  const stored = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  expect(stored['note-board:v1'] ?? '').not.toContain('hotkeys');
  expect(stored['note-board:hotkeys']).toContain('"k"');
  await openPanel(page);
  await panel(page).getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(keyRow(page, 'Select tool')).toHaveText('V');
  await expect(page.getByRole('button', { name: 'Select (V)' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Select (V)' })).toBeVisible();
});

test('a key that something else uses is refused with a short message naming it', async ({ page }) => {
  await openPanel(page);
  await keyRow(page, 'Hand tool').click();
  await page.keyboard.press('Control+d');
  await expect(panel(page).getByRole('status')).toHaveText('Ctrl+D is already used by Duplicate.');
  await expect(keyRow(page, 'Hand tool')).toHaveText('H');
  await keyRow(page, 'Hand tool').click();
  await page.keyboard.press('v');
  await expect(panel(page).getByRole('status')).toHaveText('V is already used by Select tool.');
  await keyRow(page, 'Hand tool').click();
  await page.keyboard.press('Control+z');
  await expect(panel(page).getByRole('status')).toHaveText('Ctrl+Z is already used by the app.');
  await keyRow(page, 'Hand tool').click();
  await page.keyboard.press('ArrowLeft');
  await expect(panel(page).getByRole('status')).toHaveText('That key is used for something else.');
  // Nothing changed.
  await expect(page.getByRole('button', { name: 'Hand (H)' })).toBeVisible();
});

test('Escape while recording cancels it and leaves the panel open', async ({ page }) => {
  await openPanel(page);
  await keyRow(page, 'Hand tool').click();
  await page.keyboard.press('Escape');
  await expect(keyRow(page, 'Hand tool')).toHaveText('H');
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
});

test('Duplicate and Select all follow their new keys on the board, and the old ones stop', async ({ page }) => {
  await add(page, 'Note');
  await clickEmpty(page);
  await openPanel(page);
  await keyRow(page, 'Duplicate').click();
  await page.keyboard.press('Control+Shift+k');
  await expect(keyRow(page, 'Duplicate')).toHaveText('Ctrl+Shift+K');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await page.keyboard.press('Control+a'); // still Select all
  await expect(page.locator('.card.selected')).toHaveCount(1);
  await expect(cards(page)).toHaveCount(1);
  await page.keyboard.press('Control+d');
  await expect(cards(page)).toHaveCount(1);
  await page.keyboard.press('Control+Shift+k');
  await expect(cards(page)).toHaveCount(2);
});

test('a broken saved value falls back to the usual keys', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('note-board:hotkeys', '{"hand":{"key":"v","mod":false,"shift":false},"select":"x"'));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Hand (H)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select (V)' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('note-board:hotkeys', JSON.stringify({ hand: { key: 'v', mod: false, shift: false } })));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Hand (H)' })).toBeVisible(); // V is Select's: the whole saved set is dropped
});

test('keys still do nothing while typing in a text field, and undo still works there', async ({ page }) => {
  await openPanel(page);
  await keyRow(page, 'Hand tool').click();
  await page.keyboard.press('g');
  await page.keyboard.press('Escape');
  await add(page, 'Note');
  await page.keyboard.type('gggg');
  await expect(page.locator('textarea').first()).toHaveValue('gggg');
  await page.keyboard.press('Control+z');
  await expect(page.locator('textarea').first()).not.toHaveValue('gggg');
});

test('Delete follows its new key (Backspace still works too)', async ({ page }) => {
  await openPanel(page);
  await keyRow(page, 'Delete selection').click();
  await page.keyboard.press('x');
  await expect(keyRow(page, 'Delete selection')).toHaveText('X');
  await page.keyboard.press('Escape');
  await add(page, 'Note');
  await page.keyboard.press('Escape'); // leaves the text field; the card stays selected
  await page.keyboard.press('Delete');
  await expect(cards(page)).toHaveCount(1);
  await page.keyboard.press('x');
  await expect(cards(page)).toHaveCount(0);
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Backspace');
  await expect(cards(page)).toHaveCount(0);
});
