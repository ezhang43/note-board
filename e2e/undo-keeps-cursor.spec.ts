import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, cards, clickEmpty, freshBoardEachTest } from './helpers';

// Ctrl+Z or Ctrl+Y while typing in a checklist item (job undo-keeps-cursor, 2026-11-09): when it takes the item
// away, the cursor goes to the nearest item still drawn, never to the page, so the next Backspace can't delete the card.

freshBoardEachTest();

async function checklist(page: Page, items: string[]) {
  await clickEmpty(page);
  await add(page, 'Checklist');
  const list = page.locator(`[data-card-id="${await page.locator('.card.selected').getAttribute('data-card-id')}"]`);
  for (const [i, t] of items.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  return list;
}

const texts = (list: Locator) => list.getByLabel('Item text').evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));
const focused = (page: Page) => page.evaluate(() => (document.activeElement instanceof HTMLTextAreaElement ? document.activeElement.value : null));

test('Ctrl+Z that takes away the new item being typed in: the cursor goes to the item above, and Backspace only deletes a letter', async ({ page }) => {
  const list = await checklist(page, ['one']);
  await page.keyboard.press('Enter'); // a new item, with the cursor in it
  await page.keyboard.type('two');
  await expect.poll(() => texts(list)).toEqual(['one', 'two']);
  // Undo until the new item is gone (its typing may be a step of its own).
  for (let i = 0; i < 3 && (await texts(list)).length > 1; i++) await page.keyboard.press('Control+z');
  await expect.poll(() => texts(list)).toEqual(['one']);
  await expect.poll(() => focused(page)).toBe('one');
  await page.keyboard.press('Backspace');
  await expect(cards(page)).toHaveCount(1);
  await expect.poll(() => texts(list)).toEqual(['on']);
});

test('Ctrl+Z that moves the item being typed in back down keeps the cursor in it (code review)', async ({ page }) => {
  const list = await checklist(page, ['one', 'two']);
  await page.keyboard.press('Control+Shift+ArrowUp'); // "two" goes to the top
  await expect.poll(() => texts(list)).toEqual(['two', 'one']);
  await page.keyboard.press('Control+z');
  await expect.poll(() => texts(list)).toEqual(['one', 'two']);
  await expect.poll(() => focused(page)).toBe('two');
  await page.keyboard.press('Backspace');
  await expect(cards(page)).toHaveCount(1);
  await expect.poll(() => texts(list)).toEqual(['one', 'tw']);
});

test('Ctrl+Y that takes away the item being typed in: the cursor goes to the item above, and Backspace never deletes the card', async ({ page }) => {
  const list = await checklist(page, ['one', 'x']);
  await page.keyboard.press('Backspace'); // "x" emptied...
  await page.keyboard.press('Backspace'); // ...then the empty item goes
  await expect.poll(() => texts(list)).toEqual(['one']);
  await page.keyboard.press('Control+z'); // the empty item is back
  await expect.poll(() => texts(list)).toEqual(['one', '']);
  await list.getByLabel('Item text').nth(1).click();
  await expect.poll(() => focused(page)).toBe('');
  await page.keyboard.press('Control+y'); // and goes again
  await expect.poll(() => texts(list)).toEqual(['one']);
  await expect.poll(() => focused(page)).toBe('one');
  await page.keyboard.press('Backspace');
  await expect(cards(page)).toHaveCount(1);
});

test('Ctrl+Z that collapses the list being typed in: the card is let go, and Backspace does not delete it', async ({ page }) => {
  const list = await checklist(page, ['one']);
  await list.getByRole('button', { name: 'Collapse card' }).click();
  await list.getByRole('button', { name: 'Expand card' }).click();
  await list.getByLabel('Item text').click();
  await page.keyboard.press('Control+z'); // collapsed again: no item is drawn
  await expect(list.getByLabel('Item text')).toHaveCount(0);
  await expect(page.locator('.card.selected')).toHaveCount(0);
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  await expect(cards(page)).toHaveCount(1);
});

const caretIn = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return el instanceof HTMLTextAreaElement ? [el.value, el.selectionStart, el.selectionEnd] : null;
  });

