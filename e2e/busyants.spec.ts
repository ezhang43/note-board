import { expect, test } from '@playwright/test';
import { add, clickEmpty, columns, dragTo, freshBoardEachTest } from './helpers';

// BusyAnts: the agreed features from the 2026-10-03 owner interview.

freshBoardEachTest();

test('the app is called BusyAnts', async ({ page }) => {
  await expect(page).toHaveTitle('BusyAnts');
});

test('an empty board shows a hint, which goes once anything is on the board', async ({ page }) => {
  const hint = page.getByText('Add a note, a to-do list or a column from the toolbar, or drag one onto the board. Press ? for keyboard shortcuts.');
  await expect(hint).toBeVisible();
  await add(page, 'Note');
  await expect(hint).toHaveCount(0);
});

test('new lists and columns start untitled; a new list takes the cursor in its title, and Enter moves to its first item', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'To-do list', { stayInTitle: true });
  const list = page.locator('.card.selected');
  await expect(list.getByLabel('List title')).toHaveValue('');
  await expect(list.getByLabel('List title')).toHaveAttribute('placeholder', 'List title');
  await page.keyboard.type('Groceries');
  await page.keyboard.press('Enter');
  await page.keyboard.type('milk');
  await expect(list.getByLabel('List title')).toHaveValue('Groceries');
  await expect(list.getByLabel('Item text').first()).toHaveValue('milk');

  await clickEmpty(page);
  await add(page, 'New column');
  const title = columns(page).first().getByLabel('Column title');
  await expect(title).toHaveValue('');
  await expect(title).toHaveAttribute('placeholder', 'Column title');
});

const css = (l: import('@playwright/test').Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test('A+ / A− change the text size on cards and columns (not the toolbar), and it is remembered', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'To-do list');
  await page.keyboard.type('milk');
  const item = page.getByLabel('Item text').first();
  const before = parseFloat(await css(item, 'font-size'));
  const toolbarBefore = await css(page.getByLabel('Board name'), 'font-size');
  await page.getByRole('button', { name: 'Larger text' }).click();
  await expect.poll(async () => parseFloat(await css(item, 'font-size'))).toBeGreaterThan(before);
  expect(await css(page.getByLabel('Board name'), 'font-size')).toBe(toolbarBefore);
  await page.reload();
  await expect.poll(async () => parseFloat(await css(page.getByLabel('Item text').first(), 'font-size'))).toBeGreaterThan(before);
  // Down to the smallest size, where A− fades.
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Smaller text' }).click(); // Large → Normal → Small
  await expect(page.getByRole('button', { name: 'Smaller text' })).toHaveAttribute('aria-disabled', 'true');
});

test('the Hand tool shows a glove over empty board, and the normal arrow over cards', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  const canvas = page.getByTestId('canvas');
  expect(await css(canvas, 'cursor')).toContain('url(');
  expect(await css(page.locator('.card').first(), 'cursor')).toBe('default');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('v'); // Select tool
  expect(await css(canvas, 'cursor')).toBe('default');
});

test('Same width makes the selected blocks as wide as the first one selected', async ({ page }) => {
  const sameWidth = page.locator('header.toolbar').getByRole('button', { name: 'Same width' });
  await expect(sameWidth).toHaveAttribute('aria-disabled', 'true');
  await clickEmpty(page);
  await add(page, 'New column');
  await page.keyboard.press('Escape');
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  const note = page.locator('.card.loose').first();
  const col = columns(page).first();
  await note.click({ position: { x: 30, y: 10 } });
  await col.click({ position: { x: 20, y: 20 }, modifiers: ['Control'] });
  await expect(sameWidth).not.toHaveAttribute('aria-disabled', 'true');
  await sameWidth.click();
  await expect.poll(async () => (await col.boundingBox())!.width).toBeCloseTo((await note.boundingBox())!.width, 0);
});

test('dragging a card near another shows an alignment guide', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  const [first, second] = [page.locator('.card.loose').nth(0), page.locator('.card.loose').nth(1)];
  const a = (await first.boundingBox())!;
  const b = (await second.boundingBox())!;
  // Grab the second note and bring its left edge to 3px right of the first's, well below it.
  await page.mouse.move(b.x + 30, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(a.x + 3 + 30, a.y + a.height + 200 + 10, { steps: 10 });
  await expect(page.locator('.align-guide').first()).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.align-guide')).toHaveCount(0);
  expect(Math.round((await second.boundingBox())!.x)).toBe(Math.round(a.x));
});

