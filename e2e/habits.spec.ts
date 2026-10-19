import { expect, test, type Page } from '@playwright/test';
import { add, cards, expectNoOverlaps, freshBoardEachTest } from './helpers';

// Habits (owner request, 2026-10-19): the Habits button opens a side panel of daily habits, each
// with this week's seven days to tick and its streak. The board you are on stays open.

freshBoardEachTest();

const dock = (page: Page) => page.locator('.corner-controls');
const habitsButton = (page: Page) => dock(page).getByRole('button', { name: 'Habits', exact: true });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Habits' });
const newHabit = (page: Page) => panel(page).getByRole('textbox', { name: 'New habit' });
const habitRows = (page: Page) => panel(page).locator('.habit');
const row = (page: Page, i: number) => habitRows(page).nth(i);
const days = (page: Page, i: number) => row(page, i).getByRole('button', { name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) / });
const todayBox = (page: Page, i: number) => row(page, i).locator('.habit-day[aria-current="date"]');

async function addHabit(page: Page, name: string) {
  await newHabit(page).fill(name);
  await newHabit(page).press('Enter');
}

test('Habits opens a side panel; add a habit, tick today and see the streak; the board you are on is untouched', async ({ page }) => {
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
  await expect(days(page, 0).first()).toHaveAccessibleName(/^Mon /);
  await expect(row(page, 0)).toContainText('No streak');
  await todayBox(page, 0).click();
  await expect(todayBox(page, 0)).toHaveAttribute('aria-pressed', 'true');
  await expect(row(page, 0)).toContainText('1-day streak');
  await todayBox(page, 0).click();
  await expect(todayBox(page, 0)).toHaveAttribute('aria-pressed', 'false');
  await expect(row(page, 0)).toContainText('No streak');
  // Home still has just its note, and the Habits board isn't in the Boards menu.
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page)).toContainText('on home');
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'Habits' })).toHaveCount(0);
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
  await expect(page.getByRole('complementary', { name: 'Journal' }).getByRole('textbox').first()).toHaveValue('old journal');
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('⋯ → Habits opens the panel over the whole screen, with day boxes big enough to tap', async ({ page }) => {
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).locator('.phone-tiles').getByRole('button', { name: 'Habits', exact: true }).tap();
    await expect(panel(page)).toBeVisible();
    expect((await panel(page).boundingBox())!.width).toBeGreaterThanOrEqual(389);
    await addHabit(page, 'Walk');
    const box = (await todayBox(page, 0).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeGreaterThanOrEqual(40);
    await todayBox(page, 0).tap();
    await expect(todayBox(page, 0)).toHaveAttribute('aria-pressed', 'true');
    const right = await days(page, 0).last().evaluate((el) => el.getBoundingClientRect().right);
    expect(right).toBeLessThanOrEqual(390);
    await panel(page).getByRole('button', { name: 'Close habits' }).tap();
    await expect(panel(page)).toHaveCount(0);
  });
});
