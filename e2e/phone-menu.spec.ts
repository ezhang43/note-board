import { expect, test, type Locator, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// The phone ⋯ menu as tiles (owner approved job 74, option B, 2026-10-16): the things that open
// (Search, Share, History, Completed, Focus timer, Calendar, Journal) are tiles three across; then a Board
// group (tool, text size, Snap to grid, Color, Collapse all · Same width · Clean up); then a More
// group (File, Appearance, Feedback, About, Buy me a coffee, Sign out).

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

const tag = () => Math.random().toString(36).slice(2, 8);
const more = (page: Page) => page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true });
const menu = (page: Page) => page.getByRole('dialog', { name: 'More' });
const tiles = (page: Page) => menu(page).locator('.phone-tiles');
const arrange = (page: Page) => menu(page).locator('.phone-arrange');
const rest = (page: Page) => menu(page).locator('.phone-rest');

/** Published-site look: a demo person (Share, Calendar, Feedback) and the Sign out button. */
async function openSignedIn(page: Page) {
  await page.goto(`/?signed-in&demo-user=Tile${tag()}`);
  await fontsLoaded(page);
  await more(page).tap();
  await expect(menu(page)).toBeVisible();
}
async function openLocal(page: Page) {
  await page.goto('/');
  await fontsLoaded(page);
  await more(page).tap();
  await expect(menu(page)).toBeVisible();
}

const box = async (l: Locator) => (await l.boundingBox())!;
/** The visible labels of the direct children, in order (accessible names for icon-only ones). */
const names = (l: Locator) => l.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || (e.textContent ?? '').trim()));

test('signed in, the top is eight tiles in a 4 x 2 grid (no empty ninth tile), each at least 44px', async ({ page }) => {
  await openSignedIn(page);
  const t = tiles(page).locator('button');
  expect(await names(t)).toEqual(['Search', 'Share', 'Version history', 'Completed', expect.stringMatching(/^Focus timer/), 'Google Calendar', 'Journal', 'Habits']);
  await expect(t.nth(2)).toHaveText('History');
  await expect(t.nth(4)).toHaveText('Timer');
  await expect(t.nth(5)).toHaveText('Calendar');
  await expect(t.nth(6)).toHaveText('Journal');
  const b = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7].map((i) => box(t.nth(i))));
  for (const x of b) {
    expect(x.height).toBeGreaterThanOrEqual(44);
    expect(x.width).toBeGreaterThanOrEqual(44);
  }
  // Two full rows of four.
  for (const i of [1, 2, 3]) expect(b[i].y).toBe(b[0].y);
  for (const i of [5, 6, 7]) expect(b[i].y).toBe(b[4].y);
  expect(b[4].y).toBeGreaterThan(b[0].y + b[0].height - 1);
  expect(b[4].x).toBe(b[0].x);
  expect(b[7].x).toBeGreaterThan(b[6].x);
  expect(b[6].x).toBeGreaterThan(b[5].x);
  expect(b[1].x).toBeGreaterThan(b[0].x);
  expect(b[3].x).toBeGreaterThan(b[2].x);
  // The last tile ends where the sheet's inner edge is: no empty slot after it.
  const grid = await box(tiles(page));
  expect(Math.abs(b[7].x + b[7].width - (grid.x + grid.width))).toBeLessThan(1.5);
  // Every tile has an icon and a label.
  for (let i = 0; i < 8; i++) await expect(t.nth(i).locator('svg').first()).toBeVisible();
});

