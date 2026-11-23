import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Repeating calendar events (owner request, 2026-11-22): Google Calendar-style Repeat dropdown +
// Custom options, changing an existing event/series, read-only unsupported rules, green/blue look & Undo.

const tag = () => Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, '');
const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
const PINNED = new Date(2026, 10, 15, 12, 0); // Sunday 15 Nov 2026 (3rd Sunday)
const dayOffset = (n: number) => new Date(PINNED.getFullYear(), PINNED.getMonth(), PINNED.getDate() + n);

async function openAs(page: Page, clickDesktopButton = true) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(PINNED);
  await page.setExtraHTTPHeaders({ 'x-demo-today': key(PINNED) });
  await page.goto(`/?demo-user=Rep${tag()}`);
  await fontsLoaded(page);
  if (clickDesktopButton) await page.locator('.corner-controls').getByRole('button', { name: 'Google Calendar' }).click();
  return errors;
}

const panel = (page: Page) => page.getByRole('complementary', { name: 'Google Calendar' });
const dayRegion = (page: Page, n: number) => panel(page).getByRole('region', { name: label(dayOffset(n)) });
const form = (page: Page) => panel(page).getByRole('form');
const card = (page: Page) => panel(page).getByRole('dialog');
const answered = (page: Page) => expect(panel(page).locator('[aria-busy="true"]')).toHaveCount(0);

