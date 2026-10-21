import { expect, test, type Page } from '@playwright/test';
import { add, cards, clickEmpty, freshBoardEachTest } from './helpers';

// Guards (review pass, job 156): a change made just before a reload is kept, and undo belongs to
// each board. Both pass today.

freshBoardEachTest();

const boardName = (page: Page) => page.getByLabel('Board name');
const boardsMenu = (page: Page) => page.getByRole('menu', { name: 'Boards' });
const undoButton = (page: Page) => page.getByRole('button', { name: 'Undo (Ctrl+Z)' });

async function openBoardsMenu(page: Page) {
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(boardsMenu(page)).toBeVisible();
}

// The board is saved 150 ms after the last change, and again as the page is hidden. No other test
// reloads at once: they all wait first, so nothing else proves the save on the way out.
test('a note typed just before a reload is kept (no waiting)', async ({ page }) => {
  await add(page, 'Note');
  await cards(page).first().getByLabel('Note text').fill('kept on reload');
  await page.reload();
  await expect(page.getByLabel('Note text').first()).toHaveValue('kept on reload');
});

test('a board renamed just before a reload keeps its new name (no waiting)', async ({ page }) => {
  await boardName(page).fill('Quick');
  await page.reload();
  await expect(boardName(page)).toHaveValue('Quick');
});

test('Ctrl+Z on one board never undoes something on another board', async ({ page }) => {
  await boardName(page).fill('Home');
  await add(page, 'Note');
  await cards(page).first().getByLabel('Note text').fill('home note');
  await clickEmpty(page);
  await openBoardsMenu(page);
  await boardsMenu(page).getByRole('menuitem', { name: 'New board' }).click();
  await boardName(page).fill('Recipes');
  await clickEmpty(page);

  // Recipes has only its rename to undo; a second Ctrl+Z has nothing left and leaves Home alone.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(boardName(page)).toHaveValue('');
  await expect(undoButton(page)).toHaveAttribute('aria-disabled', 'true');

  await openBoardsMenu(page);
  await boardsMenu(page).getByRole('menuitem', { name: 'Home' }).click();
  await expect(boardName(page)).toHaveValue('Home');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first().getByLabel('Note text')).toHaveValue('home note');
  await expect(undoButton(page)).not.toHaveAttribute('aria-disabled', 'true'); // Home's own history was kept
});