test('guide lines all go away once the card no longer lines up, even when it lined up with two cards at once (owner bug report)', async ({ page }) => {
  for (let i = 0; i < 3; i++) {
    await clickEmpty(page);
    await add(page, 'Note');
    await page.keyboard.press('Escape');
  }
  const ids = await page.locator('.card.loose').evaluateAll((els) => els.map((e) => e.getAttribute('data-card-id')!));
  const [b, c, a] = ids.map((id) => page.locator(`[data-card-id="${id}"]`));
  // Guides that look alike once confused React, which left old lines on the board.
  const keyErrors: string[] = [];
  page.on('console', (m) => { if (/same key/.test(m.text())) keyErrors.push(m.text()); });
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  const y = canvas.y + 120;
  // Two notes side by side in a row, the third well below and to the left of them.
  await dragTo(page, b, { x: canvas.x + 600, y });
  await dragTo(page, c, { x: canvas.x + 1000, y });
  await dragTo(page, a, { x: canvas.x + 100, y: y + 400 });
  const from = (await a.boundingBox())!;
  const row = (await b.boundingBox())!;
  // Bring the third note up level with the row, a few px off: it lines up with both notes at once.
  await page.mouse.move(from.x + 30, from.y + 18);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, row.y + 3 + 18, { steps: 10 });
  await expect(page.locator('.align-guide').first()).toBeVisible();
  // Slide along the row: it keeps lining up with both, with the guides changing as it goes.
  for (let k = 0; k < 6; k++) await page.mouse.move(from.x + 30 + k * 7, row.y + 18 + 3 - (k % 3), { steps: 3 });
  await expect(page.locator('.align-guide').first()).toBeVisible();
  // Then down to where it lines up with nothing.
  await page.mouse.move(from.x + 30, row.y + 300 + 18, { steps: 10 });
  await expect(page.locator('.align-guide')).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator('.align-guide')).toHaveCount(0);
  expect(keyErrors).toEqual([]);
});

const panOf = async (page: import('@playwright/test').Page) => {
  const c = page.getByTestId('canvas');
  return { x: Number(await c.getAttribute('data-pan-x')), y: Number(await c.getAttribute('data-pan-y')) };
};

test('dragging a card to the edge of the screen keeps moving the board', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  const card = (await page.locator('.card.loose').first().boundingBox())!;
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  const start = await panOf(page);
  await page.mouse.move(card.x + 30, card.y + 10);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width - 4, card.y + 10, { steps: 10 });
  await expect.poll(async () => (await panOf(page)).x).toBeLessThan(start.x - 50);
  await page.mouse.up();
});

test('a selection box at the bottom edge keeps moving the board and selecting', async ({ page }) => {
  await page.getByRole('button', { name: 'Select (V)' }).click();
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  const start = await panOf(page);
  await page.mouse.move(canvas.x + 40, canvas.y + 40);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 300, canvas.y + canvas.height - 3, { steps: 10 });
  await expect.poll(async () => (await panOf(page)).y).toBeLessThan(start.y - 50);
  // The box still starts where it was first pressed on the board, so it has grown taller than the screen.
  await expect.poll(async () => (await page.getByTestId('marquee').boundingBox())?.height ?? 0).toBeGreaterThan(canvas.height - 80);
  await page.mouse.up();
});

/** A column holding two lists (Groceries: milk, eggs / Chores: sweep), and a loose list (Ideas: paint). */
async function columnWithLists(page: import('@playwright/test').Page) {
  await clickEmpty(page);
  await add(page, 'New column');
  await page.keyboard.press('Escape');
  const col = columns(page).first();
  const listIn = async (title: string, items: string[]) => {
    await col.click({ position: { x: 20, y: 20 } });
    await add(page, 'To-do list', { stayInTitle: true });
    await page.keyboard.type(title);
    await page.keyboard.press('Enter');
    for (const [i, t] of items.entries()) {
      if (i) await page.keyboard.press('Enter');
      await page.keyboard.type(t);
    }
    await page.keyboard.press('Escape');
  };
  await listIn('Groceries', ['milk', 'eggs']);
  await listIn('Chores', ['sweep']);
  await clickEmpty(page);
  await add(page, 'To-do list', { stayInTitle: true });
  await page.keyboard.type('Ideas');
  await page.keyboard.press('Enter');
  await page.keyboard.type('paint');
  return col;
}

