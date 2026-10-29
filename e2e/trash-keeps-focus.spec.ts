import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, cards, clickEmpty, freshBoardEachTest } from './helpers';

// Job 222 (follow-up to job 218): pressing a checklist item's own trash can left the focus nowhere,
// so the next Delete deleted the whole (selected) card. The cursor now goes to the item above
// (else below), as with Delete in a ticked item, and no key pressed afterwards deletes the card.

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

test('clicking the trash can while typing in the item moves the cursor to the item above; Delete then never deletes the card', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk']);
  await expect(list).toHaveClass(/selected/);
  await list.getByRole('button', { name: 'Delete item' }).nth(1).click();
  await expect.poll(() => texts(list)).toEqual(['bread']);
  await expect.poll(() => focused(page)).toBe('bread');
  await page.keyboard.press('Delete');
  await expect(cards(page)).toHaveCount(1);
  await expect.poll(() => texts(list)).toEqual(['bread']);

  await page.keyboard.press('Control+z');
  await expect.poll(() => texts(list)).toEqual(['bread', 'milk']);
});

test('the first item: the cursor goes to the item below', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk']);
  await list.getByLabel('Item text').first().click();
  await list.getByRole('button', { name: 'Delete item' }).first().click();
  await expect.poll(() => texts(list)).toEqual(['milk']);
  await expect.poll(() => focused(page)).toBe('milk');
});

test('pressing the trash can from the keyboard (Enter) moves the cursor the same way', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk', 'eggs']);
  await list.getByRole('button', { name: 'Delete item' }).nth(1).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => texts(list)).toEqual(['bread', 'eggs']);
  await expect.poll(() => focused(page)).toBe('bread');
  await page.keyboard.press('Backspace');
  await expect.poll(() => texts(list)).toEqual(['brea', 'eggs']);
  await expect(cards(page)).toHaveCount(1);
});

test('holding Enter on the trash can removes one item; its repeats do nothing in the item above', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk', 'eggs']);
  await list.getByRole('button', { name: 'Delete item' }).nth(1).focus();
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter'); // a repeat
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect.poll(() => texts(list)).toEqual(['bread', 'eggs']);
  await expect.poll(() => focused(page)).toBe('bread');
});

test('clicking the trash can with nothing being typed in, then Delete: the card stays', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk']);
  await page.keyboard.press('Escape'); // leaves the text box; the card stays selected
  await expect.poll(() => focused(page)).toBeNull();
  await expect(list).toHaveClass(/selected/);
  await list.getByRole('button', { name: 'Delete item' }).nth(1).click();
  await expect.poll(() => texts(list)).toEqual(['bread']);
  await expect.poll(() => focused(page)).toBe('bread');
  await page.keyboard.press('Delete');
  await expect(cards(page)).toHaveCount(1);
});

test('Delete with items selected (Shift+click), then Delete again: the card stays', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk', 'eggs']);
  await list.getByLabel('Item text').nth(1).click();
  await list.getByLabel('Item text').nth(2).click({ modifiers: ['Shift'] });
  await page.keyboard.press('Delete');
  await expect.poll(() => texts(list)).toEqual(['bread']);
  await expect.poll(() => focused(page)).toBe('bread');
  await page.keyboard.press('Delete');
  await expect(cards(page)).toHaveCount(1);
});

test('trashing the only item leaves one blank item with the cursor in it; Delete keeps the card', async ({ page }) => {
  const list = await checklist(page, ['bread']);
  await list.getByRole('button', { name: 'Delete item' }).first().click();
  await expect.poll(() => texts(list)).toEqual(['']);
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Item text');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  await expect(cards(page)).toHaveCount(1);
});

test('holding Backspace with items selected removes them once; the item above keeps its text', async ({ page }) => {
  const list = await checklist(page, ['bread', 'milk', 'eggs', 'jam']);
  await list.getByLabel('Item text').nth(1).click();
  await list.getByLabel('Item text').nth(2).click({ modifiers: ['Shift'] });
  await page.keyboard.down('Backspace');
  await page.keyboard.down('Backspace'); // repeats
  await page.keyboard.down('Backspace');
  await page.keyboard.up('Backspace');
  await expect.poll(() => texts(list)).toEqual(['bread', 'jam']);
  await expect.poll(() => focused(page)).toBe('bread');
});

test('while typing in one list, the trash can in another list leaves the cursor where it was', async ({ page }) => {
  const other = await checklist(page, ['bread', 'milk']);
  const typing = await checklist(page, ['tea']);
  await expect.poll(() => focused(page)).toBe('tea');
  await other.getByRole('button', { name: 'Delete item' }).nth(1).click();
  await expect.poll(() => texts(other)).toEqual(['bread']);
  await expect.poll(() => focused(page)).toBe('tea');
  await page.keyboard.type('s');
  await expect.poll(() => texts(typing)).toEqual(['teas']);
});
