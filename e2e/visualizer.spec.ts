import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded, freshBoardEachTest, more } from './helpers';

// Visualizer (owner request 2026-11-12): a full-screen, looping, read-only view of what Clean up moved
// into the Completed panels. Boards are wedges, the lists items came from are cells, each item is a spark.

freshBoardEachTest();

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Visualizer' });
const rangeButton = (page: Page, name: string) => dialog(page).getByRole('button', { name, exact: true });
const count = (page: Page, label: string) => dialog(page).locator('.viz-count').filter({ hasText: label }).locator('.viz-count-number');

/** [board, list, text, days ago]: three boards' worth of cleaned-up items, one older than 30 days and one older than 7. */
const SEED: [string, string, string, number][] = [
  ['home', 'Groceries', 'milk', 0],
  ['home', 'Groceries', 'bread', 0],
  ['home', 'Groceries', 'eggs', 1],
  ['home', 'Chores', 'laundry', 10],
  ['b2', 'Tools', 'sand', 2],
  ['b2', 'Tools', 'paint', 40],
];

/** Saves two boards (Home and Garage) with the items above already cleaned up, then reloads. Returns how many of them fall in this calendar week. */
async function seed(page: Page) {
  const inWeek = await page.evaluate((seed) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const key = (ago: number) => {
      const d = new Date();
      d.setDate(d.getDate() - ago);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const boards: Record<string, unknown> = {};
    for (const [id, name] of [['home', 'Home'], ['b2', 'Garage']]) {
      const groups: Record<string, { date: string; entries: unknown[] }> = {};
      seed.filter((s) => s[0] === id).forEach(([, list, text, ago], i) => {
        const date = key(ago);
        groups[date] ??= { date, entries: [] };
        groups[date].entries.push({ item: { id: `${id}_${i}`, text, done: true, children: [] }, fromCardId: `${id}_l`, fromTitle: list, fromParentId: null });
      });
      const sorted = Object.values(groups).sort((a, b) => (a.date < b.date ? 1 : -1));
      boards[id] = { name, snap: true, cards: { [`${id}_done`]: { id: `${id}_done`, kind: 'completed', color: 'stone', x: 0, y: 0, groups: sorted } }, columns: {}, order: [`${id}_done`] };
    }
    localStorage.setItem('note-board:v1', JSON.stringify({ version: 6, home: 'home', boards }));
    const sinceMonday = (new Date().getDay() + 6) % 7;
    return seed.filter((s) => s[3] <= sinceMonday).length;
  }, SEED);
  await page.reload();
  await fontsLoaded(page);
  return inWeek;
}

