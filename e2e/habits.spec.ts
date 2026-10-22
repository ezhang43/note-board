import { expect, test, type Page } from '@playwright/test';
import { add, cards, expectNoOverlaps, freshBoardEachTest } from './helpers';

// Habits (owner request, 2026-10-19): the Habits button opens a side panel of daily habits, each
// with this week's seven days to tick, and Month and Year views (owner request 2026-10-20). The board you are on stays open.

freshBoardEachTest();

const dock = (page: Page) => page.locator('.corner-controls');
const habitsButton = (page: Page) => dock(page).getByRole('button', { name: 'Habits', exact: true });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Habits' });
const newHabit = (page: Page) => panel(page).getByRole('textbox', { name: 'New habit' });
const habitRows = (page: Page) => panel(page).locator('.habit');
const row = (page: Page, i: number) => habitRows(page).nth(i);
const days = (page: Page, i: number) => row(page, i).getByRole('button', { name: /, (Mon|Tue|Wed|Thu|Fri|Sat|Sun) / });
const todayBox = (page: Page, i: number) => row(page, i).locator('.habit-day[aria-current="date"]');

/** A habit's ⋯ menu, then its Delete habit item (the Ledger design: nothing destructive sits beside every habit). */
async function deleteHabit(page: Page, i: number, name: string) {
  await row(page, i).getByRole('button', { name: `More for ${name}` }).click();
  await row(page, i).getByRole('button', { name: 'Delete habit', exact: true }).click();
}

async function addHabit(page: Page, name: string) {
  // With no habits the box isn't shown until "Add a habit" is pressed (job 185).
  if ((await newHabit(page).count()) === 0) await panel(page).getByRole('button', { name: 'Add a habit' }).click();
  await newHabit(page).fill(name);
  await newHabit(page).press('Enter');
}

test('Habits opens a side panel; add a habit, tick today, and there is no streak; the board you are on is untouched', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.type('on home');
  await page.keyboard.press('Escape');
  await habitsButton(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(habitsButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page)).toContainText('No habits yet');
  await addHabit(page, 'Walk');
  await expect(habitRows(page)).toHaveCount(1);
  await expect(row(page, 0).getByRole('textbox', { name: 'Habit name' })).toHaveValue('Walk');
  await expect(days(page, 0)).toHaveCount(7);
  await expect(days(page, 0).first()).toHaveAccessibleName(/^Walk, Mon \d+ [A-Z][a-z]{2}$/);
  await expect(row(page, 0)).not.toContainText('streak');
  await todayBox(page, 0).click();
  await expect(todayBox(page, 0)).toHaveAttribute('aria-pressed', 'true');
  await expect(row(page, 0)).not.toContainText('streak');
  await todayBox(page, 0).click();
  await expect(todayBox(page, 0)).toHaveAttribute('aria-pressed', 'false');
  // Home still has just its note, and the Habits board isn't in the Boards menu.
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page)).toContainText('on home');
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'Habits' })).toHaveCount(0);
});

const viewSwitch = (page: Page) => panel(page).getByRole('group', { name: 'View' });
const viewBar = (page: Page) => panel(page).locator('.habit-viewbar');
const goTo = (page: Page, view: 'Week' | 'Month' | 'Year') => viewSwitch(page).getByRole('button', { name: view, exact: true }).click();

