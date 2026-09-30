import { expect, test } from '@playwright/test';
import {
  add,
  boardPos,
  box,
  clickEmpty,
  columns,
  dragBy,
  dragPointer,
  expectNoOverlaps,
  freshBoardEachTest,
  grabPoint,
  looseCards,
} from './helpers';

// Step 3: no-overlap layout, resizing, size matching and snap-to-grid realignment.

freshBoardEachTest();

/** Two loose notes side by side: returns [first, second]. */
async function twoNotes(page: import('@playwright/test').Page) {
  await add(page, 'Note');
  await clickEmpty(page);
  await add(page, 'Note');
  await clickEmpty(page);
  await expect(looseCards(page)).toHaveCount(2);
  return [looseCards(page).nth(0), looseCards(page).nth(1)] as const;
}

test('dragging onto another block shows a dashed landing spot, and the drop lands there', async ({ page }) => {
  const [a, b] = await twoNotes(page);
  const target = await box(a);
  const g = await grabPoint(b);
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  await page.mouse.move(target.x + 40, target.y + 30, { steps: 12 });
  const spot = page.getByTestId('landing-spot');
  await expect(spot).toBeVisible();
  const spotBox = await box(spot);
  await page.mouse.up();
  await expect(spot).toHaveCount(0);
  await expectNoOverlaps(page);
  const landed = await box(b);
  expect(Math.round(landed.x)).toBe(Math.round(spotBox.x));
  expect(Math.round(landed.y)).toBe(Math.round(spotBox.y));
});

test('no landing spot is shown when the spot under the block is already free', async ({ page }) => {
  await add(page, 'Note');
  const note = looseCards(page).first();
  const g = await grabPoint(note);
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  await page.mouse.move(g.x + 300, g.y + 200, { steps: 8 });
  await expect(page.getByTestId('landing-spot')).toHaveCount(0);
  await page.mouse.up();
});

test('resizing a loose card from its corner snaps to the grid and shows the size', async ({ page }) => {
  await add(page, 'Note');
  const note = looseCards(page).first();
  const handle = note.getByRole('button', { name: 'Resize card' });
  const h = await box(handle);
  await page.mouse.move(h.x + 9, h.y + 9);
  await page.mouse.down();
  await page.mouse.move(h.x + 9 + 93, h.y + 9 + 67, { steps: 10 });
  const label = page.getByTestId('size-label');
  await expect(label).toHaveText(/^\d+ × \d+$/);
  await page.mouse.up();
  await expect(label).toHaveCount(0);

  const size = await note.evaluate((el) => ({ w: (el as HTMLElement).offsetWidth, h: (el as HTMLElement).offsetHeight }));
  expect(size.w % 20).toBe(0);
  expect(size.w).toBeGreaterThan(300);
  expect(size.h % 20).toBe(0);

  // Content taller than the set height still grows the card.
  await note.getByLabel('Note text').fill(Array(30).fill('line').join('\n'));
  await expect.poll(async () => note.evaluate((el) => (el as HTMLElement).offsetHeight)).toBeGreaterThan(size.h + 100);

  // Kept after reload.
  await page.reload();
  expect(await looseCards(page).first().evaluate((el) => (el as HTMLElement).offsetWidth)).toBe(size.w);
});

test('within 8px of another block, the size matches it and both show dashed outlines', async ({ page }) => {
  const [a, b] = await twoNotes(page);
  // Make the first note 320 wide.
  const ha = await box(a.getByRole('button', { name: 'Resize card' }));
  await dragPointer(page, { x: ha.x + 9, y: ha.y + 9 }, { x: ha.x + 9 + 80, y: ha.y + 9 });
  expect(await a.evaluate((el) => (el as HTMLElement).offsetWidth)).toBe(320);

  // Resize the second to just short of 320.
  const hb = await box(b.getByRole('button', { name: 'Resize card' }));
  await page.mouse.move(hb.x + 9, hb.y + 9);
  await page.mouse.down();
  await page.mouse.move(hb.x + 9 + 74, hb.y + 9, { steps: 10 });
  await expect(page.getByTestId('size-label')).toContainText(/same width( & height)? as 1 block/);
  await expect(page.getByTestId('size-label')).toContainText('320 ×');
  await expect(a).toHaveClass(/size-match/);
  await page.mouse.up();
  await expect(a).not.toHaveClass(/size-match/);
  expect(await b.evaluate((el) => (el as HTMLElement).offsetWidth)).toBe(320);
  await expectNoOverlaps(page);
});

