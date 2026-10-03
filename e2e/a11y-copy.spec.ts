import { expect, test } from '@playwright/test';
import { add, box, cards, clickEmpty, columns, freshBoardEachTest } from './helpers';

// The accessibility and wording reviews (2026-10-03, owner approved all of it).

freshBoardEachTest();

const css = (l: import('@playwright/test').Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

async function list(page: import('@playwright/test').Page, title: string, items: string[]) {
  await clickEmpty(page);
  await add(page, 'To-do list', { stayInTitle: true });
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
  for (const [i, t] of items.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  const id = await page.locator('.card.selected').getAttribute('data-card-id');
  return page.locator(`[data-card-id="${id}"]`);
}

test('a tick box reached with Tab shows the focus ring', async ({ page }) => {
  const l = await list(page, 'Groceries', ['milk']);
  await l.getByLabel('List title').focus();
  await page.keyboard.press('Tab');
  const tick = l.getByRole('checkbox', { name: 'Done' }).first();
  await expect(tick).toBeFocused();
  expect(await css(tick, 'outline-style')).toBe('solid');
});

test('a focused resize handle resizes with the arrow keys', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  const note = cards(page).first();
  const w = (await box(note)).width;
  await note.getByRole('button', { name: 'Resize card' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await box(note)).width).toBeCloseTo(w + 20, 0);
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => (await box(note)).width).toBeCloseTo(w + 120, 0);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await box(note)).width).toBeCloseTo(w + 20, 0);
});

test('screen readers hear card and column titles, and "Untitled" when there is none', async ({ page }) => {
  await list(page, 'Groceries', ['milk']);
  await expect(page.getByRole('article', { name: 'To-do list: Groceries' })).toHaveCount(1);
  await clickEmpty(page);
  await add(page, 'New column');
  await expect(columns(page).first()).toHaveAttribute('aria-label', 'Untitled column');
  await page.keyboard.type('Week');
  await expect(columns(page).first()).toHaveAttribute('aria-label', 'Column: Week');
  await expect(page.getByRole('main', { name: 'Board' })).toHaveCount(1);
});

test('tick boxes, resize corners and the item grip are at least 24px to touch', async ({ page }) => {
  const l = await list(page, 'Groceries', ['milk']);
  const tick = (await box(l.getByRole('checkbox', { name: 'Done' }).first()))!;
  // 3px outside the drawn 16px box still hits it.
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.tick')?.querySelector('input')?.getAttribute('aria-label'), { x: tick.x - 3, y: tick.y + tick.height / 2 });
  expect(hit).toBe('Done');
  await clickEmpty(page);
  await add(page, 'New column'); // has the width strip
  await page.keyboard.press('Escape');
  for (const sel of ['.resize-corner', '.item-grip', '.resize-edge']) {
    const size = await page.locator(sel).first().evaluate((el) => {
      const after = getComputedStyle(el, '::before');
      const r = el.getBoundingClientRect();
      const grow = (v: string) => (v === 'auto' ? 0 : -parseFloat(v));
      return { w: r.width + grow(after.left) + grow(after.right), h: r.height + grow(after.top) + grow(after.bottom) };
    });
    expect(Math.min(size.w, size.h), sel).toBeGreaterThanOrEqual(24);
  }
});

test('Ctrl+Shift+Down / Up move an item past its neighbour, keeping the cursor in it', async ({ page }) => {
  const l = await list(page, 'Groceries', ['milk', 'eggs', 'bread']);
  await l.getByLabel('Item text').first().click();
  await page.keyboard.press('Control+Shift+ArrowDown');
  expect(await l.getByLabel('Item text').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value))).toEqual(['eggs', 'milk', 'bread']);
  await expect(l.getByLabel('Item text').nth(1)).toBeFocused();
  await page.keyboard.press('Control+Shift+ArrowUp');
  await page.keyboard.press('Control+Shift+ArrowUp'); // already at the top: nothing
  expect(await l.getByLabel('Item text').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value))).toEqual(['milk', 'eggs', 'bread']);
  await expect(l.getByLabel('Item text').first()).toBeFocused();
});

test('wording: placeholders, empty hint, Select tool tip, Colour label', async ({ page }) => {
  await expect(page.getByText('Add a note, a to-do list or a column from the toolbar, or drag one onto the board. Press ? for keyboard shortcuts.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select (V)' })).toHaveAttribute('title', 'Select (V): drag a rectangle to select several cards and columns');
  await expect(page.getByRole('button', { name: 'Colour of selected cards and columns' })).toHaveCount(1);
  const l = await list(page, '', []);
  await expect(l.getByLabel('Item text').first()).toHaveAttribute('placeholder', 'Add an item');
  await clickEmpty(page);
  await add(page, 'Link');
  await expect(page.getByLabel('Link address')).toHaveAttribute('placeholder', 'Paste a link address');
});

test('deleting a column says how many cards go with it, with a Keep button', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'New column');
  await page.keyboard.type('Week');
  await page.keyboard.press('Escape');
  const col = columns(page).first();
  for (let i = 0; i < 2; i++) {
    await col.click({ position: { x: 20, y: 20 } });
    await add(page, 'Note');
    await page.keyboard.press('Escape');
  }
  await col.getByRole('button', { name: 'Delete column and its cards' }).click();
  await expect(page.getByText('Delete “Week” and its 2 cards?')).toBeVisible();
  await page.getByRole('button', { name: 'Keep column' }).click();
  await expect(columns(page)).toHaveCount(1);
});

test('dragging items to empty board says the drop makes a new list', async ({ page }) => {
  const l = await list(page, 'Groceries', ['milk', 'eggs']);
  await clickEmpty(page);
  await l.locator('.todo-item').first().hover();
  const g = await box(l.locator('.item-grip').first());
  await page.mouse.move(g.x + 7, g.y + 12);
  await page.mouse.down();
  await page.mouse.move(g.x + 400, g.y + 300, { steps: 8 });
  await expect(page.getByTestId('item-ghost')).toContainText('Drop to make a new list');
  await page.mouse.up();
});
