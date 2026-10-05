import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, box, cards, clickEmpty, dragPointer, fontsLoaded, freshBoardEachTest, grabPoint } from './helpers';

// Owner requests, 2026-10-05 (second batch): Sign out no longer cut off, "Checklist" instead of
// "To-do list", Miro-style arrows, and Clean up on each list beside Uncheck all.

freshBoardEachTest();

const toolbar = (page: Page) => page.locator('header.toolbar');

/** Every toolbar button fits in the window, Sign out included (`?signed-in` shows it locally). */
async function expectToolbarFits(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  expect(await toolbar(page).evaluate((el) => el.scrollWidth <= el.clientWidth), `toolbar fits at ${width}px`).toBe(true);
  const out = await box(toolbar(page).getByRole('button', { name: 'Sign out' }));
  expect(out.x + out.width, `Sign out fits at ${width}px`).toBeLessThanOrEqual(width);
}

test('Sign out is never cut off at the right of the toolbar, also inside a sub-board', async ({ page }) => {
  await page.goto('/?signed-in');
  await fontsLoaded(page);
  for (const width of [1280, 1366, 1440, 1536, 1920]) await expectToolbarFits(page, width);

  // Inside a sub-board the path to it shows too.
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'Add a sub-board here' }).click();
  await page.locator('[data-kind="board"]').getByRole('button', { name: /open/i }).click();
  await expect(page.getByRole('navigation', { name: 'Boards above this one' })).toBeVisible();
  for (const width of [1280, 1440]) await expectToolbarFits(page, width);
});

test('lists are called Checklist: the toolbar button, the card name and the empty-board hint', async ({ page }) => {
  await expect(page.getByText('Add a note, a checklist or a column from the toolbar, or drag one onto the board. Press ? for keyboard shortcuts.')).toBeVisible();
  await expect(toolbar(page).getByRole('button', { name: 'To-do list' })).toHaveCount(0);
  await add(page, 'Checklist', { stayInTitle: true });
  await page.keyboard.type('Groceries');
  await expect(page.getByRole('article', { name: 'Checklist: Groceries' })).toHaveCount(1);
});

/** A checklist with the given items, the first `ticked` of them ticked. */
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

test('Clean up beside Uncheck all moves only that list’s ticked items into the Completed card', async ({ page }) => {
  const groceries = await checklist(page, 'Groceries', ['bread', 'milk', 'eggs'], 2);
  const chores = await checklist(page, 'Chores', ['sweep', 'dust'], 1);
  const cleanUp = groceries.getByRole('button', { name: 'Clean up', exact: true });
  await expect(cleanUp).toBeVisible();
  await expect(groceries.getByRole('button', { name: 'Uncheck all' })).toBeVisible();
  // On the same line as Uncheck all, just left of it.
  const c = await box(cleanUp);
  const u = await box(groceries.getByRole('button', { name: 'Uncheck all' }));
  expect(Math.abs(c.y - u.y)).toBeLessThan(2);
  expect(c.x + c.width).toBeLessThanOrEqual(u.x + 1);

  await cleanUp.click();
  expect(await texts(groceries)).toEqual(['eggs']);
  await expect(groceries.getByRole('button', { name: 'Clean up', exact: true })).toHaveCount(0);
  expect(await texts(chores)).toEqual(['dust', 'sweep']);
  const done = cards(page).filter({ has: page.locator('.completed-card-body') });
  await expect(done.locator('.completed-text')).toHaveText(['bread', 'milk']);

  // One Ctrl+Z puts it back.
  await clickEmpty(page);
  await page.keyboard.press('Control+z');
  expect(await texts(groceries)).toEqual(['eggs', 'bread', 'milk']);
});

/** Two notes, the second 200px below the first; nothing selected. */
async function noteAbove(page: Page) {
  await add(page, 'Note');
  const id = await page.locator('.card.selected').getAttribute('data-card-id');
  const top = page.locator(`[data-card-id="${id}"]`);
  await add(page, 'Note');
  const below = page.locator(`[data-card-id]:not([data-card-id="${id}"])`);
  await clickEmpty(page);
  const a = await box(top);
  const from = await grabPoint(below);
  const b = await box(below);
  await dragPointer(page, from, { x: from.x + (a.x - b.x), y: from.y + (a.y + a.height + 200 - b.y) });
  await clickEmpty(page);
  return { top, below };
}

const dots = (page: Page) => page.locator('.arrow-dot');

