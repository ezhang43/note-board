import { expect, test } from '@playwright/test';
import { add, clickEmpty, columns, freshBoardEachTest } from './helpers';

// BusyAnts: the agreed features from the 2026-10-03 owner interview.

freshBoardEachTest();

test('the app is called BusyAnts', async ({ page }) => {
  await expect(page).toHaveTitle('BusyAnts');
});

test('an empty board shows a hint, which goes once anything is on the board', async ({ page }) => {
  const hint = page.getByText('Add a note, a to-do list or a column from the toolbar, or drag one onto the board');
  await expect(hint).toBeVisible();
  await add(page, 'Note');
  await expect(hint).toHaveCount(0);
});

test('new lists and columns start untitled; a new list takes the cursor in its title, and Enter moves to its first item', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'To-do list', { stayInTitle: true });
  const list = page.locator('.card.selected');
  await expect(list.getByLabel('List title')).toHaveValue('');
  await expect(list.getByLabel('List title')).toHaveAttribute('placeholder', 'List title');
  await page.keyboard.type('Groceries');
  await page.keyboard.press('Enter');
  await page.keyboard.type('milk');
  await expect(list.getByLabel('List title')).toHaveValue('Groceries');
  await expect(list.getByLabel('Item text').first()).toHaveValue('milk');

  await clickEmpty(page);
  await add(page, 'New column');
  const title = columns(page).first().getByLabel('Column title');
  await expect(title).toHaveValue('');
  await expect(title).toHaveAttribute('placeholder', 'Column title');
});
