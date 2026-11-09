import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Folding a parent item's sub-items (owner request, 2026-11-09). A small arrow just left of a parent item's
// tick box hides or shows its sub-items. The fold is saved with the board (it survives a reload) and Ctrl+Z
// undoes it; a folded item keeps its "1/3" done count. Ctrl+Up / Ctrl+Down while typing in it fold and unfold it.

type Item = { id: string; text: string; done: boolean; children: Item[]; folded?: true };
const item = (id: string, text: string, done = false, children: Item[] = [], folded = false): Item => ({ id, text, done, children, ...(folded ? { folded: true as const } : {}) });

const list = (folded = false) => [
  item('trip', 'Trip', false, [item('fl', 'Flights', true), item('ho', 'Hotel'), item('ca', 'Car')], folded),
  item('milk', 'Milk'),
];

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
const fold = (page: Page, id: string) => row(page, id).locator('.item-fold').first();
const text = (page: Page, id: string) => row(page, id).locator('textarea').first();
/** The first item's saved fold, as in localStorage (null when not saved). */
const savedFold = (page: Page) =>
  page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1') ?? 'null');
    const boards = Object.values((raw?.boards ?? { one: raw?.board }) as Record<string, { cards: Record<string, { items?: { folded?: unknown }[] }> }>);
    const t1 = boards.find((b) => b?.cards?.t1)?.cards.t1;
    const first = t1?.items?.[0];
    return first && 'folded' in first ? first.folded : null;
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
});

test('the arrow hides and shows the sub-items; the done count stays; it is a real button that says whether it is open', async ({ page }) => {
  await seed(page, list());
  // Only an item with sub-items has the arrow.
  await expect(row(page, 'milk').locator('.item-fold')).toHaveCount(0);
  await expect(row(page, 'fl').locator('.item-fold')).toHaveCount(0);
  const arrow = fold(page, 'trip');
  await expect(arrow).toHaveAttribute('aria-expanded', 'true');
  await expect(arrow).toHaveAccessibleName('Hide sub-items');
  expect(await arrow.evaluate((el) => el.tagName)).toBe('BUTTON');
  // It sits just left of the tick box.
  const a = (await arrow.boundingBox())!;
  const tick = (await row(page, 'trip').locator('input[type="checkbox"]').first().boundingBox())!;
  expect(a.x + a.width).toBeLessThanOrEqual(tick.x + 2);
  expect(tick.x - (a.x + a.width)).toBeLessThan(8);

  await arrow.click();
  await expect(row(page, 'fl')).toHaveCount(0);
  await expect(row(page, 'ho')).toHaveCount(0);
  await expect(row(page, 'milk')).toBeVisible();
  await expect(arrow).toHaveAttribute('aria-expanded', 'false');
  await expect(arrow).toHaveAccessibleName('Show sub-items');
  await expect(row(page, 'trip').locator('.item-count')).toHaveText('1/3');
  await expect(card(page).locator('.title-count')).toHaveText('1/5');

  await arrow.click();
  await expect(row(page, 'ho')).toBeVisible();
});

test('the fold is saved: it is still folded after a reload, and an open item saves no fold', async ({ page }) => {
  await seed(page, list());
  await fold(page, 'trip').click();
  await expect.poll(() => savedFold(page)).toBe(true);
  await page.reload();
  await fontsLoaded(page);
  await expect(row(page, 'trip')).toBeVisible();
  await expect(row(page, 'ho')).toHaveCount(0);
  await fold(page, 'trip').click();
  await expect.poll(() => savedFold(page)).toBeNull();
});