test('Ctrl+A again and again: the item text, the list, the column\'s lists, the whole board; Ctrl+C copies them with titles', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const col = await columnWithLists(page);
  const picked = page.locator('.todo-item.picked');
  await col.getByLabel('Item text').first().click(); // "milk"
  await page.keyboard.press('Control+a'); // the text
  await expect(picked).toHaveCount(0);
  await page.keyboard.press('Control+a'); // the list
  await expect(picked).toHaveCount(2);
  await page.keyboard.press('Control+a'); // the column's lists
  await expect(picked).toHaveCount(3);
  await page.keyboard.press('Control+c');
  const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'); // Windows line endings
  expect(copied).toBe('Groceries\n  milk\n  eggs\nChores\n  sweep');
  await page.keyboard.press('Control+a'); // the whole board
  await expect(picked).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(picked).toHaveCount(0);
});

test('press and drag from an item into the next card of the column selects across both', async ({ page }) => {
  const col = await columnWithLists(page);
  await clickEmpty(page);
  const eggs = (await col.getByLabel('Item text').nth(1).boundingBox())!;
  const sweep = (await col.getByLabel('Item text').nth(2).boundingBox())!;
  await page.mouse.move(eggs.x + 20, eggs.y + eggs.height / 2);
  await page.mouse.down();
  await page.mouse.move(sweep.x + 20, sweep.y + sweep.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.todo-item.picked')).toHaveCount(2);
  await page.keyboard.press('Delete');
  await expect(col.getByLabel('Item text')).toHaveCount(2); // milk, and a blank item left in Chores
});

/**
 * Real touches on the page (through Chrome's DevTools protocol): each step puts finger 1 at `a[i]`
 * and finger 2 at `b[i]` (screen points), both together; `a` may start a step before `b`.
 */
async function touches(page: import('@playwright/test').Page, a: [number, number][], b: [number, number][], firstAlone = 0) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: [number, number][]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  for (let i = 0; i < firstAlone; i++) await send(i ? 'touchMove' : 'touchStart', [a[i]]);
  for (let i = firstAlone; i < a.length; i++) await send(i === firstAlone ? 'touchStart' : 'touchMove', [a[i], b[i]]);
  await send('touchEnd', []);
}

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true });

  test('two fingers pinch to zoom and move together to pan', async ({ page }) => {
    const c = (await page.getByTestId('canvas').boundingBox())!;
    const m = { x: c.x + c.width / 2, y: c.y + c.height / 2 };
    const zoom = async () => Number(await page.getByTestId('canvas').getAttribute('data-zoom'));
    const before = await zoom();
    await touches(page, [[m.x - 50, m.y], [m.x - 75, m.y], [m.x - 100, m.y]], [[m.x + 50, m.y], [m.x + 75, m.y], [m.x + 100, m.y]]);
    await expect.poll(zoom).toBeCloseTo(before * 2, 1);
    const start = await panOf(page);
    await touches(page, [[m.x - 50, m.y], [m.x - 50, m.y + 40], [m.x - 50, m.y + 80]], [[m.x + 50, m.y], [m.x + 50, m.y + 40], [m.x + 50, m.y + 80]]);
    await expect.poll(async () => (await panOf(page)).y).toBeCloseTo(start.y + 80, 0);
    expect(await zoom()).toBeCloseTo(before * 2, 1);
  });

  test('a pinch that starts on a card zooms the board and leaves the card where it was', async ({ page }) => {
    await clickEmpty(page);
    await add(page, 'Note');
    await page.keyboard.press('Escape');
    const card = page.locator('.card.loose').first();
    const id = (await card.getAttribute('data-card-id'))!;
    const spot = () => page.evaluate((id) => {
      const c = JSON.parse(localStorage.getItem('note-board:v1') ?? 'null')?.board.cards[id];
      return c ? { x: c.x, y: c.y } : null;
    }, id);
    await expect.poll(spot).not.toBeNull(); // saving waits a moment
    const before = await spot();
    const b = (await card.boundingBox())!;
    const p = { x: b.x + 30, y: b.y + 10 };
    // Finger 1 presses the card and moves far enough to start dragging it; then finger 2 lands.
    await touches(
      page,
      [[p.x, p.y], [p.x + 20, p.y], [p.x + 10, p.y - 10], [p.x, p.y - 20], [p.x - 10, p.y - 30]],
      [[0, 0], [0, 0], [p.x + 200, p.y + 150], [p.x + 210, p.y + 160], [p.x + 220, p.y + 170]],
      2,
    );
    await expect.poll(async () => Number(await page.getByTestId('canvas').getAttribute('data-zoom'))).toBeGreaterThan(1);
    await expect(page.locator('.card.dragging')).toHaveCount(0);
    await page.waitForTimeout(500); // let any save land
    expect(await spot()).toEqual(before);
  });
});