test('the sheet has a grab handle, the group over the text size is "Board" (no Hand / Select tools), and the sheet keeps its scroll', async ({ page }) => {
  await openSignedIn(page);
  await expect(menu(page).locator('.phone-grab')).toBeVisible();
  await expect(arrange(page).getByRole('heading', { name: 'Board' })).toBeVisible();
  await expect(arrange(page).getByRole('heading', { name: 'Arrange' })).toHaveCount(0);
  await expect(arrange(page).getByRole('button', { name: /^Hand|^Select \(/ })).toHaveCount(0);
  expect(await menu(page).evaluate((el) => getComputedStyle(el).overscrollBehaviorY)).toBe('contain');
  // Phone-sized: nothing sticks out sideways.
  expect(await menu(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('signed out and not published: no Share, Calendar, Feedback or Sign out', async ({ page }) => {
  await openLocal(page);
  expect(await names(tiles(page).locator('button'))).toEqual(['Search', 'Version history', 'Completed', expect.stringMatching(/^Focus timer/), 'Journal', 'Habits']);
  await expect(menu(page).getByRole('button', { name: 'Feedback' })).toHaveCount(0);
  await expect(menu(page).getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await expect(menu(page).getByRole('button', { name: 'Share' })).toHaveCount(0);
  await expect(menu(page).getByRole('button', { name: 'Google Calendar' })).toHaveCount(0);
});

test('the Board group: text size, Snap to grid, Color, then Collapse all · Same width · Clean up in one row', async ({ page }) => {
  await openSignedIn(page);
  const a = arrange(page);
  for (const name of ['Smaller text', 'Larger text', 'Snap to grid', 'Color of selected cards and containers'])
    await expect(a.getByRole('button', { name, exact: true })).toBeVisible();
  const three = await Promise.all(['Collapse all', 'Same width', 'Clean up'].map((name) => box(a.getByRole('button', { name, exact: true }))));
  expect(three[1].y).toBe(three[0].y);
  expect(three[2].y).toBe(three[0].y);
  expect(three[0].x).toBeLessThan(three[1].x);
  expect(three[1].x).toBeLessThan(three[2].x);
  for (const x of three) expect(x.height).toBeGreaterThanOrEqual(44);
  // The text-size buttons are tap-sized too, and share their row evenly.
  for (const name of ['Smaller text', 'Larger text']) expect((await box(a.getByRole('button', { name, exact: true }))).height).toBeGreaterThanOrEqual(44);
  // Snap to grid is first below the text-size row; the one row of three is last.
  const snap = await box(a.getByRole('button', { name: 'Snap to grid' }));
  const colour = await box(a.getByRole('button', { name: 'Color of selected cards and containers' }));
  expect(snap.y).toBeLessThan(colour.y);
  expect(colour.y).toBeLessThan(three[0].y);
});

test('the More group, in order: File, Appearance, Feedback, About, Buy me a coffee, Sign out', async ({ page }) => {
  await openSignedIn(page);
  expect(await names(rest(page).locator('button, a'))).toEqual(['File', 'Appearance', 'Feedback', 'About BusyAnts', 'Buy me a coffee', 'Sign out']);
  // Feedback is a row of its own, right before About (owner decision, 2026-10-16).
  const fb = await box(rest(page).getByRole('button', { name: 'Feedback', exact: true }));
  const about = await box(rest(page).getByRole('link', { name: 'About BusyAnts' }));
  expect(fb.width).toBeGreaterThan(250);
  expect(about.y).toBeGreaterThan(fb.y);
  await expect(rest(page).getByRole('link', { name: 'About BusyAnts' })).toHaveAttribute('target', '_blank');
  await expect(rest(page).getByRole('link', { name: 'Buy me a coffee' })).toHaveAttribute('href', /.+/);
});

test('Snap to grid and Appearance’s Dark mode are switches that show on / off', async ({ page }) => {
  await openLocal(page);
  const snap = arrange(page).getByRole('button', { name: 'Snap to grid' });
  await expect(snap).toHaveAttribute('aria-pressed', 'true');
  expect((await snap.evaluate((el) => getComputedStyle(el, '::after').width))).toBe('40px');
  await snap.tap();
  await expect(snap).toHaveAttribute('aria-pressed', 'false');
  await snap.tap();
  await expect(snap).toHaveAttribute('aria-pressed', 'true');
  await rest(page).getByRole('button', { name: 'Appearance', exact: true }).tap();
  const dark = rest(page).getByRole('button', { name: 'Dark mode' });
  await dark.tap();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(dark).toHaveAttribute('aria-pressed', 'true');
  expect((await dark.evaluate((el) => getComputedStyle(el, '::after').width))).toBe('40px');
});

test('tiles work: Search, History and Completed open and close the menu; the focus timer shows its time', async ({ page }) => {
  await openSignedIn(page);
  await tiles(page).getByRole('button', { name: 'Search' }).tap();
  await expect(menu(page)).toHaveCount(0);
  await expect(page.getByRole('search', { name: 'Search the board' })).toBeVisible();
  await page.keyboard.press('Escape');

  await more(page).tap();
  await tiles(page).getByRole('button', { name: 'Version history' }).tap();
  await expect(menu(page)).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Version history' })).toBeVisible();
  await page.getByRole('button', { name: 'Close version history' }).tap();

  await more(page).tap();
  await tiles(page).getByRole('button', { name: 'Completed' }).tap();
  await expect(menu(page)).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Completed' })).toBeVisible();
});

test('the Share tile opens the share sheet inside the menu, below the tiles', async ({ page }) => {
  await openSignedIn(page);
  await tiles(page).getByRole('button', { name: 'Share', exact: true }).tap();
  const panel = menu(page).locator('.share-panel');
  await expect(panel).toBeVisible();
  const p = await box(panel);
  const m = await box(menu(page));
  const calendar = await box(tiles(page).getByRole('button', { name: 'Google Calendar' }));
  expect(p.y).toBeGreaterThan(calendar.y);
  expect(p.x).toBeGreaterThanOrEqual(m.x);
  expect(p.x + p.width).toBeLessThanOrEqual(m.x + m.width + 1);
  // The panel's own buttons (such as "Share this board" on a sub-board) keep their row look; the tile
  // style is only for the tiles. A probe button stands in for them here.
  const probe = await panel.evaluate((el) => {
    const b = document.createElement('button');
    b.className = 'tb-button';
    el.append(b);
    const css = getComputedStyle(b);
    return { dir: css.flexDirection, min: css.minHeight };
  });
  expect(probe).toEqual({ dir: 'row', min: 'auto' });
  // The open Share tile shows it is open.
  const tile = tiles(page).getByRole('button', { name: 'Share', exact: true });
  await expect(tile).toHaveAttribute('aria-expanded', 'true');
  expect(await tile.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(253, 241, 207)');
});

test('Arrange controls work: text size, Collapse all, Color menu with Auto-color, File menu', async ({ page }) => {
  await openLocal(page);
  const a = arrange(page);
  await a.getByRole('button', { name: 'Larger text' }).tap();
  await a.getByRole('button', { name: 'Smaller text' }).tap();
  await a.getByRole('button', { name: 'Color of selected cards and containers' }).tap();
  await expect(a.getByRole('group', { name: 'Colors' }).getByRole('button', { name: 'Auto-color' })).toBeVisible();
  await rest(page).getByRole('button', { name: 'File' }).tap();
  await expect(menu(page).getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: 'Import file…' })).toBeVisible();
});

test('text size in the menu goes up to 175% and A+ fades there', async ({ page }) => {
  await openLocal(page);
  const a = arrange(page);
  for (let i = 0; i < 4; i++) await a.getByRole('button', { name: 'Larger text' }).tap(); // Normal → Largest
  await expect(a.getByRole('button', { name: 'Larger text' })).toHaveAttribute('aria-disabled', 'true');
  expect(await page.evaluate(() => localStorage.getItem('note-board:font'))).toBe('largest');
  await a.getByRole('button', { name: 'Smaller text' }).tap();
  await expect(a.getByRole('button', { name: 'Larger text' })).not.toHaveAttribute('aria-disabled', 'true');
  expect(await page.evaluate(() => localStorage.getItem('note-board:font'))).toBe('huge');
});

test('tapping outside closes it', async ({ page }) => {
  await openLocal(page);
  await page.mouse.click(200, 70);
  await expect(menu(page)).toHaveCount(0);
});

for (const theme of ['light', 'dark'] as const) {
  test(`fits 320px wide with no sideways scroll, ${theme} mode, with the Color and File menus open`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ colorScheme: theme });
    await openSignedIn(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await arrange(page).getByRole('button', { name: 'Color of selected cards and containers' }).tap();
    await rest(page).getByRole('button', { name: 'File' }).tap();
    const m = await box(menu(page));
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x + m.width).toBeLessThanOrEqual(320);
    expect(await menu(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Nothing inside sticks out of the menu, and no tile's label is cut off.
    const stuck = await menu(page).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return [...el.querySelectorAll('button, a, .phone-tiles > *')]
        .filter((c) => { const b = c.getBoundingClientRect(); return b.width > 0 && (b.left < r.left - 1 || b.right > r.right + 1); })
        .map((c) => c.textContent);
    });
    expect(stuck).toEqual([]);
    const clipped = await tiles(page).locator('button').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent));
    expect(clipped).toEqual([]);
  });
}
