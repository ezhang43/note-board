import { expect, test, type Page } from '@playwright/test';
import { add, cards, clickEmpty, freshBoardEachTest } from './helpers';

// Custom hotkeys (job 118): the block shortcuts can be re-mapped in the Keyboard shortcuts
// panel (click a key, press the new one; Escape cancels; Reset). Kept on this device only.

freshBoardEachTest();

const panel = (page: Page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' });
const keyRow = (page: Page, name: string) => panel(page).getByRole('button', { name: new RegExp(`^${name}:`) });

async function openPanel(page: Page) {
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(panel(page)).toBeVisible();
}

test('the panel shows the keys as they are, and clicking one records a new key for it', async ({ page }) => {
  await openPanel(page);
  await expect(keyRow(page, 'Delete selection')).toHaveText('Delete');
  await expect(keyRow(page, 'Duplicate')).toHaveText('Ctrl+D');
  // The Hand and Select tools are gone (job 188), so their keys are too.
  await expect(panel(page).getByText('Hand tool')).toHaveCount(0);
  await expect(panel(page).getByText('Select tool')).toHaveCount(0);
  await keyRow(page, 'Delete selection').click();
  await expect(keyRow(page, 'Delete selection')).toHaveText('Press a key…');
  await page.keyboard.press('g');
  await expect(keyRow(page, 'Delete selection')).toHaveText('G');
  // The panel is still open (the pressed key did nothing else), and Escape closes it.
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
});

test('the new key is kept for next time, on this device only, and Reset puts the usual keys back', async ({ page }) => {
  await openPanel(page);
  await keyRow(page, 'Duplicate').click();
  await page.keyboard.press('Control+k');
  await expect(keyRow(page, 'Duplicate')).toHaveText('Ctrl+K');
  await page.keyboard.press('Escape');
  await page.reload();
  await openPanel(page);
  await expect(keyRow(page, 'Duplicate')).toHaveText('Ctrl+K');
  // Not part of the board: the board's own saved data has no hotkeys.
  const stored = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  expect(stored['note-board:v1'] ?? '').not.toContain('hotkeys');
  expect(stored['note-board:hotkeys']).toContain('"k"');
  await panel(page).getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(keyRow(page, 'Duplicate')).toHaveText('Ctrl+D');
  await page.keyboard.press('Escape');
  await page.reload();
  await openPanel(page);
  await expect(keyRow(page, 'Duplicate')).toHaveText('Ctrl+D');
});

test('a key that something else uses is refused with a short message naming it', async ({ page }) => {
  await openPanel(page);
  await keyRow(page, 'Delete selection').click();
  await page.keyboard.press('Control+d');
  await expect(panel(page).getByRole('status')).toHaveText('Ctrl+D is already used by Duplicate.');
  await expect(keyRow(page, 'Delete selection')).toHaveText('Delete');
  await keyRow(page, 'Delete selection').click();
  await page.keyboard.press('Control+a');
  await expect(panel(page).getByRole('status')).toHaveText('Ctrl+A is already used by Select all.');
  await keyRow(page, 'Delete selection').click();
  await page.keyboard.press('Control+z');
  await expect(panel(page).getByRole('status')).toHaveText('Ctrl+Z is already used by the app.');
  await keyRow(page, 'Delete selection').click();
  await page.keyboard.press('ArrowLeft');
  await expect(panel(page).getByRole('status')).toHaveText('That key is used for something else.');
  // Nothing changed.
  await expect(keyRow(page, 'Delete selection')).toHaveText('Delete');
});

test('Escape while recording cancels it and leaves the panel open', async ({ page }) => {
  await openPanel(page);
  await keyRow(page, 'Delete selection').click();
  await page.keyboard.press('Escape');
  await expect(keyRow(page, 'Delete selection')).toHaveText('Delete');
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
  await page.evaluate(() => localStorage.setItem('note-board:hotkeys', '{"duplicate":{"key":"k","mod":true,"shift":false},"delete":"x"'));
  await page.reload();
  await openPanel(page);
  await expect(keyRow(page, 'Duplicate')).toHaveText('Ctrl+D');
  await expect(keyRow(page, 'Delete selection')).toHaveText('Delete');
});

test('keys saved when there were tool keys are still read: the tool keys are ignored, the rest kept', async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem('note-board:hotkeys', JSON.stringify({ hand: { key: 'g', mod: false, shift: false }, select: { key: 'h', mod: false, shift: false }, duplicate: { key: 'k', mod: true, shift: false } })),
  );
  await page.reload();
  await openPanel(page);
  await expect(keyRow(page, 'Duplicate')).toHaveText('Ctrl+K');
  await expect(keyRow(page, 'Delete selection')).toHaveText('Delete');
});

test('keys still do nothing while typing in a text field, and undo still works there', async ({ page }) => {
  await openPanel(page);
  await keyRow(page, 'Delete selection').click();
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