async function openVisualizer(page: Page) {
  await (await more(page)).getByRole('button', { name: 'Visualizer', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
}

test('opens from the ⋯ More menu, shuts the menu, and closes with Escape or the × button', async ({ page }) => {
  await openVisualizer(page);
  await expect(page.getByRole('dialog', { name: 'More' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);

  await openVisualizer(page);
  await dialog(page).getByRole('button', { name: 'Close' }).click();
  await expect(dialog(page)).toHaveCount(0);
  // The board is as it was: no card, nothing selected.
  await expect(page.locator('[data-card-id]')).toHaveCount(0);
});

test('counts every board: done today, this week and in the range; the switch opens on 30 days and changes the range', async ({ page }) => {
  const inWeek = await seed(page);
  await openVisualizer(page);
  await expect(rangeButton(page, '30 days')).toHaveAttribute('aria-pressed', 'true');
  await expect(count(page, 'Done today')).toHaveText('2');
  await expect(count(page, 'This week')).toHaveText(String(inWeek));
  await expect(count(page, 'Last 30 days')).toHaveText('5'); // paint is 40 days old

  await rangeButton(page, '7 days').click();
  await expect(rangeButton(page, '7 days')).toHaveAttribute('aria-pressed', 'true');
  await expect(rangeButton(page, '30 days')).toHaveAttribute('aria-pressed', 'false');
  await expect(count(page, 'Last 7 days')).toHaveText('4'); // not laundry (10 days) or paint

  await rangeButton(page, 'All').click();
  await expect(count(page, 'All time')).toHaveText('6');
  // Today and this week do not follow the switch.
  await expect(count(page, 'Done today')).toHaveText('2');
  // The picture is described in words for a screen reader.
  // By category is the default: the lists' items sort by their words, then by the list title.
  await expect(dialog(page).getByRole('img', { name: /6 items cleaned up: Errands & shopping 3, Home & chores 1, Other 2\./ })).toBeVisible();
});

test('the feed fills as the loop runs, oldest item first, and names its list and board', async ({ page }) => {
  await seed(page);
  await openVisualizer(page);
  const rows = dialog(page).locator('.viz-feed li');
  await expect(rows.first()).toBeVisible({ timeout: 10000 });
  await expect(rows.first().locator('.viz-feed-text')).toHaveText('laundry'); // 10 days ago: the oldest in 30 days
  await expect(rows.first().locator('.viz-feed-where')).toHaveText('Home & chores · Chores · Home'); // category, list, board
  // Later ones push in above it.
  await expect.poll(async () => rows.count(), { timeout: 8000 }).toBeGreaterThan(1);
});

test('switching to a shorter range part-way round the loop does not break it (no page error, it starts again from the oldest)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page);
  await openVisualizer(page);
  await rangeButton(page, 'All').click();
  const rows = dialog(page).locator('.viz-feed li');
  // Five of the six have landed, more than the four a week holds.
  await expect.poll(async () => rows.count(), { timeout: 15000 }).toBeGreaterThanOrEqual(5);
  await rangeButton(page, '7 days').click();
  await expect(count(page, 'Last 7 days')).toHaveText('4');
  await expect(dialog(page)).toBeVisible();
  await expect(rows.first()).toBeVisible({ timeout: 5000 });
  await expect(rows.first().locator('.viz-feed-text')).toHaveText('sand'); // 2 days ago: the oldest within 7 days
  expect(errors).toEqual([]);
});

const groupButton = (page: Page, name: string) => dialog(page).getByRole('group', { name: 'Group by' }).getByRole('button', { name, exact: true });

test('wedges are categories by default; By board switches to boards, and the choice is remembered on this device', async ({ page }) => {
  await seed(page);
  await openVisualizer(page);
  await expect(groupButton(page, 'By category')).toHaveAttribute('aria-pressed', 'true');
  await expect(groupButton(page, 'By board')).toHaveAttribute('aria-pressed', 'false');

  await groupButton(page, 'By board').click();
  await expect(groupButton(page, 'By board')).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog(page).getByRole('img', { name: /5 items cleaned up: Home 4, Garage 1/ })).toBeVisible();
  // The feed rows go back to list and board.
  await expect(dialog(page).locator('.viz-feed li').first().locator('.viz-feed-where')).toHaveText('Chores · Home', { timeout: 10000 });
  // The range is unchanged by it.
  await expect(rangeButton(page, '30 days')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('note-board:viz-group'))).toBe('board');

  // A reload (and a fresh open) keeps it.
  await page.reload();
  await fontsLoaded(page);
  await openVisualizer(page);
  await expect(groupButton(page, 'By board')).toHaveAttribute('aria-pressed', 'true');

  await groupButton(page, 'By category').click();
  await expect(dialog(page).getByRole('img', { name: /Errands & shopping 3/ })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('note-board:viz-group'))).toBe('category');
});

test('a saved choice that is not one of the two falls back to By category', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('note-board:viz-group', 'wedges'));
  await openVisualizer(page);
  await expect(groupButton(page, 'By category')).toHaveAttribute('aria-pressed', 'true');
});

test('with nothing cleaned up yet, it says so', async ({ page }) => {
  await openVisualizer(page);
  await expect(dialog(page).getByText('Nothing cleaned up yet in this range. Tick items and press Clean up.')).toBeVisible();
  await expect(count(page, 'Done today')).toHaveText('0');
  await expect(dialog(page).locator('.viz-feed li')).toHaveCount(0);
});

