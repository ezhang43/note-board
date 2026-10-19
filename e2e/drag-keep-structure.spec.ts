import { expect, test, type Page } from '@playwright/test';
import { boardPos, box, columns, expectNoOverlaps, freshBoardEachTest, grabPoint, looseCards } from './helpers';

// Owner decision 2026-10-19 ("Spring back + row shift"): blocks in the same row as a dragged or
// resized block slide sideways and keep their order, instead of scattering above or below the row.

freshBoardEachTest();

async function seed(page: Page, board: object) {
  await page.evaluate((b) => localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board: b })), board);
  await page.reload();
}

const column = (id: string, x: number) => ({ id, title: id, x, y: 100, w: 280, h: null, color: null, collapsed: false, cardIds: [] });
const note = (id: string, x: number) => ({ id, kind: 'note', text: id, color: null, collapsed: false, x, y: 100, w: 240, h: 160 });

test('dragging the leftmost container across a row reorders the row sideways; it stays a row', async ({ page }) => {
  const names = ['Notes', 'Tuesday', 'Ideas', 'Later'];
  await seed(page, {
    name: 'Row',
    snap: true,
    cards: {},
    columns: Object.fromEntries(names.map((n, i) => [n, column(n, 100 + i * 300)])),
    order: names,
  });
  await expect(columns(page)).toHaveCount(4);
  const col = (n: string) => page.locator(`[data-col-id="${n}"]`);
  const others = ['Tuesday', 'Ideas', 'Later'];

  const g = await grabPoint(col('Notes'));
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  for (const dx of [300, 600, 900]) {
    await page.mouse.move(g.x + dx, g.y, { steps: 10 });
    // While dragging, the others stay in the row and in their order.
    await expect.poll(async () => (await Promise.all(others.map((n) => boardPos(col(n))))).map((p) => p.y)).toEqual([100, 100, 100]);
    const xs = (await Promise.all(others.map((n) => boardPos(col(n))))).map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  }
  await page.mouse.up();

  await expect
    .poll(async () => Promise.all(['Tuesday', 'Ideas', 'Later', 'Notes'].map((n) => boardPos(col(n)))))
    .toEqual([100, 400, 700, 1000].map((x) => ({ x, y: 100 })));
  await expectNoOverlaps(page);
});

test('widening a card slides its row neighbour sideways on release; shrinking back first moves nothing',async ({ page }) => {
  await seed(page, { name: 'Row', snap: true, cards: { Tuesday: note('Tuesday', 100), Notes: note('Notes', 360) }, columns: {}, order: ['Tuesday', 'Notes'] });
  await expect(looseCards(page)).toHaveCount(2);
  const card = (n: string) => page.locator(`[data-card-id="${n}"]`);
  const h = await box(card('Tuesday').getByRole('button', { name: 'Resize card' }));
  const from = { x: h.x + h.width / 2, y: h.y + h.height / 2 };

  // Wider, then back again before letting go: nothing moves.
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 160, from.y, { steps: 8 });
  await page.mouse.move(from.x, from.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => boardPos(card('Notes'))).toEqual({ x: 360, y: 100 });

  // Wider and let go: Notes slides right in its row, not down.
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 160, from.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => card('Tuesday').evaluate((el) => (el as HTMLElement).offsetWidth)).toBe(400);
  await expect.poll(() => boardPos(card('Notes'))).toEqual({ x: 520, y: 100 });
  await expectNoOverlaps(page);
});
