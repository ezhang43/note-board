import { expect, test, type Page } from '@playwright/test';

// The Journal panel's entries grouped Year > Month > Week, each group a button that opens and shuts
// (owner request, 2026-10-19). Today's year, month and week start open; the rest start shut; what
// the person opens or shuts is remembered on this device only.

// The browser's clock is fixed to Wed 14 Oct 2026, so the groups are the same on any day.
// Its week is Mon 12 to Sun 18 Oct.
const NOW = new Date(2026, 9, 14, 10, 0, 0);
const OPEN_KEY = 'note-board:journal-open';

// Earlier days, newest first: the same week, an earlier week, a week split across two months
// (Mon 28 Sep to Sun 4 Oct), another month, another year.
const EARLIER = ['Tue 13 Oct 2026', 'Fri 9 Oct 2026', 'Sun 4 Oct 2026', 'Tue 29 Sep 2026', 'Thu 1 Jan 2026', 'Wed 31 Dec 2025'];
const TODAY = 'Wed 14 Oct 2026';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Journal' });
const group = (page: Page, name: string) => panel(page).getByRole('button', { name, exact: true });
/** Each day's date line, top to bottom (a day's heading is named by it; today's page comes first). */
const dates = (page: Page) => panel(page).locator('.journal-entry h3').evaluateAll((els) => els.map((e) => e.querySelector('.sr-only')?.textContent));
/** The group headers that are shut, top to bottom (a group's name is its first words; counts and days are left out). */
const shutGroups = (page: Page) => panel(page).locator('.jg-head[aria-expanded="false"]:not(.jg-day)').evaluateAll((els) => els.map((e) => e.childNodes[0].textContent));
const openDay = (page: Page, date: string) => panel(page).getByRole('button', { name: new RegExp(`^${date}`) }).click();
const openJournal = (page: Page) => page.locator('.corner-controls').getByRole('button', { name: 'Journal', exact: true }).click();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(NOW);
  await page.goto('/');
  // Today's note, then the earlier days written into the saved Journal board, then a fresh start.
  await openJournal(page);
  await page.waitForTimeout(400);
  await page.evaluate((earlier) => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
    const [id] = Object.entries(raw.boards).find(([, b]) => (b as { name: string }).name === 'Journal')!;
    const board = raw.boards[id];
    const note = Object.values(board.cards)[0] as { y: number };
    earlier.forEach((text, i) => {
      const key = `e${i}`;
      board.cards[key] = { ...note, id: key, text: `${text}\n\nwrote ${text}`, y: note.y + 400 * (i + 1) };
      board.order.push(key);
    });
    localStorage.setItem('note-board:v1', JSON.stringify(raw));
  }, EARLIER);
  await page.reload();
  await openJournal(page);
  (page as Page & { errors: string[] }).errors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { errors: string[] }).errors).toEqual([]);
});

test('opens with the current year, month and week open, today visible, and everything older shut', async ({ page }) => {
  // This year has no header of its own (the page-and-timeline design, 2026-10-22); its month and week are open.
  for (const name of ['October', '12–18 Oct']) await expect(group(page, name)).toHaveAttribute('aria-expanded', 'true');
  await expect(group(page, '2026')).toHaveCount(0);
  // A header's count is the rows under it: today's note is on its page, not among them.
  await expect(group(page, 'October').locator('.jg-count')).toHaveText('3 entries');
  await expect(group(page, '5–11 Oct').locator('.jg-count')).toHaveText('1 entry');
  await expect(group(page, '12–18 Oct').locator('.jg-count')).toHaveCount(0); // an open week shows no count
  for (const name of ['5–11 Oct', '1–4 Oct', 'September', 'January', '2025']) await expect(group(page, name)).toHaveAttribute('aria-expanded', 'false');
  // Only this week's days are on show: today (with the cursor) and Tuesday.
  expect(await dates(page)).toEqual([TODAY, 'Tue 13 Oct 2026']);
  await expect(panel(page).getByRole('textbox', { name: /^Journal, / }).first()).toBeFocused();
  // A shut group's days are not in the panel at all.
  await expect(group(page, 'September')).toBeVisible();
  await expect(group(page, '28–30 Sep')).toHaveCount(0);
  await expect(group(page, 'December')).toHaveCount(0);
});

