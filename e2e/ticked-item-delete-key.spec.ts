import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, cards, clickEmpty, freshBoardEachTest } from './helpers';

// Owner report 2026-10-29 (job 218): with the cursor blinking in a ticked checklist item, Delete
// deleted the whole card. It must remove just that item (and its sub-items), like its trash can.

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

test('Delete in a ticked item (ticked with its box, then clicked into) removes only that item; Ctrl+Z brings it back', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk', 'eggs']);
  await list.getByRole('checkbox', { name: 'Done: milk' }).click();
  await list.getByLabel('Item text').nth(1).click();
  await page.keyboard.press('Delete');
  await expect(cards(page)).toHaveCount(1);
  await expect.poll(() => texts(list)).toEqual(['bread', 'eggs']);
  await expect.poll(() => focused(page)).toBe('bread'); // where the phone's trash leaves it: the item above

  await page.keyboard.press('Control+z');
  await expect.poll(() => texts(list)).toEqual(['bread', 'milk', 'eggs']);
  await expect(list.getByRole('checkbox', { name: 'Done: milk' })).toBeChecked();
  await expect(cards(page)).toHaveCount(1);
});

test('Delete at the end of a ticked item takes its sub-items too, instead of joining the next item', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk', 'oat', 'soy']);
  await list.getByLabel('Item text').nth(2).click();
  await page.keyboard.press('Tab');
  await list.getByLabel('Item text').nth(3).click();
  await page.keyboard.press('Tab');
  await list.getByRole('checkbox', { name: 'Done: milk' }).click(); // ticks milk
  await list.getByLabel('Item text').nth(1).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Delete');
  await expect.poll(() => texts(list)).toEqual(['bread']);
  await expect(cards(page)).toHaveCount(1);
  await expect.poll(() => focused(page)).toBe('bread');
  await page.keyboard.press('Control+z');
  await expect.poll(() => texts(list)).toEqual(['bread', 'milk', 'oat', 'soy']);
});

test('the last ticked item of a list: Delete leaves one blank item, never deletes the card', async ({ page }) => {
  const list = await checklist(page, ['bread']);
  await list.getByRole('checkbox', { name: 'Done: bread' }).click();
  await list.getByLabel('Item text').first().click();
  await page.keyboard.press('Delete');
  await expect(cards(page)).toHaveCount(1);
  await expect.poll(() => texts(list)).toEqual(['']);
});

test('Backspace in a ticked item still edits its text', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk']);
  await list.getByRole('checkbox', { name: 'Done: milk' }).click();
  await list.getByLabel('Item text').nth(1).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await expect.poll(() => texts(list)).toEqual(['bread', 'mil']);
  await expect(list.getByRole('checkbox', { name: 'Done: mil' })).toBeChecked();
  await expect(cards(page)).toHaveCount(1);
});

test('an open item keeps its Delete: in the middle it deletes a letter, at the end it joins the next', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk']);
  await list.getByLabel('Item text').nth(0).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Delete');
  await expect.poll(() => texts(list)).toEqual(['read', 'milk']);
  await page.keyboard.press('End');
  await page.keyboard.press('Delete');
  await expect.poll(() => texts(list)).toEqual(['readmilk']);
  await expect(cards(page)).toHaveCount(1);
});

test('the owner\'s case: type in an item, tick its box, press Delete: the item goes, never the card', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk', 'eggs']);
  await list.getByLabel('Item text').nth(1).click();
  await list.getByRole('checkbox', { name: 'Done: milk' }).click(); // the box now has the focus, not the text
  await page.keyboard.press('Delete');
  await expect.poll(() => texts(list)).toEqual(['bread', 'eggs']);
  await expect(cards(page)).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect.poll(() => texts(list)).toEqual(['bread', 'milk', 'eggs']);
  // Backspace on a focused box does the same; an open item's box too.
  await list.getByRole('checkbox', { name: 'Done: bread' }).focus();
  await page.keyboard.press('Backspace');
  await expect.poll(() => texts(list)).toEqual(['milk', 'eggs']);
  await expect(cards(page)).toHaveCount(1);
});

test('Delete with letters of a ticked item selected deletes just those letters', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk']);
  await list.getByRole('checkbox', { name: 'Done: milk' }).click();
  await list.getByLabel('Item text').nth(1).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Delete');
  await expect.poll(() => texts(list)).toEqual(['bread', 'mil']);
});

