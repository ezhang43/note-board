import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, cards, clickEmpty, freshBoardEachTest } from './helpers';

freshBoardEachTest();

const cleanUpButton = (page: Page) => page.locator('header.toolbar').getByRole('button', { name: 'Clean up', exact: true });
const texts = (list: Locator) => list.getByLabel('Item text').evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));

async function makeList(page: Page, title: string, items: string[]) {
  await clickEmpty(page);
  await add(page, 'Checklist');
  const id = await page.locator('.card.selected').getAttribute('data-card-id');
  const list = page.locator(`[data-card-id="${id}"]`);
  await list.getByLabel('List title').fill(title);
  await list.getByLabel('Item text').first().click();
  for (const [i, t] of items.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  return list;
}

const completedPanel = (page: Page) => page.getByRole('complementary', { name: 'Completed' });
const openCompleted = (page: Page) => page.locator('.corner-controls').getByRole('button', { name: 'Completed', exact: true }).click();

test('Clean up moves ticked items into the Completed panel under today, and unticking sends one back', async ({ page }) => {
  await expect(cleanUpButton(page)).toHaveAttribute('aria-disabled', 'true');
  const groceries = await makeList(page, 'Groceries', ['bread', 'milk', 'eggs']);
  await groceries.locator('[data-item-id]').filter({ has: page.locator('textarea:text-is("milk")') }).getByLabel('Done').click();
  await expect(cleanUpButton(page)).not.toHaveAttribute('aria-disabled');

  await cleanUpButton(page).click();
  expect(await texts(groceries)).toEqual(['bread', 'eggs']);
  await expect(cards(page)).toHaveCount(1); // nothing new on the board
  await openCompleted(page);
  const done = completedPanel(page);
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  await expect(done.locator('.completed-date')).toHaveText([today]);
  await expect(done.locator('.completed-entry')).toHaveCount(1);
  await expect(done.locator('.completed-text')).toHaveText(['milk']);
  await expect(done.locator('.completed-from')).toHaveText(['Groceries']);
  await expect(cleanUpButton(page)).toHaveAttribute('aria-disabled', 'true');

  // Untick: back to Groceries, unticked.
  await done.getByLabel('Send "milk" back to Groceries').click();
  expect(await texts(groceries)).toEqual(['bread', 'eggs', 'milk']);
  await expect(done.locator('.completed-entry')).toHaveCount(0);
  await expect(done.getByText('Nothing cleaned up yet')).toBeVisible();
});

test('Clean up is one undo step', async ({ page }) => {
  const list = await makeList(page, 'L', ['a', 'b']);
  await list.getByLabel('Done').first().click();
  await cleanUpButton(page).click();
  await openCompleted(page);
  await expect(completedPanel(page).locator('.completed-text')).toHaveText(['a']);
  await clickEmpty(page);
  await page.keyboard.press('Control+z');
  await expect(completedPanel(page).locator('.completed-entry')).toHaveCount(0);
  await expect(list.locator('.completed')).toHaveCount(1); // "a" is back in the list's Completed section
});
