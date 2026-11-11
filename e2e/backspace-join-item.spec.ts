import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, clickEmpty, freshBoardEachTest } from './helpers';

// Owner bug report 2026-11-11: "backspacing on a checklist item doesn't push it back into the previous item".
// Backspace at the very start of an item joins it onto the item shown above (the mirror of Delete at the end).

freshBoardEachTest();

async function makeList(page: Page, texts: string[]) {
  await clickEmpty(page);
  await add(page, 'Checklist');
  const id = await page.locator('.card.selected').getAttribute('data-card-id');
  for (const [i, t] of texts.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  return page.locator(`[data-card-id="${id}"]`);
}

const rows = (list: Locator) => list.locator('[data-item-id]');
const texts = (list: Locator) => list.getByLabel('Item text').evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));
const depthOf = (row: Locator) => row.evaluate((el) => parseFloat(getComputedStyle(el as HTMLElement).paddingLeft) / 32);
const field = (list: Locator, text: string) =>
  list.locator('[data-item-id]').filter({ has: list.page().locator(`textarea:text-is("${text}")`) }).getByLabel('Item text');

async function toStart(page: Page, el: Locator) {
  await el.click();
  await page.keyboard.press('Home');
}

test('Backspace at the start of an item joins it onto the item above, cursor at the join; one Ctrl+Z undoes it', async ({ page }) => {
  const list = await makeList(page, ['Buy ', 'milk', 'eggs']);
  await toStart(page, field(list, 'milk'));
  await page.keyboard.press('Backspace');
  expect(await texts(list)).toEqual(['Buy milk', 'eggs']);
  await expect(rows(list).nth(0).getByLabel('Item text')).toBeFocused();
  await page.keyboard.type('!');
  expect(await texts(list)).toEqual(['Buy !milk', 'eggs']); // cursor landed at the join
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect(await texts(list)).toEqual(['Buy ', 'milk', 'eggs']);
});

test('a first sub-item joins onto its parent; its own sub-items move up a level', async ({ page }) => {
  const list = await makeList(page, ['Pack', 'shoes', 'laces', 'Other']);
  await field(list, 'shoes').press('Tab');
  await field(list, 'laces').press('Tab');
  await field(list, 'laces').press('Tab');
  await toStart(page, field(list, 'shoes'));
  await page.keyboard.press('Backspace');
  expect(await texts(list)).toEqual(['Packshoes', 'laces', 'Other']);
  expect(await depthOf(rows(list).nth(1))).toBe(1);
  await expect(rows(list).nth(0).getByLabel('Item text')).toBeFocused();
});

test('a ticked item joins too (ticked only if both were); the first item and a word highlight are left alone; an empty item is still deleted', async ({ page }) => {
  const list = await makeList(page, ['one', 'two', 'three', '']);
  // An empty item: Backspace deletes it, as before.
  await page.keyboard.press('Backspace');
  expect(await texts(list)).toEqual(['one', 'two', 'three']);
  // A ticked item joins onto the open one above; the result is open.
  await rows(list).nth(1).getByLabel('Done').click();
  await toStart(page, field(list, 'two'));
  await page.keyboard.press('Backspace');
  expect(await texts(list)).toEqual(['onetwo', 'three']);
  await expect(rows(list).nth(0).getByLabel('Done')).not.toBeChecked();
  // The first item: nothing happens.
  await toStart(page, field(list, 'onetwo'));
  await page.keyboard.press('Backspace');
  expect(await texts(list)).toEqual(['onetwo', 'three']);
  // Letters highlighted from the start: only they go.
  await toStart(page, field(list, 'three'));
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Backspace');
  expect(await texts(list)).toEqual(['onetwo', 'hree']);
});
