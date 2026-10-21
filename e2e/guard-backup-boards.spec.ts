import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { freshBoardEachTest } from './helpers';

// Guard (review pass, job 156): a backup of several boards is named "All boards", holds every board,
// and Restore from backup asks the right question and puts every board back. Passes today.

freshBoardEachTest();

const boardName = (page: Page) => page.getByLabel('Board name');
const boardsMenu = (page: Page) => page.getByRole('menu', { name: 'Boards' });

async function openBoardsMenu(page: Page) {
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(boardsMenu(page)).toBeVisible();
}

async function fileMenu(page: Page, item: string) {
  await page.locator('header.toolbar').getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test('a backup of two boards holds both, and restoring it asks "Replace all your boards" and brings both back', async ({ page }, info) => {
  await boardName(page).fill('Home');
  await openBoardsMenu(page);
  await boardsMenu(page).getByRole('menuitem', { name: 'New board' }).click();
  await boardName(page).fill('Recipes');

  const waiting = page.waitForEvent('download');
  await fileMenu(page, 'Download backup');
  const d = await waiting;
  const text = readFileSync((await d.path())!, 'utf8');
  expect(d.suggestedFilename()).toMatch(/^BusyAnts - All boards - \d{4}-\d\d-\d\d\.json$/);
  expect(Object.keys(JSON.parse(text).boards)).toHaveLength(2);

  await boardName(page).fill('Changed');
  const file = info.outputPath('all-boards.json');
  writeFileSync(file, text);
  const asked = new Promise<string>((resolve) => page.once('dialog', (dlg) => (resolve(dlg.message()), dlg.accept())));
  const chooser = page.waitForEvent('filechooser');
  await fileMenu(page, 'Restore from backup…');
  await (await chooser).setFiles(file);
  expect(await asked).toMatch(/^Replace all your boards with the ones in the backup\?/);

  await openBoardsMenu(page);
  await expect(boardsMenu(page).getByRole('menuitem', { name: 'Home' })).toBeVisible();
  await expect(boardsMenu(page).getByRole('menuitem', { name: 'Recipes' })).toBeVisible();
  await expect(boardsMenu(page).getByRole('menuitem', { name: 'Changed' })).toHaveCount(0);
});
