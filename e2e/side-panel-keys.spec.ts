import { expect, test, type Page } from '@playwright/test';
import { add, arrange, cards, clickEmpty, freshBoardEachTest } from './helpers';

// Keys pressed while the keyboard is in a side panel never act on the board behind it (job 165a,
// from the interface review U1). Only the Journal and Habits panels were protected: with a note
// selected, Delete on the Focus timer's Reset button, or Backspace on a Completed tick box,
// deleted the note without anything on screen showing it.

freshBoardEachTest();

const dock = (page: Page, name: string) => page.locator('.corner-controls').getByRole('button', { name, exact: true });

/** A note with text, selected (Escape leaves its text box with the note still selected). */
async function selectedNote(page: Page) {
  await add(page, 'Note');
  await page.keyboard.type('keep me');
  await page.keyboard.press('Escape');
  await expect(page.locator('.card.selected')).toHaveCount(1);
}

test('Delete, Backspace, Ctrl+D and the tool keys on a Focus timer button leave the selected note alone', async ({ page }) => {
  await selectedNote(page);
  await dock(page, 'Focus timer').click();
  const panel = page.getByRole('complementary', { name: 'Focus timer' });
  await panel.getByRole('button', { name: 'Reset' }).focus();
  for (const key of ['Delete', 'Backspace', 'Control+d', 'v', 'Control+a']) await page.keyboard.press(key);
  await expect(cards(page)).toHaveCount(1);
  await expect(page.locator('.card.selected')).toHaveCount(1);
  await expect(page.getByTestId('canvas')).toHaveClass(/tool-hand/);
  await expect(page.getByLabel('Note text')).toHaveValue('keep me');
});

test('Backspace on a Completed panel tick box leaves the selected note alone', async ({ page }) => {
  await add(page, 'Checklist');
  await page.keyboard.type('milk');
  await page.locator('[data-card-id] input[type="checkbox"]').first().check();
  await (await arrange(page)).getByRole('button', { name: 'Clean up', exact: true }).click();
  await clickEmpty(page);
  await selectedNote(page);
  await dock(page, 'Completed').click();
  const back = page.getByRole('complementary', { name: 'Completed' }).getByRole('checkbox', { name: /^Send "milk" back/ });
  await back.focus();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  await expect(cards(page)).toHaveCount(2);
});

test('Delete on a Version history button leaves the selected note alone', async ({ page }) => {
  await selectedNote(page);
  await dock(page, 'Version history').click();
  const panel = page.getByRole('complementary', { name: 'Version history' });
  await panel.getByRole('button').first().focus();
  await page.keyboard.press('Delete');
  await expect(cards(page)).toHaveCount(1);
});

test('undo and redo still work from a side panel button, and Delete works again once the panel is closed', async ({ page }) => {
  await selectedNote(page);
  await dock(page, 'Focus timer').click();
  const panel = page.getByRole('complementary', { name: 'Focus timer' });
  await panel.getByRole('button', { name: 'Reset' }).focus();
  await page.keyboard.press('Control+z'); // takes back the note's text, then the note itself
  await page.keyboard.press('Control+z');
  await expect(cards(page)).toHaveCount(0);
  await page.keyboard.press('Control+y');
  await expect(cards(page)).toHaveCount(1);

  // With the panel closed the board's own keys work as before.
  await panel.getByRole('button', { name: 'Close focus timer' }).click();
  await page.locator('[data-card-id]').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Delete');
  await expect(cards(page)).toHaveCount(0);
});