test('Month and Year views: switch, move, tick days in the month, jump from a year row; no streak', async ({ page }) => {
  await habitsButton(page).click();
  await addHabit(page, 'Walk');
  await addHabit(page, 'Read');
  // It opens on Week.
  await expect(viewSwitch(page).getByRole('button', { name: 'Week', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(days(page, 0)).toHaveCount(7);
  await expect(panel(page)).not.toContainText(/streak/i);
  // Month: one calendar per habit, today outlined; ticking uses the same one change as Week.
  await goTo(page, 'Month');
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'long' });
  await expect(viewBar(page)).toContainText(`${month} ${now.getFullYear()}`);
  const inMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  await expect(days(page, 0)).toHaveCount(inMonth);
  await expect(viewBar(page).getByRole('button', { name: 'Today' })).toHaveCount(0);
  await todayBox(page, 0).click();
  await expect(todayBox(page, 0)).toHaveAttribute('aria-pressed', 'true');
  await expect(todayBox(page, 1)).toHaveAttribute('aria-pressed', 'false');
  await goTo(page, 'Week');
  await expect(todayBox(page, 0)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+z'); // the tick in Month was one undoable change
  await expect(todayBox(page, 0)).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Control+y');
  await expect(todayBox(page, 0)).toHaveAttribute('aria-pressed', 'true');
  // Previous / next month, and back with Today.
  await goTo(page, 'Month');
  await viewBar(page).getByRole('button', { name: 'Previous month' }).click();
  await expect(viewBar(page)).not.toContainText(`${month} ${now.getFullYear()}`);
  await viewBar(page).getByRole('button', { name: 'Today' }).click();
  await expect(viewBar(page)).toContainText(`${month} ${now.getFullYear()}`);
  await viewBar(page).getByRole('button', { name: 'Next month' }).click();
  await expect(todayBox(page, 0)).toHaveCount(0);
  await viewBar(page).getByRole('button', { name: 'Today' }).click();
  // Year: 12 rows per habit, view only; the ticked day shows; clicking a month name opens that month.
  await goTo(page, 'Year');
  await expect(viewBar(page)).toContainText(String(now.getFullYear()));
  await expect(row(page, 0).locator('.habit-year-month')).toHaveCount(12);
  await expect(row(page, 0).locator('.habit-sq.on')).toHaveCount(1);
  await expect(row(page, 1).locator('.habit-sq.on')).toHaveCount(0);
  await expect(days(page, 0)).toHaveCount(0); // nothing to tick here
  await viewBar(page).getByRole('button', { name: 'Previous year' }).click();
  await expect(viewBar(page)).toContainText(String(now.getFullYear() - 1));
  await expect(row(page, 0).locator('.habit-sq.on')).toHaveCount(0);
  await viewBar(page).getByRole('button', { name: 'Today' }).click();
  await row(page, 1).getByRole('button', { name: new RegExp(`^${month} ${now.getFullYear()}`) }).click();
  await expect(viewSwitch(page).getByRole('button', { name: 'Month', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(viewBar(page)).toContainText(`${month} ${now.getFullYear()}`);
});

test('the Month view puts two habits side by side when the panel is wide, and the ticks are saved', async ({ page }) => {
  await habitsButton(page).click();
  await addHabit(page, 'Walk');
  await addHabit(page, 'Read');
  await goTo(page, 'Month');
  const first = (await row(page, 0).boundingBox())!;
  const second = (await row(page, 1).boundingBox())!;
  expect(second.y).toBeGreaterThan(first.y + first.height - 1); // 300px: one column
  await page.getByRole('separator', { name: 'Resize habits' }).focus();
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft'); // 300px to 540px
  const a = (await row(page, 0).boundingBox())!;
  const b = (await row(page, 1).boundingBox())!;
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  expect(b.x).toBeGreaterThan(a.x + a.width - 1);
  await todayBox(page, 1).click();
  await page.waitForTimeout(400);
  await page.reload();
  await habitsButton(page).click();
  await expect(todayBox(page, 1)).toHaveAttribute('aria-pressed', 'true');
});

test('habits, names and ticks are kept after a reload', async ({ page }) => {
  await habitsButton(page).click();
  await addHabit(page, 'Walk');
  await addHabit(page, 'Read');
  await todayBox(page, 1).click();
  const name = row(page, 0).getByRole('textbox', { name: 'Habit name' });
  await name.fill('Walk the dog');
  await page.waitForTimeout(400);
  await page.reload();
  await habitsButton(page).click();
  await expect(row(page, 0).getByRole('textbox', { name: 'Habit name' })).toHaveValue('Walk the dog');
  await expect(row(page, 1).getByRole('textbox', { name: 'Habit name' })).toHaveValue('Read');
  await expect(todayBox(page, 1)).toHaveAttribute('aria-pressed', 'true');
  await expect(todayBox(page, 0)).toHaveAttribute('aria-pressed', 'false');
});

test('delete goes at once with Undo, and Ctrl+Z in the panel brings the habit back with its ticks; Home is never undone', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.type('on home');
  await page.keyboard.press('Escape');
  await habitsButton(page).click();
  await addHabit(page, 'Walk');
  await todayBox(page, 0).click();
  // No question (owner, 2026-10-22): it goes at once, with the Undo message.
  await deleteHabit(page, 0, 'Walk');
  await expect(page.locator('.undo-toast')).toContainText('Walk');
  await expect(habitRows(page)).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(habitRows(page)).toHaveCount(1);
  await expect(todayBox(page, 0)).toHaveAttribute('aria-pressed', 'true');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Control+z');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page)).toContainText('on home');
});

test('Ctrl+Z while typing a new habit undoes the typing, not a tick', async ({ page }) => {
  await habitsButton(page).click();
  await addHabit(page, 'Walk');
  await todayBox(page, 0).click();
  await newHabit(page).click();
  await page.keyboard.type('Meditat');
  await page.keyboard.press('Control+z');
  await expect(todayBox(page, 0)).toHaveAttribute('aria-pressed', 'true');
  await expect(habitRows(page)).toHaveCount(1);
  await expect(newHabit(page)).not.toHaveValue('Meditat');
});

test('on a board named Habits that is open, new habits are placed clear of what is drawn', async ({ page }) => {
  await page.getByLabel('Board name').fill('Habits');
  await page.keyboard.press('Enter');
  await habitsButton(page).click();
  for (const name of ['Walk', 'Read', 'Stretch', 'Water']) await addHabit(page, name);
  await todayBox(page, 0).click();
  await expect(cards(page)).toHaveCount(4);
  await expectNoOverlaps(page);
});

test('keys pressed in the panel never act on the board behind it; Escape closes it', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.type('on home');
  await page.keyboard.press('Escape');
  await habitsButton(page).click();
  await addHabit(page, 'Walk');
  await page.keyboard.press('Escape'); // out of the text, still in the panel
  await expect(panel(page)).toBeVisible();
  for (const key of ['Backspace', 'Delete', 'ArrowDown', 'Control+d']) await page.keyboard.press(key);
  await expect(cards(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
});

test('a board and a journal saved before Habits existed load unchanged', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.type('old note');
  await page.keyboard.press('Escape');
  await dock(page).getByRole('button', { name: 'Journal', exact: true }).click();
  await page.keyboard.type('old journal');
  await page.waitForTimeout(400);
  const saved = await page.evaluate(() => localStorage.getItem('note-board:v1'));
  await page.reload();
  await habitsButton(page).click();
  await habitsButton(page).click();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => localStorage.getItem('note-board:v1'))).toBe(saved);
  await expect(cards(page)).toContainText('old note');
  await dock(page).getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Journal' }).getByRole('textbox').first()).toHaveText('old journal');
});

// Weight (owner request, 2026-10-21; "weight B", owner pick 2026-10-22, job 179): the card reads first (the latest weight and the
// change, then the chart), then one input strip (day, weight, Save), then a read-only History list that is tapped to correct or remove.
const weightCard = (page: Page) => panel(page).locator('.weight');
const weightBox = (page: Page) => weightCard(page).getByRole('textbox', { name: 'Weight in kg' });
const weightPoints = (page: Page) => weightCard(page).locator('.weight-point');
const weightMsgRow = (page: Page) => weightCard(page).locator('.weight-msg');
const weightMsg = (page: Page) => weightCard(page).locator('.weight-msg-text');
const weightUndo = (page: Page) => weightCard(page).getByRole('button', { name: 'Undo', exact: true });
const weightSave = (page: Page) => weightCard(page).getByRole('button', { name: 'Save weight' });
const weightStrip = (page: Page) => weightCard(page).locator('.weight-new');
async function enterWeight(page: Page, text: string) {
  await weightBox(page).fill(text);
  await weightBox(page).press('Enter');
}

test('Weight: type today’s weight, replace it, and see it in a chart; it is not a habit and is kept after a reload', async ({ page }) => {
  await habitsButton(page).click();
  await expect(weightCard(page)).toBeVisible();
  await expect(weightCard(page)).toContainText('None saved this week');
  await expect(weightCard(page)).not.toContainText('Save one and it shows');
  await expect(weightCard(page).locator('.weight-ghost, .weight-empty')).toHaveCount(0); // no empty chart box (job 185)
  await expect(weightPoints(page)).toHaveCount(0);
  // The Weight card sits above the habits.
  await addHabit(page, 'Walk');
  expect((await weightCard(page).boundingBox())!.y).toBeLessThan((await row(page, 0).boundingBox())!.y);
  await enterWeight(page, '72.4');
  await expect(weightBox(page)).toHaveValue('');
  await expect(weightCard(page).locator('.weight-num')).toHaveText('72.4 kg');
  await expect(weightCard(page).locator('.weight-when')).toHaveText('Today');
  await expect(weightPoints(page)).toHaveCount(1);
  await expect(weightCard(page)).not.toContainText('None saved this');
  await expect(weightMsg(page)).toHaveText('Today: saved 72.4 kg');
  // Again for the same day: replaced, with a comma and the Save button.
  await weightBox(page).fill('71,8');
  await weightSave(page).click();
  await expect(weightCard(page).locator('.weight-num')).toHaveText('71.8 kg');
  await expect(weightMsg(page)).toHaveText('Today: 72.4 → 71.8 kg');
  await expect(weightPoints(page)).toHaveCount(1);
  // Not a habit, and the Habits board is still not in the Boards menu.
  await expect(habitRows(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'Habits' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.reload();
  await habitsButton(page).click();
  await expect(weightCard(page).locator('.weight-num')).toHaveText('71.8 kg');
  await expect(habitRows(page)).toHaveCount(1);
});

test('Weight: it reads top to bottom as the number, the chart, the input strip, then History', async ({ page }) => {
  await habitsButton(page).click();
  await enterWeight(page, '72.4');
  const y = async (sel: string) => (await weightCard(page).locator(sel).boundingBox())!.y;
  const ys = [await y('.weight-num'), await y('.weight-chart'), await y('.weight-new'), await y('.weight-history')];
  expect(ys).toEqual([...ys].sort((a, b) => a - b));
  expect(new Set(ys).size).toBe(4);
});

test('Weight: a blank does nothing; an entry outside 20.0 to 400.0 kg shows a short red note, saves nothing, and moves nothing', async ({ page }) => {
  await habitsButton(page).click();
  await enterWeight(page, '72.4');
  await weightBox(page).press('Enter'); // a blank
  await expect(weightMsg(page)).toHaveText('Today: saved 72.4 kg'); // untouched
  await weightBox(page).fill('72.4');
  const chart = (await weightCard(page).locator('.weight-chart').boundingBox())!;
  const strip = (await weightStrip(page).boundingBox())!;
  for (const bad of ['abc', '19.9', '400.1']) {
    await enterWeight(page, bad);
    await expect(weightMsg(page)).toHaveText('Enter a weight from 20.0 to 400.0 kg.');
    await expect(weightMsgRow(page)).toHaveAttribute('role', 'alert');
    await expect(weightUndo(page)).toHaveCount(0);
    await expect(weightPoints(page)).toHaveCount(1);
    await expect(weightBox(page)).toHaveValue(bad); // kept, so it can be fixed
    // The note sits inside the strip, below the chart: nothing above it moves, and it stays on one line.
    expect(await weightCard(page).locator('.weight-chart').boundingBox()).toEqual(chart);
    expect((await weightStrip(page).boundingBox())!.y).toBe(strip.y);
    expect((await weightMsgRow(page).boundingBox())!.height).toBeLessThan(26);
  }
  await enterWeight(page, '72.0');
  await expect(weightMsg(page)).toHaveText('Today: 72.4 → 72.0 kg');
});

test('Weight: a blank with nothing saved does nothing and shows no note', async ({ page }) => {
  await habitsButton(page).click();
  await weightBox(page).press('Enter');
  await expect(weightMsgRow(page)).toHaveCount(0);
  await expect(weightPoints(page)).toHaveCount(0);
});

test('Weight: the chart follows Week, Month and Year and the arrows', async ({ page }) => {
  await habitsButton(page).click();
  await enterWeight(page, '72.4');
  for (const [view, word] of [['Week', 'week'], ['Month', 'month'], ['Year', 'year']] as const) {
    await goTo(page, view);
    await expect(weightPoints(page)).toHaveCount(1);
    await viewBar(page).getByRole('button', { name: `Previous ${word}` }).click();
    await expect(weightPoints(page)).toHaveCount(0);
    await expect(weightCard(page)).toContainText(`None saved this ${word}`);
    await viewBar(page).getByRole('button', { name: 'Today' }).click();
    await expect(weightPoints(page)).toHaveCount(1);
  }
});

test('Weight: Ctrl+Z right after Save takes the saved weight back; while typing it undoes the typing', async ({ page }) => {
  await habitsButton(page).click();
  await enterWeight(page, '72.4');
  await expect(weightPoints(page)).toHaveCount(1);
  await weightBox(page).click();
  await page.keyboard.press('Control+z');
  await expect(weightPoints(page)).toHaveCount(0);
  await page.keyboard.press('Control+y');
  await expect(weightPoints(page)).toHaveCount(1);
  await weightBox(page).click();
  await page.keyboard.type('73');
  await page.keyboard.press('Control+z');
  await expect(weightPoints(page)).toHaveCount(1); // the typing, not the saved weight
});

test('Weight: the Undo link after a save takes the weight back, and goes once something else changes', async ({ page }) => {
  await habitsButton(page).click();
  await enterWeight(page, '72.4');
  await expect(weightUndo(page)).toBeVisible();
  await weightUndo(page).click();
  await expect(weightPoints(page)).toHaveCount(0);
  await expect(weightMsg(page)).toHaveText('Undone.');
  await expect(weightUndo(page)).toHaveCount(0);
  // After a replacement it brings the old weight back.
  await enterWeight(page, '72.4');
  await enterWeight(page, '71.0');
  await weightUndo(page).click();
  await expect(weightCard(page).locator('.weight-num')).toHaveText('72.4 kg');
  // A later change (here a new habit) is not this weight's: Undo would take that one back instead, so the link goes.
  await enterWeight(page, '70.0');
  await expect(weightUndo(page)).toBeVisible();
  await addHabit(page, 'Walk');
  await expect(weightUndo(page)).toHaveCount(0);
  await expect(weightCard(page).locator('.weight-num')).toHaveText('70.0 kg');
});

test('Weight: saving the same weight again changes nothing, says so, and has no Undo', async ({ page }) => {
  await habitsButton(page).click();
  await enterWeight(page, '72.4');
  await enterWeight(page, '72.4');
  await expect(weightMsg(page)).toHaveText('Today: 72.4 kg, no change');
  await expect(weightUndo(page)).toHaveCount(0);
});

// Job #156: the edges of a week and a year, with the browser's clock fixed so they are the same on any day.
type SavedCard = { title?: string; titleColor?: string | null; items?: { text: string; done: boolean }[] };
const savedHabitCards = (page: Page) =>
  page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
    const board = Object.values(raw.boards).find((b) => (b as { name: string }).name === 'Habits') as { cards: Record<string, SavedCard> };
    return Object.values(board.cards);
  });

test('around New Year: a week over the year end, a tick on 31 Dec, the year views and today’s weight', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2027, 0, 2, 10, 0)); // Sat 2 Jan 2027, in the week of Mon 28 Dec to Sun 3 Jan
  await page.goto('/');
  await habitsButton(page).click();
  await addHabit(page, 'Walk');
  await expect(viewBar(page)).toContainText('28 Dec 2026 – 3 Jan 2027');
  await row(page, 0).getByRole('button', { name: 'Walk, Thu 31 Dec' }).click();
  await expect(row(page, 0).getByRole('button', { name: 'Walk, Thu 31 Dec' })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(400);
  const walk = (await savedHabitCards(page)).find((c) => c.title === 'Walk')!;
  expect(walk.items!.filter((i) => i.done).map((i) => i.text)).toEqual(['2026-12-31']);
  await goTo(page, 'Year');
  await expect(viewBar(page)).toContainText('2027');
  await expect(row(page, 0).locator('.habit-sq.on')).toHaveCount(0);
  await viewBar(page).getByRole('button', { name: 'Previous year' }).click();
  await expect(viewBar(page)).toContainText('2026');
  await expect(row(page, 0).locator('.habit-sq.on')).toHaveCount(1);
  await goTo(page, 'Week');
  await enterWeight(page, '72.4');
  await page.waitForTimeout(400);
  const weight = (await savedHabitCards(page)).find((c) => c.title === 'Weight')!;
  expect(weight.items!.map((i) => i.text)).toContain('2027-01-02 72.4');
});