test('Expand all opens everything, including cards and columns that were closed before Collapse all (owner bug report)', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'New column');
  await page.keyboard.press('Escape');
  await columns(page).first().getByRole('button', { name: 'Collapse column' }).click();
  await clickEmpty(page);
  await add(page, 'To-do list');
  await page.keyboard.press('Escape');
  await page.locator('.card.loose').first().getByRole('button', { name: 'Collapse card' }).click();
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  const toggle = page.locator('header.toolbar').getByRole('button', { name: /^(Collapse|Expand) all$/ });
  await clickEmpty(page); // nothing selected: everything
  await expect(toggle).toHaveAccessibleName('Collapse all');
  await toggle.click();
  await expect(page.locator('.card.loose:not(.collapsed), .column:not(.collapsed)')).toHaveCount(0);
  await toggle.click();
  await expect(page.locator('.card.loose.collapsed, .column.collapsed')).toHaveCount(0);
});

test('with cards selected, Collapse all / Expand all act on just those', async ({ page }) => {
  for (let i = 0; i < 2; i++) {
    await clickEmpty(page);
    await add(page, 'Note');
    await page.keyboard.press('Escape');
  }
  const [a, b] = [page.locator('.card.loose').nth(0), page.locator('.card.loose').nth(1)];
  await page.keyboard.press('Escape');
  await a.click({ position: { x: 30, y: 10 } });
  const toggle = page.locator('header.toolbar').getByRole('button', { name: /^(Collapse|Expand) all$/ });
  await expect(toggle).toHaveAttribute('title', 'Collapse the selected cards and columns');
  await toggle.click();
  await expect(a).toHaveClass(/collapsed/);
  await expect(b).not.toHaveClass(/collapsed/);
  await toggle.click();
  await expect(a).not.toHaveClass(/collapsed/);
});

test('Collapse all closes the gaps: a card under a column moves up to sit right below it', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'New column');
  await page.keyboard.press('Escape');
  const col = columns(page).first();
  for (let i = 0; i < 3; i++) {
    await col.click({ position: { x: 20, y: 20 } });
    await add(page, 'Note');
    await page.keyboard.press('Escape');
  }
  // A note dropped straight under the column.
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  const note = page.locator('.card.loose').first();
  const c = (await col.boundingBox())!;
  const n = (await note.boundingBox())!;
  await page.mouse.move(n.x + 30, n.y + 10);
  await page.mouse.down();
  await page.mouse.move(c.x + 30, c.y + c.height + 40 + 10, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.press('Escape');
  const gap = async () => (await note.boundingBox())!.y - ((await col.boundingBox())!.y + (await col.boundingBox())!.height);
  const gapBefore = await gap();
  expect((await col.boundingBox())!.height).toBeGreaterThan(300); // open, with its cards
  await clickEmpty(page); // nothing selected: everything
  await page.locator('header.toolbar').getByRole('button', { name: 'Collapse all' }).click();
  await expect.poll(async () => (await col.boundingBox())!.height).toBeLessThan(100);
  await expect.poll(gap).toBeCloseTo(gapBefore, 0);
});

test('collapsing one column with its arrow pulls the block below up, leaving no empty space', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'New column');
  await page.keyboard.press('Escape');
  const col = columns(page).first();
  for (let i = 0; i < 3; i++) {
    await col.click({ position: { x: 20, y: 20 } });
    await add(page, 'Note');
    await page.keyboard.press('Escape');
  }
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  const note = page.locator('.card.loose').first();
  const n = (await note.boundingBox())!;
  const c = (await col.boundingBox())!;
  await page.mouse.move(n.x + 30, n.y + 10);
  await page.mouse.down();
  await page.mouse.move(c.x + 30, c.y + c.height + 30, { steps: 10 });
  await page.mouse.up();
  const gap = async () => (await note.boundingBox())!.y - ((await col.boundingBox())!.y + (await col.boundingBox())!.height);
  const before = await gap();
  await col.getByRole('button', { name: 'Collapse column' }).click();
  await expect.poll(async () => (await col.boundingBox())!.height).toBeLessThan(100);
  await expect.poll(gap).toBeCloseTo(before, 0);
});
