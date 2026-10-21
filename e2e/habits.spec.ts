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

async function addHabit(page: Page, name: string) {
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
  await expect(newHabit(page)).toBeFocused();
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

test('delete asks first, and Ctrl+Z in the panel brings the habit back with its ticks; Home is never undone', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.type('on home');
  await page.keyboard.press('Escape');
  await habitsButton(page).click();
  await addHabit(page, 'Walk');
  await todayBox(page, 0).click();
  // Cancelled: nothing goes.
  page.once('dialog', (d) => {
    expect(d.message()).toContain('Walk');
    void d.dismiss();
  });
  await row(page, 0).getByRole('button', { name: 'Delete habit Walk' }).click();
  await expect(habitRows(page)).toHaveCount(1);
  page.once('dialog', (d) => void d.accept());
  await row(page, 0).getByRole('button', { name: 'Delete habit Walk' }).click();
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

// Weight (owner request, 2026-10-21): a Weight card above the habits, kg with one decimal, a chart that follows the view.
const weightCard = (page: Page) => panel(page).locator('.weight');
const weightBox = (page: Page) => weightCard(page).getByRole('textbox', { name: 'Today’s weight in kg' });
const weightPoints = (page: Page) => weightCard(page).locator('.weight-point');
async function enterWeight(page: Page, text: string) {
  await weightBox(page).fill(text);
  await weightBox(page).press('Enter');
}

test('Weight: type today’s weight, replace it, and see it in a chart; it is not a habit and is kept after a reload', async ({ page }) => {
  await habitsButton(page).click();
  await expect(weightCard(page)).toBeVisible();
  await expect(weightCard(page)).toContainText('No weight entered in this week.');
  await expect(weightPoints(page)).toHaveCount(0);
  // The Weight card sits above the habits.
  await addHabit(page, 'Walk');
  expect((await weightCard(page).boundingBox())!.y).toBeLessThan((await row(page, 0).boundingBox())!.y);
  await enterWeight(page, '72.4');
  await expect(weightBox(page)).toHaveValue('');
  await expect(weightCard(page).locator('.weight-today')).toHaveText('Today: 72.4 kg');
  await expect(weightPoints(page)).toHaveCount(1);
  await expect(weightCard(page)).not.toContainText('No weight entered');
  // Again for the same day: replaced, with a comma and the Save button.
  await weightBox(page).fill('71,8');
  await weightCard(page).getByRole('button', { name: 'Save weight' }).click();
  await expect(weightCard(page).locator('.weight-today')).toHaveText('Today: 71.8 kg');
  await expect(weightPoints(page)).toHaveCount(1);
  // Not a habit, and the Habits board is still not in the Boards menu.
  await expect(habitRows(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'Habits' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.reload();
  await habitsButton(page).click();
  await expect(weightCard(page).locator('.weight-today')).toHaveText('Today: 71.8 kg');
  await expect(habitRows(page)).toHaveCount(1);
});

test('Weight: a blank does nothing; an entry outside 20.0 to 400.0 kg shows a short note and saves nothing', async ({ page }) => {
  await habitsButton(page).click();
  await weightBox(page).press('Enter');
  await expect(weightCard(page).locator('.weight-note')).toHaveCount(0);
  for (const bad of ['abc', '19.9', '400.1']) {
    await enterWeight(page, bad);
    await expect(weightCard(page).locator('.weight-note')).toHaveText('Enter a weight from 20.0 to 400.0 kg.');
    await expect(weightPoints(page)).toHaveCount(0);
    await expect(weightBox(page)).toHaveValue(bad); // kept, so it can be fixed
  }
  await enterWeight(page, '72.4');
  await expect(weightCard(page).locator('.weight-note')).toHaveCount(0);
  await expect(weightPoints(page)).toHaveCount(1);
});

test('Weight: the chart follows Week, Month and Year and the arrows', async ({ page }) => {
  await habitsButton(page).click();
  await enterWeight(page, '72.4');
  for (const [view, word] of [['Week', 'week'], ['Month', 'month'], ['Year', 'year']] as const) {
    await goTo(page, view);
    await expect(weightPoints(page)).toHaveCount(1);
    await viewBar(page).getByRole('button', { name: `Previous ${word}` }).click();
    await expect(weightPoints(page)).toHaveCount(0);
    await expect(weightCard(page)).toContainText(`No weight entered in this ${word}.`);
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

test('Weight: the × removes the latest entry of the period, and Ctrl+Z brings it back', async ({ page }) => {
  await habitsButton(page).click();
  await enterWeight(page, '72.4');
  await expect(weightCard(page).locator('.weight-latest')).toContainText('72.4 kg');
  await weightCard(page).getByRole('button', { name: /^Remove weight for/ }).click();
  await expect(weightPoints(page)).toHaveCount(0);
  await expect(weightCard(page)).toContainText('No weight entered in this week.');
  await page.keyboard.press('Control+z');
  await expect(weightPoints(page)).toHaveCount(1);
  await expect(weightCard(page).locator('.weight-today')).toHaveText('Today: 72.4 kg');
  await page.keyboard.press('Control+y');
  await expect(weightPoints(page)).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('Weight: full width, a box that does not zoom the page, 44px buttons', async ({ page }) => {
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).locator('.phone-tiles').getByRole('button', { name: 'Habits', exact: true }).tap();
    const card = (await weightCard(page).boundingBox())!;
    const wide = (await panel(page).boundingBox())!;
    expect(card.width).toBeGreaterThan(wide.width - 40);
    expect(await weightBox(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    expect((await weightBox(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await weightCard(page).getByRole('button', { name: 'Save weight' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await weightBox(page).fill('72.4');
    await weightCard(page).getByRole('button', { name: 'Save weight' }).tap();
    await expect(weightPoints(page)).toHaveCount(1);
    expect((await weightCard(page).getByRole('button', { name: /^Remove weight for/ }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await panel(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });

  test('⋯ → Habits opens the panel over the whole screen, with day boxes big enough to tap', async ({ page }) => {
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).locator('.phone-tiles').getByRole('button', { name: 'Habits', exact: true }).tap();
    await expect(panel(page)).toBeVisible();
    expect((await panel(page).boundingBox())!.width).toBeGreaterThanOrEqual(389);
    // The keyboard doesn't pop up by itself and cover the day boxes.
    await expect(newHabit(page)).not.toBeFocused();
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
