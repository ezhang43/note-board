import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Google Calendar side panel (owner request, 2026-10-06). Tests can't reach Google: with
// ?demo-user=… `npm run dev` answers like the Calendar API from a pretend calendar (src/calendar/devServer.ts),
// a fresh one for each demo person, holding: "Dentist" today 10:00–11:00 (simple), "Team stand-up" every
// day 09:00–09:15 (repeating, so read-only), "Lunch with Sam" tomorrow (has a guest, so read-only).

const tag = () => Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, '');
const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
/** A day `n` days from today. */
function daysFromToday(n: number) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

async function openAs(page: Page, name = `Cal${tag()}`, path = '/') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${path}?demo-user=${name}`);
  await fontsLoaded(page);
  return errors;
}

const button = (page: Page) => page.locator('.corner-controls').getByRole('button', { name: 'Google Calendar' });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Google Calendar' });
const day = (page: Page, d: Date) => panel(page).getByRole('region', { name: label(d) });
const form = (page: Page) => panel(page).getByRole('form');

test('without anyone signed in there is no calendar button', async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
  await expect(page.locator('.corner-controls').getByRole('button', { name: 'Focus timer' })).toBeVisible();
  await expect(button(page)).toHaveCount(0);
});

test('opens beside the board with this week’s events; repeating and invited events are read-only', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(button(page)).toHaveAttribute('aria-pressed', 'true');
  const today = day(page, new Date());
  await expect(today.getByRole('button', { name: '10:00 – 11:00 Dentist' })).toBeVisible();
  await expect(today.getByRole('button', { name: /09:00 – 09:15 Team stand-up/ })).toBeVisible();

  // A repeating event shows its details, read-only, with a link to change it in Google Calendar.
  await today.getByRole('button', { name: /Team stand-up/ }).click();
  await expect(panel(page).getByText(/can only be changed in Google Calendar/)).toBeVisible();
  const link = panel(page).getByRole('link', { name: 'Open in Google Calendar' });
  await expect(link).toHaveAttribute('href', /^https:\/\/(calendar|www)\.google\.com\//);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(form(page)).toHaveCount(0);

  // It shares the right-hand spot with the focus timer: one at a time.
  await page.locator('.corner-controls').getByRole('button', { name: 'Focus timer' }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Focus timer' })).toBeVisible();
  await button(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Focus timer' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('add an event on a day; it is still there after a reload', async ({ page }) => {
  const name = `Cal${tag()}`;
  await openAs(page, name);
  await button(page).click();
  const today = new Date();
  await day(page, today).getByRole('button', { name: `Add event on ${label(today)}` }).click();
  await expect(form(page).getByLabel('Title')).toBeFocused();
  await page.keyboard.type('Swim');
  await form(page).getByLabel('Start time').fill('07:00');
  await form(page).getByLabel('End time').fill('07:45');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(form(page)).toHaveCount(0);
  await expect(day(page, today).getByRole('button', { name: '07:00 – 07:45 Swim' })).toBeVisible();

  await openAs(page, name);
  await button(page).click();
  await expect(day(page, today).getByRole('button', { name: '07:00 – 07:45 Swim' })).toBeVisible();
});

test('an end before the start is refused with a plain note', async ({ page }) => {
  await openAs(page);
  await button(page).click();
  await day(page, new Date()).getByRole('button', { name: /Dentist/ }).click();
  await form(page).getByLabel('End time').fill('09:00');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(form(page).getByText('The end must be after the start.')).toBeVisible();
});

test('rename a simple event and move it to another day', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  const today = new Date();
  const other = daysFromToday(2);
  await day(page, today).getByRole('button', { name: '10:00 – 11:00 Dentist' }).click();
  await form(page).getByLabel('Title').fill('Dentist check-up');
  await form(page).getByLabel('Start date').fill(key(other));
  await form(page).getByLabel('Start time').fill('14:00');
  await form(page).getByLabel('End time').fill('15:00');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(day(page, other).getByRole('button', { name: '14:00 – 15:00 Dentist check-up' })).toBeVisible();
  if (key(other) !== key(today)) await expect(day(page, today).getByRole('button', { name: /Dentist/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a timed event can be made all-day, and back', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  const today = day(page, new Date());
  await today.getByRole('button', { name: '10:00 – 11:00 Dentist' }).click();
  await form(page).getByLabel('All day').check();
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(today.getByRole('button', { name: 'All day Dentist' })).toBeVisible();
  await today.getByRole('button', { name: 'All day Dentist' }).click();
  await form(page).getByLabel('All day').uncheck();
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(today.getByRole('button', { name: '09:00 – 10:00 Dentist' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('delete asks first (Keep / Delete); Escape keeps the panel open; Ctrl+Z doesn’t bring it back', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  const today = day(page, new Date());
  await today.getByRole('button', { name: /Dentist/ }).click();
  await form(page).getByRole('button', { name: 'Delete' }).click();
  const ask = panel(page).getByRole('alertdialog', { name: 'Delete “Dentist”?' });
  await expect(ask).toBeVisible();
  await expect(ask.getByRole('button', { name: 'Keep' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(ask).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  await ask.getByRole('button', { name: 'Keep' }).waitFor({ state: 'detached' });

  await form(page).getByRole('button', { name: 'Delete' }).click();
  await ask.getByRole('button', { name: 'Delete' }).click();
  await expect(today.getByRole('button', { name: /Dentist/ })).toHaveCount(0);
  // Calendar events aren't board data: undo doesn't touch them.
  await page.locator('.canvas').click({ position: { x: 300, y: 300 } });
  await page.keyboard.press('Control+z');
  await expect(today.getByRole('button', { name: /Team stand-up/ })).toBeVisible();
  await expect(today.getByRole('button', { name: /Dentist/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('week and month views, back and forward, and Today', async ({ page }) => {
  await openAs(page);
  await button(page).click();
  await expect(panel(page).getByRole('button', { name: 'Week', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const heading = panel(page).locator('.cal-range');
  // The week starts today (no past days of this week) and runs seven days.
  const days = panel(page).locator('.cal-day');
  await expect(days).toHaveCount(7);
  await expect(days.first()).toHaveAttribute('aria-label', label(new Date()));
  await expect(days.last()).toHaveAttribute('aria-label', label(daysFromToday(6)));
  const dayAndDate = (d: Date) => label(d).split(' ').slice(0, 2).join(' '); // "Thu 15"
  await expect(heading).toHaveText(new RegExp(`^${dayAndDate(new Date())}\\b.* – ${dayAndDate(daysFromToday(6))}\\b`));
  const thisWeek = await heading.textContent();
  await panel(page).getByRole('button', { name: 'Next week' }).click();
  await expect(heading).not.toHaveText(thisWeek!);
  await expect(days.first()).toHaveAttribute('aria-label', label(daysFromToday(7)));
  await panel(page).getByRole('button', { name: 'Today', exact: true }).click();
  await expect(heading).toHaveText(thisWeek!);
  await panel(page).getByRole('button', { name: 'Previous week' }).click();
  await expect(days.first()).toHaveAttribute('aria-label', label(daysFromToday(-7)));
  await expect(days.last()).toHaveAttribute('aria-label', label(daysFromToday(-1)));
  await panel(page).getByRole('button', { name: 'Today', exact: true }).click();

  await panel(page).getByRole('button', { name: 'Month', exact: true }).click();
  const now = new Date();
  const monthName = now.toLocaleString('en-GB', { month: 'long' });
  await expect(heading).toHaveText(`${monthName} ${now.getFullYear()}`);
  // The month is a grid of days; today's day is picked and its events are listed under it.
  const grid = panel(page).getByRole('grid');
  await expect(grid.getByRole('gridcell', { name: new RegExp(`^${label(now)}`) })).toHaveAttribute('aria-selected', 'true');
  await expect(day(page, now).getByRole('button', { name: /Dentist/ })).toBeVisible();
  await panel(page).getByRole('button', { name: 'Previous month' }).click();
  await expect(heading).not.toHaveText(`${monthName} ${now.getFullYear()}`);
});

test('the month grid shows each day’s event names; clicking one opens it; “+n more” lists the day', async ({ page }) => {
  // A short window: the day's list under the month grid starts below the bottom of the panel.
  await page.setViewportSize({ width: 1440, height: 600 });
  const errors = await openAs(page);
  await button(page).click();
  await panel(page).getByRole('button', { name: 'Month', exact: true }).click();
  const grid = panel(page).getByRole('grid');
  const cell = (d: Date) => grid.getByRole('gridcell', { name: new RegExp(`^${label(d)}`) });
  const now = new Date();
  // Today: Team stand-up (09:00, repeating) and Dentist (10:00), in time order, by name.
  const todayCell = cell(now);
  await expect(todayCell.locator('.cal-chip')).toHaveText([/Team stand-up/, /Dentist/]);
  await expect(todayCell.getByRole('button', { name: '10:00 – 11:00 Dentist' })).toBeVisible();
  await expect(todayCell.getByRole('button', { name: /Team stand-up, read-only/ })).toHaveClass(/read-only/);
  // An all-day event is a filled chip, first on its day.
  const holiday = daysFromToday(3);
  if (holiday.getMonth() === now.getMonth()) {
    await expect(cell(holiday).locator('.cal-chip').first()).toHaveText('Holiday');
    await expect(cell(holiday).locator('.cal-chip').first()).toHaveClass(/all-day/);
  }

  // Clicking a name opens that event: Dentist's change form, then back to the month.
  await todayCell.getByRole('button', { name: /Dentist/ }).click();
  await expect(form(page).getByLabel('Title')).toHaveValue('Dentist');
  await form(page).getByRole('button', { name: 'Cancel' }).click();
  // A read-only event opens read-only.
  await todayCell.getByRole('button', { name: /Team stand-up/ }).click();
  await expect(panel(page).getByText(/can only be changed in Google Calendar/)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Back' }).click();

  // The wide Month panel has room for three lines; a fourth event today makes the last say "+2 more".
  for (const [title, start, end] of [['Swim', '07:00', '07:45'], ['Run', '06:00', '06:30']]) {
    await day(page, now).getByRole('button', { name: `Add event on ${label(now)}` }).click();
    await page.keyboard.type(title);
    await form(page).getByLabel('Start time').fill(start);
    await form(page).getByLabel('End time').fill(end);
    await form(page).getByRole('button', { name: 'Save' }).click();
  }
  await expect(todayCell.locator('.cal-chip')).toHaveText(['06:00Run', '07:00Swim']);
  await expect(todayCell.getByRole('button', { name: '+2 more' })).toBeVisible();
  // Clicking another day, then "+2 more", lists all of today's events under the grid.
  await cell(now.getDate() === 1 ? daysFromToday(1) : daysFromToday(-1)).locator('.cal-date').click();
  await todayCell.getByRole('button', { name: '+2 more' }).click();
  await expect(todayCell).toHaveAttribute('aria-selected', 'true');
  await expect(day(page, now).locator('.cal-event')).toHaveCount(4);
  // The list is under the grid, so it is scrolled into view (not left below the bottom of the panel).
  await expect(day(page, now).locator('h3')).toBeInViewport({ ratio: 1 });
  await expect(day(page, now).locator('.cal-event').last()).toBeInViewport({ ratio: 1 });
  expect(errors).toEqual([]);
});

// Panel width (owner request, 2026-10-16, job #56): roomier defaults, and a handle on the panel's left edge.
const handle = (page: Page) => page.getByRole('separator', { name: 'Resize calendar' });
const width = async (page: Page) => (await panel(page).boundingBox())!.width;
const cornerRight = async (page: Page) => {
  const box = (await page.locator('.corner-controls').boundingBox())!;
  return page.viewportSize()!.width - box.x - box.width;
};
const viewButton = (page: Page, name: 'Week' | 'Month') => panel(page).getByRole('button', { name, exact: true });
/** Drags the handle so the panel's left edge is at `x`. */
async function dragTo(page: Page, x: number) {
  const box = (await handle(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(x, box.y + 200, { steps: 6 });
  await page.mouse.up();
}

test('the side panel opens 420px wide for Week and 720px for Month, and other panels stay 300px', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  expect(await width(page)).toBe(420);
  await viewButton(page, 'Month').click();
  await expect.poll(() => width(page)).toBe(720);
  // The zoom control and its buttons move aside to stay clear of the panel.
  await expect.poll(() => cornerRight(page)).toBe(744);
  // Cells are about 100px, so timed events show their start time.
  const todayCell = panel(page).getByRole('grid').getByRole('gridcell', { name: new RegExp(`^${label(new Date())}`) });
  await expect(todayCell.locator('.cal-chip-time').first()).toBeVisible();
  await viewButton(page, 'Week').click();
  await expect.poll(() => width(page)).toBe(420);
  await expect.poll(() => cornerRight(page)).toBe(444);
  // A narrow window keeps at least 300px of board beside it, and the width comes back when it grows.
  await viewButton(page, 'Month').click();
  await page.setViewportSize({ width: 760, height: 800 });
  await expect.poll(() => width(page)).toBe(460);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => width(page)).toBe(720);
  // Other side panels keep their width and have no handle.
  const corner = page.locator('.corner-controls');
  await corner.getByRole('button', { name: 'Focus timer' }).click();
  await expect.poll(async () => (await page.getByRole('complementary', { name: 'Focus timer' }).boundingBox())!.width).toBe(300);
  await expect(handle(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('dragging the panel’s left edge resizes it, within limits, separately for Week and Month, and it is remembered', async ({ page }) => {
  const name = `Cal${tag()}`;
  const errors = await openAs(page, name);
  await button(page).click();
  await expect(handle(page)).toBeVisible();
  await dragTo(page, 1440 - 520);
  await expect.poll(() => width(page)).toBe(520);
  await expect.poll(() => cornerRight(page)).toBe(544);
  // Month has its own width.
  await viewButton(page, 'Month').click();
  await expect.poll(() => width(page)).toBe(720);
  await dragTo(page, 1440 - 900);
  await expect.poll(() => width(page)).toBe(900);
  await viewButton(page, 'Week').click();
  await expect.poll(() => width(page)).toBe(520);
  // At least 300px, and 300px of board stays visible.
  await dragTo(page, 1430);
  await expect.poll(() => width(page)).toBe(300);
  await dragTo(page, 5);
  await expect.poll(() => width(page)).toBe(1140);
  await dragTo(page, 1440 - 480);
  await expect.poll(() => width(page)).toBe(480);
  // Remembered on this device: a reload opens at the same widths.
  await page.reload();
  await fontsLoaded(page);
  await button(page).click();
  await expect.poll(() => width(page)).toBe(480);
  await viewButton(page, 'Month').click();
  await expect.poll(() => width(page)).toBe(900);
  expect(errors).toEqual([]);
});

test('the resize handle works from the keyboard (arrows, 20px a press) and double-click puts the default back', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  const bar = handle(page);
  await expect(bar).toHaveAttribute('aria-orientation', 'vertical');
  await expect(bar).toHaveAttribute('aria-valuenow', '420');
  await expect(bar).toHaveAttribute('aria-valuemin', '300');
  await expect(bar).toHaveAttribute('aria-valuemax', '1140');
  await bar.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => width(page)).toBe(440);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => width(page)).toBe(480);
  await expect(bar).toHaveAttribute('aria-valuenow', '480');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => width(page)).toBe(460);
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(() => width(page)).toBe(300);
  await bar.dblclick();
  await expect.poll(() => width(page)).toBe(420);
  expect(errors).toEqual([]);
});

test('on a phone-sized screen the calendar is full screen and has no resize handle', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  await expect(handle(page)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(handle(page)).toHaveCount(0);
  await expect.poll(() => width(page)).toBe(390);
  expect(errors).toEqual([]);
});

test('a bad remembered width falls back to the defaults', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('note-board:calendar-width', '{"week":"huge","month":5}'));
  const errors = await openAs(page);
  await button(page).click();
  expect(await width(page)).toBe(420);
  await viewButton(page, 'Month').click();
  await expect.poll(() => width(page)).toBe(720);
  expect(errors).toEqual([]);
});

test('in the Week view an event’s name wraps onto a second line instead of being cut', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  const now = new Date();
  await day(page, now).getByRole('button', { name: `Add event on ${label(now)}` }).click();
  await page.keyboard.type('Quarterly planning review with the whole design and engineering teams');
  await form(page).getByRole('button', { name: 'Save' }).click();
  const title = day(page, now).locator('.cal-title', { hasText: 'Quarterly planning' });
  const box = await title.evaluate((el) => ({ height: el.clientHeight, full: el.scrollHeight }));
  expect(box.height).toBeGreaterThan(24); // two lines
  expect(box.full).toBeLessThanOrEqual(box.height); // nothing cut off
  // A name too long for two lines is cut after the second.
  await day(page, now).getByRole('button', { name: /Quarterly planning/ }).click();
  await form(page).getByLabel('Title').fill('word '.repeat(60));
  await form(page).getByRole('button', { name: 'Save' }).click();
  const long = await day(page, now).locator('.cal-title', { hasText: 'word word' }).evaluate((el) => ({ height: el.clientHeight, full: el.scrollHeight }));
  expect(long.height).toBeLessThan(44);
  expect(long.full).toBeGreaterThan(long.height);
  expect(errors).toEqual([]);
});

test('when Google Calendar can’t be reached, one plain note shows and nothing breaks', async ({ page }) => {
  const errors = await openAs(page);
  await page.route('**/__calendar/**', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":{"code":403,"message":"accessNotConfigured"}}' }));
  await button(page).click();
  await expect(panel(page).getByText('Google Calendar isn’t connected yet. Try again later.')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Connect Google Calendar' })).toHaveCount(0);
  await page.unroute('**/__calendar/**');
  await panel(page).getByRole('button', { name: 'Try again' }).click();
  await expect(day(page, new Date()).getByRole('button', { name: /Dentist/ })).toBeVisible();
  expect(errors).toEqual([]);
});

// Locally, ?demo-calendar=blocked (or =refused) makes the first ask for calendar access fail the way
// Google's window does when it is blocked or closed (or when access isn't given).
for (const [kind, note] of [
  ['blocked', 'Google’s window didn’t open or was closed. Click Connect Google Calendar to try again.'],
  ['refused', 'Calendar access wasn’t given. Click Connect Google Calendar to allow it.'],
] as const) {
  test(`without calendar access (${kind}) it says why, and Connect Google Calendar asks again`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/?demo-user=Cal${tag()}&demo-calendar=${kind}`);
    await fontsLoaded(page);
    await button(page).click();
    await expect(panel(page).getByText(note)).toBeVisible();
    await expect(panel(page).getByRole('button', { name: 'Try again' })).toHaveCount(0);
    const connect = panel(page).getByRole('button', { name: 'Connect Google Calendar' });
    await expect(connect).toHaveClass(/cal-connect/);
    await connect.click();
    await expect(day(page, new Date()).getByRole('button', { name: /Dentist/ })).toBeVisible();
    await expect(connect).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test.describe('on a wide phone-layout screen (month cells 70px or wider)', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 590, height: 1000 } });

  test('month cells show start times and up to three lines', async ({ page }) => {
    await openAs(page);
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Google Calendar' }).tap();
    await panel(page).getByRole('button', { name: 'Month', exact: true }).tap();
    const now = new Date();
    const todayCell = panel(page).getByRole('grid').getByRole('gridcell', { name: new RegExp(`^${label(now)}`) });
    await expect(todayCell.locator('.cal-chip')).toHaveText(['09:00Team stand-up', '10:00Dentist']);
    await expect(todayCell.locator('.cal-chip-time').first()).toBeVisible();
    // A third event still fits: three lines, no "+n more".
    await day(page, now).getByRole('button', { name: `Add event on ${label(now)}` }).tap();
    await page.keyboard.type('Swim');
    await form(page).getByLabel('Start time').fill('07:00');
    await form(page).getByLabel('End time').fill('07:45');
    await form(page).getByRole('button', { name: 'Save' }).tap();
    await expect(todayCell.locator('.cal-chip')).toHaveText(['07:00Swim', '09:00Team stand-up', '10:00Dentist']);
    await expect(todayCell.getByRole('button', { name: /more$/ })).toHaveCount(0);
  });
});

test.describe('on a phone-sized screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('Google Calendar is in the ⋯ menu', async ({ page }) => {
    await openAs(page);
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Google Calendar' }).tap();
    await expect(panel(page)).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'More' })).toHaveCount(0);
    await expect(day(page, new Date()).getByRole('button', { name: /Dentist/ })).toBeVisible();
  });
});
