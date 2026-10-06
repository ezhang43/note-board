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
/** Another day in this week (Monday, or Tuesday when today is Monday), so it shows in the week view. */
function otherDayThisWeek() {
  const d = new Date();
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return d.getDay() === 1 ? new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 1) : monday;
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
  const other = otherDayThisWeek();
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
  const thisWeek = await heading.textContent();
  await panel(page).getByRole('button', { name: 'Next week' }).click();
  await expect(heading).not.toHaveText(thisWeek!);
  await panel(page).getByRole('button', { name: 'Today', exact: true }).click();
  await expect(heading).toHaveText(thisWeek!);

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

test('when Google Calendar can’t be reached, one plain note shows and nothing breaks', async ({ page }) => {
  const errors = await openAs(page);
  await page.route('**/__calendar/**', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":{"code":403,"message":"accessNotConfigured"}}' }));
  await button(page).click();
  await expect(panel(page).getByText('Google Calendar isn’t connected yet. Try again later.')).toBeVisible();
  await page.unroute('**/__calendar/**');
  await panel(page).getByRole('button', { name: 'Try again' }).click();
  await expect(day(page, new Date()).getByRole('button', { name: /Dentist/ })).toBeVisible();
  expect(errors).toEqual([]);
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