test('like Miro, hovering a card shows a dot on each side; dragging one onto another card draws a curved arrow side to side', async ({ page }) => {
  const { top, below } = await noteAbove(page);
  await expect(dots(page)).toHaveCount(0);
  const t = await box(top);
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await expect(dots(page)).toHaveCount(4);
  // One just outside the middle of each side.
  const at = async (side: string) => {
    const d = await box(page.getByRole('button', { name: `Draw an arrow from the ${side}` }));
    return { x: d.x + d.width / 2, y: d.y + d.height / 2 };
  };
  const bottom = await at('bottom');
  expect(Math.abs(bottom.x - (t.x + t.width / 2))).toBeLessThan(2);
  expect(bottom.y).toBeGreaterThan(t.y + t.height);
  expect(bottom.y).toBeLessThan(t.y + t.height + 24);
  const right = await at('right');
  expect(right.x).toBeGreaterThan(t.x + t.width);
  expect(Math.abs(right.y - (t.y + t.height / 2))).toBeLessThan(2);

  // Moving onto the dot keeps it there; drag it onto the card below.
  const b = await box(below);
  await dragPointer(page, bottom, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
  const arrow = page.locator('[data-arrow-id]');
  await expect(arrow).toHaveCount(1);
  // A curve from the middle of the top card's bottom side to the middle of the lower card's top side.
  const ends = await arrow.locator('.arrow-line').evaluate((el) => {
    const p = el as SVGPathElement;
    const m = p.getScreenCTM()!;
    const pt = (l: number) => {
      const q = p.getPointAtLength(l);
      return { x: q.x * m.a + m.e, y: q.y * m.d + m.f };
    };
    return { tag: p.tagName, start: pt(0), end: pt(p.getTotalLength()) };
  });
  expect(ends.tag).toBe('path');
  expect(Math.abs(ends.start.x - (t.x + t.width / 2))).toBeLessThan(3);
  expect(ends.start.y).toBeGreaterThan(t.y + t.height - 1);
  expect(ends.start.y).toBeLessThan(t.y + t.height + 12);
  expect(Math.abs(ends.end.x - (b.x + b.width / 2))).toBeLessThan(3);
  expect(ends.end.y).toBeLessThan(b.y + 1);
  expect(ends.end.y).toBeGreaterThan(b.y - 12);
});

test('a selected card shows its four dots too, and they go when the pointer leaves', async ({ page }) => {
  const { top } = await noteAbove(page);
  const p = await grabPoint(top);
  await page.mouse.click(p.x, p.y);
  await page.mouse.move(5, 500);
  await expect(dots(page)).toHaveCount(4);
  await clickEmpty(page);
  await page.mouse.move(5, 500);
  await expect(dots(page)).toHaveCount(0);
});

/** A column holding two notes, "upper" above "lower"; nothing selected, pointer on empty board. */
async function columnOfTwo(page: Page) {
  await add(page, 'New column');
  const c = page.locator(`[data-col-id="${await page.locator('[data-col-id].selected').getAttribute('data-col-id')}"]`);
  for (const text of ['upper', 'lower']) {
    await c.click({ position: { x: 200, y: 26 } });
    await add(page, 'Note');
    await page.keyboard.type(text);
  }
  await clickEmpty(page);
  const note = (text: string) => c.locator('[data-card-id]').filter({ has: page.locator(`textarea:text-is("${text}")`) });
  return { column: c, upper: note('upper'), lower: note('lower') };
}

const dot = (page: Page, side: string) => page.getByRole('button', { name: `Draw an arrow from the ${side}` });
const middle = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

test('the dots of a card in a column can be reached across the column around it, and drawn from', async ({ page }) => {
  const { upper } = await columnOfTwo(page);
  // A loose note to the right of the column.
  await add(page, 'Note');
  const loose = page.locator(`[data-card-id="${await page.locator('.card.selected').getAttribute('data-card-id')}"]`);
  await clickEmpty(page);
  const u = await box(upper);
  await page.mouse.move(u.x + u.width / 2, u.y + u.height / 2);
  const right = middle(await box(dot(page, 'right')));
  // Still the card's dot: just right of the card, inside the column.
  expect(right.x).toBeLessThan(u.x + u.width + 20);
  await page.mouse.move(right.x, right.y, { steps: 10 });
  expect(middle(await box(dot(page, 'right'))).x).toBeCloseTo(right.x, 0);
  await dragPointer(page, right, middle(await box(loose)));
  await expect(page.locator('[data-arrow-id]')).toHaveCount(1);
});

test('a dot of one card never covers the card below it in a column', async ({ page }) => {
  const { upper, lower } = await columnOfTwo(page);
  const u = await box(upper);
  await page.mouse.move(u.x + u.width / 2, u.y + u.height / 2);
  await expect(dot(page, 'bottom')).toBeVisible();
  // Move down onto the top middle of the lower card, where the upper card's bottom dot sat.
  const l = await box(lower);
  await page.mouse.move(l.x + l.width / 2, l.y + 3, { steps: 10 });
  // Now the lower card shows its dots: its top dot is above it.
  await expect.poll(async () => middle(await box(dot(page, 'top'))).y).toBeLessThan(l.y);
  expect(middle(await box(dot(page, 'bottom'))).y).toBeGreaterThan(l.y + l.height);
});
