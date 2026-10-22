import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, clickEmpty, freshBoardEachTest } from './helpers';

// Board-logic review 181 (part B), job 183: what a person can see of the fixes.

freshBoardEachTest();

async function checklist(page: Page, items: string[]) {
  await clickEmpty(page);
  await add(page, 'Checklist');
  const list = page.locator('.card.selected');
  for (const [i, t] of items.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  return list;
}

const rowOf = (list: Locator, text: string) => list.locator('[data-item-id]').filter({ has: list.page().locator(`textarea:text-is("${text}")`) }).first();

test('Tab puts an open item under a ticked one: the ticked one is reopened, so Clean up keeps both', async ({ page }) => {
  const list = await checklist(page, ['Groceries', 'milk', 'eggs']);
  await rowOf(list, 'milk').getByLabel('Item text').click();
  await page.keyboard.press('Tab'); // milk under Groceries
  await rowOf(list, 'eggs').getByLabel('Item text').click();
  await page.keyboard.press('Tab'); // eggs under Groceries, after milk
  await rowOf(list, 'milk').getByLabel('Done').click(); // a ticked sub-item: only struck through
  await expect(rowOf(list, 'milk').getByLabel('Done')).toBeChecked();
  await rowOf(list, 'eggs').getByLabel('Item text').click();
  await page.keyboard.press('Tab'); // eggs under the ticked milk
  await expect(rowOf(list, 'milk').getByLabel('Done')).not.toBeChecked();
  await expect(rowOf(list, 'eggs').getByLabel('Done')).not.toBeChecked();
  // One undo step: the tick comes back.
  await page.keyboard.press('Control+z');
  await expect(rowOf(list, 'milk').getByLabel('Done')).toBeChecked();
});