test('Year view marks today and the days ahead, and names each month with its ticks', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 21, 10, 0)); // Wed 21 Oct 2026
  await page.goto('/');
  await habitsButton(page).click();
  await addHabit(page, 'Walk');
  await todayBox(page, 0).click();
  await goTo(page, 'Year');
  const october = row(page, 0).getByRole('button', { name: 'October 2026, 1 ticked' });
  await expect(october).toHaveAttribute('aria-current', 'date');
  const squares = row(page, 0).locator('.habit-year-month').nth(9).locator('xpath=following-sibling::*[position() <= 31]');
  await expect(squares.nth(20)).toHaveClass(/\bon\b/);
  await expect(squares.nth(20)).toHaveClass(/\btoday\b/);
  await expect(squares.nth(21)).toHaveClass(/\bahead\b/);
  await expect(squares.nth(19)).not.toHaveClass(/\b(ahead|today|on)\b/);
});

// The Ledger redesign (owner pick, 2026-10-22, jobs 166 + 167).
const sub = (page: Page) => panel(page).locator('.habits-sub');
const moreMenu = (page: Page, i: number) => row(page, i).getByRole('group', { name: /^Options for / });
const openMenu = (page: Page, i: number, name: string) => row(page, i).getByRole('button', { name: `More for ${name}` }).click();

