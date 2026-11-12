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

/** The toolbar's ⋯ More popover (owner request 2026-11-12: Version history and Completed live here), opened unless it already is. */
export async function more(page: Page) {
  const toggle = page.locator('header.toolbar').getByRole('button', { name: 'More', exact: true });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  return page.getByRole('dialog', { name: 'More' });
}

/** Opens (or, if it is open, closes) the Version history panel from ⋯ More on a computer. */
export async function toggleHistory(page: Page) {
  await (await more(page)).getByRole('button', { name: 'Version history', exact: true }).click();
}

/** Opens (or, if it is open, closes) the Completed panel from ⋯ More on a computer. */
export async function toggleCompleted(page: Page) {
  await (await more(page)).getByRole('button', { name: 'Completed', exact: true }).click();
}

/** Opens or closes a side panel by its name: Version history and Completed through ⋯ More, the others from the bottom-right pill. */
export async function togglePanel(page: Page, name: string) {
  if (name === 'Version history') return toggleHistory(page);
  if (name === 'Completed') return toggleCompleted(page);
  await page.locator('.corner-controls').getByRole('button', { name: new RegExp(`^${name}`) }).click();
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
  // Colors fade to the new theme (a tick box's 120ms, for one): read them once every color fade has ended,
  // not part-way (a slow computer read a tick box 90% of the way to dark, PR #246 checks).
  await page.waitForFunction(() => document.getAnimations().every((a) => !(a instanceof CSSTransition && /color/.test(a.transitionProperty))));
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

/**
 * A blank spot in a block's header, safe to grab for dragging. A card's title shares its header row (job 186), so a
 * card is grabbed in the 12px of padding left of its title, which is header all the way down.
 */
export async function grabPoint(block: Locator) {
  const b = await box(block);
  const isColumn = (await block.getAttribute('data-col-id')) !== null;
  return isColumn ? { x: b.x + b.width - 124, y: b.y + 26 } : { x: b.x + 8, y: b.y + 18 };
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

/** A spot on checklist row `n` of `list` that is neither its text nor a button: the row's own space under its text box. */
export async function rowSpace(list: Locator, n: number) {
  return list.locator('[data-item-id]').nth(n).evaluate((row) => {
    const r = row.getBoundingClientRect();
    const t = row.querySelector('.item-text')!.getBoundingClientRect();
    const p = { x: t.left + 8, y: (t.bottom + r.bottom) / 2 };
    const hit = document.elementFromPoint(p.x, p.y);
    if (hit !== row) throw new Error(`not the row's own space: ${hit?.tagName}.${hit?.className}`);
    return p;
  });
}
