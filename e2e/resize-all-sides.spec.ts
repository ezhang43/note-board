import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, boardPos, box, clickEmpty, columns, dragPointer, expectNoOverlaps, freshBoardEachTest, holdAndDrag, looseCards, touch } from './helpers';

// Resizing from all four sides and corners (owner request 2026-10-21, job 135).

freshBoardEachTest();

// The bottom-right corner is the older handle button; the rest are the invisible grips.
const grip = (block: Locator, dir: string) => (dir === 'se' ? block.getByRole('button', { name: 'Resize card', exact: true }) : block.locator(`[data-grip="${dir}"]`));
const center = async (l: Locator) => {
  const b = await box(l);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
/** x, y, width and height of a loose block on the board (board pixels = screen pixels at 100%). */
const rect = async (block: Locator) => ({ ...(await boardPos(block)), w: await block.evaluate((e) => (e as HTMLElement).offsetWidth), h: await block.evaluate((e) => (e as HTMLElement).offsetHeight) });
const dragGrip = async (page: Page, block: Locator, dir: string, dx: number, dy: number) => {
  const c = await center(grip(block, dir));
  await dragPointer(page, c, { x: c.x + dx, y: c.y + dy });
};

async function oneNote(page: Page) {
  await add(page, 'Note');
  await clickEmpty(page);
  return looseCards(page).first();
}

test('every edge of an open card resizes it, and the opposite edge stays where it is', async ({ page }) => {
  const note = await oneNote(page);
  // Make room around it first, so no edge runs off the board or into a limit.
  await dragGrip(page, note, 'se', 100, 100);
  const start = await rect(note);

  await dragGrip(page, note, 'e', 100, 30);
  let r = await rect(note);
  expect(r).toMatchObject({ x: start.x, y: start.y, w: start.w + 100, h: start.h });

  await dragGrip(page, note, 'w', -100, 30);
  r = await rect(note);
  expect(r).toMatchObject({ x: start.x - 100, w: start.w + 200, y: start.y, h: start.h });
  expect(r.x + r.w).toBe(start.x + start.w + 100);

  const before = await rect(note);
  await dragGrip(page, note, 's', 30, 60);
  r = await rect(note);
  expect(r).toMatchObject({ x: before.x, y: before.y, h: before.h + 60 });

  const tall = await rect(note);
  await dragGrip(page, note, 'n', 30, -60);
  r = await rect(note);
  expect(r).toMatchObject({ y: tall.y - 60, h: tall.h + 60, x: tall.x, w: tall.w });
  expect(r.y + r.h).toBe(tall.y + tall.h);
});

test('every corner resizes both of its edges', async ({ page }) => {
  const note = await oneNote(page);
  await dragGrip(page, note, 'se', 100, 100);
  for (const [dir, dx, dy, grows] of [
    ['nw', -40, -40, { x: -40, y: -40 }],
    ['ne', 40, -40, { x: 0, y: -40 }],
    ['sw', -40, 40, { x: -40, y: 0 }],
  ] as const) {
    const a = await rect(note);
    await dragGrip(page, note, dir, dx, dy);
    const b = await rect(note);
    expect(b, dir).toMatchObject({ x: a.x + grows.x, y: a.y + grows.y, w: a.w + 40, h: a.h + 40 });
  }
  const a = await rect(note);
  await dragGrip(page, note, 'se', 40, 40);
  expect(await rect(note)).toMatchObject({ x: a.x, y: a.y, w: a.w + 40, h: a.h + 40 });
});

test('the resize cursors show only on the edge and corner areas', async ({ page }) => {
  const note = await oneNote(page);
  const cursorAt = (p: { x: number; y: number }) =>
    page.evaluate(({ x, y }) => (document.elementFromPoint(x, y) ? getComputedStyle(document.elementFromPoint(x, y)!).cursor : ''), p);
  const b = await box(note);
  const cursors: Record<string, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' };
  for (const [dir, cursor] of Object.entries(cursors)) expect(await cursorAt(await center(grip(note, dir))), dir).toBe(cursor);
  expect(await cursorAt({ x: b.x + b.width - 10, y: b.y + b.height - 10 })).toBe('nwse-resize'); // the old bottom-right handle
  // Just inside the strips, the middle, the header and the text: the normal arrow (text boxes keep their I-beam).
  expect(await cursorAt({ x: b.x + 14, y: b.y + b.height / 2 })).not.toMatch(/resize/);
  expect(await cursorAt({ x: b.x + b.width / 2, y: b.y + b.height / 2 })).not.toMatch(/resize/);
  expect(await cursorAt({ x: b.x + b.width / 2, y: b.y + 18 })).toBe('default');
  // The grips are inside the outline.
  const g = await box(grip(note, 'e'));
  expect(g.x + g.width).toBeLessThanOrEqual(b.x + b.width + 0.5);
  expect(g.width).toBeLessThanOrEqual(6.5);
});

test('the grips never sit over the buttons, and a press in a grip does not start a move', async ({ page }) => {
  const note = await oneNote(page);
  await note.click();
  for (const name of ['Collapse card', 'Delete card']) {
    const c = await center(note.getByRole('button', { name }));
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.resize-grip') !== null, c);
    expect(hit, name).toBe(false);
  }
  const start = await rect(note);
  const g = await center(grip(note, 'n'));
  await dragPointer(page, g, { x: g.x + 200, y: g.y }); // sideways along the top edge: not a move (the height may ease to the grid)
  const after = await rect(note);
  expect(after.x).toBe(start.x);
  expect(after.w).toBe(start.w);
  expect(after.y + after.h).toBe(start.y + start.h);
});

/** Every control and text box inside `block` that a grip's area overlaps (a list of what is covered). */
const coveredByGrips = (block: Locator) =>
  block.evaluate((el) => {
    const rect = (e: Element) => e.getBoundingClientRect();
    const grips = [...el.querySelectorAll('.resize-grip')].filter((g) => g.closest('[data-card-id], [data-col-id]') === el);
    const controls = [...el.querySelectorAll('button, input, textarea, .tick, .item-grip, [contenteditable]')].filter(
      (c) => !c.classList.contains('resize-grip') && !c.matches('.resize-corner, .resize-edge') && c.closest('[data-card-id], [data-col-id]') === el && rect(c).width > 0,
    );
    const hits: string[] = [];
    for (const c of controls) {
      const a = rect(c);
      for (const g of grips) {
        const b = rect(g);
        const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
        // Only counts where the grip is really on top of the control at that spot.
        if (overlap) {
          const x = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
          const y = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
          if (document.elementFromPoint(x, y)?.closest('.resize-grip')) hits.push(`${(c.getAttribute('aria-label') ?? c.className) || c.tagName} under ${g.getAttribute('data-grip')}`);
        }
      }
    }
    return hits;
  });

test('the grips are never on top of a button, a tick box, an item grip or a text box', async ({ page }) => {
  // A note, a checklist with items, and an empty container, open and collapsed.
  const note = await oneNote(page);
  await note.click();
  expect(await coveredByGrips(note)).toEqual([]);
  await add(page, 'Checklist');
  await page.keyboard.type('milk');
  await page.keyboard.press('Enter');
  await page.keyboard.type('eggs');
  const list = page.locator('.card.loose[data-kind="todo"]').first();
  expect(await coveredByGrips(list)).toEqual([]);
  await clickEmpty(page);
  await add(page, 'New container');
  const col = columns(page).first();
  expect(await coveredByGrips(col)).toEqual([]);
  await add(page, 'Note');
  expect(await coveredByGrips(col)).toEqual([]);
  await col.getByRole('button', { name: 'Collapse container' }).click();
  expect(await coveredByGrips(col)).toEqual([]);
  await note.getByRole('button', { name: 'Collapse card' }).click();
  expect(await coveredByGrips(note)).toEqual([]);
  await list.click({ position: { x: 8, y: 18 } });
  await list.getByRole('button', { name: 'Collapse card' }).click();
  expect(await coveredByGrips(list)).toEqual([]);
});

test('a collapsed card resizes from all sides too (as short as its header)', async ({ page }) => {
  const note = await oneNote(page);
  await dragGrip(page, note, 'se', 100, 100);
  await note.getByRole('button', { name: 'Collapse card' }).click();
  const a = await rect(note);
  await dragGrip(page, note, 'w', -60, 0);
  expect(await rect(note)).toMatchObject({ x: a.x - 60, w: a.w + 60 });
  const b = await rect(note);
  await dragGrip(page, note, 'n', 0, -40);
  const c = await rect(note);
  expect(c.h).toBe(b.h + 40);
  expect(c.y + c.h).toBe(b.y + b.h);
  await dragGrip(page, note, 's', 0, -200);
  expect((await rect(note)).h).toBeGreaterThanOrEqual(40);
  // Expanding it gives back its open size.
  await note.getByRole('button', { name: 'Expand card' }).click();
  expect((await rect(note)).h).toBeGreaterThan(100);
});

test('dragging the left edge out: nothing moves until let go, then the neighbor on its left slides left', async ({ page }) => {
  const left = await oneNote(page);
  await add(page, 'Note');
  await clickEmpty(page);
  const right = looseCards(page).nth(1);
  // Put the second note in the same row, 40px to the right of the first.
  const l0 = await rect(left);
  const r0 = await boardPos(right);
  const rb = await box(right);
  await dragPointer(page, { x: rb.x + 30, y: rb.y + 18 }, { x: rb.x + 30 + (l0.x + l0.w + 40 - r0.x), y: rb.y + 18 + (l0.y - r0.y) });
  const leftBefore = await rect(left);
  const rightBefore = await rect(right);
  expect(leftBefore.x + leftBefore.w).toBeLessThanOrEqual(rightBefore.x);

  const c = await center(grip(right, 'w'));
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x - 160, c.y, { steps: 12 });
  // Still dragging: the right card follows the pointer, the neighbor has not moved.
  expect((await boardPos(left)).x).toBe(leftBefore.x);
  expect((await box(right)).x).toBeLessThan(rightBefore.x - 100);
  await page.mouse.up();

  const after = await rect(right);
  expect(after.x).toBeLessThan(rightBefore.x - 100);
  expect(after.x + after.w).toBe(rightBefore.x + rightBefore.w);
  expect((await boardPos(left)).x + leftBefore.w).toBeLessThanOrEqual(after.x - 10);
  expect((await boardPos(left)).y).toBe(leftBefore.y);
  await expectNoOverlaps(page);

  // One undo puts both back.
  await page.keyboard.press('Control+z');
  expect(await boardPos(left)).toEqual({ x: leftBefore.x, y: leftBefore.y });
  expect(await rect(right)).toEqual(rightBefore);
});

