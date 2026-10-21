import { expect, test, type Page } from '@playwright/test';
import { add, arrange, clickEmpty, freshBoardEachTest } from './helpers';

// Screen readers (job 165a, from the UX audit): every tick box is named for its item, and one
// polite live region speaks what is otherwise only seen: deletes, undo and redo, items moving to Completed.

freshBoardEachTest();

const announcer = (page: Page) => page.getByTestId('announcer');

async function groceries(page: Page, items: string[]) {
  await clickEmpty(page);
  await add(page, 'Checklist', { stayInTitle: true });
  await page.keyboard.type('Groceries');
  await page.keyboard.press('Enter');
  for (const [i, t] of items.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  return page.locator(`[data-card-id="${await page.locator('.card.selected').getAttribute('data-card-id')}"]`);
}

test('each tick box is named for its item, in the list and in the Completed panel', async ({ page }) => {
  const list = await groceries(page, ['Buy milk', 'eggs']);
  await expect(list.getByRole('checkbox', { name: 'Done: Buy milk', exact: true })).toHaveCount(1);
  await expect(list.getByRole('checkbox', { name: 'Done: eggs', exact: true })).toHaveCount(1);

  // The name follows the text as it is edited.
  await list.getByLabel('Item text').first().fill('Buy oat milk');
  await expect(list.getByRole('checkbox', { name: 'Done: Buy oat milk', exact: true })).toHaveCount(1);

  // An item with no text yet is still just "Done".
  await list.getByLabel('Item text').last().click();
  await page.keyboard.press('Enter');
  await expect(list.getByRole('checkbox', { name: 'Done', exact: true })).toHaveCount(1);

  await list.getByRole('checkbox', { name: 'Done: eggs', exact: true }).check();
  await (await arrange(page)).getByRole('button', { name: 'Clean up', exact: true }).click();
  await page.locator('.corner-controls').getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Completed' }).getByRole('checkbox', { name: 'Done: eggs', exact: true })).toHaveCount(0); // its own box says "Send … back"
  await expect(page.getByRole('complementary', { name: 'Completed' }).getByRole('checkbox', { name: /Send "eggs" back/ })).toHaveCount(1);
});

test('one polite live region is always on the page and starts empty', async ({ page }) => {
  await expect(page.locator('[data-testid="announcer"]')).toHaveCount(1);
  await expect(announcer(page)).toHaveAttribute('aria-live', 'polite');
  await expect(announcer(page)).toHaveText('');
});

test('deleting, undo and redo are announced', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.type('hello');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Delete');
  await expect(announcer(page)).toHaveText('Deleted 1 card');
  await page.keyboard.press('Control+z');
  await expect(announcer(page)).toHaveText('Undid the last change');
  await page.keyboard.press('Control+y');
  await expect(announcer(page)).toHaveText('Redid the last change');
});

test('the same message twice in a row is spoken twice (the text changes underneath)', async ({ page }) => {
  await add(page, 'Note');
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await expect(announcer(page)).toHaveText('Undid the last change');
  const first = await announcer(page).textContent();
  await page.keyboard.press('Control+z');
  await expect.poll(() => announcer(page).textContent()).not.toBe(first);
  await expect(announcer(page)).toHaveText('Undid the last change');
});

test('deleting a checklist item and ticking one into Completed are announced', async ({ page }) => {
  const list = await groceries(page, ['bread', 'milk', 'eggs']);
  await list.getByRole('checkbox', { name: 'Done: milk', exact: true }).check();
  await expect(announcer(page)).toHaveText('Moved to Completed: milk');

  await list.getByLabel('Item text').first().click();
  await list.getByRole('button', { name: 'Delete item' }).first().click();
  await expect(announcer(page)).toHaveText('Deleted 1 item');

  await list.getByRole('checkbox', { name: 'Done: eggs', exact: true }).check();
  await (await arrange(page)).getByRole('button', { name: 'Clean up', exact: true }).click();
  await expect(announcer(page)).toHaveText('2 items moved to the Completed panel');
});
