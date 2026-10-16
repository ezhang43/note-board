import { expect, test, type Page } from '@playwright/test';
import { cards, freshBoardEachTest } from './helpers';

// Ctrl+arrow keys switch boards (owner request, 2026-10-16).

freshBoardEachTest();

const boardName = (page: Page) => page.getByLabel('Board name');

test('Ctrl+arrows move through the boards in menu order, up to the parent and down into the first sub-board; a toast names the board', async ({ page }) => {
  await boardName(page).fill('Home');
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add a sub-board here' }).click();
  await cards(page).first().getByRole('button', { name: 'Open board' }).click();
  await boardName(page).fill('Trips');
  await page.getByRole('button', { name: 'Back to Home' }).click();
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New board' }).click();
  await boardName(page).fill('Recipes');
  await boardName(page).blur();

  // Menu order: Home, Trips (inside Home), Recipes. At the ends nothing happens.
  await page.keyboard.press('Control+ArrowLeft');
  await expect(boardName(page)).toHaveValue('Trips');
  await expect(page.getByRole('status')).toContainText('Trips');
  await page.keyboard.press('Control+ArrowRight');
  await expect(boardName(page)).toHaveValue('Recipes');
  await page.keyboard.press('Control+ArrowRight');
  await expect(boardName(page)).toHaveValue('Recipes');
  await page.keyboard.press('Control+ArrowLeft');
  await page.keyboard.press('Control+ArrowUp');
  await expect(boardName(page)).toHaveValue('Home');
  await page.keyboard.press('Control+ArrowUp');
  await page.keyboard.press('Control+ArrowLeft');
  await expect(boardName(page)).toHaveValue('Home');
  await page.keyboard.press('Control+ArrowDown');
  await expect(boardName(page)).toHaveValue('Trips');
  await page.keyboard.press('Control+ArrowDown');
  await expect(boardName(page)).toHaveValue('Trips');

  // Not while typing in a text field.
  await boardName(page).focus();
  await page.keyboard.press('Control+ArrowRight');
  await expect(boardName(page)).toHaveValue('Trips');
});

test('the shortcuts panel lists the Ctrl+arrow board keys', async ({ page }) => {
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toContainText('Ctrl+arrows');
});
