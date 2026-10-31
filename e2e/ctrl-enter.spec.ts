import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, clickEmpty, freshBoardEachTest } from './helpers';

// Ctrl+Enter in a checklist item (owner request, 2026-10-15): ticks it as if its Done box were
// clicked; the cursor moves on to the next open item. On a ticked item it unticks it.

freshBoardEachTest();

async function checklist(page: Page, items: string[]) {
  await clickEmpty(page);
  await add(page, 'Checklist', { stayInTitle: true });
  const list = page.locator(`[data-card-id="${await page.locator('.card.selected').getAttribute('data-card-id')}"]`);
  await page.keyboard.type('Today');
  await page.keyboard.press('Enter');
  for (const [i, t] of items.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  return list;
}

const texts = (list: Locator) => list.getByLabel('Item text').evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));
const focused = (page: Page) => page.evaluate(() => (document.activeElement as HTMLTextAreaElement | null)?.value ?? null);

test('Ctrl+Enter ticks the item, the cursor moves to the next one, and Ctrl+Z brings it back', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk', 'eggs']);
  await list.getByLabel('Item text').nth(1).click();
  await page.keyboard.press('Control+Enter');
  await expect(list.getByRole('checkbox', { name: 'Done', checked: true })).toHaveCount(1);
  await expect(list.getByRole('checkbox', { name: 'Done: milk' })).toBeChecked(); // ticked in its place (job 200)
  expect(await texts(list)).toEqual(['bread', 'milk', 'eggs']);
  expect(await focused(page)).toBe('eggs');
  // A screen reader hears which item was ticked, since the cursor left its box.
  await expect(page.getByTestId('announcer')).toHaveText('Ticked: milk');
  // Typing goes on in the next item; nothing was split or added.
  await page.keyboard.type('!');
  await expect.poll(() => texts(list)).toEqual(['bread', 'milk', 'eggs!']);

  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect.poll(() => texts(list)).toEqual(['bread', 'milk', 'eggs']);
  await expect(list.getByRole('checkbox', { name: 'Done', checked: true })).toHaveCount(0);
});

test('Ctrl+Enter on a ticked item unticks it and keeps the cursor in it', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk']);
  await list.getByRole('checkbox', { name: 'Done' }).first().click();
  await expect(list.getByRole('checkbox', { name: 'Done: bread' })).toBeChecked();
  expect(await texts(list)).toEqual(['bread', 'milk']); // in place (job 200)
  await list.getByLabel('Item text').nth(0).click();
  await page.keyboard.press('Control+Enter');
  await expect.poll(() => texts(list)).toEqual(['bread', 'milk']);
  await expect(list.getByRole('checkbox', { name: 'Done', checked: true })).toHaveCount(0);
  await expect.poll(() => focused(page)).toBe('bread');
});

test('ticking the last open item keeps the cursor in it; Delete then removes only that item; it is in the shortcuts list', async ({ page }) => {
  const list = await checklist(page, ['bread']);
  await page.keyboard.press('Control+Enter');
  await expect(list.getByRole('checkbox', { name: 'Done', checked: true })).toHaveCount(1);
  await expect.poll(() => focused(page)).toBe('bread');
  await page.keyboard.press('Delete');
  await expect.poll(() => texts(list)).toEqual(['']); // the list keeps one blank item
  await expect(list).toBeVisible();
  await expect(page.locator('[data-card-id]')).toHaveCount(1);

  await clickEmpty(page); // out of the text, so "?" is a shortcut
  await page.keyboard.press('?');
  await expect(page.getByText('Tick the item (or untick it); the cursor moves to the next one')).toBeVisible();
});
