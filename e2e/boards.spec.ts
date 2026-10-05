import { expect, test, type Page } from '@playwright/test';
import { add, cards, freshBoardEachTest } from './helpers';

// Several boards, and boards inside boards (owner request, 2026-10-05).

freshBoardEachTest();

const boardName = (page: Page) => page.getByLabel('Board name');
const boardsMenu = (page: Page) => page.getByRole('menu', { name: 'Boards' });

async function openBoardsMenu(page: Page) {
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(boardsMenu(page)).toBeVisible();
}

test('New board opens an empty board; the Boards menu switches between boards, and they are kept after a reload', async ({ page }) => {
  await boardName(page).fill('Home');
  await add(page, 'Note');
  await openBoardsMenu(page);
  await boardsMenu(page).getByRole('menuitem', { name: 'New board' }).click();
  await expect(cards(page)).toHaveCount(0);
  await expect(boardName(page)).toHaveValue('');
  await boardName(page).fill('Recipes');

  await openBoardsMenu(page);
  await expect(boardsMenu(page).getByRole('menuitem', { name: 'Recipes' })).toHaveAttribute('aria-current', 'true');
  await boardsMenu(page).getByRole('menuitem', { name: 'Home' }).click();
  await expect(boardName(page)).toHaveValue('Home');
  await expect(cards(page)).toHaveCount(1);

  await page.waitForTimeout(400); // saved a moment after the last change
  await page.reload();
  await expect(boardName(page)).toHaveValue('Home');
  await openBoardsMenu(page);
  await expect(boardsMenu(page).getByRole('menuitem', { name: 'Recipes' })).toBeVisible();
});

test('Add a sub-board here puts a board card on the board; Open board goes in, and the path above goes back out', async ({ page }) => {
  await boardName(page).fill('Home');
  await openBoardsMenu(page);
  await boardsMenu(page).getByRole('menuitem', { name: 'Add a sub-board here' }).click();
  const card = cards(page).first();
  await expect(card).toHaveAttribute('data-kind', 'board');
  await expect(card).toContainText('Untitled board');

  await card.getByRole('button', { name: 'Open board' }).click();
  await expect(cards(page)).toHaveCount(0);
  await boardName(page).fill('Trips');
  await add(page, 'Note');
  await page.getByRole('button', { name: 'Back to Home' }).click();
  await expect(boardName(page)).toHaveValue('Home');
  await expect(cards(page).first()).toContainText('Trips');
  await expect(cards(page).first()).toContainText('1 card');

  // In the Boards menu, Trips is listed under Home.
  await openBoardsMenu(page);
  await expect(boardsMenu(page).getByRole('menuitem')).toContainText(['Home', 'Trips']);
});

test('deleting a board (after a confirmation) removes it and its card', async ({ page }) => {
  await boardName(page).fill('Home');
  await openBoardsMenu(page);
  await boardsMenu(page).getByRole('menuitem', { name: 'Add a sub-board here' }).click();
  await cards(page).first().getByRole('button', { name: 'Open board' }).click();
  await boardName(page).fill('Old plans');
  await page.getByRole('button', { name: 'Back to Home' }).click();

  await openBoardsMenu(page);
  page.once('dialog', (d) => d.accept());
  await boardsMenu(page).getByRole('button', { name: 'Delete board Old plans' }).click();
  await expect(cards(page)).toHaveCount(0);
  await openBoardsMenu(page);
  await expect(boardsMenu(page).getByRole('menuitem', { name: 'Old plans' })).toHaveCount(0);
  // The home board has no delete button.
  await expect(boardsMenu(page).getByRole('button', { name: /^Delete board/ })).toHaveCount(0);
});