test('Ledger: the subtitle says how today is going, each habit counts its week, the weekdays show once, and the empty state leads to the box', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 21, 10, 0)); // Wed 21 Oct 2026
  await page.goto('/');
  await habitsButton(page).click();
  await expect(sub(page)).toHaveText('Wednesday, 21 October');
  await expect(panel(page)).toContainText('No habits yet');
  await expect(panel(page)).toContainText('Add one, then tick each day you do it.');
  await expect(newHabit(page)).toHaveCount(0); // one way to add: the button, then the box (job 185)
  await panel(page).getByRole('button', { name: 'Add a habit' }).click();
  await expect(newHabit(page)).toBeFocused();
  await expect(panel(page).getByRole('button', { name: 'Add a habit' })).toHaveCount(0);
  await addHabit(page, 'Walk');
  await expect(newHabit(page)).toBeFocused(); // the cursor moves with the box to the foot of the list
  await addHabit(page, 'Read');
  await expect(newHabit(page)).toBeFocused(); // the box stays ready for the next one
  await expect(panel(page).getByText('No habits yet')).toHaveCount(0);
  await expect(sub(page)).toHaveText('Wednesday · 0 of 2 done');
  await expect(row(page, 0)).toContainText('0 of 7 this week');
  await todayBox(page, 0).click();
  await expect(sub(page)).toHaveText('Wednesday · 1 of 2 done');
  await expect(row(page, 0)).toContainText('1 of 7 this week');
  await row(page, 0).getByRole('button', { name: 'Walk, Mon 19 Oct' }).click();
  await expect(row(page, 0)).toContainText('2 of 7 this week');
  await expect(sub(page)).toHaveText('Wednesday · 1 of 2 done'); // only today counts there
  await todayBox(page, 1).click();
  await expect(sub(page)).toContainText('All 2 done');
  // The weekdays are written once, above every habit, with today's column marked.
  await expect(panel(page).locator('.habit-days-head')).toHaveCount(1);
  await expect(panel(page).locator('.habit-dh.today')).toContainText('21');
  await expect(row(page, 0).locator('.habit-wd')).toHaveCount(0);
});