test('add a Daily repeating event (blue for own reminder) and Ctrl+Z removes the whole series', async ({ page }) => {
  const errors = await openAs(page);
  await dayRegion(page, 0).getByRole('button', { name: `Add event on ${label(PINNED)}` }).click();
  await form(page).getByLabel('Title').fill('Stretch');
  const repeat = form(page).getByLabel('Repeat');
  await expect(repeat).toBeVisible();
  await expect(repeat.locator('option')).toHaveText([
    'Does not repeat',
    'Daily',
    'Weekly on Sunday',
    'Monthly on the third Sunday',
    'Annually on November 15',
    'Every weekday',
    'Custom…',
  ]);
  await repeat.selectOption('daily');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(form(page)).toHaveCount(0);
  await answered(page);

  // Appears across the week and stays blue (not green, since no guests).
  for (const n of [0, 1, 2, 6]) {
    const ev = dayRegion(page, n).getByRole('button', { name: '12 – 1pm Stretch' });
    await expect(ev).toBeVisible();
    await expect(ev).not.toHaveClass(/\bgreen\b/);
  }

  // Ctrl+Z removes the entire series; Ctrl+Y brings it back.
  await dayRegion(page, 0).getByRole('heading').click();
  await page.keyboard.press('Control+z');
  for (const n of [0, 1, 2]) await expect(dayRegion(page, n).getByRole('button', { name: /Stretch/ })).toHaveCount(0);
  await page.keyboard.press('Control+y');
  for (const n of [0, 1, 2]) await expect(dayRegion(page, n).getByRole('button', { name: '12 – 1pm Stretch' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Custom repeat: every 2 days after 3 occurrences, and weekly on Mon+Wed with guest (green)', async ({ page }) => {
  const errors = await openAs(page);
  // 1. Every 2 days, after 3 occurrences.
  await dayRegion(page, 0).getByRole('button', { name: `Add event on ${label(PINNED)}` }).click();
  await form(page).getByLabel('Title').fill('Water plants');
  await form(page).getByLabel('Repeat').selectOption('custom');
  await form(page).getByLabel('Repeat interval').fill('2');
  await form(page).getByLabel('Repeat unit').selectOption('day');
  await form(page).getByRole('radio', { name: 'After' }).check();
  await form(page).getByLabel('Repeat occurrences').fill('3');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(form(page)).toHaveCount(0);
  await answered(page);

  for (const n of [0, 2, 4]) await expect(dayRegion(page, n).getByRole('button', { name: '12 – 1pm Water plants' })).toBeVisible();
  for (const n of [1, 3, 5, 6]) await expect(dayRegion(page, n).getByRole('button', { name: /Water plants/ })).toHaveCount(0);

  // 2. Weekly on Mon + Wed with a guest (turns green like any meeting).
  await dayRegion(page, 0).getByRole('button', { name: `Add event on ${label(PINNED)}` }).click();
  await form(page).getByRole('button', { name: 'More options' }).click();
  await form(page).getByLabel('Title').fill('Design sync');
  await form(page).getByLabel('Repeat').selectOption('custom');
  await form(page).getByRole('button', { name: 'Monday' }).click();
  await form(page).getByRole('button', { name: 'Wednesday' }).click();
  await form(page).getByRole('button', { name: 'Sunday' }).click(); // deselect default Sunday
  await form(page).getByLabel('Guest email').fill('alex@example.com');
  await form(page).getByRole('button', { name: 'Add guest' }).click();
  await form(page).getByRole('button', { name: 'Save' }).click();
  await panel(page).getByRole('alertdialog').getByRole('button', { name: 'Don’t send' }).click();
  await expect(form(page)).toHaveCount(0);
  await answered(page);

  for (const n of [1, 3]) {
    const ev = dayRegion(page, n).getByRole('button', { name: '12 – 1pm Design sync' });
    await expect(ev).toBeVisible();
    await expect(ev).toHaveClass(/\bgreen\b/);
  }
  await expect(dayRegion(page, 0).getByRole('button', { name: /Design sync/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('make an existing one-off event repeat and Undo back to one-off; change an existing series repeat and Undo', async ({ page }) => {
  const errors = await openAs(page);
  // Turn one-off Dentist into Daily.
  await answered(page);
  await dayRegion(page, 0).getByRole('button', { name: '10 – 11am Dentist' }).click();
  await card(page).getByRole('button', { name: 'Edit event' }).click();
  await expect(form(page).getByLabel('Repeat')).toHaveValue('none');
  await form(page).getByLabel('Repeat').selectOption('daily');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(form(page)).toHaveCount(0);
  await answered(page);
  await expect(dayRegion(page, 1).getByRole('button', { name: '10 – 11am Dentist' })).toBeVisible();

  // Undo turns Dentist back into a one-off event.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await answered(page);
  await expect(dayRegion(page, 0).getByRole('button', { name: '10 – 11am Dentist' })).toBeVisible();
  await expect(dayRegion(page, 1).getByRole('button', { name: /Dentist/ })).toHaveCount(0);

  // Change Team stand-up (Daily) to Every weekday (Mon–Fri): Sunday & Saturday disappear; Undo brings them back.
  await dayRegion(page, 0).getByRole('button', { name: '9 – 9:15am Team stand-up' }).click();
  await card(page).getByRole('button', { name: 'Edit event' }).click();
  await expect(form(page).getByLabel('Repeat')).toHaveValue('daily');
  await form(page).getByLabel('Repeat').selectOption('weekday');
  await form(page).getByRole('button', { name: 'Save' }).click();
  const ask = panel(page).getByRole('alertdialog', { name: 'Save changes to which events?' });
  await expect(ask.getByText(/updates all events in the series/i)).toBeVisible();
  await expect(ask.getByRole('button', { name: 'Only this event' })).toHaveCount(0);
  await ask.getByRole('button', { name: 'All events in the series' }).click();
  await expect(form(page)).toHaveCount(0);
  await answered(page);

  await expect(dayRegion(page, 0).getByRole('button', { name: /Team stand-up/ })).toHaveCount(0);
  await expect(dayRegion(page, 1).getByRole('button', { name: '9 – 9:15am Team stand-up' })).toBeVisible();
  await expect(dayRegion(page, 6).getByRole('button', { name: /Team stand-up/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await answered(page);
  await expect(dayRegion(page, 0).getByRole('button', { name: '9 – 9:15am Team stand-up' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('an unreadable RRULE shows as read-only and is left untouched on Save', async ({ page }) => {
  const errors = await openAs(page);
  let patchedBody: Record<string, unknown> | null = null;
  await page.route('**/__calendar/calendar/v3/calendars/primary/events/standup*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      const res = await route.fetch();
      const json = (await res.json()) as Record<string, unknown>;
      json.recurrence = ['RRULE:FREQ=MONTHLY;BYSETPOS=-1;BYDAY=MO,TU,WE,TH,FR'];
      await route.fulfill({ response: res, json });
      return;
    }
    if (req.method() === 'PATCH') {
      patchedBody = req.postDataJSON() as Record<string, unknown>;
    }
    await route.continue();
  });

  await dayRegion(page, 0).getByRole('button', { name: '9 – 9:15am Team stand-up' }).click();
  await card(page).getByRole('button', { name: 'Edit event' }).click();
  await expect(form(page).getByText(/Custom repeat \(edit in Google Calendar\)/)).toBeVisible();
  await expect(form(page).getByLabel('Repeat')).toHaveCount(0);
  await form(page).getByLabel('Title').fill('Team sync');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await panel(page).getByRole('alertdialog').getByRole('button', { name: 'All events in the series' }).click();
  await expect(form(page)).toHaveCount(0);
  expect(patchedBody).not.toBeNull();
  expect('recurrence' in patchedBody!).toBe(false);
  expect(errors).toEqual([]);
});

test.describe('phone layout', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('Repeat dropdown and Custom controls use 16px text and fit without overflow', async ({ page }) => {
    const errors = await openAs(page, false);
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Google Calendar' }).tap();
    await dayRegion(page, 0).getByRole('button', { name: `Add event on ${label(PINNED)}` }).tap();
    const repeat = form(page).getByLabel('Repeat');
    await expect(repeat).toBeVisible();
    const selectFont = await repeat.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(selectFont).toBeGreaterThanOrEqual(16);
    await repeat.selectOption('custom');
    const dayHeight = await form(page).getByRole('button', { name: 'Monday' }).evaluate((el) => el.getBoundingClientRect().height);
    expect(dayHeight).toBeGreaterThanOrEqual(44);
    const overflow = await form(page).evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(overflow).toBe(false);
    expect(errors).toEqual([]);
  });
});
