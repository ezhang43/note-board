import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Owner request 2026-11-11: "for sub-checklist items, the collapse button should only be there if there are 2 or more
// items. a sub-checklist item with only one item doesn't need the ability to collapse." The fold arrow shows only on a
// parent with 2 or more direct sub-items, at every level. A fold saved on a parent with one sub-item shows that
// sub-item and no arrow (the saved data is not rewritten). The done count is unchanged. The list's extra left room
// for top-level arrows (has-fold) follows the same rule.

type Item = { id: string; text: string; done: boolean; children: Item[]; folded?: true };
const item = (id: string, children: Item[] = [], folded = false, done = false): Item => ({ id, text: id, done, children, ...(folded ? { folded: true as const } : {}) });

async function seed(page: Page, items: Item[]) {
  await page.evaluate((items) => {
    const base = { color: null, collapsed: false, h: null };
    const board = { name: 'T', snap: true, cards: { t1: { ...base, id: 't1', kind: 'todo', title: 'Plans', completedOpen: true, x: 100, y: 100, w: 400, items } }, columns: {}, order: ['t1'] };
    localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board }));
  }, items);
  await page.reload();
  await fontsLoaded(page);
}

const card = (page: Page) => page.locator('[data-card-id="t1"]');
const row = (page: Page, id: string) => card(page).locator(`[data-item-id="${id}"]`);
const fold = (page: Page, id: string) => row(page, id).locator('.item-fold');
const text = (page: Page, id: string) => row(page, id).locator('textarea').first();
const tickX = async (page: Page, id: string) => (await row(page, id).locator('input[type="checkbox"]').first().boundingBox())!.x;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
});

test('one sub-item: no arrow, at the top level and nested; its count still shows', async ({ page }) => {
  await seed(page, [item('trip', [item('fl', [item('seat', [], false, true)])], false)]);
  await expect(fold(page, 'trip')).toHaveCount(0);
  await expect(fold(page, 'fl')).toHaveCount(0);
  await expect(row(page, 'trip').locator('.item-count')).toHaveText('1/2'); // counts everything under it
  await expect(card(page).locator('.todo-items')).not.toHaveClass(/has-fold/);
});

test('one sub-item that was saved folded is shown, with no arrow, and the save is left as it was', async ({ page }) => {
  await seed(page, [item('trip', [item('fl')], true), item('milk')]);
  await expect(row(page, 'fl')).toBeVisible();
  await expect(fold(page, 'trip')).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('note-board:v1')!).board.cards.t1.items[0].folded);
  expect(saved).toBe(true);
  // Ctrl+Up has nothing to fold: the key is left to the browser.
  await text(page, 'trip').click();
  await page.keyboard.press('Control+ArrowUp');
  await expect(row(page, 'fl')).toBeVisible();
});

test('two sub-items: the arrow is there, at the top level and nested, and it folds', async ({ page }) => {
  await seed(page, [item('trip', [item('fl', [item('s1'), item('s2')]), item('ho')])]);
  await expect(fold(page, 'trip')).toHaveCount(1);
  await expect(fold(page, 'fl')).toHaveCount(1);
  await expect(card(page).locator('.todo-items')).toHaveClass(/has-fold/);
  await fold(page, 'fl').click();
  await expect(row(page, 's1')).toHaveCount(0);
  await expect(row(page, 'ho')).toBeVisible();
});

test('a parent whose sub-items have two but is itself one-in-one gets no arrow and no extra room', async ({ page }) => {
  const plain = [item('a', [item('b', [item('c'), item('d')])])];
  await seed(page, plain);
  await expect(fold(page, 'a')).toHaveCount(0);
  await expect(fold(page, 'b')).toHaveCount(1);
  await expect(card(page).locator('.todo-items')).not.toHaveClass(/has-fold/); // only top-level parents need the room
});

test('the list gives its boxes room only when a top-level parent has two sub-items', async ({ page }) => {
  await seed(page, [item('a', [item('a1')]), item('b')]);
  const without = await tickX(page, 'a');
  await seed(page, [item('a', [item('a1'), item('a2')]), item('b')]);
  expect(await tickX(page, 'a')).toBeGreaterThan(without + 1);
});

test('going from one sub-item to two brings the arrow, and back to one takes it away', async ({ page }) => {
  await seed(page, [item('trip', [item('fl')])]);
  await expect(fold(page, 'trip')).toHaveCount(0);
  const x1 = await tickX(page, 'trip');
  await text(page, 'fl').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter'); // a second sub-item
  await page.keyboard.type('ho');
  await expect(fold(page, 'trip')).toHaveCount(1);
  expect(await tickX(page, 'trip')).toBeGreaterThan(x1 + 1);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace'); // the empty second sub-item goes
  await expect(card(page).locator('[data-item-id]')).toHaveCount(2);
  await expect(fold(page, 'trip')).toHaveCount(0);
  expect(await tickX(page, 'trip')).toBeCloseTo(x1, 0);
});

test('a parent folded with two sub-items stays folded while it has two; the sub-items it hides are not shown', async ({ page }) => {
  await seed(page, [item('trip', [item('fl'), item('ho')], true)]);
  await expect(fold(page, 'trip')).toHaveAttribute('aria-expanded', 'false');
  await expect(row(page, 'fl')).toHaveCount(0);
});