test('Ledger: a habit’s ⋯ menu renames it, gives it one of the 8 bold colors (saved with it, undoable) and deletes it', async ({ page }) => {
  await habitsButton(page).click();
  await addHabit(page, 'Walk');
  await addHabit(page, 'Read');
  await expect(row(page, 0)).not.toHaveAttribute('data-hc', /./);
  await openMenu(page, 0, 'Walk');
  await expect(moreMenu(page, 0).getByRole('radio')).toHaveCount(9); // the default and the 8 bold swatches
  await expect(moreMenu(page, 0).getByRole('radio', { name: 'Default' })).toHaveAttribute('aria-checked', 'true');
  await moreMenu(page, 0).getByRole('radio', { name: 'Ocean' }).click();
  await expect(row(page, 0)).toHaveAttribute('data-hc', 'ocean');
  await expect(row(page, 1)).not.toHaveAttribute('data-hc', /./);
  await expect(moreMenu(page, 0)).toHaveCount(0); // choosing a color shuts the menu
  await openMenu(page, 0, 'Walk');
  await expect(moreMenu(page, 0).getByRole('radio', { name: 'Ocean' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await todayBox(page, 0).click();
  const ticked = row(page, 0).locator('.habit-day[aria-pressed="true"] .habit-tk');
  const plain = await ticked.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.waitForTimeout(300);
  expect((await savedHabitCards(page)).find((c) => c.title === 'Walk')!.titleColor).toBe('ocean');
  // The tick takes the habit's color, not the default green.
  await expect(panel(page)).toBeVisible();
  expect(plain).not.toBe('rgb(47, 125, 91)');
  // One undo takes the tick, the next takes the color.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(row(page, 0)).not.toHaveAttribute('data-hc', /./);
  await page.keyboard.press('Control+y');
  await expect(row(page, 0)).toHaveAttribute('data-hc', 'ocean');
  // Rename puts the cursor in the name, selected; Delete goes at once (with Undo).
  await openMenu(page, 0, 'Walk');
  await moreMenu(page, 0).getByRole('button', { name: 'Rename' }).click();
  await expect(row(page, 0).getByRole('textbox', { name: 'Habit name' })).toBeFocused();
  await page.keyboard.type('Run');
  await expect(row(page, 0).getByRole('textbox', { name: 'Habit name' })).toHaveValue('Run');
  await openMenu(page, 0, 'Run');
  await moreMenu(page, 0).getByRole('button', { name: 'Delete habit' }).click();
  await expect(habitRows(page)).toHaveCount(1);
});

test('Ledger: Escape shuts a ⋯ menu before it closes the panel, and a press outside shuts it too', async ({ page }) => {
  await habitsButton(page).click();
  await addHabit(page, 'Walk');
  await openMenu(page, 0, 'Walk');
  await expect(moreMenu(page, 0)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(moreMenu(page, 0)).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  await openMenu(page, 0, 'Walk');
  await panel(page).locator('.habits-sub').click();
  await expect(moreMenu(page, 0)).toHaveCount(0);
});

test('Ledger: names sit beside the ticks when the panel is wide, above them when it is narrow, and Month and Year say how many days', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 21, 10, 0));
  await page.goto('/');
  await habitsButton(page).click();
  await addHabit(page, 'Walk');
  await todayBox(page, 0).click();
  const name = row(page, 0).getByRole('textbox', { name: 'Habit name' });
  const firstDay = days(page, 0).first();
  expect((await name.boundingBox())!.y).toBeLessThan((await firstDay.boundingBox())!.y - 10); // narrow: stacked
  await page.getByRole('separator', { name: 'Resize habits' }).focus();
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowLeft'); // 300px to 440px
  const n = (await name.boundingBox())!;
  const d = (await firstDay.boundingBox())!;
  expect(n.x + n.width).toBeLessThanOrEqual(d.x + 1);
  expect(Math.abs(n.y + n.height / 2 - (d.y + d.height / 2))).toBeLessThan(25); // level with the ticks
  await goTo(page, 'Month');
  await expect(row(page, 0)).toContainText('1 of 21 days');
  await goTo(page, 'Year');
  await expect(row(page, 0)).toContainText('1 day');
});

test('Ledger: the view bar and the weekdays stay in view while a long list of habits scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await habitsButton(page).click();
  for (let i = 1; i <= 14; i++) await addHabit(page, `Habit ${i}`);
  const scroller = page.locator('.side-panel');
  await scroller.evaluate((el) => (el.scrollTop = 500));
  const bar = (await viewBar(page).boundingBox())!;
  const head = (await panel(page).locator('.habit-days-head').boundingBox())!;
  expect(bar.y).toBeLessThan(120); // still at the top of the panel
  expect(Math.abs(head.y - (bar.y + bar.height))).toBeLessThan(3); // the weekdays sit right under it
  // The first habit has scrolled away behind them.
  expect((await row(page, 0).boundingBox())!.y).toBeLessThan(head.y);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('Weight: full width, a box that does not zoom the page, 44px controls, History rows to tap, and an Undo that works by touch', async ({ page }) => {
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).locator('.phone-tiles').getByRole('button', { name: 'Habits', exact: true }).tap();
    const card = (await weightCard(page).boundingBox())!;
    const wide = (await panel(page).boundingBox())!;
    expect(card.width).toBeGreaterThan(wide.width - 40);
    const height = async (l: ReturnType<typeof weightBox>) => (await l.boundingBox())!.height;
    const size = (l: ReturnType<typeof weightBox>) => l.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(await size(weightBox(page))).toBeGreaterThanOrEqual(16);
    expect(await size(weightDate(page))).toBeGreaterThanOrEqual(16); // the date box under the day button too, so iOS doesn't zoom
    expect(await height(weightBox(page).locator('xpath=..'))).toBeGreaterThanOrEqual(44); // the box with its border and unit
    expect(await height(weightDate(page))).toBeGreaterThanOrEqual(44);
    expect(await height(weightSave(page))).toBeGreaterThanOrEqual(44);
    await weightBox(page).fill('72.4');
    await weightSave(page).tap();
    await expect(weightPoints(page)).toHaveCount(1);
    // The note is one line, and its Undo is a 44px target; tapping it takes the weight back (a phone has no Ctrl+Z).
    expect((await weightMsgRow(page).boundingBox())!.height).toBeLessThan(48);
    expect(await height(weightUndo(page))).toBeGreaterThanOrEqual(44);
    await weightUndo(page).tap();
    await expect(weightPoints(page)).toHaveCount(0);
    await weightBox(page).fill('72.4');
    await weightSave(page).tap();
    await weightCard(page).locator('.weight-history summary').tap();
    expect(await height(historyRows(page).first())).toBeGreaterThanOrEqual(44);
    await historyRows(page).first().tap();
    await expect(weightStrip(page)).toHaveClass(/editing/);
    expect(await height(weightStrip(page).getByRole('button', { name: 'Remove' }))).toBeGreaterThanOrEqual(44);
    expect(await height(weightStrip(page).getByRole('button', { name: 'Cancel' }))).toBeGreaterThanOrEqual(44);
    await weightStrip(page).getByRole('button', { name: 'Remove' }).tap();
    await expect(weightPoints(page)).toHaveCount(0);
    await weightUndo(page).tap();
    await expect(weightPoints(page)).toHaveCount(1);
    expect(await panel(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
  test('⋯ → Habits opens the panel over the whole screen, with day boxes big enough to tap', async ({ page }) => {
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).locator('.phone-tiles').getByRole('button', { name: 'Habits', exact: true }).tap();
    await expect(panel(page)).toBeVisible();
    expect((await panel(page).boundingBox())!.width).toBeGreaterThanOrEqual(389);
    // The keyboard doesn't pop up by itself and cover the day boxes.
    await expect(newHabit(page)).toHaveCount(0); // (no box until "Add a habit")
    await addHabit(page, 'Walk');
    const box = (await todayBox(page, 0).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeGreaterThanOrEqual(40);
    await todayBox(page, 0).tap();
    await expect(todayBox(page, 0)).toHaveAttribute('aria-pressed', 'true');
    const right = await days(page, 0).last().evaluate((el) => el.getBoundingClientRect().right);
    expect(right).toBeLessThanOrEqual(390);
    // Month cells are tappable on a phone too (44px).
    await viewSwitch(page).getByRole('button', { name: 'Month', exact: true }).tap();
    const cell = (await todayBox(page, 0).boundingBox())!;
    expect(cell.width).toBeGreaterThanOrEqual(40);
    expect(cell.height).toBeGreaterThanOrEqual(44);
    expect(await panel(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await todayBox(page, 0).tap();
    await expect(todayBox(page, 0)).toHaveAttribute('aria-pressed', 'false');
    await panel(page).getByRole('button', { name: 'Close habits' }).tap();
    await expect(panel(page)).toHaveCount(0);
  });
});

// Job #177 (owner, 2026-10-22), in the "weight B" card (job 179): weights for earlier days. A day button in the input strip (today to
// start with, nothing later, written as "Mon 19 Oct"), a read-only History list to tap, one weight per day, the chart in date order.
const weightDate = (page: Page) => weightCard(page).getByLabel('Date of weight');
const weightDay = (page: Page) => weightCard(page).locator('.weight-day-text');
const historyRows = (page: Page) => weightCard(page).locator('.weight-row');
async function enterWeightOn(page: Page, day: string, text: string) {
  await weightDate(page).fill(day);
  await enterWeight(page, text);
}
async function openWeightsOn21Oct(page: Page) {
  await page.clock.setFixedTime(new Date(2026, 9, 21, 10, 0)); // Wed 21 Oct 2026, in the week of Mon 19 Oct
  await page.goto('/');
  await habitsButton(page).click();
}
const openHistory = (page: Page) => weightCard(page).locator('.weight-history summary').click();

test('Weight: the day starts at today, is written the app’s way, and an earlier day can be entered; the chart puts it in date order', async ({ page }) => {
  await openWeightsOn21Oct(page);
  await expect(weightDate(page)).toHaveValue('2026-10-21');
  await expect(weightDate(page)).toHaveAttribute('max', '2026-10-21');
  await expect(weightDate(page)).toHaveAttribute('min', '2000-01-01');
  await expect(weightDay(page)).toHaveText('Today');
  await weightDate(page).fill('2026-10-19');
  await expect(weightDay(page)).toHaveText('Mon 19 Oct'); // not 10/19/2026
  await expect(weightStrip(page)).not.toContainText('2026');
  await weightDate(page).fill('2026-10-21');
  await enterWeight(page, '72.4');
  await enterWeightOn(page, '2026-10-19', '73.0');
  await expect(weightMsg(page)).toHaveText('Mon 19 Oct: saved 73.0 kg');
  await expect(weightDay(page)).toHaveText('Today'); // back to today for the next one
  await expect(weightDate(page)).toHaveValue('2026-10-21');
  await expect(weightBox(page)).toHaveValue('');
  await expect(weightPoints(page)).toHaveCount(2);
  await expect(weightCard(page).locator('.weight-num')).toHaveText('72.4 kg'); // the latest is still the latest by date
  await expect(weightCard(page).locator('.weight-when')).toHaveText('Today');
  await expect(weightCard(page).locator('.weight-change')).toHaveText('↓ 0.6 kg this week'); // from 73.0 on the 19th
  await enterWeightOn(page, '2026-10-20', '72.8');
  const xs = await weightPoints(page).evaluateAll((els) => els.map((e) => Number(e.getAttribute('cx'))));
  expect(xs).toEqual([...xs].sort((a, b) => a - b));
  await page.reload();
  await habitsButton(page).click();
  await expect(weightPoints(page)).toHaveCount(3);
});

test('Weight: an earlier day’s weight shows its own day above the number when it is not today’s', async ({ page }) => {
  await openWeightsOn21Oct(page);
  await enterWeightOn(page, '2026-10-19', '73.0');
  await expect(weightCard(page).locator('.weight-num')).toHaveText('73.0 kg');
  await expect(weightCard(page).locator('.weight-when')).toHaveText('Mon 19 Oct');
});

test('Weight: entering a day that already has a weight replaces it, and says so', async ({ page }) => {
  await openWeightsOn21Oct(page);
  await enterWeightOn(page, '2026-10-19', '73.0');
  await enterWeightOn(page, '2026-10-19', '73.5');
  await expect(weightMsg(page)).toHaveText('Mon 19 Oct: 73.0 → 73.5 kg');
  await expect(weightPoints(page)).toHaveCount(1);
  await enterWeight(page, '72.4');
  await enterWeight(page, '72.0');
  await expect(weightMsg(page)).toHaveText('Today: 72.4 → 72.0 kg');
  await expect(weightPoints(page)).toHaveCount(2);
  await page.keyboard.press('Control+z'); // focus is back in the empty weight box: takes the replacement back
  await expect(weightCard(page).locator('.weight-num')).toHaveText('72.4 kg');
});

test('Weight: a later day, or no day at all, is refused with a note and nothing is saved', async ({ page }) => {
  await openWeightsOn21Oct(page);
  await enterWeightOn(page, '2026-10-22', '72.4');
  await expect(weightMsg(page)).toHaveText('Pick today or an earlier day.');
  await expect(weightPoints(page)).toHaveCount(0);
  await expect(weightBox(page)).toHaveValue('72.4'); // kept
  await weightDate(page).fill('');
  await weightBox(page).press('Enter');
  await expect(weightMsg(page)).toHaveText('Pick today or an earlier day.'); // an empty date is not guessed to be today
  await expect(weightPoints(page)).toHaveCount(0);
  await weightDate(page).fill('2026-10-21');
  await weightBox(page).press('Enter');
  await expect(weightCard(page).locator('.weight-num')).toHaveText('72.4 kg');
});

test('Weight: a day outside the shown week takes the panel to that week', async ({ page }) => {
  await openWeightsOn21Oct(page);
  await enterWeightOn(page, '2026-09-15', '75.2');
  await expect(panel(page).locator('.habit-nav-label')).toContainText('14');
  await expect(weightPoints(page)).toHaveCount(1);
  await expect(weightCard(page).locator('.weight-num')).toHaveText('75.2 kg');
  await expect(weightMsg(page)).toHaveText('Tue 15 Sep: saved 75.2 kg');
});

test('Weight: History is a read-only list, newest first, with the change from the weight before', async ({ page }) => {
  await openWeightsOn21Oct(page);
  await enterWeight(page, '72.4');
  await enterWeightOn(page, '2026-10-19', '73.0');
  await enterWeightOn(page, '2026-10-20', '72.8');
  await expect(weightCard(page).locator('.weight-history summary')).toHaveText('History · 3');
  await expect(historyRows(page).first()).toBeHidden(); // folded away until opened
  await openHistory(page);
  await expect(historyRows(page)).toHaveCount(3);
  await expect(weightCard(page).locator('.weight-history').getByRole('textbox')).toHaveCount(0); // no column of open boxes
  await expect(historyRows(page).nth(0)).toHaveText('Wed 21 Oct72.4 kg−0.4');
  await expect(historyRows(page).nth(1)).toHaveText('Tue 20 Oct72.8 kg−0.2');
  await expect(historyRows(page).nth(2)).toHaveText('Mon 19 Oct73.0 kg');
  // Nothing is edited or removed just by looking or typing in a row's place.
  await expect(weightPoints(page)).toHaveCount(3);
});

test('Weight: tapping a History row fills the strip with that day, to correct it; Save keeps it and Undo takes it back', async ({ page }) => {
  await openWeightsOn21Oct(page);
  await enterWeight(page, '72.4');
  await enterWeightOn(page, '2026-10-19', '73.0');
  await openHistory(page);
  await expect(weightStrip(page).getByRole('button', { name: 'Remove' })).toHaveCount(0);
  await historyRows(page).last().click();
  await expect(weightDate(page)).toHaveValue('2026-10-19');
  await expect(weightDay(page)).toHaveText('Mon 19 Oct');
  await expect(weightBox(page)).toHaveValue('73.0');
  await expect(weightBox(page)).toBeFocused();
  await expect(weightStrip(page)).toHaveClass(/editing/);
  await expect(historyRows(page).last()).toHaveAttribute('aria-pressed', 'true');
  await expect(weightCard(page).locator('.weight-point.selected')).toHaveCount(1); // ringed on the chart
  await expect(weightStrip(page).getByRole('button', { name: 'Remove' })).toBeVisible();
  await expect(weightStrip(page).getByRole('button', { name: 'Cancel' })).toBeVisible();
  await weightBox(page).fill('73,4');
  await weightBox(page).press('Enter');
  await expect(weightMsg(page)).toHaveText('Mon 19 Oct: 73.0 → 73.4 kg');
  await expect(weightStrip(page)).not.toHaveClass(/editing/);
  await expect(weightDay(page)).toHaveText('Today');
  await expect(historyRows(page).last()).toContainText('73.4 kg');
  await expect(weightCard(page).locator('.weight-change')).toHaveText('↓ 1.0 kg this week');
  await weightUndo(page).click();
  await expect(historyRows(page).last()).toContainText('73.0 kg');
  await page.waitForTimeout(400);
  await page.reload();
  await habitsButton(page).click();
  await expect(weightPoints(page)).toHaveCount(2);
});

test('Weight: Remove in the strip removes the chosen day, and Undo or Ctrl+Z brings it back; Cancel changes nothing', async ({ page }) => {
  await openWeightsOn21Oct(page);
  await enterWeight(page, '72.4');
  await enterWeightOn(page, '2026-10-19', '73.0');
  await openHistory(page);
  // Cancel: the strip goes back to today and nothing changed.
  await historyRows(page).last().click();
  await weightStrip(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(weightStrip(page)).not.toHaveClass(/editing/);
  await expect(weightBox(page)).toHaveValue('');
  await expect(weightDay(page)).toHaveText('Today');
  await expect(historyRows(page)).toHaveCount(2);
  await expect(weightCard(page).locator('.weight-point.selected')).toHaveCount(0);
  // Remove.
  await historyRows(page).last().click();
  await weightStrip(page).getByRole('button', { name: 'Remove' }).click();
  await expect(historyRows(page)).toHaveCount(1);
  await expect(weightPoints(page)).toHaveCount(1);
  await expect(weightMsg(page)).toHaveText('Mon 19 Oct: removed 73.0 kg');
  await expect(weightStrip(page)).not.toHaveClass(/editing/);
  await weightUndo(page).click();
  await expect(historyRows(page)).toHaveCount(2);
  // The same with the keyboard: the panel has it after Remove.
  await historyRows(page).last().click();
  await weightStrip(page).getByRole('button', { name: 'Remove' }).click();
  await expect(historyRows(page)).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(historyRows(page)).toHaveCount(2);
  await page.keyboard.press('Control+y');
  await expect(historyRows(page)).toHaveCount(1);
});

test('Weight: removing the only weight leaves the strip and the empty note, and Undo brings it back', async ({ page }) => {
  await openWeightsOn21Oct(page);
  await enterWeight(page, '72.4');
  await openHistory(page);
  await historyRows(page).first().click();
  await expect(weightBox(page)).toHaveValue('72.4');
  await weightStrip(page).getByRole('button', { name: 'Remove' }).click();
  await expect(weightCard(page)).toContainText('None saved this week');
  await expect(weightStrip(page)).toBeVisible();
  await expect(weightMsg(page)).toHaveText('Today: removed 72.4 kg');
  await weightUndo(page).click();
  await expect(weightCard(page).locator('.weight-num')).toHaveText('72.4 kg');
});

test('Weight: choosing a day that has a weight fills the strip with it; choosing one without empties it', async ({ page }) => {
  await openWeightsOn21Oct(page);
  await enterWeightOn(page, '2026-10-19', '73.0');
  await weightDate(page).fill('2026-10-19');
  await expect(weightBox(page)).toHaveValue('73.0');
  await expect(weightStrip(page)).toHaveClass(/editing/);
  await weightDate(page).fill('2026-10-20');
  await expect(weightBox(page)).toHaveValue('');
  await expect(weightStrip(page)).not.toHaveClass(/editing/);
  await expect(weightStrip(page).getByRole('button', { name: 'Remove' })).toHaveCount(0);
});

test('Weight: typed text is kept when a day with a weight is chosen, and Save replaces that day', async ({ page }) => {
  await openWeightsOn21Oct(page);
  await enterWeightOn(page, '2026-10-19', '73.0');
  await weightBox(page).fill('72.5');
  await weightDate(page).fill('2026-10-19');
  await expect(weightBox(page)).toHaveValue('72.5'); // not overwritten by 73.0
  await expect(weightStrip(page)).toHaveClass(/editing/);
  await weightBox(page).press('Enter');
  await expect(weightMsg(page)).toHaveText('Mon 19 Oct: 73.0 → 72.5 kg');
});

test('Weight: if the day being corrected disappears (Ctrl+Z, another device), the strip leaves edit mode', async ({ page }) => {
  await openWeightsOn21Oct(page);
  await enterWeightOn(page, '2026-10-19', '73.0');
  await openHistory(page);
  await historyRows(page).first().click();
  await expect(weightStrip(page).getByRole('button', { name: 'Remove' })).toBeVisible();
  await weightBox(page).press('Escape'); // the panel has the keyboard
  await page.keyboard.press('Control+z'); // takes the 19 Oct weight back
  await expect(weightPoints(page)).toHaveCount(0);
  await expect(weightStrip(page)).not.toHaveClass(/editing/);
  await expect(weightStrip(page).getByRole('button', { name: 'Remove' })).toHaveCount(0);
});

test('Weight: the keyboard stays in the panel after Undo, so Ctrl+Y brings the weight back', async ({ page }) => {
  await habitsButton(page).click();
  await enterWeight(page, '72.4');
  await weightUndo(page).focus();
  await page.keyboard.press('Enter');
  await expect(weightPoints(page)).toHaveCount(0);
  await expect(panel(page).locator('.habits-panel')).toBeFocused();
  await page.keyboard.press('Control+y');
  await expect(weightPoints(page)).toHaveCount(1);
});

test('Weight chart: today is marked, the last dots do not touch, and the latest has no ring cutting the line', async ({ page }) => {
  await openWeightsOn21Oct(page);
  await enterWeightOn(page, '2026-10-19', '73.0');
  await enterWeightOn(page, '2026-10-20', '72.8');
  await enterWeight(page, '72.4');
  await goTo(page, 'Month');
  await expect(weightCard(page).locator('.weight-today-line')).toHaveCount(1);
  await expect(weightCard(page).locator('.weight-today-label')).toHaveText('Today');
  const dots = await weightPoints(page).evaluateAll((els) => els.map((e) => ({ cx: Number(e.getAttribute('cx')), r: Number(e.getAttribute('r')) })));
  expect(dots).toHaveLength(3);
  for (let i = 1; i < dots.length; i++) expect(dots[i].cx - dots[i - 1].cx).toBeGreaterThan(dots[i].r + dots[i - 1].r + 2);
  await expect(weightCard(page).locator('.weight-point.latest')).toHaveCSS('stroke', 'none');
  // The weights are labeled at the right, so the line starts at the left edge.
  const labelX = await weightCard(page).locator('.weight-axis text').first().evaluate((e) => Number(e.getAttribute('x')));
  expect(dots[0].cx).toBeLessThan(labelX);
  // A week that hasn't come yet has no Today mark.
  await goTo(page, 'Week');
  await viewBar(page).getByRole('button', { name: 'Next week' }).click();
  await expect(weightCard(page).locator('.weight-today-line')).toHaveCount(0);
});

test('Weight: clearing part of the date by keyboard is not put back to today while typing', async ({ page }) => {
  await openWeightsOn21Oct(page);
  await weightDate(page).focus();
  await page.keyboard.press('Backspace');
  await expect(weightDate(page)).toHaveValue('');
});

test('first visit: one honey button, Save is plain until a weight is typed, and a new habit shows the box under the list', async ({ page }) => {
  await habitsButton(page).click();
  const honey = (el: import('@playwright/test').Locator) => el.evaluate((e) => getComputedStyle(e).backgroundColor);
  const add = panel(page).getByRole('button', { name: 'Add a habit' });
  const plain = await honey(weightSave(page));
  await weightBox(page).fill('72.4');
  await expect.poll(() => honey(weightSave(page))).not.toBe(plain); // takes the accent color once there is a number
  await weightBox(page).fill('');
  await expect.poll(() => honey(weightSave(page))).toBe(plain);
  expect(await honey(add)).not.toBe(plain);
  await expect(panel(page).getByText('+ New habit')).toHaveCount(0);
  await addHabit(page, 'Walk');
  await expect(newHabit(page)).toBeVisible();
  expect((await newHabit(page).boundingBox())!.y).toBeGreaterThan((await row(page, 0).boundingBox())!.y);
  await deleteHabit(page, 0, 'Walk');
  await expect(add).toBeVisible(); // back to one button, no box
  await add.click();
  await newHabit(page).press('Escape'); // changed my mind: the button comes back
  await expect(add).toBeVisible();
  await expect(newHabit(page)).toHaveCount(0);
  await expect(newHabit(page)).toHaveCount(0);
});