test('Ctrl+Z undoes a fold, and Ctrl+Y redoes it', async ({ page }) => {
  await seed(page, list());
  await fold(page, 'trip').click();
  await expect(row(page, 'ho')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(row(page, 'ho')).toBeVisible();
  await page.keyboard.press('Control+y');
  await expect(row(page, 'ho')).toHaveCount(0);
});

test('Ctrl+Up folds and Ctrl+Down unfolds the item being typed in; the cursor stays in it', async ({ page }) => {
  await seed(page, list());
  await text(page, 'trip').click();
  await page.keyboard.press('Control+ArrowUp');
  await expect(row(page, 'ho')).toHaveCount(0);
  await expect(text(page, 'trip')).toBeFocused();
  await page.keyboard.press('Control+ArrowDown');
  await expect(row(page, 'ho')).toBeVisible();
  await expect(text(page, 'trip')).toBeFocused();
});

/** Presses `key` in the focused text and says whether the app blocked the browser's own use of it. */
async function blocked(page: Page, key: string) {
  await page.evaluate(() => {
    const w = window as unknown as { lastKey?: KeyboardEvent; watching?: boolean };
    w.lastKey = undefined;
    if (!w.watching) window.addEventListener('keydown', (e) => e.key.startsWith('Arrow') && (w.lastKey = e), { capture: true });
    w.watching = true;
  });
  await page.keyboard.press(key);
  return page.evaluate(() => (window as unknown as { lastKey?: KeyboardEvent }).lastKey?.defaultPrevented ?? null);
}

test('Ctrl+Up / Ctrl+Down are left to the browser when there is nothing to fold or unfold', async ({ page }) => {
  await seed(page, list());
  await text(page, 'trip').click();
  // Open item: Ctrl+Down has nothing to do, so the browser keeps it (jump by paragraph, or to the end on a Mac).
  expect(await blocked(page, 'Control+ArrowDown')).toBe(false);
  expect(await blocked(page, 'Control+ArrowUp')).toBe(true);
  await expect(row(page, 'ho')).toHaveCount(0);
  // Folded item: Ctrl+Up has nothing to do.
  expect(await blocked(page, 'Control+ArrowUp')).toBe(false);
  await expect(row(page, 'ho')).toHaveCount(0);
  expect(await blocked(page, 'Meta+ArrowDown')).toBe(true);
  await expect(row(page, 'ho')).toBeVisible();
  // No sub-items: nothing to fold.
  await text(page, 'milk').click();
  expect(await blocked(page, 'Control+ArrowUp')).toBe(false);
});

test('the arrow darkens on hover', async ({ page }) => {
  await seed(page, list());
  const stroke = () => fold(page, 'trip').locator('svg').evaluate((el) => getComputedStyle(el).stroke);
  await page.mouse.move(5, 5);
  const resting = await stroke();
  await fold(page, 'trip').hover();
  await expect.poll(stroke).not.toBe(resting);
});

test('folding while typing in a sub-item puts the cursor on the folded item', async ({ page }) => {
  await seed(page, list());
  await text(page, 'ho').click();
  await fold(page, 'trip').click();
  await expect(row(page, 'ho')).toHaveCount(0);
  await expect(text(page, 'trip')).toBeFocused();
});

test('the arrow keys and Enter skip the hidden sub-items', async ({ page }) => {
  await seed(page, list(true));
  await text(page, 'trip').click();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowDown');
  await expect(text(page, 'milk')).toBeFocused();
  await text(page, 'trip').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('New');
  // The new item went after the folded group, as a top-level item, not inside the fold.
  await expect(card(page).locator('.todo-item textarea')).toHaveCount(3);
  await expect(row(page, 'ho')).toHaveCount(0);
  await expect(card(page).locator('.todo-item textarea').nth(1)).toHaveValue('New');
});

test('a search for a hidden sub-item rings the folded item and leaves it folded', async ({ page }) => {
  await seed(page, list(true));
  await page.keyboard.press('Control+f');
  await page.getByRole('searchbox', { name: 'Search the board' }).fill('Hotel');
  await expect(page.getByRole('search').getByRole('status')).toHaveText('1 of 1 · in a folded item');
  await expect(row(page, 'trip')).toHaveClass(/find-target/);
  await expect(row(page, 'ho')).toHaveCount(0);
});

test('keyboard: the arrow takes focus and Enter folds it, with the focus staying on it', async ({ page }) => {
  await seed(page, list());
  await fold(page, 'trip').focus();
  await page.keyboard.press('Enter');
  await expect(row(page, 'ho')).toHaveCount(0);
  await expect(fold(page, 'trip')).toBeFocused();
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('the arrow can be tapped across a 44px area without ticking the item', async ({ page }) => {
    await seed(page, list());
    const a = (await fold(page, 'trip').boundingBox())!;
    const hit = await fold(page, 'trip').evaluate((el) => {
      const s = getComputedStyle(el, '::after');
      return { w: parseFloat(s.width), h: parseFloat(s.height) };
    });
    expect(hit.w).toBeGreaterThanOrEqual(44);
    expect(hit.h).toBeGreaterThanOrEqual(44);
    // A tap a little left of the drawn arrow still hits it.
    await page.touchscreen.tap(a.x - 4, a.y + a.height / 2);
    await expect(row(page, 'ho')).toHaveCount(0);
    await expect(row(page, 'trip').locator('input[type="checkbox"]').first()).not.toBeChecked();
    // The row below keeps its own tick box's press area where the arrow's reaches over it.
    const box = (await row(page, 'milk').locator('input[type="checkbox"]').boundingBox())!;
    const milkRow = (await row(page, 'milk').boundingBox())!;
    await page.touchscreen.tap(box.x - 8, milkRow.y + 3);
    await expect(row(page, 'milk').locator('input[type="checkbox"]')).toBeChecked();
    await expect(row(page, 'ho')).toHaveCount(0); // still folded
  });
});
