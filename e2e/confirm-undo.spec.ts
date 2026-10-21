import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { add, cards, columns, freshBoardEachTest } from './helpers';

// In-app questions instead of the browser's pop-ups, and an Undo message after a delete
// (job 170, owner's choice 3A, 2026-10-22).

freshBoardEachTest();

const toast = (page: Page) => page.locator('.undo-toast');
const question = (page: Page) => page.getByRole('alertdialog');
const spoken = (page: Page) => page.getByTestId('announcer');

/** Fails the test if the browser's own confirm / alert / prompt shows up. */
function noNativePopups(page: Page) {
  const seen: string[] = [];
  page.on('dialog', (d) => void (seen.push(d.message()), d.dismiss()));
  return seen;
}

async function deleteWithKey(page: Page) {
  await page.keyboard.press('Escape'); // out of the text box; the card stays selected
  await page.keyboard.press('Delete');
}

test('deleting a card shows "Deleted 1 card" with Undo at the bottom; Undo brings it back and the message goes', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.type('Keep me');
  await deleteWithKey(page);
  await expect(cards(page)).toHaveCount(0);
  await expect(toast(page)).toContainText('Deleted 1 card');
  await expect(spoken(page)).toHaveText(/Deleted 1 card/);
  // A dark pill near the bottom, centered.
  const box = (await toast(page).boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(2);
  expect(box.y).toBeGreaterThan(700);
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first().getByLabel('Note text')).toHaveValue('Keep me');
  await expect(toast(page)).toHaveCount(0);
  await expect(spoken(page)).toHaveText(/Undid the last change/);
});

test('the Undo message goes by itself after about 6 seconds, and at once on another change or Ctrl+Z', async ({ page }) => {
  await add(page, 'Note');
  await deleteWithKey(page);
  await expect(toast(page)).toBeVisible();
  await page.waitForTimeout(4000);
  await expect(toast(page)).toBeVisible();
  await expect(toast(page)).toHaveCount(0, { timeout: 4000 });

  await add(page, 'Note');
  await deleteWithKey(page);
  await expect(toast(page)).toBeVisible();
  await add(page, 'Note'); // another change: Undo would no longer undo the delete
  await expect(toast(page)).toHaveCount(0);

  await deleteWithKey(page);
  await expect(toast(page)).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(toast(page)).toHaveCount(0);
  await expect(cards(page)).toHaveCount(1);
});

test('an empty container is deleted without asking, with Undo; a container with cards still asks', async ({ page }) => {
  const seen = noNativePopups(page);
  await add(page, 'New container');
  await page.keyboard.press('Escape');
  await columns(page).first().getByRole('button', { name: 'Delete container and its cards' }).click();
  await expect(page.getByRole('button', { name: 'Keep container' })).toHaveCount(0);
  await expect(columns(page)).toHaveCount(0);
  await expect(toast(page)).toContainText('Deleted 1 container');
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(columns(page)).toHaveCount(1);

  // With a card in it, the question is as before; after Delete container the Undo message shows.
  await columns(page).first().click({ position: { x: 20, y: 8 } });
  await add(page, 'Note');
  await expect(columns(page).first().locator('[data-card-id]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await columns(page).first().getByRole('button', { name: 'Delete container and its cards' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete container', exact: true }).click();
  await expect(columns(page)).toHaveCount(0);
  await expect(toast(page)).toContainText('Deleted 1 container and 1 card');
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(columns(page).first().locator('[data-card-id]')).toHaveCount(1);
  expect(seen).toEqual([]);
});

