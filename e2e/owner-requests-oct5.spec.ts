import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, box, clickEmpty, columns, dragPointer, freshBoardEachTest, grabPoint, importLinkCard, looseCards } from './helpers';

// Owner requests, 2026-10-05: no Link button (only notes and to-do lists), "Add a sub-board here",
// and Alt + arrows that go the way the arrow points and reach every card and column.

freshBoardEachTest();

const toolbar = (page: Page) => page.locator('header.toolbar');

test('the toolbar adds notes, to-do lists and columns, but no longer links', async ({ page }) => {
  await expect(toolbar(page).getByRole('button', { name: 'Note', exact: true })).toBeVisible();
  await expect(toolbar(page).getByRole('button', { name: 'To-do list', exact: true })).toBeVisible();
  await expect(toolbar(page).getByRole('button', { name: 'New column', exact: true })).toBeVisible();
  await expect(toolbar(page).getByRole('button', { name: 'Link', exact: true })).toHaveCount(0);
});

test('a link card that is already on a board still works', async ({ page }) => {
  // Imported from Milanote: the way left to get a link card, besides older boards.
  await importLinkCard(page);
  const link = page.locator('[data-kind="link"]');
  await expect(link).toHaveCount(1);
  await expect(link.getByLabel('Link title')).toHaveValue('Inspiration');
  await expect(link.locator('.link-open')).toHaveAttribute('href', 'https://www.example.com/ideas');
});

test('the Boards menu says "Add a sub-board here"', async ({ page }) => {
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Boards' });
  await menu.getByRole('menuitem', { name: 'Add a sub-board here' }).click();
  await expect(page.locator('[data-kind="board"]')).toHaveCount(1);
});

/** A column titled `title` holding notes with the given texts, top to bottom. */
async function column(page: Page, title: string, notes: string[]) {
  await clickEmpty(page);
  await add(page, 'New column');
  const col = page.locator('[data-col-id].selected');
  const id = await col.getAttribute('data-col-id');
  const c = page.locator(`[data-col-id="${id}"]`);
  await c.getByLabel('Column title').fill(title);
  for (const text of notes) {
    await c.click({ position: { x: 200, y: 26 } });
    await add(page, 'Note');
    await page.keyboard.type(text);
  }
  return c;
}

/** Adds a loose note with `text` and returns it. */
async function looseNote(page: Page, text: string) {
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.type(text);
  return page.locator(`[data-card-id="${await page.locator('.card.selected').getAttribute('data-card-id')}"]`);
}
const focusedValue = (page: Page) => page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.value ?? null);

test('Alt + arrows step through a column, go to its title, and across to the next column at the same height', async ({ page }) => {
  const a = await column(page, 'Week', ['a1', 'a2']);
  const b = await column(page, 'Later', ['b1', 'b2']);
  // Put column B just right of column A, tops level.
  const ra = await box(a);
  const g = await grabPoint(b);
  const rb = await box(b);
  await dragPointer(page, g, { x: ra.x + ra.width + 40 + (g.x - rb.x), y: ra.y + (g.y - rb.y) });
  await expect.poll(async () => Math.abs((await box(b)).y - (await box(a)).y)).toBeLessThan(4);

  await a.getByLabel('Note text').first().click();
  expect(await focusedValue(page)).toBe('a1');

  await page.keyboard.press('Alt+ArrowUp'); // a1 → the column's title
  await expect(a.getByLabel('Column title')).toBeFocused();
  await expect(a).toHaveClass(/selected/);

  await page.keyboard.press('Alt+ArrowRight'); // title → title
  await expect(b.getByLabel('Column title')).toBeFocused();
  await expect(b).toHaveClass(/selected/);

  await page.keyboard.press('Alt+ArrowDown'); // title → first card
  expect(await focusedValue(page)).toBe('b1');
  await page.keyboard.press('Alt+ArrowDown');
  expect(await focusedValue(page)).toBe('b2');
  await page.keyboard.press('Alt+ArrowLeft'); // b2 → a2, beside it
  expect(await focusedValue(page)).toBe('a2');
  await page.keyboard.press('Alt+ArrowUp');
  expect(await focusedValue(page)).toBe('a1');
  await expect(a.locator('[data-card-id]').first()).toHaveClass(/selected/);
  await expect(page.locator('.selected')).toHaveCount(1);
});

test('Alt + → goes to the card to the right, not to one that is mostly below', async ({ page }) => {
  // [start]  [right]
  //    [lower]
  const start = await looseNote(page, 'start');
  const right = await looseNote(page, 'right');
  const lower = await looseNote(page, 'lower');
  const s = await box(start);
  const place = async (card: Locator, x: number, y: number) => {
    const p = await grabPoint(card);
    const r = await box(card);
    await dragPointer(page, p, { x: x + (p.x - r.x), y: y + (p.y - r.y) });
  };
  await place(right, s.x + s.width + 120, s.y);
  await place(lower, s.x + s.width / 2 + 20, s.y + s.height + 40);
  await expect(looseCards(page)).toHaveCount(3);
  const l = await box(lower);
  expect(l.x).toBeGreaterThan(s.x + s.width / 2); // starts right of the start card's middle…
  expect(l.x).toBeLessThan(s.x + s.width); // …but is below it, not to its right

  await start.getByLabel('Note text').click();
  await page.keyboard.press('Alt+ArrowRight');
  expect(await focusedValue(page)).toBe('right');
  await start.getByLabel('Note text').click();
  await page.keyboard.press('Alt+ArrowDown');
  expect(await focusedValue(page)).toBe('lower');
});

test('Alt + arrows reach an empty column and a collapsed one', async ({ page }) => {
  const a = await column(page, 'Full', ['only']);
  await clickEmpty(page);
  await add(page, 'New column');
  const empty = page.locator('[data-col-id].selected');
  const id = await empty.getAttribute('data-col-id');
  const e = page.locator(`[data-col-id="${id}"]`);
  await e.getByLabel('Column title').fill('Empty');
  const ra = await box(a);
  const g = await grabPoint(e);
  const re = await box(e);
  await dragPointer(page, g, { x: ra.x + ra.width + 40 + (g.x - re.x), y: ra.y + (g.y - re.y) });

  await a.getByLabel('Note text').click();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(e.getByLabel('Column title')).toBeFocused();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(a.getByLabel('Column title')).toBeFocused();
  await a.getByRole('button', { name: 'Collapse column' }).click();
  await e.getByLabel('Column title').click();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(a.getByLabel('Column title')).toBeFocused();
  await expect(columns(page)).toHaveCount(2);
});