test('column edge sets width only and the cards inside follow; corner sets minimum height', async ({ page }) => {
  await add(page, 'New column');
  const col = columns(page).first();
  await add(page, 'Note');
  const card = col.locator('[data-card-id]').first();
  await expect(card.getByRole('button', { name: 'Resize card' })).toHaveCount(0); // cards in columns can't be resized

  const edge = await box(col.getByRole('button', { name: 'Resize column width' }));
  const h0 = await col.evaluate((el) => (el as HTMLElement).offsetHeight);
  await dragPointer(page, { x: edge.x + 5, y: edge.y + 20 }, { x: edge.x + 5 + 100, y: edge.y + 60 });
  const w = await col.evaluate((el) => (el as HTMLElement).offsetWidth);
  expect(w).toBe(380);
  expect(await col.evaluate((el) => (el as HTMLElement).offsetHeight)).toBe(h0);
  expect(await card.evaluate((el) => (el as HTMLElement).offsetWidth)).toBe(w - 32 - 2);

  const corner = await box(col.getByRole('button', { name: 'Resize column', exact: true }));
  await dragPointer(page, { x: corner.x + 9, y: corner.y + 9 }, { x: corner.x + 9, y: corner.y + 9 + 200 });
  expect(await col.evaluate((el) => (el as HTMLElement).offsetHeight)).toBeGreaterThan(h0 + 150);
});

test('a note growing as you type pushes the block under it out of the way', async ({ page }) => {
  await add(page, 'Note');
  const top = looseCards(page).first();
  await clickEmpty(page);
  await add(page, 'Link');
  const other = looseCards(page).nth(1);
  // Put the link just below the note.
  const t = await box(top);
  const g = await grabPoint(other);
  const o = await box(other);
  await dragPointer(page, g, { x: t.x + (g.x - o.x), y: t.y + t.height + 20 + (g.y - o.y) });
  await expectNoOverlaps(page);
  const before = await boardPos(other);

  await top.getByLabel('Note text').fill(Array(20).fill('growing').join('\n'));
  await expect.poll(async () => (await boardPos(other)).y !== before.y || (await boardPos(other)).x !== before.x).toBe(true);
  await expectNoOverlaps(page);
});

test('adding cards to a column pushes a loose card below it out of the way', async ({ page }) => {
  await add(page, 'New column');
  const col = columns(page).first();
  await clickEmpty(page);
  await add(page, 'Link');
  const link = looseCards(page).first();
  const c = await box(col);
  const g = await grabPoint(link);
  const l = await box(link);
  await dragPointer(page, g, { x: c.x + (g.x - l.x), y: c.y + c.height + 80 + (g.y - l.y) });
  await expectNoOverlaps(page);

  await col.click({ position: { x: 200, y: 26 } });
  for (let i = 0; i < 4; i++) {
    await add(page, 'Note');
    await col.click({ position: { x: 200, y: 26 } });
  }
  await expect(col.locator('[data-card-id]')).toHaveCount(4);
  await expect.poll(async () => {
    const a = await box(col);
    const b = await box(link);
    return b.y >= a.y + a.height + 9 || b.x >= a.x + a.width + 9 || b.x + b.width + 9 <= a.x || b.y + b.height + 9 <= a.y;
  }).toBe(true);
  await expectNoOverlaps(page);
});

test('with snap off moves are free; turning snap back on lines everything up on the grid', async ({ page }) => {
  await add(page, 'Note');
  const note = looseCards(page).first();
  await page.getByRole('button', { name: 'Snap to grid' }).click();
  await dragBy(page, note, 37, 23);
  const off = await boardPos(note);
  expect(off.x % 20 !== 0 || off.y % 20 !== 0).toBe(true);

  const h = await box(note.getByRole('button', { name: 'Resize card' }));
  await dragPointer(page, { x: h.x + 9, y: h.y + 9 }, { x: h.x + 9 + 47, y: h.y + 9 + 33 });
  expect((await note.evaluate((el) => (el as HTMLElement).offsetWidth)) % 20).not.toBe(0);

  await page.getByRole('button', { name: 'Snap to grid' }).click();
  const on = await boardPos(note);
  expect(Math.abs(on.x % 20)).toBe(0);
  expect(Math.abs(on.y % 20)).toBe(0);
  expect((await note.evaluate((el) => (el as HTMLElement).offsetWidth)) % 20).toBe(0);
});

test('saved boards with overlapping blocks are tidied on load', async ({ page }) => {
  await page.evaluate(() => {
    const card = (id: string) => ({ id, kind: 'note', text: id, color: 'butter', collapsed: false, x: 100, y: 100, w: null, h: null });
    localStorage.setItem(
      'note-board:v1',
      JSON.stringify({
        version: 2,
        board: { name: 'Messy', snap: true, cards: { a: card('a'), b: card('b'), c: card('c') }, columns: {}, order: ['a', 'b', 'c'] },
      }),
    );
  });
  await page.reload();
  await expect(looseCards(page)).toHaveCount(3);
  await expect.poll(async () => {
    const ps = await Promise.all((await looseCards(page).all()).map(boardPos));
    return new Set(ps.map((p) => `${p.x},${p.y}`)).size;
  }).toBe(3);
  await expectNoOverlaps(page);
});