test('dragging the top edge up pushes the block above it up, on release', async ({ page }) => {
  await add(page, 'Note');
  await clickEmpty(page);
  const top = looseCards(page).first();
  const topBefore = await rect(top);
  await add(page, 'Note');
  await clickEmpty(page);
  const low = looseCards(page).nth(1);
  // Put the second note straight under the first.
  const lowStart = await boardPos(low);
  await dragPointer(page, { x: (await box(low)).x + 30, y: (await box(low)).y + 18 }, { x: (await box(low)).x + 30 + (topBefore.x - lowStart.x), y: (await box(low)).y + 18 + (topBefore.y + topBefore.h + 30 - lowStart.y) });
  const lowBefore = await rect(low);
  const topNow = await rect(top);
  const c = await center(grip(low, 'n'));
  await dragPointer(page, c, { x: c.x, y: c.y - 100 });
  const after = await rect(low);
  expect(after.y).toBeLessThan(lowBefore.y - 60);
  expect(after.y + after.h).toBe(lowBefore.y + lowBefore.h);
  expect((await boardPos(top)).y + topNow.h).toBeLessThanOrEqual(after.y - 10);
  expect((await boardPos(top)).x).toBe(topNow.x);
  await expectNoOverlaps(page);
});

test('a container: the left edge and the corners set the width; one with cards stays as tall as its cards', async ({ page }) => {
  await add(page, 'New container');
  await clickEmpty(page);
  const col = columns(page).first();
  // Empty: the corners also set its minimum height; the left edge only the width.
  const a = await rect(col);
  await dragGrip(page, col, 'w', -80, 40);
  expect(await rect(col)).toMatchObject({ x: a.x - 80, w: a.w + 80, h: a.h, y: a.y });
  const b = await rect(col);
  await dragGrip(page, col, 'nw', -40, -60);
  const c = await rect(col);
  expect(c).toMatchObject({ x: b.x - 40, w: b.w + 40, y: b.y - 60, h: b.h + 60 });
  expect(c.y + c.h).toBe(b.y + b.h);
  await expect(col.locator('[data-grip="n"], [data-grip="s"]')).toHaveCount(0); // no top / bottom strips on containers

  // With a card in it: as tall as its card, so the top corner moves only the width.
  await add(page, 'Note');
  await expect(col.locator('.card')).toHaveCount(1);
  await page.waitForTimeout(100);
  const d = await rect(col);
  await dragGrip(page, col, 'ne', 60, -50);
  const e = await rect(col);
  expect(e).toMatchObject({ x: d.x, y: d.y, w: d.w + 60, h: d.h });
  await dragGrip(page, col, 'sw', -40, 80);
  const f = await rect(col);
  expect(f).toMatchObject({ x: d.x - 40, y: d.y, w: e.w + 40, h: d.h });
  // Cards inside still can't be resized.
  await expect(col.locator('.card .resize-grip')).toHaveCount(0);
});