test('Ctrl+Z then Ctrl+Y on typing puts the cursor at the end of the text it brings back (owner, 2026-11-09)', async ({ page }) => {
  const list = await checklist(page, ['hello', 'x']);
  await list.getByLabel('Item text').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' world');
  await page.keyboard.press('Control+z');
  await expect.poll(() => texts(list)).toEqual(['hello', 'x']);
  await page.keyboard.press('Control+y');
  await expect.poll(() => texts(list)).toEqual(['hello world', 'x']);
  await expect.poll(() => caretIn(page)).toEqual(['hello world', 11, 11]);
});

test('highlighted words stay highlighted after an undo that leaves their item as it is (owner, 2026-11-09)', async ({ page }) => {
  const list = await checklist(page, ['abcd', 'x']);
  const first = list.getByLabel('Item text').first();
  await first.click();
  await first.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(1, 3)); // "bc"
  await page.keyboard.press('Control+z'); // takes back the typing in the other item
  await expect.poll(() => texts(list)).toEqual(['abcd', '']);
  await expect.poll(() => caretIn(page)).toEqual(['abcd', 1, 3]);
});

for (const name of ['Undo', 'Redo']) {
  test(`the toolbar's ${name} clicked while typing keeps the cursor in the item, so Backspace never deletes the card (owner, 2026-11-09)`, async ({ page }) => {
    const list = await checklist(page, ['one']);
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    if (name === 'Redo') {
      await page.keyboard.press('Control+z');
      await page.keyboard.press('Control+z');
      await expect.poll(() => texts(list)).toEqual(['one']);
    }
    const button = page.getByRole('button', { name: new RegExp(`^${name} \\(`) });
    await button.click();
    await expect.poll(() => focused(page)).not.toBeNull();
    await expect(button).not.toBeFocused();
    for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
    await expect(cards(page)).toHaveCount(1);
  });
}

test("the toolbar's Undo clicked while typing in a note keeps the cursor there too, so Backspace never deletes the note (code review)", async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.type('abc');
  const undo = page.getByRole('button', { name: /^Undo \(/ });
  await undo.click();
  await expect(undo).not.toBeFocused();
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[data-card-id]') != null)).toBe(true);
  for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace');
  await expect(cards(page)).toHaveCount(1);
});

test("the Undo message's Undo clicked while typing keeps the cursor in the item, so Backspace never deletes a card (owner, 2026-11-09)", async ({ page }) => {
  const list = await checklist(page, ['one']);
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Delete'); // the note goes, and the Undo message shows
  await expect(cards(page)).toHaveCount(1);
  await list.getByLabel('Item text').click();
  await page.locator('.undo-toast').getByRole('button', { name: 'Undo' }).click();
  await expect(cards(page)).toHaveCount(2);
  await expect.poll(() => focused(page)).toBe('one');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace');
  await expect(cards(page)).toHaveCount(2);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const bar = (page: Page) => page.getByRole('toolbar', { name: 'Item actions' });

  async function phoneList(page: Page, names: string[]) {
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'Checklist' }).tap();
    await page.keyboard.press('Enter'); // from the title to the first item
    for (const [i, t] of names.entries()) {
      if (i) await page.keyboard.press('Enter');
      await page.keyboard.type(t);
    }
    return cards(page).first();
  }

  test("the item bar's Undo that collapses the list never leaves the cursor in a hidden item, and Backspace does not delete the card", async ({ page }) => {
    const list = await phoneList(page, ['one']);
    await list.getByRole('button', { name: 'Collapse card' }).tap();
    await list.getByRole('button', { name: 'Expand card' }).tap();
    await list.getByLabel('Item text').tap();
    await bar(page).getByRole('button', { name: 'Undo' }).tap();
    await expect(list.getByLabel('Item text')).toHaveCount(0);
    expect(await focused(page)).toBeNull();
    await expect(page.locator('.card.selected')).toHaveCount(0);
    await page.keyboard.press('Backspace');
    await expect(cards(page)).toHaveCount(1);
  });

  test("the item bar's Undo that takes away the new item keeps the cursor in the list", async ({ page }) => {
    const list = await phoneList(page, ['one']);
    await page.keyboard.press('Enter');
    await expect.poll(() => texts(list)).toEqual(['one', '']);
    await bar(page).getByRole('button', { name: 'Undo' }).tap();
    await expect.poll(() => texts(list)).toEqual(['one']);
    await expect.poll(() => focused(page)).toBe('one');
    await expect(bar(page)).toBeVisible();
    await page.keyboard.press('Backspace');
    await expect(cards(page)).toHaveCount(1);
  });
});
