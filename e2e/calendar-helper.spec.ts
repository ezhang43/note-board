import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// The calendar helper (owner decision 2026-11-20): it keeps the Google connection, so once connected a
// new access comes without Google's window, on a reload, after the hour, or on another device, until
// Disconnect calendar. Locally, ?demo-helper=on uses the dev server's pretend helper
// (src/calendar/devServer.ts), and the pretend "window" is the helper's /connect.

const tag = () => Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, '');
const ACCESS_KEY = 'note-board:calendar-access';
const PINNED = new Date(2026, 10, 15, 12, 0);
const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DISCONNECTED = 'Google Calendar is disconnected. Click Connect Google Calendar to connect it again.';
const BLOCKED = 'Google’s window didn’t open or was closed. Click Connect Google Calendar to try again.';

const button = (page: Page) => page.locator('.corner-controls').getByRole('button', { name: 'Google Calendar' });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Google Calendar' });
const dentist = (page: Page) => panel(page).getByRole('button', { name: /Dentist/ });

/** Opens the board as `name` with the pretend helper, and returns the helper paths asked for and the page errors. */
async function open(page: Page, name: string, extra = '') {
  const asked: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => {
    const m = /__calendar-helper\/(\w+)/.exec(r.url());
    if (m) asked.push(m[1]);
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(PINNED);
  await page.setExtraHTTPHeaders({ 'x-demo-today': key(PINNED) });
  await page.goto(`/?demo-user=${name}&demo-helper=on${extra}`);
  await fontsLoaded(page);
  await button(page).click();
  return { asked, errors };
}

test('connected once, a reload with the hour’s access gone shows the events without Google’s window', async ({ page }) => {
  const name = `Helper${tag()}`;
  const first = await open(page, name, '&demo-calendar=blocked');
  // Not connected yet: the "window" is needed, and here it is blocked.
  await expect(panel(page).getByText(BLOCKED)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Connect Google Calendar' }).click();
  await expect(dentist(page)).toBeVisible();
  expect(first.asked).toEqual(['access', 'connect']);

  // The hour's access is gone from this device (as after the hour, or on another device).
  await page.evaluate((k) => localStorage.removeItem(k), ACCESS_KEY);
  const again = await open(page, name, '&demo-calendar=blocked');
  await expect(dentist(page)).toBeVisible();
  await expect(panel(page).getByText(BLOCKED)).toHaveCount(0);
  expect(again.asked).toEqual(['access']); // no window: only the helper's access
  expect([...first.errors, ...again.errors]).toEqual([]);
});

test('Disconnect calendar forgets the connection; Connect Google Calendar connects again', async ({ page }) => {
  const name = `Helper${tag()}`;
  const { asked, errors } = await open(page, name);
  await expect(dentist(page)).toBeVisible();
  const link = panel(page).getByRole('button', { name: 'Disconnect calendar' });
  // At the bottom of the panel, under the scrolling week list (not scrolled away inside it).
  await expect(link).toBeInViewport();
  const weeks = await panel(page).locator('.cal-weeks').boundingBox();
  const at = await link.boundingBox();
  expect(at!.y).toBeGreaterThanOrEqual(weeks!.y + weeks!.height);
  await link.click();
  await expect(panel(page).getByText(DISCONNECTED)).toBeVisible();
  await expect(dentist(page)).toHaveCount(0);
  await expect(link).toHaveCount(0);
  await expect(panel(page).getByRole('button', { name: 'Connect Google Calendar' })).toBeFocused();
  expect(await page.evaluate((k) => localStorage.getItem(k), ACCESS_KEY)).toBeNull();
  expect(asked).toEqual(['access', 'connect', 'disconnect']);

  // A reload doesn't bring it back without the window.
  const reload = await open(page, name, '&demo-calendar=blocked');
  await expect(panel(page).getByText(BLOCKED)).toBeVisible();
  expect(reload.asked).toEqual(['access']);
  await panel(page).getByRole('button', { name: 'Connect Google Calendar' }).click();
  await expect(dentist(page)).toBeVisible();
  expect(reload.asked).toEqual(['access', 'connect']); // Connect goes straight to the window
  expect([...errors, ...reload.errors]).toEqual([]);
});

test('without the helper there is no Disconnect calendar link', async ({ page }) => {
  await page.clock.setFixedTime(PINNED);
  await page.setExtraHTTPHeaders({ 'x-demo-today': key(PINNED) });
  await page.goto(`/?demo-user=Helper${tag()}`);
  await fontsLoaded(page);
  await button(page).click();
  await expect(dentist(page)).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Disconnect calendar' })).toHaveCount(0);
});
