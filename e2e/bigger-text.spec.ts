import { expect, test, type Locator, type Page } from '@playwright/test';
import { box, fontsLoaded, freshBoardEachTest } from './helpers';

// Bigger text steps (owner requests, 2026-10-23: "increase the font size ++ capability to be even greater", then
// "the font text size can still be increased"; picked "A+ up to 400%"): A+ goes on to 200%, 225%, 250%, 300%, 350%
// and 400%, and everything on a card or container grows with it, the Completed header and Clean up links
// included, without anything overlapping at the smallest card width.

freshBoardEachTest();

const px = (l: Locator, prop: string) => l.evaluate((el, p) => parseFloat(getComputedStyle(el).getPropertyValue(p)), prop);
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

async function seed(page: Page) {
  await page.evaluate(() => {
    const item = (id: string, text: string, done: boolean) => ({ id, text, done, children: [] as never[] });
    const base = { color: null, collapsed: false, h: null };
    const board = {
      name: 'T',
      snap: true,
      cards: {
        t1: { ...base, id: 't1', kind: 'todo', title: 'Groceries for the week', completedOpen: true, x: 100, y: 100, w: 200, items: [item('i1', 'Milk', false), item('i2', 'Bread and butter', false), item('i3', 'Eggs', true), item('i4', 'Coffee beans', true)] },
        t2: { ...base, id: 't2', kind: 'todo', title: 'Wide', completedOpen: false, x: 1400, y: 100, w: 300, items: [item('i5', 'Milk', false)] },
        l1: { ...base, id: 'l1', kind: 'link', title: 'Ideas', url: 'https://www.example.com/ideas', x: 400, y: 100, w: 200 },
        n1: { ...base, id: 'n1', kind: 'note', text: 'A note', x: 700, y: 100, w: 200, h: 160 },
        n2: { ...base, id: 'n2', kind: 'note', text: 'A collapsed note with a longer first line', x: 1000, y: 100, w: 200, h: null, collapsed: true },
      },
      columns: { c1: { id: 'c1', title: 'A container', x: 100, y: 500, w: 240, h: null, color: null, collapsed: false, cardIds: [] as string[] } },
      order: ['t1', 't2', 'l1', 'n1', 'n2', 'c1'],
    };
    localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board }));
  });
  await page.reload();
  await fontsLoaded(page);
}

async function stepTo(page: Page, name: 'Larger text' | 'Smaller text', times: number) {
  for (let i = 0; i < times; i++) await page.getByRole('button', { name }).click();
}

test('A+ goes up to 400% and the Completed header and Clean up links grow with it', async ({ page }) => {
  test.slow();
  await seed(page);
  const card = page.locator('[data-card-id="t1"]');
  const toggle = card.locator('.completed-toggle');
  const clean = card.getByRole('button', { name: 'Clean up' });
  const measure = async () => ({
    toggleFont: await px(toggle, 'font-size'),
    toggleH: (await box(toggle)).height,
    cleanFont: await px(clean, 'font-size'),
    cleanH: (await box(clean)).height,
    count: await px(card.locator('.item-text').first(), 'font-size'),
  });
  const normal = await measure();
  await stepTo(page, 'Larger text', 10); // Normal → Large → Larger → Huge → Largest → 200% → 225% → 250% → 300% → 350% → 400%
  await expect(page.getByRole('button', { name: 'Larger text' })).toHaveAttribute('aria-disabled', 'true');
  const top = await measure();
  expect(top.toggleFont / normal.toggleFont).toBeCloseTo(4, 1);
  expect(top.cleanFont / normal.cleanFont).toBeCloseTo(4, 1);
  expect(top.count / normal.count).toBeCloseTo(4, 1);
  expect(top.toggleH / normal.toggleH).toBeCloseTo(4, 1);
  expect(top.cleanH / normal.cleanH).toBeCloseTo(4, 1);
});

test('at 400% nothing overlaps or runs off a 200px card or a 240px container, at 100% zoom', async ({ page }) => {
  test.slow();
  await seed(page);
  await stepTo(page, 'Larger text', 10);
  for (const id of ['t1', 'l1', 'n1', 'n2']) {
    const card = page.locator(`[data-card-id="${id}"]`);
    await card.hover();
    const c = await box(card);
    // Every button and text field inside stays inside the card, and no two overlap.
    const parts = await card.locator('.card-header > .icon-button, .card-title, .completed-toggle, .uncheck-all, .todo-item input[type="checkbox"], .item-text, .link-url, .link-open').all();
    const boxes: { name: string; r: { x: number; y: number; width: number; height: number } }[] = [];
    for (const p of parts) {
      if (!(await p.isVisible())) continue;
      const r = await box(p);
      boxes.push({ name: (await p.getAttribute('class')) ?? '', r });
      expect(r.x, `${id} left`).toBeGreaterThanOrEqual(c.x - 1);
      expect(r.x + r.width, `${id} right: ${boxes[boxes.length - 1].name}`).toBeLessThanOrEqual(c.x + c.width + 1);
    }
    // Buttons never overlap each other or a title / the tick boxes beside them.
    const rows = boxes.filter((b) => !/item-text|link-url/.test(b.name));
    for (const [i, a] of rows.entries()) for (const b of rows.slice(i + 1)) expect(overlaps(a.r, b.r), `${id}: ${a.name} / ${b.name} ${JSON.stringify([a.r, b.r])}`).toBe(false);
  }
  // A tick box never overlaps its item's text.
  const item = page.locator('[data-card-id="t1"] [data-item-id]').first();
  const tick = await box(item.getByRole('checkbox', { name: 'Done' }));
  const text = await box(item.getByLabel('Item text'));
  const tc = await box(page.locator('[data-card-id="t1"]'));
  expect(tick.width / (tc.width / 200)).toBeCloseTo(80, 0); // 20px at Normal, times 4 (the card is 200px wide; the board may be zoomed)
  expect(tick.x + tick.width).toBeLessThanOrEqual(text.x + 0.5);
  // The item buttons (shown on hover) sit to the right of the text, clear of the tick box.
  await item.hover();
  const grip = await box(item.locator('.item-grip'));
  const trash = await box(item.locator('.item-trash'));
  expect(trash.x).toBeGreaterThanOrEqual(tick.x + tick.width - 0.5);
  expect(grip.x).toBeGreaterThanOrEqual(trash.x + trash.width - 0.5);
  expect(grip.x + grip.width).toBeLessThanOrEqual(tc.x + tc.width + 1);
  // In a 300px card the text keeps room beside the tick box and the strip (a 200px card has none left at this size: widen it).
  const wide = page.locator('[data-card-id="t2"] [data-item-id]').first();
  await wide.hover();
  const wideText = await box(wide.getByLabel('Item text'));
  expect(wideText.width).toBeGreaterThan(60);
  // The container header: title, count and buttons clear of each other.
  const col = page.locator('[data-col-id="c1"]');
  await col.hover();
  const c = await box(col);
  const title = await box(col.locator('.column-title'));
  const buttons = await col.locator('.column-actions > .icon-button').all();
  for (const b of buttons) {
    const r = await box(b);
    expect(r.x + r.width).toBeLessThanOrEqual(c.x + c.width);
    expect(r.x).toBeGreaterThanOrEqual(title.x + title.width - 0.5);
  }
});