test('a group opens and shuts when its button is clicked or pressed with the keyboard', async ({ page }) => {
  // Newest first at every level: Oct weeks, then the split week's October part sits in October.
  expect(await shutGroups(page)).toEqual(['5–11 Oct', '1–4 Oct', 'September', 'January', '2025']);
  await group(page, '5–11 Oct').click();
  await expect(group(page, '5–11 Oct')).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => dates(page)).toEqual([TODAY, 'Tue 13 Oct 2026', 'Fri 9 Oct 2026']);
  // A week that spans two months lists its days under each month.
  await group(page, '1–4 Oct').click();
  await expect.poll(() => dates(page)).toContain('Sun 4 Oct 2026');
  await group(page, 'September').click();
  await expect(group(page, '28–30 Sep')).toHaveAttribute('aria-expanded', 'false');
  await group(page, '28–30 Sep').click();
  await expect.poll(() => dates(page)).toEqual([TODAY, 'Tue 13 Oct 2026', 'Fri 9 Oct 2026', 'Sun 4 Oct 2026', 'Tue 29 Sep 2026']);
  await openDay(page, 'Tue 29 Sep 2026'); // earlier days start folded
  await expect(panel(page).getByRole('textbox', { name: /^Journal, / }).nth(1)).toHaveText('wrote Tue 29 Sep 2026');
  // The keyboard works, and the button shows a focus ring.
  await page.keyboard.press('Shift'); // the keyboard was used last, so the ring shows
  await group(page, 'January').focus();
  await expect(group(page, 'January')).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(group(page, 'January')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Space');
  await expect(group(page, 'January')).toHaveAttribute('aria-expanded', 'false');
  // Shutting a group hides its days; opening it again brings them back.
  await group(page, 'October').click();
  await expect(group(page, 'October')).toHaveAttribute('aria-expanded', 'false');
  await expect(group(page, '12–18 Oct')).toHaveCount(0);
  await expect.poll(() => dates(page)).toEqual([TODAY, 'Tue 29 Sep 2026']); // September was opened above; today's page stays on top
  await group(page, 'October').click();
  await expect.poll(() => dates(page)).toContain('Tue 13 Oct 2026');
});

test('years open too, and the New Year week is split between the two years', async ({ page }) => {
  await group(page, '2025').click();
  await expect(group(page, 'December')).toHaveAttribute('aria-expanded', 'false');
  await group(page, 'December').click();
  await expect(group(page, '29–31 Dec')).toBeVisible();
  await group(page, 'January').click();
  await expect(group(page, '1–4 Jan')).toBeVisible();
  // 2025 shuts like any group; this year has no header to shut.
  await group(page, '2025').click();
  await expect(group(page, '29–31 Dec')).toHaveCount(0);
  await expect(group(page, 'January')).toHaveAttribute('aria-expanded', 'true');
});

test('what is open or shut is kept after a reload, on this device only', async ({ page }) => {
  await group(page, 'September').click();
  await group(page, '28–30 Sep').click();
  await group(page, '2025').click();
  await group(page, '12–18 Oct').click(); // shut this week
  await expect.poll(() => dates(page)).toEqual([TODAY, 'Tue 29 Sep 2026']);
  await page.reload();
  await openJournal(page);
  await expect(group(page, 'September')).toHaveAttribute('aria-expanded', 'true');
  await expect(group(page, '28–30 Sep')).toHaveAttribute('aria-expanded', 'true');
  await expect(group(page, '2025')).toHaveAttribute('aria-expanded', 'true');
  await expect(group(page, 'January')).toHaveAttribute('aria-expanded', 'false');
  // The panel opens with today's note, so the week holding today is open again (the cursor is in it).
  await expect(group(page, '12–18 Oct')).toHaveAttribute('aria-expanded', 'true');
  await expect(panel(page).getByRole('textbox', { name: /^Journal, / }).first()).toBeFocused();
  // It is kept in its own place, not in the board's saved data.
  const kept = await page.evaluate((key) => ({ choices: localStorage.getItem(key), board: localStorage.getItem('note-board:v1') }), OPEN_KEY);
  expect(JSON.parse(kept.choices!)).toMatchObject({ '2026-09': true, '2025': true });
  expect(kept.board).not.toContain('2026-09/');
});

test('bad saved data falls back to the defaults', async ({ page }) => {
  for (const bad of ['not json', '[1,2]', '{"2026":"yes","2026-10":5}', 'null']) {
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [OPEN_KEY, bad]);
    await page.reload();
    await openJournal(page);
    await expect(group(page, '12–18 Oct')).toHaveAttribute('aria-expanded', 'true');
    await expect(group(page, 'September')).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(() => dates(page)).toEqual([TODAY, 'Tue 13 Oct 2026']);
  }
});

test('the panel is as wide as the Calendar panel', async ({ page }) => {
  // The Calendar panel's Week width is 420px (PANEL_DEFAULT in src/model/calendar.ts).
  expect((await panel(page).boundingBox())!.width).toBe(420);
});
