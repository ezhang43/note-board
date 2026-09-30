import { expect, test, type Locator, type Page } from '@playwright/test';

type WithErrors = Page & { errors: string[] };

/** Open a fresh board for each test and fail the test if the page throws an error. */
export function freshBoardEachTest() {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    (page as WithErrors).errors = errors;
    await page.goto('/');
  });
  test.afterEach(async ({ page }) => {
    expect((page as WithErrors).errors).toEqual([]);
  });
}

export const cards = (page: Page) => page.locator('[data-card-id]');
export const looseCards = (page: Page) => page.locator('.card.loose');
export const columns = (page: Page) => page.locator('[data-col-id]');

export const add = (page: Page, name: 'Note' | 'To-do list' | 'Link' | 'New column') =>
  page.locator('header.toolbar').getByRole('button', { name, exact: true }).click();

export async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error('not visible');
  return b;
}

/** A blank spot in a block's header, safe to grab for dragging. */
export async function grabPoint(block: Locator) {
  const b = await box(block);
  const isColumn = (await block.getAttribute('data-col-id')) !== null;
  return isColumn ? { x: b.x + b.width - 70, y: b.y + 26 } : { x: b.x + 30, y: b.y + 18 };
}

/** Drag from `from` to `to` in small steps. */
export async function dragPointer(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

/** Drag a block by its header so that the grab point ends at `to`. */
export async function dragTo(page: Page, block: Locator, to: { x: number; y: number }) {
  await dragPointer(page, await grabPoint(block), to);
}

/** Drag a block by (dx, dy) screen pixels. */
export async function dragBy(page: Page, block: Locator, dx: number, dy: number) {
  const g = await grabPoint(block);
  await dragPointer(page, g, { x: g.x + dx, y: g.y + dy });
}

export async function emptySpot(page: Page) {
  const c = await box(page.getByTestId('canvas'));
  return { x: c.x + 40, y: c.y + c.height - 60 };
}

export async function clickEmpty(page: Page) {
  const p = await emptySpot(page);
  await page.mouse.click(p.x, p.y);
}

type R = { x: number; y: number; width: number; height: number };

/** True if the rectangles overlap or are closer than `gap` screen pixels. */
export function tooClose(a: R, b: R, gap = 0) {
  return a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;
}

/** Every loose card and column keeps (just under) a 10px gap from every other. */
export async function expectNoOverlaps(page: Page) {
  const rects = await Promise.all((await page.locator('.card.loose, [data-col-id]').all()).map(box));
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) expect(tooClose(rects[i], rects[j], 9), `blocks ${i} and ${j} overlap`).toBe(false);
}

/** A loose block's position on the board, from its style. */
export async function boardPos(block: Locator) {
  return block.evaluate((el) => ({ x: parseFloat((el as HTMLElement).style.left), y: parseFloat((el as HTMLElement).style.top) }));
}
