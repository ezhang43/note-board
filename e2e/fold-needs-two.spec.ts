import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Owner request 2026-11-11: nested sub-checklist items need 2 or more direct sub-items to collapse.
// Owner decision 2026-11-23: top-level parent items can always collapse as long as they have at least 1 sub-item
// (everywhere: both board checklists and the Main checklist), while nested sub-items still require 2 or more.
// A fold saved on a nested parent with one sub-item shows that sub-item and no arrow (the saved data is not
// rewritten). The done count is unchanged. The list's extra left room for top-level arrows (has-fold) applies
// whenever any top-level parent has at least 1 sub-item.

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

test('top-level with 1 sub-item shows arrow and folds (click + Ctrl+Up/Down); nested with 1 sub-item has no arrow', async ({ page }) => {
  await seed(page, [item('trip', [item('fl', [item('seat', [], false, true)])], false)]);
  await expect(fold(page, 'trip')).toHaveCount(1);
  await expect(fold(page, 'fl')).toHaveCount(0);
  await expect(row(page, 'trip').locator('.item-count')).toHaveText('1/2'); // counts everything under it
  await expect(card(page).locator('.todo-items')).toHaveClass(/has-fold/);

  // Click folds and unfolds the top-level parent with 1 sub-item.
  await fold(page, 'trip').click();
  await expect(row(page, 'fl')).toHaveCount(0);
  await expect(row(page, 'seat')).toHaveCount(0);
  await expect(fold(page, 'trip')).toHaveAttribute('aria-expanded', 'false');
  await fold(page, 'trip').click();
  await expect(row(page, 'fl')).toBeVisible();
  await expect(row(page, 'seat')).toBeVisible();

  // Ctrl+Up / Ctrl+Down fold and unfold the top-level parent with 1 sub-item.
  await text(page, 'trip').click();
  await page.keyboard.press('Control+ArrowUp');
  await expect(row(page, 'fl')).toHaveCount(0);
  await page.keyboard.press('Control+ArrowDown');
  await expect(row(page, 'fl')).toBeVisible();
});

test('nested parent with 1 sub-item saved folded is shown open, with no arrow, and the save is left as it was', async ({ page }) => {
  await seed(page, [item('trip', [item('fl', [item('seat')], true), item('ho')])]);
  await expect(row(page, 'seat')).toBeVisible();
  await expect(fold(page, 'fl')).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('note-board:v1')!).board.cards.t1.items[0].children[0].folded);
  expect(saved).toBe(true);
  // Ctrl+Up on the nested parent with 1 sub-item has nothing to fold: the key is left to the browser.
  await text(page, 'fl').click();
  await page.keyboard.press('Control+ArrowUp');
  await expect(row(page, 'seat')).toBeVisible();
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

test('the list gives its boxes room as soon as a top-level parent has 1 sub-item', async ({ page }) => {
  await seed(page, [item('a'), item('b')]);
  await expect(card(page).locator('.todo-items')).not.toHaveClass(/has-fold/);
  const without = await tickX(page, 'a');
  await seed(page, [item('a', [item('a1')]), item('b')]);
  await expect(card(page).locator('.todo-items')).toHaveClass(/has-fold/);
  expect(await tickX(page, 'a')).toBeGreaterThan(without + 1);
});

test('nested parent going from 1 sub-item to 2 brings its arrow, and back to 1 takes it away', async ({ page }) => {
  await seed(page, [item('trip', [item('fl', [item('s1')])])]);
  await expect(fold(page, 'trip')).toHaveCount(1);
  await expect(fold(page, 'fl')).toHaveCount(0);
  await text(page, 's1').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter'); // a second sub-item under nested `fl`
  await page.keyboard.type('s2');
  await expect(fold(page, 'fl')).toHaveCount(1);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace'); // the empty second sub-item goes
  await expect(card(page).locator('[data-item-id]')).toHaveCount(3);
  await expect(fold(page, 'fl')).toHaveCount(0);
  await expect(fold(page, 'trip')).toHaveCount(1);
});

test('a top-level parent saved folded with 1 sub-item stays folded and hides its sub-item', async ({ page }) => {
  await seed(page, [item('trip', [item('fl')], true), item('milk')]);
  await expect(fold(page, 'trip')).toHaveAttribute('aria-expanded', 'false');
  await expect(row(page, 'fl')).toHaveCount(0);
  await expect(row(page, 'milk')).toBeVisible();
});

test('Main checklist: top-level with 1 sub-item folds; nested needs 2', async ({ page }) => {
  await page.locator('.corner-controls').getByRole('button', { name: 'Checklist', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Checklist', exact: true });
  await expect(panel).toBeVisible();
  await page.keyboard.type('Errands');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Post office');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Stamps');

  // Top-level "Errands" has 1 sub-item -> has arrow; nested "Post office" has 1 sub-item -> no arrow.
  const rows = panel.locator('.todo-item');
  await expect(panel.locator('.todo-items')).toHaveClass(/has-fold/);
  await expect(rows.nth(0).locator('.item-fold')).toHaveCount(1);
  await expect(rows.nth(1).locator('.item-fold')).toHaveCount(0);

  // Fold and unfold top-level "Errands" via click.
  await rows.nth(0).locator('.item-fold').click();
  await expect(rows).toHaveCount(1);
  await rows.nth(0).locator('.item-fold').click();
  await expect(rows).toHaveCount(3);

  // Add a second sub-item under nested "Post office" -> now nested gets an arrow and folds.
  await rows.nth(2).locator('textarea').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Envelopes');
  await expect(rows.nth(1).locator('.item-fold')).toHaveCount(1);
  await rows.nth(1).locator('.item-fold').click();
  await expect(rows).toHaveCount(2);
});
