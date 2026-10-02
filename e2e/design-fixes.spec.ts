import { expect, test } from '@playwright/test';
import { add, cards, clickEmpty, columns, freshBoardEachTest } from './helpers';

// Design fixes from the 2026-10-02 Impeccable review.

freshBoardEachTest();

test('typing straight after adding a note, link or column goes into it', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'To-do list');
  await page.keyboard.type('first item');

  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.type('Water the plants');
  await expect(page.getByLabel('Note text')).toHaveValue('Water the plants');
  await expect(page.getByLabel('Item text').first()).toHaveValue('first item');

  await clickEmpty(page);
  await add(page, 'Link');
  await page.keyboard.type('Recipes');
  await expect(page.getByLabel('Link title')).toHaveValue('Recipes');

  await clickEmpty(page);
  await add(page, 'New column');
  await page.keyboard.type('Ideas');
  await expect(page.getByLabel('Column title')).toHaveValue('Ideas');
  await expect(cards(page)).toHaveCount(3);
  await expect(columns(page)).toHaveCount(1);
});
