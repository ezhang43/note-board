import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test';

type WithErrors = Page & { errors: string[] };

/** Open a fresh board for each test and fail the test if the page throws an error. */
export function freshBoardEachTest() {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    (page as WithErrors).errors = errors;
    await page.goto('/');
    await fontsLoaded(page);
  });
  test.afterEach(async ({ page }) => {
    expect((page as WithErrors).errors).toEqual([]);
  });
}

/**
 * Wait for the web fonts (IBM Plex Sans from Google Fonts) to finish loading. The page first draws
 * with a fallback font (display=swap) and measuring before the swap made toolbar-width and
 * zoom-center tests fail now and then on GitHub. Resolves at once when the fonts can't be reached.
 */
export async function fontsLoaded(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

export const cards = (page: Page) => page.locator('[data-card-id]');
export const looseCards = (page: Page) => page.locator('.card.loose');
export const columns = (page: Page) => page.locator('[data-col-id]');

/**
 * Clicks a toolbar Add button. A new to-do list takes the cursor in its title; unless `stayInTitle`,
 * Enter then moves it to the first item, so typing straight after adds items.
 */
export async function add(page: Page, name: 'Note' | 'Checklist' | 'New container', opts: { stayInTitle?: boolean } = {}) {
  await page.locator('header.toolbar').getByRole('button', { name, exact: true }).click();
  if (name === 'Checklist' && !opts.stayInTitle) {
    await expect(page.locator('.card.selected').getByLabel('List title')).toBeFocused();
    await page.keyboard.press('Enter');
  }
}

/**
 * Opens the toolbar's Arrange menu (Snap to grid, Collapse all, Same width, Clean up) unless it is
 * already open, and returns it. A click on the board or a card closes it again.
 */
export async function arrange(page: Page) {
  const toggle = page.locator('header.toolbar').getByRole('button', { name: 'Arrange', exact: true });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  return page.getByRole('group', { name: 'Arrange' });
}

/**
 * Opens the toolbar's Appearance menu (the Dark mode switch and the color themes) unless it is already
 * open, and returns it. A click on the board or a card closes it again.
 */
export async function appearance(page: Page) {
  const toggle = page.locator('header.toolbar').getByRole('button', { name: 'Appearance', exact: true });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  return page.getByRole('group', { name: 'Appearance', exact: true });
}

/** Switches Dark mode on the desktop toolbar (through the Appearance menu), then closes the menu. */
export async function toggleDark(page: Page) {
  const menu = await appearance(page);
  await menu.getByRole('button', { name: 'Dark mode' }).click();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
}

/**
 * Puts a link card on the board. The toolbar no longer adds links (owner request, 2026-10-05), but
 * boards can still hold them: from before, or from a Milanote import, which is used here.
 */
export async function importLinkCard(page: Page, title = 'Inspiration', url = 'https://www.example.com/ideas') {
  await page.getByLabel('File to import').setInputFiles({ name: 'board.md', mimeType: 'text/markdown', buffer: Buffer.from(`[${title}](${url})\n`) });
  const link = page.locator('[data-kind="link"]').last();
  await expect(link).toBeVisible();
  return link;
}

export async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error('not visible');
  return b;
}

/** A blank spot in a block's header, safe to grab for dragging. */
export async function grabPoint(block: Locator) {
  const b = await box(block);
  const isColumn = (await block.getAttribute('data-col-id')) !== null;
  return isColumn ? { x: b.x + b.width - 84, y: b.y + 26 } : { x: b.x + 30, y: b.y + 18 };
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
function tooClose(a: R, b: R, gap = 0) {
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

// ---- real touch events (Playwright's touchscreen can only tap) ----

export type Pt = { x: number; y: number };
export type TouchStep = { type: 'touchStart' | 'touchMove' | 'touchEnd'; p?: Pt; wait?: number };

const touchSessions = new WeakMap<Page, CDPSession>();
/** Send touch events through the browser's own input pipeline, with an optional wait before each. A finger left down stays down for the next call. */
export async function touch(page: Page, steps: TouchStep[]) {
  let cdp = touchSessions.get(page);
  if (!cdp) touchSessions.set(page, (cdp = await page.context().newCDPSession(page)));
  for (const s of steps) {
    if (s.wait) await page.waitForTimeout(s.wait);
    await cdp.send('Input.dispatchTouchEvent', { type: s.type, touchPoints: s.p ? [{ x: s.p.x, y: s.p.y, id: 1 }] : [] });
  }
}
export const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
/** The steps of a finger resting `holdMs` on `from`, then moving to `to` in 12 steps; no lift (add a touchEnd to let go). */
export const holdAndMoveSteps = (from: Pt, to: Pt, holdMs = 700): TouchStep[] => [
  { type: 'touchStart', p: from },
  ...Array.from({ length: 12 }, (_, i): TouchStep => ({ type: 'touchMove', p: lerp(from, to, (i + 1) / 12), wait: i === 0 ? holdMs : 0 })),
];
/** Rest a finger for `holdMs`, then move it to `to`; letting go. */
export const holdAndDrag = (page: Page, from: Pt, to: Pt, holdMs = 700) => touch(page, [...holdAndMoveSteps(from, to, holdMs), { type: 'touchEnd' }]);
