import { expect, test, type Locator, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// A bigger press area for a parent item's fold arrow (owner request, 2026-11-21: "it is hard to click precisely right
// on it"), and more room between the arrow and its tick box ("a bit more space between the collapse arrow and the parent
// checkbox"). The drawn arrow keeps its size; the area it can be pressed from is at least 24px tall, and reaches left over
// the indent, but never over its own tick box, the item text or the card's left resize strip.

type Item = { id: string; text: string; done: boolean; children: Item[] };
const item = (id: string, children: Item[] = []): Item => ({ id, text: `Item ${id}`, done: false, children });

async function seed(page: Page) {
  await page.evaluate((items) => {
    const base = { color: null, collapsed: false, h: null };
    const board = { name: 'T', snap: true, cards: { t1: { ...base, id: 't1', kind: 'todo', title: 'Plans', completedOpen: true, x: 100, y: 100, w: 400, items } }, columns: {}, order: ['t1'] };
    localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board }));
  }, [item('a', [item('b', [item('c'), item('c2')]), item('d')]), item('e')]);
  await page.reload();
  await fontsLoaded(page);
}

const card = (page: Page) => page.locator('[data-card-id="t1"]');
const row = (scope: Locator, id: string) => scope.locator(`[data-item-id="${id}"]`);

/** The drawn chevron's box (the path, stroke included), in page px. */
async function drawn(fold: Locator) {
  return fold.evaluate((btn) => {
    const svg = btn.querySelector('svg')!;
    const path = svg.querySelector('path')!;
    const p = path.getBoundingClientRect();
    const half = (svg.getBoundingClientRect().width / 12) * (parseFloat(getComputedStyle(path).strokeWidth) / 2);
    return { left: p.left - half, right: p.right + half, top: p.top - half, bottom: p.bottom + half, midY: (p.top + p.bottom) / 2, midX: (p.left + p.right) / 2 };
  });
}

/** Clicks at a point and says whether the fold flipped (then flips it back with the arrow itself). */
async function foldsAt(page: Page, fold: Locator, x: number, y: number) {
  const before = await fold.getAttribute('aria-expanded');
  await page.mouse.click(x, y);
  const after = await fold.getAttribute('aria-expanded');
  if (after !== before) await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', before!);
  return after !== before;
}

/** How far the drawn chevron ends from its tick box's left edge (border included). */
async function gap(scope: Locator, id: string) {
  const r = row(scope, id);
  const d = await drawn(r.locator(':scope > .item-fold'));
  const box = (await r.locator(':scope > .tick input').boundingBox())!;
  return box.x - d.right;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
});

test('the arrow folds when pressed a little beside it, and the tick box and text keep their presses (board)', async ({ page }) => {
  await seed(page);
  // A sub-item's arrow: 9px left of it, and 8px above and below it.
  const sub = row(card(page), 'b').locator(':scope > .item-fold');
  const s = await drawn(sub);
  expect(await foldsAt(page, sub, s.left - 9, s.midY)).toBe(true);
  expect(await foldsAt(page, sub, s.midX, s.top - 8)).toBe(true);
  expect(await foldsAt(page, sub, s.midX, s.bottom + 8)).toBe(true);
  // A top-level arrow: above and below it too, but never outside the card.
  const top = row(card(page), 'a').locator(':scope > .item-fold');
  const t = await drawn(top);
  expect(await foldsAt(page, top, t.midX, t.top - 8)).toBe(true);
  expect(await foldsAt(page, top, t.midX, t.bottom + 8)).toBe(true);
  const cardLeft = (await card(page).boundingBox())!.x;
  const outside = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.item-fold'), [cardLeft - 2, t.midY]);
  expect(outside).toBe(false);

  // The tick box still ticks (and doesn't fold), from its left edge too.
  const tick = row(card(page), 'b').locator(':scope > .tick input');
  const tb = (await tick.boundingBox())!;
  await page.mouse.click(tb.x + 1, tb.y + tb.height / 2);
  await expect(tick).toBeChecked();
  await expect(sub).toHaveAttribute('aria-expanded', 'true');
  await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await expect(tick).not.toBeChecked();

  // The text still takes the cursor.
  const text = row(card(page), 'b').locator(':scope textarea').first();
  const xb = (await text.boundingBox())!;
  await page.mouse.click(xb.x + 4, xb.y + xb.height / 2);
  await expect(text).toBeFocused();
  await expect(sub).toHaveAttribute('aria-expanded', 'true');
});

test('a parent item\'s arrow sits about 9px clear of its tick box, top-level and sub-item (board)', async ({ page }) => {
  await seed(page);
  for (const id of ['a', 'b']) {
    const g = await gap(card(page), id);
    expect(g, id).toBeGreaterThan(8.4);
    expect(g, id).toBeLessThan(9.6);
  }
});

test('in the Main checklist the arrow folds when pressed beside it, and sits about 9px clear of its tick box', async ({ page }) => {
  await page.locator('.corner-controls').getByRole('button', { name: 'Checklist', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Checklist', exact: true });
  await expect(panel).toBeVisible();
  for (const [i, [t, key]] of ([['Groceries', null], ['Dairy', 'Tab'], ['skim milk', 'Tab'], ['eggs', null], ['Bread', 'Shift+Tab']] as const).entries()) {
    if (i) await page.keyboard.press('Enter');
    if (key) await page.keyboard.press(key);
    await page.keyboard.type(t);
  }
  const folds = panel.locator('.item-fold');
  await expect(folds).toHaveCount(2);
  const sub = folds.nth(1);
  const s = await drawn(sub);
  expect(await foldsAt(page, sub, s.left - 9, s.midY)).toBe(true);
  expect(await foldsAt(page, sub, s.midX, s.top - 8)).toBe(true);
  expect(await foldsAt(page, sub, s.midX, s.bottom + 8)).toBe(true);
  const top = folds.nth(0);
  const t = await drawn(top);
  expect(await foldsAt(page, top, t.midX, t.bottom + 8)).toBe(true);
  for (const r of await panel.locator('.todo-item:has(> .item-fold)').all()) {
    const d = await drawn(r.locator(':scope > .item-fold'));
    const box = (await r.locator(':scope > .tick input').boundingBox())!;
    expect(box.x - d.right).toBeGreaterThan(8.4);
    expect(box.x - d.right).toBeLessThan(9.6);
  }
});