test('deleting a habit shows the Undo message instead of a question; Undo brings it back', async ({ page }) => {
  const seen = noNativePopups(page);
  await page.locator('.corner-controls').getByRole('button', { name: 'Habits', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Habits' });
  await panel.getByRole('textbox', { name: 'New habit' }).fill('Walk');
  await panel.getByRole('textbox', { name: 'New habit' }).press('Enter');
  await panel.getByRole('button', { name: 'More for Walk' }).click();
  await panel.getByRole('button', { name: 'Delete habit', exact: true }).click();
  await expect(question(page)).toHaveCount(0);
  await expect(panel.locator('.habit')).toHaveCount(0);
  await expect(toast(page)).toContainText('Deleted the habit “Walk”');
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(panel.locator('.habit')).toHaveCount(1);
  expect(seen).toEqual([]);
});

test('deleting a board asks in the app: Escape keeps it and puts focus back, Delete board deletes it', async ({ page }) => {
  const seen = noNativePopups(page);
  const menu = page.getByRole('menu', { name: 'Boards' });
  const boardsButton = page.getByRole('button', { name: 'Boards', exact: true });
  await boardsButton.click();
  await menu.getByRole('menuitem', { name: 'Add a sub-board here' }).click();
  await cards(page).first().getByRole('button', { name: 'Open board' }).click();
  await page.getByLabel('Board name').fill('Old plans');
  await page.getByRole('button', { name: /^Back to/ }).click();

  await boardsButton.click();
  await menu.getByRole('button', { name: 'Delete board Old plans' }).click();
  const ask = page.getByRole('alertdialog', { name: 'Delete “Old plans”?' });
  await expect(ask).toBeVisible();
  await expect(ask).toHaveAccessibleDescription(/Version history/);
  // The safe button has the focus; Tab moves to the action and back, staying in the question.
  await expect(ask.getByRole('button', { name: 'Keep board' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(ask.getByRole('button', { name: 'Delete board' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(ask.getByRole('button', { name: 'Keep board' })).toBeFocused();
  // Board keys don't act behind it.
  await page.keyboard.press('Delete');
  await page.keyboard.press('Escape');
  await expect(ask).toHaveCount(0);
  await expect(boardsButton).toBeFocused();
  await expect(cards(page)).toHaveCount(1);

  await boardsButton.click();
  await menu.getByRole('button', { name: 'Delete board Old plans' }).click();
  await expect(ask.getByRole('button', { name: 'Delete board' })).toHaveCSS('background-color', 'rgb(163, 38, 63)');
  await ask.getByRole('button', { name: 'Delete board' }).click();
  await expect(cards(page)).toHaveCount(0);
  await boardsButton.click();
  await expect(menu.getByRole('menuitem', { name: 'Old plans' })).toHaveCount(0);
  expect(seen).toEqual([]);
});

test('Restore from backup asks in the app; Cancel changes nothing; a file that isn’t a backup says so in the banner', async ({ page }, info) => {
  const seen = noNativePopups(page);
  await add(page, 'Note');
  const file = info.outputPath('backup.json');
  const fileMenu = async (item: string) => {
    await page.locator('header.toolbar').getByRole('button', { name: 'File', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: item }).click();
    await (await chooser).setFiles(file);
  };
  // The board as saved (one note) is the backup; add another note, then restore and cancel.
  await page.waitForTimeout(300); // saving waits a moment after a change
  writeFileSync(file, (await page.evaluate(() => localStorage.getItem('note-board:v1')))!);
  await add(page, 'Note');
  await fileMenu('Restore from backup…');
  const ask = page.getByRole('alertdialog', { name: 'Replace this board with the backup?' });
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(cards(page)).toHaveCount(2);
  await fileMenu('Restore from backup…');
  await ask.getByRole('button', { name: 'Replace board' }).click();
  await expect(cards(page)).toHaveCount(1);

  writeFileSync(file, '{"hello": 1}');
  await fileMenu('Restore from backup…');
  await expect(page.locator('.notice-banner')).toContainText('isn’t a BusyAnts backup');
  expect(seen).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('a question is a bottom sheet with full-width buttons, the action first', async ({ page }) => {
    await page.getByRole('button', { name: 'Boards', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'New board' }).tap();
    await page.getByLabel('Board name').fill('Trip');
    await page.getByRole('button', { name: 'Boards', exact: true }).tap();
    await page.getByRole('button', { name: 'Delete board Trip' }).tap();
    const ask = page.getByRole('alertdialog', { name: 'Delete “Trip”?' });
    await expect(ask).toBeVisible();
    const sheet = (await ask.boundingBox())!;
    expect(sheet.y + sheet.height).toBeGreaterThan(780);
    const del = (await ask.getByRole('button', { name: 'Delete board' }).boundingBox())!;
    const keep = (await ask.getByRole('button', { name: 'Keep board' }).boundingBox())!;
    expect(del.width).toBeGreaterThan(300);
    expect(del.height).toBeGreaterThanOrEqual(48);
    expect(del.y).toBeLessThan(keep.y);
    await ask.getByRole('button', { name: 'Keep board' }).tap();
    await expect(ask).toHaveCount(0);
  });
});
