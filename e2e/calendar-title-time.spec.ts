import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// A time typed in an event's title ("Dinner 8pm") sets its start on Save and leaves the title
// (owner request, 2026-11-22). Uses the pretend calendar that `?demo-user=…` gives (see calendar.spec.ts):
// "Dentist" today 10:00–11:00.

const tag = () => Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, '');
const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
const PINNED = new Date(2026, 10, 15, 12, 0);

async function openAs(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(PINNED);
  await page.setExtraHTTPHeaders({ 'x-demo-today': key(PINNED) });
  await page.goto(`/?demo-user=Cal${tag()}`);
  await fontsLoaded(page);
  await page.locator('.corner-controls').getByRole('button', { name: 'Google Calendar' }).click();
  return errors;
}
const panel = (page: Page) => page.getByRole('complementary', { name: 'Google Calendar' });
const today = (page: Page) => panel(page).getByRole('region', { name: label(PINNED) });
const form = (page: Page) => panel(page).getByRole('form');

test('a new event titled “Dinner 8pm” is saved at 8 – 9pm as “Dinner”', async ({ page }) => {
  const errors = await openAs(page);
  await today(page).getByRole('button', { name: `Add event on ${label(PINNED)}` }).click();
  await form(page).getByLabel('Title').fill('Dinner 8pm');
  // Nothing changes while typing.
  await expect(form(page).getByLabel('Start time')).toHaveValue('12:00 PM');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(form(page)).toHaveCount(0);
  const event = today(page).getByRole('button', { name: '8 – 9pm Dinner' });
  await expect(event).toBeVisible();
  await expect(today(page).getByRole('button', { name: /Dinner 8pm/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('changing an event’s title to “Dentist at 3:30-4:15pm” moves it there and drops the time words; Ctrl+Z puts it back', async ({ page }) => {
  const errors = await openAs(page);
  await expect(panel(page).locator('[aria-busy="true"]')).toHaveCount(0);
  await today(page).getByRole('button', { name: '10 – 11am Dentist' }).click();
  await panel(page).getByRole('dialog').getByRole('button', { name: 'Edit event' }).click();
  await form(page).getByLabel('Title').fill('Dentist at 3:30-4:15pm');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(form(page)).toHaveCount(0);
  await expect(today(page).getByRole('button', { name: '3:30 – 4:15pm Dentist' })).toBeVisible();
  await expect(today(page).getByRole('button', { name: '10 – 11am Dentist' })).toHaveCount(0);
  await expect(panel(page).locator('[aria-busy="true"]')).toHaveCount(0);
  await today(page).getByRole('heading').first().click();
  await page.keyboard.press('Control+z');
  await expect(today(page).getByRole('button', { name: '10 – 11am Dentist' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a change that leaves the title as it was doesn’t read it again: only the start picked counts', async ({ page }) => {
  const errors = await openAs(page);
  await today(page).getByRole('button', { name: `Add event on ${label(PINNED)}` }).click();
  // "Call 3pm then 5pm": the first time counts, the second stays in the name.
  await form(page).getByLabel('Title').fill('Call 3pm then 5pm');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(today(page).getByRole('button', { name: '3 – 4pm Call then 5pm' })).toBeVisible();
  // Opened again and only the start changed: the "5pm" left in the name is not read.
  await expect(panel(page).locator('[aria-busy="true"]')).toHaveCount(0);
  await today(page).getByRole('button', { name: '3 – 4pm Call then 5pm' }).click();
  await panel(page).getByRole('dialog').getByRole('button', { name: 'Edit event' }).click();
  const startBox = form(page).getByLabel('Start time');
  await startBox.fill('10:00');
  await startBox.press('Enter');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(today(page).getByRole('button', { name: '10 – 11am Call then 5pm' })).toBeVisible();
  expect(errors).toEqual([]);
});
