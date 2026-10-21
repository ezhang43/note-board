import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// The bottom-right bar beside an open side panel (owner request 2026-10-21, job #130: "when the side
// bar is opened, I still want the main bottom bar items to all fit like search, completed, etc.").
// Every control stays fully visible and clickable in the room left of the panel: the pill's buttons
// drop their words when short of room, and the bar wraps into two rows when icons alone don't fit.

const dock = (page: Page) => page.locator('.corner-controls');
const handle = (page: Page) => page.getByRole('separator', { name: 'Resize journal' });

async function openSignedIn(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`/?signed-in&demo-user=Fit${Math.random().toString(36).slice(2, 8)}`);
  await fontsLoaded(page);
}
/** Opens the Journal panel and drags its strip so the panel's left edge is at `x`. */
async function openJournalAt(page: Page, x: number) {
  await dock(page).getByRole('button', { name: 'Journal' }).click();
  const box = (await handle(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(x, box.y + 200, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await page.getByRole('complementary', { name: 'Journal' }).boundingBox())!.x).toBe(x);
}

const PILL = ['Search', 'Completed', 'Version history', 'Focus timer', 'Google Calendar', 'Journal', 'Habits'];
const OTHERS = ['Keyboard shortcuts', 'Buy me a coffee', 'Smaller text', 'Larger text', 'Fit to screen', 'Zoom out', 'Reset zoom', 'Zoom in'];

/** Every control is inside the window and left of the panel, and nothing sits on top of it. */
async function expectAllFit(page: Page, panelLeft: number) {
  for (const name of [...PILL, ...OTHERS]) {
    const el = dock(page).getByRole(name === 'Buy me a coffee' ? 'link' : 'button', { name, exact: true });
    await expect(el, name).toBeVisible();
    const box = (await el.boundingBox())!;
    expect(box.x, `${name} left edge`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${name} right edge`).toBeLessThanOrEqual(panelLeft);
    // Playwright only clicks what really receives the click, so this also proves nothing covers it.
    await el.click({ trial: true });
  }
}

test('at 1280px with a panel dragged as wide as it goes, every bottom-bar control still fits and works', async ({ page }) => {
  await openSignedIn(page, 1280);
  await openJournalAt(page, 300);
  await expectAllFit(page, 300);
  // The bar wrapped into rows (the pill on top) instead of running off the left edge.
  const pill = (await dock(page).locator('.dock-tools').boundingBox())!;
  const zoom = (await dock(page).getByRole('group', { name: 'Zoom' }).boundingBox())!;
  expect(zoom.y).toBeGreaterThan(pill.y + pill.height - 1);
  // And it still works: Search opens the Find bar.
  await dock(page).getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('search')).toBeVisible();
});

test('with a panel a little wider than usual the pill drops its words, keeping names and tooltips', async ({ page }) => {
  await openSignedIn(page, 1280);
  await openJournalAt(page, 840);
  await expectAllFit(page, 840);
  const search = dock(page).getByRole('button', { name: 'Search', exact: true });
  expect((await search.boundingBox())!.width).toBeLessThan(44);
  await expect(search).toHaveAttribute('title', /Search/);
  const pill = (await dock(page).locator('.dock-tools').boundingBox())!;
  const zoom = (await dock(page).getByRole('group', { name: 'Zoom' }).boundingBox())!;
  // One row only: the zoom control sits level with the pill.
  expect(Math.abs(zoom.y + zoom.height / 2 - (pill.y + pill.height / 2))).toBeLessThan(6);
});

test('with room to spare the pill keeps its words, with or without a panel', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/?signed-in&demo-user=Fit${Math.random().toString(36).slice(2, 8)}`);
  await fontsLoaded(page);
  const search = dock(page).getByRole('button', { name: 'Search', exact: true });
  expect((await search.boundingBox())!.width).toBeGreaterThan(60);
  await dock(page).getByRole('button', { name: 'Version history' }).click();
  await expect(page.getByRole('complementary', { name: 'Version history' })).toBeVisible();
  expect((await search.boundingBox())!.width).toBeGreaterThan(60);
});
