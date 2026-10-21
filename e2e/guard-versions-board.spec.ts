import { expect, test, type Page } from '@playwright/test';
import { add, cards } from './helpers';

// Guard (review pass, job 156): a deleted board comes back from Version history. SPEC "Several
// boards": "Every board is saved in Version history first, so a deleted board can be brought back
// from there". The unit tests cover it; this is the same flow as a person would do it.

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.evaluate(() => (localStorage.clear(), localStorage.setItem('note-board:tour-done', '1')));
  await page.reload();
});

const boardName = (page: Page) => page.getByLabel('Board name');
const boardsMenu = (page: Page) => page.getByRole('menu', { name: 'Boards' });

async function openBoardsMenu(page: Page) {
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(boardsMenu(page)).toBeVisible();
}

test('a deleted sub-board, with its note, is brought back by restoring the version saved before it was deleted', async ({ page }) => {
  await boardName(page).fill('Home');
  await openBoardsMenu(page);
  await boardsMenu(page).getByRole('menuitem', { name: 'Add a sub-board here' }).click();
  await cards(page).first().getByRole('button', { name: 'Open board' }).click();
  await boardName(page).fill('Trips');
  await add(page, 'Note');
  await page.keyboard.type('passport');
  await page.getByRole('button', { name: 'Back to Home' }).click();
  await expect(cards(page)).toHaveCount(1);

  // Delete it (a confirmation may ask first).
  await openBoardsMenu(page);
  page.once('dialog', (d) => d.accept());
  await boardsMenu(page).getByRole('button', { name: 'Delete board Trips' }).click();
  await expect(cards(page)).toHaveCount(0);
  await openBoardsMenu(page);
  await expect(boardsMenu(page).getByRole('menuitem', { name: 'Trips' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // The version saved just before the delete still has it.
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Version history' });
  await panel.getByRole('region').getByRole('button').first().click();
  const banner = page.getByRole('region', { name: 'Looking at an earlier version' });
  await banner.getByRole('button', { name: 'Restore this version' }).click();
  await expect(banner).toBeHidden();

  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('Trips');
  await openBoardsMenu(page);
  await boardsMenu(page).getByRole('menuitem', { name: 'Trips' }).click();
  await expect(page.getByLabel('Note text').first()).toHaveValue('passport');
});
