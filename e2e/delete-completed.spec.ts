import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, clickEmpty, freshBoardEachTest } from './helpers';

// Delete completed items (owner request, 2026-10-06): Ctrl+Shift+Backspace (⌘+Shift+Backspace on
// a Mac) asks first, then removes every item in the Completed sections on the open board.

freshBoardEachTest();

/** A checklist with the given items, the first `ticked` of them ticked (so they go to Completed). */
async function checklist(page: Page, title: string, items: string[], ticked: number) {
  await clickEmpty(page);
  await add(page, 'Checklist', { stayInTitle: true });
  const list = page.locator(`[data-card-id="${await page.locator('.card.selected').getAttribute('data-card-id')}"]`);
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
  for (const [i, t] of items.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  for (let i = 0; i < ticked; i++) await list.getByRole('checkbox', { name: 'Done', checked: false }).first().click();
  return list;
}

const texts = (list: Locator) => list.getByLabel('Item text').evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));
const dialog = (page: Page) => page.getByRole('alertdialog', { name: 'Delete completed items?' });

test('Ctrl+Shift+Backspace asks, Delete removes every completed item, Ctrl+Z brings them back', async ({ page }) => {
  const groceries = await checklist(page, 'Groceries', ['bread', 'milk', 'eggs'], 2);
  const chores = await checklist(page, 'Chores', ['sweep', 'dust'], 1);
  await clickEmpty(page);

  await page.keyboard.press('Control+Shift+Backspace');
  await expect(dialog(page)).toContainText('Delete 3 completed items?');
  await dialog(page).getByRole('button', { name: 'Delete' }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(await texts(groceries)).toEqual(['eggs']);
  expect(await texts(chores)).toEqual(['dust']);

  await page.keyboard.press('Control+z');
  expect(await texts(groceries)).toEqual(['eggs', 'bread', 'milk']);
  expect(await texts(chores)).toEqual(['dust', 'sweep']);
});

test('Keep (or Escape) cancels and deletes nothing; one item says "1 completed item"', async ({ page }) => {
  const groceries = await checklist(page, 'Groceries', ['bread', 'milk'], 1);
  await clickEmpty(page);

  await page.keyboard.press('Control+Shift+Backspace');
  await expect(dialog(page)).toContainText('Delete 1 completed item?');
  await dialog(page).getByRole('button', { name: 'Keep' }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(await texts(groceries)).toEqual(['milk', 'bread']);

  await page.keyboard.press('Control+Shift+Backspace');
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  expect(await texts(groceries)).toEqual(['milk', 'bread']);
});

test('⌘+Shift+Backspace (the browser’s Clear browsing data on a Mac) does not ask; other keys wait while it asks', async ({ page }) => {
  const groceries = await checklist(page, 'Groceries', ['bread', 'milk'], 1);
  await clickEmpty(page);
  await page.keyboard.press('Meta+Shift+Backspace');
  await expect(dialog(page)).toHaveCount(0);

  // The list is selected; Delete while the question is open doesn't delete the list behind it.
  await groceries.getByLabel('Item text').first().click();
  await page.keyboard.press('Escape');
  await expect(groceries).toHaveClass(/selected/);
  await page.keyboard.press('Control+Shift+Backspace');
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(groceries).toHaveCount(1);
  await expect(dialog(page)).toBeVisible();
});

test('does not fire while typing in a text field', async ({ page }) => {
  const groceries = await checklist(page, 'Groceries', ['bread', 'milk'], 1);
  await groceries.getByLabel('Item text').first().click();
  await page.keyboard.press('Control+Shift+Backspace');
  await expect(dialog(page)).toHaveCount(0);
  expect((await texts(groceries))[1]).toBe('bread');
});

test('with no completed items it says so and deletes nothing', async ({ page }) => {
  const groceries = await checklist(page, 'Groceries', ['bread'], 0);
  await clickEmpty(page);
  await page.keyboard.press('Control+Shift+Backspace');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'No completed items on this board' })).toBeVisible();
  expect(await texts(groceries)).toEqual(['bread']);
});

test('the shortcut is listed in the Keyboard shortcuts panel', async ({ page }) => {
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toContainText('Ctrl+Shift+Backspace');
});
