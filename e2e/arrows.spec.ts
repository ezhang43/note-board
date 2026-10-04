import { expect, test, type Page } from '@playwright/test';
import { add, box, cards, clickEmpty, dragPointer, freshBoardEachTest, grabPoint } from './helpers';

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
  const handle = page.getByRole('button', { name: 'Draw an arrow' });
  const h = await box(handle);
  const t = await box(to);
  await dragPointer(page, { x: h.x + h.width / 2, y: h.y + h.height / 2 }, { x: t.x + t.width / 2, y: t.y + t.height / 2 });
}

test('dragging the round handle of a selected card onto another card draws an arrow between them', async ({ page }) => {
  const { second } = await twoNotes(page);
  await expect(page.getByRole('button', { name: 'Draw an arrow' })).toBeVisible();
  await connect(page, second);
  await expect(arrows(page)).toHaveCount(1);
  // Ctrl+Z takes it away again.
  await clickEmpty(page);
  await page.keyboard.press('Control+z');
  await expect(arrows(page)).toHaveCount(0);
});

test('dropping the handle on empty board draws nothing', async ({ page }) => {
  await twoNotes(page);
  const h = await box(page.getByRole('button', { name: 'Draw an arrow' }));
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