test('a held Delete (key repeat) in a ticked item removes nothing', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk']);
  await list.getByRole('checkbox', { name: 'Done: bread' }).click();
  await list.getByRole('checkbox', { name: 'Done: milk' }).click();
  const milk = list.getByLabel('Item text').nth(1);
  await milk.click();
  await milk.evaluate((el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', repeat: true, bubbles: true, cancelable: true })));
  await list.getByRole('checkbox', { name: 'Done: milk' }).evaluate((el) => {
    el.focus();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', repeat: true, bubbles: true, cancelable: true }));
  });
  await expect.poll(() => texts(list)).toEqual(['bread', 'milk']);
  await expect(cards(page)).toHaveCount(1);
});

// Review findings (high review, job 218).
const repeatDelete = (page: Page) =>
  page.evaluate(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', repeat: true, bubbles: true, cancelable: true })));

test('holding Delete after it removed a ticked item never joins the items below into the one above', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk', 'eggs', 'jam']);
  await list.getByRole('checkbox', { name: 'Done: milk' }).click();
  await list.getByLabel('Item text').nth(1).click();
  await page.keyboard.press('Delete');
  await expect.poll(() => focused(page)).toBe('bread'); // the cursor at the end of the open item above
  await repeatDelete(page);
  await repeatDelete(page);
  await expect.poll(() => texts(list)).toEqual(['bread', 'eggs', 'jam']);
  // From the tick box too.
  await list.getByRole('checkbox', { name: 'Done: eggs' }).click();
  await page.keyboard.press('Delete');
  await expect.poll(() => focused(page)).toBe('bread');
  await repeatDelete(page);
  await expect.poll(() => texts(list)).toEqual(['bread', 'jam']);
  // A fresh press joins again, as usual for an open item.
  await page.keyboard.press('Delete');
  await expect.poll(() => texts(list)).toEqual(['breadjam']);
});

test('Alt+Delete in a ticked item does not remove it', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk']);
  await list.getByRole('checkbox', { name: 'Done: milk' }).click();
  await list.getByLabel('Item text').nth(1).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Alt+Delete');
  await expect.poll(() => texts(list)).toContainEqual(expect.stringContaining('ilk'));
  expect((await texts(list)).length).toBe(2);
});

test('with other cards selected too (Ctrl+A on a tick box), Delete deletes the selection as usual', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk']);
  await clickEmpty(page);
  await add(page, 'Note');
  await list.getByRole('checkbox', { name: 'Done: milk' }).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await expect(cards(page)).toHaveCount(0);
});

test('with the board’s delete key changed, a focused tick box still takes Delete, and the new key removes the item, not the card', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('note-board:hotkeys', JSON.stringify({ delete: { key: 'g', mod: false, shift: false } })));
  await page.reload();
  const list = await checklist(page, ['bread', 'milk', 'eggs']);
  await list.getByRole('checkbox', { name: 'Done: milk' }).click();
  await page.keyboard.press('Delete');
  await expect.poll(() => texts(list)).toEqual(['bread', 'eggs']);
  await list.getByRole('checkbox', { name: 'Done: eggs' }).focus();
  await page.keyboard.press('g');
  await expect.poll(() => texts(list)).toEqual(['bread']);
  await expect(cards(page)).toHaveCount(1);
});

test('the shortcuts list says what Delete does in a ticked item', async ({ page }) => {
  await clickEmpty(page);
  await page.keyboard.press('?');
  await expect(page.getByText('Delete it, like its trash can')).toBeVisible();
});

// Checker finding (job 218, round 2, "fix iPhone first"): on a touch screen, tapping a tick box while
// typing in an item keeps the cursor (and so the phone's keyboard) in the text, as before this change.
test.describe('on a touch screen', () => {
  test.use({ hasTouch: true });

  test('a tapped tick box ticks the item and the cursor stays in the item being typed in', async ({ page }) => {
    const list = await checklist(page, ['bread', 'milk', 'eggs']);
    await list.getByLabel('Item text').nth(1).tap();
    await list.getByRole('checkbox', { name: 'Done: eggs' }).tap();
    await expect(list.getByRole('checkbox', { name: 'Done: eggs' })).toBeChecked();
    expect(await focused(page)).toBe('milk');
    await list.getByRole('checkbox', { name: 'Done: milk' }).tap();
    await expect(list.getByRole('checkbox', { name: 'Done: milk' })).toBeChecked();
    expect(await focused(page)).toBe('milk');
    // The edge of the box's wider pressable area (its label) too.
    await list.locator('label.tick').first().tap({ position: { x: 1, y: 1 } });
    await expect(list.getByRole('checkbox', { name: 'Done: bread' })).toBeChecked();
    expect(await focused(page)).toBe('milk');
  });
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('a tapped tick box keeps the cursor in the item being typed in', async ({ page }) => {
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'Checklist' }).tap();
    await page.keyboard.press('Enter');
    await page.keyboard.type('bread');
    await page.keyboard.press('Enter');
    await page.keyboard.type('milk');
    const list = page.locator('[data-card-id]').first();
    await list.getByRole('checkbox', { name: 'Done: bread' }).tap();
    await expect(list.getByRole('checkbox', { name: 'Done: bread' })).toBeChecked();
    expect(await focused(page)).toBe('milk');
  });
});

test('a clicked tick box takes the keyboard without showing a focus ring', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk']);
  const box = list.getByRole('checkbox', { name: 'Done: milk' });
  await box.click();
  await expect(box).toBeFocused();
  expect(await box.evaluate((el) => el.matches(':focus-visible'))).toBe(false);
});