test('it only reads: the saved boards are the same after opening, looping and closing', async ({ page }) => {
  await seed(page);
  const saved = () => page.evaluate(() => localStorage.getItem('note-board:v1'));
  const before = await saved();
  await openVisualizer(page);
  await rangeButton(page, 'All').click();
  await expect(dialog(page).locator('.viz-feed li').first()).toBeVisible({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800); // longer than the save delay
  expect(await saved()).toBe(before);
  // Nothing to undo.
  await expect(page.locator('header.toolbar').getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('it is dark and glowing even in light mode, and the board keys stay off behind it', async ({ page }) => {
  await openVisualizer(page);
  const rgb = await dialog(page).evaluate((el) => getComputedStyle(el).backgroundColor.match(/\d+/g)!.slice(0, 3).map(Number));
  expect(Math.max(...rgb)).toBeLessThan(50);
  await page.keyboard.press('Control+a');
  await expect(page.locator('.card.selected')).toHaveCount(0);
});

/** Whether the canvas has paint in its top rows: `away` true looks only away from the middle (where the pillar runs), false only at the middle. */
const topRows = (page: Page, away: boolean) =>
  dialog(page)
    .locator('canvas')
    .evaluate((c: HTMLCanvasElement, away) => {
      const k = c.width / c.clientWidth;
      const rows = Math.max(2, Math.round(6 * k));
      const margin = Math.round(130 * k); // the pillar's glow is at most about 200px wide, at its fullest swell
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, rows).data;
      for (let y = 0; y < rows; y++) for (let x = 0; x < c.width; x++) if ((Math.abs(x - c.width / 2) > margin) === away && d[(y * c.width + x) * 4 + 3] > 8) return true;
      return false;
    }, away);

test('under reduced motion there is no beam and no trail, only the cell lighting up and a faint still pillar', async ({ page }) => {
  await seed(page);
  await openVisualizer(page);
  await expect(dialog(page).locator('.viz-feed li').first()).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(300);
  expect(await topRows(page, true)).toBe(false);
  expect(await topRows(page, false)).toBe(true); // the pillar is there from the top of the canvas
});

test.describe('with motion on', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  const topPainted = (page: Page) => topRows(page, true);

  test('a light beam shoots in from above the canvas onto each item\'s cell, then a comet runs into the core', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await seed(page);
    await openVisualizer(page);
    await expect.poll(() => topPainted(page), { timeout: 6000, intervals: [30] }).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the light pillar is there from the top of the canvas through the core before anything has landed', async ({ page }) => {
    await seed(page);
    await openVisualizer(page);
    await expect.poll(() => topRows(page, false), { timeout: 3000, intervals: [30] }).toBe(true);
  });

  test('sparks fly and the ring is drawn, with no page error', async ({ page }) => {
    await seed(page);
    await openVisualizer(page);
    const canvas = dialog(page).locator('canvas');
    await expect(canvas).toBeVisible();
    // Something is painted on the ring within a couple of seconds (the first spark takes about a second to land).
    await expect
      .poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0)), { timeout: 4000 })
      .toBe(true);
    await expect(dialog(page).locator('.viz-feed li').first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 780 } });

  test('a tile in the ⋯ sheet opens it: the ring on top, the numbers under it, nothing sticking out sideways', async ({ page }) => {
    await seed(page);
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    const tile = page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Visualizer', exact: true });
    const t = (await tile.boundingBox())!;
    expect(t.height).toBeGreaterThanOrEqual(44);
    await tile.tap();
    await expect(dialog(page)).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'More' })).toHaveCount(0);
    const ring = (await dialog(page).locator('canvas').boundingBox())!;
    const numbers = (await count(page, 'Done today').boundingBox())!;
    expect(ring.y + ring.height).toBeLessThanOrEqual(numbers.y + 1);
    expect(await dialog(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const close = (await dialog(page).getByRole('button', { name: 'Close' }).boundingBox())!;
    expect(close.width).toBeGreaterThanOrEqual(44);
    expect(close.height).toBeGreaterThanOrEqual(44);
    await dialog(page).getByRole('button', { name: 'Close' }).tap();
    await expect(dialog(page)).toHaveCount(0);
  });
});
