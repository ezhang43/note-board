import { expect, test, type Page } from '@playwright/test';
import { add, box, cards, clickEmpty, dragPointer, freshBoardEachTest, grabPoint, tooClose } from './helpers';

// Arrows between cards and columns (owner request, 2026-10-05).

freshBoardEachTest();

const arrows = (page: Page) => page.locator('[data-arrow-id]');

/** Two notes side by side, 160px apart, the first one selected. */
async function twoNotes(page: Page) {
  await add(page, 'Note');
  const id = await page.locator('.card.selected').getAttribute('data-card-id');
  const first = page.locator(`[data-card-id="${id}"]`);
  await add(page, 'Note');
  const second = page.locator(`[data-card-id]:not([data-card-id="${id}"])`);
  await clickEmpty(page);
  const a = await box(first);
  const from = await grabPoint(second);
  const b = await box(second);
  await dragPointer(page, from, { x: from.x + (a.x + a.width + 160 - b.x), y: from.y + (a.y - b.y) });
  await clickEmpty(page);
  const p = await grabPoint(first);
  await page.mouse.click(p.x, p.y);
  await expect(first).toHaveClass(/selected/);
  return { first, second };
}

/** Click the middle of the (only) arrow. A level line has no height, which Playwright counts as hidden. */
async function clickArrow(page: Page) {
  const r = await arrows(page).locator('.arrow-hit').evaluate((el) => el.getBoundingClientRect().toJSON());
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}

async function connect(page: Page, to: ReturnType<typeof cards>) {
  const handle = page.getByRole('button', { name: 'Draw an arrow from the right' });
  const h = await box(handle);
  const t = await box(to);
  await dragPointer(page, { x: h.x + h.width / 2, y: h.y + h.height / 2 }, { x: t.x + t.width / 2, y: t.y + t.height / 2 });
}

test('dragging the right-hand dot of a selected card onto another card draws an arrow between them', async ({ page }) => {
  const { second } = await twoNotes(page);
  await expect(page.getByRole('button', { name: 'Draw an arrow from the right' })).toBeVisible();
  await connect(page, second);
  await expect(arrows(page)).toHaveCount(1);
  // Ctrl+Z takes it away again.
  await clickEmpty(page);
  await page.keyboard.press('Control+z');
  await expect(arrows(page)).toHaveCount(0);
});

test('dropping a dot on empty board draws nothing', async ({ page }) => {
  await twoNotes(page);
  const h = await box(page.getByRole('button', { name: 'Draw an arrow from the right' }));
  await dragPointer(page, { x: h.x + h.width / 2, y: h.y + h.height / 2 }, { x: h.x + 30, y: h.y + 250 });
  await expect(arrows(page)).toHaveCount(0);
});

test('clicking an arrow selects it; Delete, or its × button, removes it', async ({ page }) => {
  const { second } = await twoNotes(page);
  await connect(page, second);
  await clickEmpty(page);
  await clickArrow(page);
  await expect(arrows(page)).toHaveClass(/selected/);
  await page.keyboard.press('Delete');
  await expect(arrows(page)).toHaveCount(0);
  await expect(cards(page)).toHaveCount(2);

  await page.keyboard.press('Control+z');
  await clickArrow(page);
  await page.getByRole('button', { name: 'Delete arrow' }).click();
  await expect(arrows(page)).toHaveCount(0);
});

test('an arrow follows its cards when one is moved, and goes when a card is deleted', async ({ page }) => {
  const { first, second } = await twoNotes(page);
  await connect(page, second);
  await clickEmpty(page);
  const before = await box(arrows(page));
  const p = await grabPoint(second);
  await dragPointer(page, p, { x: p.x, y: p.y + 200 });
  await expect.poll(async () => (await box(arrows(page))).height).toBeGreaterThan(before.height + 50);

  const g = await grabPoint(first);
  await page.mouse.click(g.x, g.y);
  await page.keyboard.press('Delete');
  await expect(arrows(page)).toHaveCount(0);
});

test('cards whose saved ids hold odd characters still get their arrow, without errors', async ({ page }) => {
  await twoNotes(page);
  const saved = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
    const board = raw.boards[raw.home];
    const [a, b] = board.order;
    const odd = 'odd"]\id';
    board.cards[odd] = { ...board.cards[a], id: odd };
    delete board.cards[a];
    board.order = [odd, b];
    board.arrows = [{ id: 'x1', from: odd, to: b }];
    return JSON.stringify(raw);
  });
  // Put in before the app starts (it saves its own board as the page closes).
  await page.addInitScript((raw) => localStorage.setItem('note-board:v1', raw), saved);
  await page.reload();
  await expect(cards(page)).toHaveCount(2);
  await expect(arrows(page)).toHaveCount(1);
});

test('dots never sit on top of another card or a column title (owner request)', async ({ page }) => {
  await add(page, 'New column');
  const col = page.locator('[data-col-id]');
  await add(page, 'Note');
  const g = await grabPoint(col);
  await page.mouse.click(g.x, g.y);
  await add(page, 'Note');
  const inCol = col.locator('[data-card-id]');
  await expect(inCol).toHaveCount(2);
  await clickEmpty(page);

  const header = await box(col.locator('.column-header'));
  for (const i of [0, 1]) {
    const c = await box(inCol.nth(i));
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    // The side dots stay, so an arrow can still be drawn from a card in a column.
    await expect(page.getByRole('button', { name: 'Draw an arrow from the right' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Draw an arrow from the left' })).toBeVisible();
    // The top dot would lie on the column title (first card) or on the card above (second card).
    await expect(page.getByRole('button', { name: 'Draw an arrow from the top' })).toHaveCount(0);
    const others = [header, await box(inCol.nth(1 - i))];
    for (const d of await page.locator('.arrow-dot').all()) {
      const r = await box(d);
      for (const o of others) expect(tooClose(r, o)).toBe(false);
    }
  }
});

test('dots are small and quiet until the pointer is on one (owner request)', async ({ page }) => {
  await add(page, 'Note');
  const dot = page.getByRole('button', { name: 'Draw an arrow from the right' });
  const look = () =>
    dot.evaluate((el) => {
      const s = getComputedStyle(el);
      return { w: el.getBoundingClientRect().width, border: s.borderTopColor, bg: s.backgroundColor };
    });
  const accent = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.color = 'var(--accent)';
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  const quiet = await look();
  expect(quiet.w).toBeLessThanOrEqual(10);
  expect(quiet.border).not.toBe(accent);
  const r = await box(dot);
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await expect.poll(async () => (await look()).bg).toBe(accent);
});