test('a collapsed container still resizes from its left edge', async ({ page }) => {
  await add(page, 'New container');
  await clickEmpty(page);
  const col = columns(page).first();
  await col.getByRole('button', { name: 'Collapse container' }).click();
  const a = await rect(col);
  await dragGrip(page, col, 'w', -60, 0);
  expect(await rect(col)).toMatchObject({ x: a.x - 60, w: a.w + 60, h: a.h });
});

test('the keyboard still resizes with the existing handles', async ({ page }) => {
  const note = await oneNote(page);
  const a = await rect(note);
  await note.getByRole('button', { name: 'Resize card' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  expect(await rect(note)).toMatchObject({ x: a.x, y: a.y, w: a.w + 20, h: a.h + 20 });
  await page.keyboard.press('Control+z');
  expect((await rect(note)).h).toBe(a.h);
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 800, height: 900 } });

  test('the thin edge and corner grips are off (the older handles stay), and the corner handle still waits for a rest', async ({ page }) => {
    const note = await oneNote(page);
    await expect(note.locator('.resize-grip').first()).toBeHidden();
    const a = await rect(note);
    const c = await center(grip(note, 'se'));
    // Moving straight away over the corner handle pans the board and resizes nothing.
    await touch(page, [
      { type: 'touchStart', p: c },
      ...Array.from({ length: 8 }, (_, i) => ({ type: 'touchMove' as const, p: { x: c.x - 10 * (i + 1), y: c.y } })),
      { type: 'touchEnd' },
    ]);
    expect(await rect(note)).toEqual(a);
    // Resting first, then moving, resizes.
    const c2 = await center(grip(note, 'se'));
    await holdAndDrag(page, c2, { x: c2.x + 60, y: c2.y });
    expect(await rect(note)).toMatchObject({ x: a.x, y: a.y, w: a.w + 60 });
  });
});
