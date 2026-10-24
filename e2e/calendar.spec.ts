import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, cards, fontsLoaded } from './helpers';

// Google Calendar side panel (owner request, 2026-10-06). Tests can't reach Google: with
// ?demo-user=… `npm run dev` answers like the Calendar API from a pretend calendar (src/calendar/devServer.ts),
// a fresh one for each demo person, holding: "Dentist" today 10:00–11:00 (simple), "Team stand-up" every
// day 09:00–09:15 (repeating), "Lunch with Sam" tomorrow (with a guest), "Holiday" all day in 3 days and
// "Book club" in 2 days 18:00–19:00 (someone else's, so read-only).

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
/** The small card an event opens (job #108). */
const card = (page: Page) => panel(page).getByRole('dialog');
/** Clicks an event, then the card's pencil: the change form, as a click alone opened before job #108. */
async function edit(page: Page, event: Locator) {
  await event.click();
  await card(page).getByRole('button', { name: 'Edit event' }).click();
}

test('without anyone signed in there is no calendar button', async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
  await expect(page.locator('.corner-controls').getByRole('button', { name: 'Focus timer' })).toBeVisible();
  await expect(button(page)).toHaveCount(0);
});

test('opens beside the board with this week’s events; someone else’s event is read-only', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(button(page)).toHaveAttribute('aria-pressed', 'true');
  const today = day(page, new Date());
  await expect(today.getByRole('button', { name: '10 – 11am Dentist' })).toBeVisible();
  await expect(today.getByRole('button', { name: /9 – 9:15am Team stand-up/ })).toBeVisible();

  // Someone else's event shows its details in the card, read-only (no pencil or trash), with a link to change it in Google Calendar.
  await day(page, daysFromToday(2)).getByRole('button', { name: '6 – 7pm Book club, read-only' }).click();
  await expect(card(page).getByText(/can only be changed in Google Calendar/)).toBeVisible();
  const link = card(page).getByRole('link', { name: 'Open in Google Calendar' });
  await expect(link).toHaveAttribute('href', /^https:\/\/(calendar|www)\.google\.com\//);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(card(page).getByRole('button', { name: 'Edit event' })).toHaveCount(0);
  await expect(card(page).getByRole('button', { name: 'Delete event' })).toHaveCount(0);
  await expect(form(page)).toHaveCount(0);
  await card(page).getByRole('button', { name: 'Close' }).click();

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
  await expect(day(page, today).getByRole('button', { name: '7 – 7:45am Swim' })).toBeVisible();

  await openAs(page, name);
  await button(page).click();
  await expect(day(page, today).getByRole('button', { name: '7 – 7:45am Swim' })).toBeVisible();
});

test('an end before the start is refused with a plain note', async ({ page }) => {
  await openAs(page);
  await button(page).click();
  await edit(page, day(page, new Date()).getByRole('button', { name: /Dentist/ }));
  await form(page).getByLabel('End time').fill('09:00');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(form(page).getByText('The end must be after the start.')).toBeVisible();
});

test('rename a simple event and move it to another day', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  const today = new Date();
  const other = daysFromToday(2);
  await edit(page, day(page, today).getByRole('button', { name: '10 – 11am Dentist' }));
  await form(page).getByLabel('Title').fill('Dentist check-up');
  await form(page).getByLabel('Start date').fill(key(other));
  await form(page).getByLabel('Start time').fill('14:00');
  await form(page).getByLabel('End time').fill('15:00');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(day(page, other).getByRole('button', { name: '2 – 3pm Dentist check-up' })).toBeVisible();
  if (key(other) !== key(today)) await expect(day(page, today).getByRole('button', { name: /Dentist/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a timed event can be made all-day, and back', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  const today = day(page, new Date());
  await edit(page, today.getByRole('button', { name: '10 – 11am Dentist' }));
  await form(page).getByLabel('All day').check();
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(today.getByRole('button', { name: 'All day Dentist' })).toBeVisible();
  await edit(page, today.getByRole('button', { name: 'All day Dentist' }));
  await form(page).getByLabel('All day').uncheck();
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(today.getByRole('button', { name: '9 – 10am Dentist' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('delete asks first (Keep / Delete); Escape keeps the panel open; Ctrl+Z doesn’t bring it back', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  const today = day(page, new Date());
  await edit(page, today.getByRole('button', { name: /Dentist/ }));
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

// Repeating events and guests (owner request, 2026-10-16, job #85).
const asked = (page: Page, name: string) => panel(page).getByRole('alertdialog', { name });
const WHICH = 'Save changes to which events?';
const EMAILS = 'Send update emails to guests?';
/** The changes sent to the calendar (adds, changes, deletes) as "METHOD url", in order. */
const ONLY_THIS = 'Moving it to another day, or to or from all day, changes only this event.';

function changesSent(page: Page) {
  const urls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/__calendar/') && r.method() !== 'GET') urls.push(`${r.method()} ${r.url()}`);
  });
  return urls;
}

test('a repeating event: “Only this event” changes just that one, “All events in the series” changes them all', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  const standUp = (n: number) => day(page, daysFromToday(n)).getByRole('button', { name: /Team stand-up/ });

  // Only this event: today's is renamed, tomorrow's isn't. No guests, so no question about emails.
  await edit(page, day(page, new Date()).getByRole('button', { name: '9 – 9:15am Team stand-up' }));
  await form(page).getByLabel('Title').fill('Planning');
  await form(page).getByRole('button', { name: 'Save' }).click();
  const which = asked(page, WHICH);
  await expect(which.getByRole('button', { name: 'Only this event' })).toBeFocused();
  await which.getByRole('button', { name: 'Only this event' }).click();
  await expect(form(page)).toHaveCount(0);
  await expect(asked(page, EMAILS)).toHaveCount(0);
  await expect(day(page, new Date()).getByRole('button', { name: '9 – 9:15am Planning' })).toBeVisible();
  await expect(standUp(1)).toHaveAccessibleName('9 – 9:15am Team stand-up');

  // All events: tomorrow's is moved to 09:30, and every other one follows, except today's (changed on its own).
  await edit(page, standUp(1));
  await form(page).getByLabel('Start time').fill('09:30');
  await form(page).getByLabel('End time').fill('09:45');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await asked(page, WHICH).getByRole('button', { name: 'All events in the series' }).click();
  await expect(form(page)).toHaveCount(0);
  for (const n of [1, 2, 6]) await expect(standUp(n)).toHaveAccessibleName('9:30 – 9:45am Team stand-up');
  await expect(day(page, new Date()).getByRole('button', { name: '9 – 9:15am Planning' })).toBeVisible();
  await panel(page).getByRole('button', { name: 'Next week' }).click();
  await expect(standUp(7)).toHaveAccessibleName('9:30 – 9:45am Team stand-up');
  await panel(page).getByRole('button', { name: 'Today', exact: true }).click();

  // Moved to another day: only that one can change; Escape goes back to the form.
  await edit(page, standUp(3));
  await form(page).getByLabel('Start date').fill(key(daysFromToday(4)));
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(asked(page, WHICH).getByText(ONLY_THIS)).toBeVisible();
  await expect(asked(page, WHICH).getByRole('button', { name: 'All events in the series' })).toHaveCount(0);
  // While asked, the form can't be changed underneath the question.
  await expect(form(page).getByLabel('Start date')).toBeDisabled();
  await expect(form(page).getByLabel('Guest email')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(asked(page, WHICH)).toHaveCount(0);
  await expect(form(page).getByLabel('Start date')).toBeEnabled();
  // Made all-day: only that one too.
  await form(page).getByLabel('Start date').fill(key(daysFromToday(3)));
  await form(page).getByLabel('All day').check();
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(asked(page, WHICH).getByText(ONLY_THIS)).toBeVisible();
  await expect(asked(page, WHICH).getByRole('button', { name: 'All events in the series' })).toHaveCount(0);
  await asked(page, WHICH).getByRole('button', { name: 'Cancel' }).click();
  await expect(form(page)).toBeVisible();
  await form(page).getByRole('button', { name: 'Cancel' }).click();

  // Deleting: only this one, then the whole series.
  await edit(page, standUp(5));
  await form(page).getByRole('button', { name: 'Delete' }).click();
  const del = asked(page, 'Delete “Team stand-up”?');
  await expect(del.getByRole('button', { name: 'Keep' })).toBeFocused();
  await del.getByRole('button', { name: 'Only this event' }).click();
  await expect(standUp(5)).toHaveCount(0);
  await expect(standUp(4)).toHaveCount(1);
  await edit(page, standUp(4));
  await form(page).getByRole('button', { name: 'Delete' }).click();
  await asked(page, 'Delete “Team stand-up”?').getByRole('button', { name: 'All events in the series' }).click();
  // Like Google, the whole series includes the ones changed on their own.
  await expect(panel(page).getByRole('button', { name: /Team stand-up|Planning/ })).toHaveCount(0);
  await expect(day(page, new Date()).getByRole('button', { name: /Dentist/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('“All events” after one event was moved on its own changes only what was edited, not the series’ time, and renames that event too (findings 1, 2)', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  // Today's stand-up moves to 10:00 on its own.
  await edit(page, day(page, new Date()).getByRole('button', { name: '9 – 9:15am Team stand-up' }));
  await form(page).getByLabel('Start time').fill('10:00');
  await form(page).getByLabel('End time').fill('10:15');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await asked(page, WHICH).getByRole('button', { name: 'Only this event' }).click();
  await expect(day(page, new Date()).getByRole('button', { name: '10 – 10:15am Team stand-up' })).toBeVisible();
  // Then only its title changes, for all events: the others keep 09:00.
  await edit(page, day(page, new Date()).getByRole('button', { name: '10 – 10:15am Team stand-up' }));
  await form(page).getByLabel('Title').fill('Daily sync');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await asked(page, WHICH).getByRole('button', { name: 'All events in the series' }).click();
  await expect(form(page)).toHaveCount(0);
  await expect(day(page, daysFromToday(1)).getByRole('button', { name: '9 – 9:15am Daily sync' })).toBeVisible();
  await expect(day(page, daysFromToday(2)).getByRole('button', { name: '9 – 9:15am Daily sync' })).toBeVisible();
  // Finding 2: the edited event itself shows the new title too, at its own time.
  await expect(day(page, new Date()).getByRole('button', { name: '10 – 10:15am Daily sync' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('“All events” with a new time, from an event moved on its own, reaches both though the series’ new time gives its events new ids (job #88)', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  await edit(page, day(page, new Date()).getByRole('button', { name: '9 – 9:15am Team stand-up' }));
  await form(page).getByLabel('Start time').fill('10:00');
  await form(page).getByLabel('End time').fill('10:15');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await asked(page, WHICH).getByRole('button', { name: 'Only this event' }).click();
  // Now a new title and a new time for all events: the series moves to 10:30, this one keeps 10:00.
  await edit(page, day(page, new Date()).getByRole('button', { name: '10 – 10:15am Team stand-up' }));
  await form(page).getByLabel('Title').fill('Daily sync');
  await form(page).getByLabel('Start time').fill('10:30');
  await form(page).getByLabel('End time').fill('10:45');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await asked(page, WHICH).getByRole('button', { name: 'All events in the series' }).click();
  await expect(form(page)).toHaveCount(0);
  await expect(day(page, daysFromToday(1)).getByRole('button', { name: '10:30 – 10:45am Daily sync' })).toBeVisible();
  await expect(day(page, new Date()).getByRole('button', { name: '10 – 10:15am Daily sync' })).toBeVisible();
  // Tomorrow's followed the series, so it isn't one changed on its own: renaming all from it changes only the series.
  const sent = changesSent(page);
  await edit(page, day(page, daysFromToday(1)).getByRole('button', { name: '10:30 – 10:45am Daily sync' }));
  await form(page).getByLabel('Title').fill('Team sync');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await asked(page, WHICH).getByRole('button', { name: 'All events in the series' }).click();
  await expect(day(page, daysFromToday(2)).getByRole('button', { name: '10:30 – 10:45am Team sync' })).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatch(/\/events\/standup(\?|$)/);
  // It can still be changed with its new id.
  await edit(page, day(page, new Date()).getByRole('button', { name: '10 – 10:15am Daily sync' }));
  await form(page).getByLabel('Title').fill('Sync');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await asked(page, WHICH).getByRole('button', { name: 'Only this event' }).click();
  await expect(day(page, new Date()).getByRole('button', { name: '10 – 10:15am Sync' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('guests can be added and removed; “Send update emails to guests?” is asked only when there are guests', async ({ page }) => {
  const errors = await openAs(page);
  const sent = changesSent(page);
  await button(page).click();
  const today = day(page, new Date());

  // No guests: saved straight away, nothing about emails sent to Google.
  await edit(page, today.getByRole('button', { name: /Dentist/ }));
  await form(page).getByLabel('Title').fill('Dentist visit');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(form(page)).toHaveCount(0);
  await expect(asked(page, EMAILS)).toHaveCount(0);
  expect(sent.at(-1)).toMatch(/^PATCH /);
  expect(sent.at(-1)).not.toContain('sendUpdates');

  // A guest is added by email address (Enter adds it, it doesn't save); something that isn't one gets a note.
  await edit(page, today.getByRole('button', { name: /Dentist visit/ }));
  await form(page).getByLabel('Guest email').fill('not-an-email');
  await form(page).getByRole('button', { name: 'Add guest' }).click();
  await expect(form(page).getByText('That doesn’t look like an email address.')).toBeVisible();
  await form(page).getByLabel('Guest email').fill('kim@example.com');
  await page.keyboard.press('Enter');
  await expect(form(page).getByRole('listitem')).toHaveText(['kim@example.com']);
  await expect(form(page).getByLabel('Guest email')).toHaveValue('');
  await expect(form(page)).toBeVisible();
  await form(page).getByRole('button', { name: 'Save' }).click();
  const emails = asked(page, EMAILS);
  await expect(emails.getByRole('button', { name: 'Send', exact: true })).toBeFocused();
  await emails.getByRole('button', { name: /Don.t send/ }).click();
  await expect(form(page)).toHaveCount(0);
  expect(sent.at(-1)).toContain('sendUpdates=none');

  // The guest list doesn't show the person themself; removing the guest, with emails.
  const lunch = day(page, daysFromToday(1)).getByRole('button', { name: /Lunch with Sam/ });
  await edit(page, lunch);
  await expect(form(page).getByRole('listitem')).toHaveText(['sam@example.com']);
  await form(page).getByRole('button', { name: 'Remove guest sam@example.com' }).click();
  await expect(form(page).getByRole('listitem')).toHaveCount(0);
  await form(page).getByRole('button', { name: 'Save' }).click();
  await asked(page, EMAILS).getByRole('button', { name: 'Send', exact: true }).click();
  await expect(form(page)).toHaveCount(0);
  expect(sent.at(-1)).toContain('sendUpdates=all');
  await edit(page, lunch);
  await expect(form(page).getByRole('listitem')).toHaveCount(0);
  await form(page).getByRole('button', { name: 'Cancel' }).click();

  // Escape on the question goes back to the form without saving.
  await edit(page, today.getByRole('button', { name: /Dentist visit/ }));
  await expect(form(page).getByRole('listitem')).toHaveText(['kim@example.com']);
  const before = sent.length;
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(asked(page, EMAILS)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(asked(page, EMAILS)).toHaveCount(0);
  await expect(form(page)).toBeVisible();
  expect(sent.length).toBe(before);

  // Deleting an event with guests asks too.
  await form(page).getByRole('button', { name: 'Delete' }).click();
  await asked(page, 'Delete “Dentist visit”?').getByRole('button', { name: 'Delete' }).click();
  await asked(page, EMAILS).getByRole('button', { name: /Don.t send/ }).click();
  await expect(today.getByRole('button', { name: /Dentist/ })).toHaveCount(0);
  expect(sent.at(-1)).toMatch(/^DELETE .*sendUpdates=none/);
  expect(errors).toEqual([]);
});

// Clicking an event opens a small card beside it, as Google Calendar does (owner request, 2026-10-19, job #108).
test('an event opens a small card beside it: title, when, guests; ×, Escape and a click outside close it', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  const lunch = day(page, daysFromToday(1)).getByRole('button', { name: /Lunch with Sam/ });
  await lunch.click();
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toBeFocused();
  await expect(card(page).getByRole('heading', { name: 'Lunch with Sam' })).toBeVisible();
  await expect(card(page).getByText(`${label(daysFromToday(1))} · 12:30 – 1:30pm`)).toBeVisible();
  await expect(card(page).getByRole('listitem')).toHaveText(['sam@example.com']);
  // The list stays in view behind it, and the card sits to the left of the event.
  await expect(day(page, new Date()).getByRole('button', { name: /Dentist/ })).toBeVisible();
  await expect(form(page)).toHaveCount(0);
  // Just left of the panel, clear of its resize strip, its top level with the event.
  const cardBox = (await card(page).boundingBox())!;
  const eventBox = (await lunch.boundingBox())!;
  const panelBox = (await panel(page).boundingBox())!;
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(panelBox.x - 4);
  expect(Math.abs(cardBox.y - eventBox.y)).toBeLessThanOrEqual(1);

  await card(page).getByRole('button', { name: 'Close' }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(lunch).toBeFocused();

  // Escape closes the card first; a second Escape closes the panel.
  await lunch.click();
  await page.keyboard.press('Escape');
  await expect(card(page)).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  await lunch.click();
  await page.locator('.canvas').click({ position: { x: 200, y: 300 } });
  await expect(card(page)).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);

  // The pencil opens the change form; an event without guests shows none.
  await button(page).click();
  await day(page, new Date()).getByRole('button', { name: '10 – 11am Dentist' }).click();
  await expect(card(page).getByRole('listitem')).toHaveCount(0);
  await card(page).getByRole('button', { name: 'Edit event' }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(form(page).getByLabel('Title')).toHaveValue('Dentist');
  expect(errors).toEqual([]);
});

test('the card’s trash asks first, the same as the form’s Delete, with the guest-email question too', async ({ page }) => {
  const errors = await openAs(page);
  const sent = changesSent(page);
  await button(page).click();
  const today = day(page, new Date());
  await today.getByRole('button', { name: /Dentist/ }).click();
  await card(page).getByRole('button', { name: 'Delete event' }).click();
  const ask = asked(page, 'Delete “Dentist”?');
  await expect(ask.getByRole('button', { name: 'Keep' })).toBeFocused();
  // Escape on the question keeps the event and the card.
  await page.keyboard.press('Escape');
  await expect(ask).toHaveCount(0);
  await expect(card(page)).toBeVisible();
  expect(sent).toEqual([]);
  await card(page).getByRole('button', { name: 'Delete event' }).click();
  await ask.getByRole('button', { name: 'Delete' }).click();
  await expect(today.getByRole('button', { name: /Dentist/ })).toHaveCount(0);
  await expect(card(page)).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  // The event's button is gone, so the keyboard goes to the panel rather than being lost.
  await expect(panel(page)).toBeFocused();
  expect(sent.at(-1)).toMatch(/^DELETE /);

  await day(page, daysFromToday(1)).getByRole('button', { name: /Lunch with Sam/ }).click();
  await card(page).getByRole('button', { name: 'Delete event' }).click();
  await asked(page, 'Delete “Lunch with Sam”?').getByRole('button', { name: 'Delete' }).click();
  await asked(page, EMAILS).getByRole('button', { name: /Don.t send/ }).click();
  await expect(day(page, daysFromToday(1)).getByRole('button', { name: /Lunch with Sam/ })).toHaveCount(0);
  expect(sent.at(-1)).toMatch(/^DELETE .*sendUpdates=none/);
  expect(errors).toEqual([]);
});

test('Delete or Backspace with the card open asks to delete the event, never the selected board note behind it', async ({ page }) => {
  const errors = await openAs(page);
  const sent = changesSent(page);
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  await expect(page.locator('.card.selected')).toHaveCount(1);
  await button(page).click();
  const today = day(page, new Date());
  const dentist = today.getByRole('button', { name: /Dentist/ });

  await dentist.click();
  await page.keyboard.press('Delete');
  const ask = asked(page, 'Delete “Dentist”?');
  await expect(ask).toBeVisible();
  await expect(cards(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(ask).toHaveCount(0);
  await page.keyboard.press('Backspace');
  await ask.getByRole('button', { name: 'Delete' }).click();
  await expect(dentist).toHaveCount(0);
  await expect(cards(page)).toHaveCount(1);
  expect(sent.at(-1)).toMatch(/^DELETE /);

  // On a read-only event the key does nothing, to the event or the board.
  const count = sent.length;
  await day(page, daysFromToday(2)).getByRole('button', { name: /Book club/ }).click();
  await page.keyboard.press('Delete');
  await expect(panel(page).getByRole('alertdialog')).toHaveCount(0);
  await expect(card(page)).toBeVisible();
  await expect(cards(page)).toHaveCount(1);

  // While typing in a text field the key types, and leaves the event alone.
  await day(page, daysFromToday(1)).getByRole('button', { name: /Lunch with Sam/ }).click();
  await page.locator('[data-card-id] textarea').first().focus();
  await page.keyboard.type('ab');
  await page.keyboard.press('Backspace');
  await expect(page.locator('[data-card-id] textarea').first()).toHaveValue('a');
  await expect(panel(page).getByRole('alertdialog')).toHaveCount(0);
  expect(sent.length).toBe(count);
  expect(errors).toEqual([]);
});

// Pressing Delete again answers the question (owner request, 2026-10-21, job #132).
test('a second fresh Delete or Backspace answers the delete question: Delete, or All events for a series; never the guest-email question', async ({ page }) => {
  const errors = await openAs(page);
  const sent = changesSent(page);
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  await button(page).click();
  const today = day(page, new Date());
  const dentist = today.getByRole('button', { name: /Dentist/ });
  const ask = asked(page, 'Delete “Dentist”?');

  // Escape still keeps it.
  await dentist.click();
  await page.keyboard.press('Delete');
  await expect(ask).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(ask).toHaveCount(0);
  await expect(card(page)).toBeVisible();
  expect(sent).toEqual([]);

  // Holding the key down: its auto-repeat never answers the question.
  await page.keyboard.down('Delete');
  await expect(ask).toBeVisible();
  await page.keyboard.down('Delete');
  await page.keyboard.down('Delete');
  await page.keyboard.up('Delete');
  await expect(ask).toBeVisible();
  expect(sent).toEqual([]);

  // A one-off event: a fresh press after letting go deletes it.
  await page.keyboard.press('Delete');
  await expect(dentist).toHaveCount(0);
  await expect(card(page)).toHaveCount(0);
  await expect(cards(page)).toHaveCount(1);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatch(/^DELETE /);

  // An event with guests: the second press answers "Delete?", but the guest-email question needs a click or Enter.
  const lunch = day(page, daysFromToday(1)).getByRole('button', { name: /Lunch with Sam/ });
  await lunch.click();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  const emails = asked(page, EMAILS);
  await expect(emails).toBeVisible();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  await expect(emails).toBeVisible();
  expect(sent).toHaveLength(1);
  await page.keyboard.press('Escape');
  await expect(emails).toHaveCount(0);
  await expect(lunch).toBeVisible();
  expect(sent).toHaveLength(1);

  // A repeating event: Backspace, then Backspace again, deletes the whole series.
  await today.getByRole('button', { name: /Team stand-up/ }).click();
  await page.keyboard.press('Backspace');
  await expect(asked(page, 'Delete “Team stand-up”?')).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(panel(page).getByRole('button', { name: /Team stand-up/ })).toHaveCount(0);
  await panel(page).getByRole('button', { name: 'Next week' }).click();
  await expect(panel(page).getByRole('button', { name: /Team stand-up/ })).toHaveCount(0);
  expect(sent).toHaveLength(2);
  // The whole series, not just today's.
  expect(sent[1]).toMatch(/^DELETE .*\/events\/standup(\?|$)/);
  await expect(cards(page)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('while a delete is on its way the card stays open, so a refusal is shown; changing the week by keyboard closes it', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  let answer: () => void = () => {};
  await page.route('**/__calendar/**', (route) =>
    route.request().method() === 'DELETE'
      ? new Promise<void>((done) => (answer = done)).then(() => route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":{"code":403}}' }))
      : route.continue(),
  );
  const dentist = day(page, new Date()).getByRole('button', { name: /Dentist/ });
  await dentist.click();
  await page.keyboard.press('Delete');
  const deleting = page.waitForRequest((r) => r.method() === 'DELETE');
  await asked(page, 'Delete “Dentist”?').getByRole('button', { name: 'Delete' }).click();
  await deleting;
  // A click outside and Escape wait for Google's answer.
  await page.locator('.canvas').click({ position: { x: 200, y: 300 } });
  await page.keyboard.press('Escape');
  await expect(card(page)).toBeVisible();
  answer();
  await expect(card(page).getByText('That change didn’t reach Google Calendar. Try again later.')).toBeVisible();
  await expect(dentist).toBeVisible();
  await page.unroute('**/__calendar/**');

  // Next week by keyboard: the event's card goes with the list it belonged to.
  await page.keyboard.press('Escape');
  await dentist.click();
  await panel(page).getByRole('button', { name: 'Next week' }).focus();
  await page.keyboard.press('Enter');
  await expect(card(page)).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('while a delete is on its way, clicking another event waits, so Google’s refusal still shows in the card', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  let answer: () => void = () => {};
  await page.route('**/__calendar/**', (route) =>
    route.request().method() === 'DELETE'
      ? new Promise<void>((done) => (answer = done)).then(() => route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":{"code":403}}' }))
      : route.continue(),
  );
  await day(page, new Date()).getByRole('button', { name: /Dentist/ }).click();
  await page.keyboard.press('Delete');
  const deleting = page.waitForRequest((r) => r.method() === 'DELETE');
  await asked(page, 'Delete “Dentist”?').getByRole('button', { name: 'Delete' }).click();
  await deleting;
  await day(page, daysFromToday(1)).getByRole('button', { name: /Lunch with Sam/ }).click();
  await panel(page).getByRole('button', { name: 'Next week' }).click();
  await expect(card(page).getByRole('heading', { name: 'Dentist' })).toBeVisible();
  answer();
  await expect(card(page).getByText('That change didn’t reach Google Calendar. Try again later.')).toBeVisible();
  await expect(card(page).getByRole('heading', { name: 'Dentist' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('with no room beside a wide panel the card sits inside the panel, fully seen and clear of its resize strip', async ({ page }) => {
  const errors = await openAs(page);
  await page.setViewportSize({ width: 760, height: 800 });
  await button(page).click();
  await dragTo(page, 300);
  await expect.poll(async () => (await panel(page).boundingBox())!.x).toBe(300);
  await day(page, new Date()).getByRole('button', { name: /Dentist/ }).click();
  await expect(card(page)).toBeInViewport({ ratio: 1 });
  const box = (await card(page).boundingBox())!;
  // 8px from the window's right edge, so nothing of it is under the strip (296–304).
  expect(Math.round(box.x + box.width)).toBe(752);
  expect(box.x).toBeGreaterThan(304);
  const onTop = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.cal-card') != null, [box.x + 4, box.y + 20]);
  expect(onTop).toBe(true);
  // A 610px window leaves the panel 310px wide (left edge 300, strip 296–304): the card narrows to fit beside the strip.
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 610, height: 800 });
  await expect.poll(async () => (await panel(page).boundingBox())!.x).toBe(300);
  await day(page, new Date()).getByRole('button', { name: /Dentist/ }).click();
  await expect(card(page)).toBeInViewport({ ratio: 1 });
  expect((await card(page).boundingBox())!.x).toBeGreaterThanOrEqual(308);
  expect(errors).toEqual([]);
});

test('the card moves with the panel’s edge when the panel or the window is resized', async ({ page }) => {
  const errors = await openAs(page);
  await page.setViewportSize({ width: 1280, height: 420 });
  await button(page).click();
  await day(page, new Date()).getByRole('button', { name: /Dentist/ }).click();
  await expect(card(page)).toBeVisible();
  // It keeps the height it opened at, also when the list has scrolled since.
  const top = (await card(page).boundingBox())!.y;
  await panel(page).evaluate((el) => el.scrollBy(0, 80));
  expect(await panel(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const gap = async () => {
    const [p, c] = [(await panel(page).boundingBox())!, (await card(page).boundingBox())!];
    return Math.round(p.x - 8 - (c.x + c.width));
  };
  // Dragging the panel's edge keeps the card open, and it follows.
  const before = (await panel(page).boundingBox())!.x;
  await dragTo(page, before - 120);
  await expect.poll(async () => (await panel(page).boundingBox())!.x).toBeLessThan(before - 100);
  await expect(card(page)).toBeVisible();
  await expect.poll(gap).toBe(0);
  await page.setViewportSize({ width: 1100, height: 420 });
  await expect(card(page)).toBeVisible();
  await expect.poll(gap).toBe(0);
  expect((await card(page).boundingBox())!.y).toBe(top);
  expect(errors).toEqual([]);
});

test('a guest still typed in when Save is clicked is added, or stops the save if it isn’t an email address', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  const today = new Date();
  await day(page, today).getByRole('button', { name: `Add event on ${label(today)}` }).click();
  await page.keyboard.type('Coffee');
  await form(page).getByLabel('Guest email').fill('kim@');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(form(page).getByText('That doesn’t look like an email address.')).toBeVisible();
  await expect(asked(page, EMAILS)).toHaveCount(0);
  await form(page).getByLabel('Guest email').fill('kim@example.com');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await asked(page, EMAILS).getByRole('button', { name: /Don.t send/ }).click();
  await edit(page, day(page, today).getByRole('button', { name: /Coffee/ }));
  await expect(form(page).getByRole('listitem')).toHaveText(['kim@example.com']);
  expect(errors).toEqual([]);
});

test('when Google refuses a change, the usual note shows and the form stays open', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  await page.route('**/__calendar/**', (route) =>
    route.request().method() === 'PATCH' ? route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":{"code":403}}' }) : route.continue(),
  );
  await edit(page, day(page, daysFromToday(1)).getByRole('button', { name: /Team stand-up/ }));
  await form(page).getByLabel('Title').fill('Daily sync');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await asked(page, WHICH).getByRole('button', { name: 'All events in the series' }).click();
  await expect(form(page).getByText('That change didn’t reach Google Calendar. Try again later.')).toBeVisible();
  await expect(form(page).getByLabel('Title')).toHaveValue('Daily sync');
  await form(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(day(page, daysFromToday(1)).getByRole('button', { name: /Team stand-up/ })).toBeVisible();
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
  await expect(todayCell.getByRole('button', { name: '10 – 11am Dentist' })).toBeVisible();
  await expect(todayCell.getByRole('button', { name: /Team stand-up/ })).not.toHaveClass(/read-only/);
  const club = daysFromToday(2);
  if (club.getMonth() === now.getMonth()) await expect(cell(club).getByRole('button', { name: /Book club, read-only/ })).toHaveClass(/read-only/);
  // An all-day event is a filled chip, first on its day.
  const holiday = daysFromToday(3);
  if (holiday.getMonth() === now.getMonth()) {
    await expect(cell(holiday).locator('.cal-chip').first()).toHaveText('Holiday');
    await expect(cell(holiday).locator('.cal-chip').first()).toHaveClass(/all-day/);
  }

  // Clicking a name opens that event: Dentist's change form, then back to the month.
  await edit(page, todayCell.getByRole('button', { name: /Dentist/ }));
  await expect(form(page).getByLabel('Title')).toHaveValue('Dentist');
  await form(page).getByRole('button', { name: 'Cancel' }).click();
  // A repeating event opens its change form too (job #85).
  await edit(page, todayCell.getByRole('button', { name: /Team stand-up/ }));
  await expect(form(page).getByLabel('Title')).toHaveValue('Team stand-up');
  await form(page).getByRole('button', { name: 'Cancel' }).click();

  // The wide Month panel has room for three lines; a fourth event today makes the last say "+2 more".
  for (const [title, start, end] of [['Swim', '07:00', '07:45'], ['Run', '06:00', '06:30']]) {
    await day(page, now).getByRole('button', { name: `Add event on ${label(now)}` }).click();
    await page.keyboard.type(title);
    await form(page).getByLabel('Start time').fill(start);
    await form(page).getByLabel('End time').fill(end);
    await form(page).getByRole('button', { name: 'Save' }).click();
  }
  await expect(todayCell.locator('.cal-chip')).toHaveText(['6amRun', '7amSwim']);
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

// Job #131 (owner requests 2026-10-21): full names in the Month view, a click on the picked day adds an event,
// and a click on an event whose card is open edits it.
test('the month grid cuts a long name at two lines with …; the full name is in the hover text and the day’s list', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  const now = new Date();
  const long = 'Quarterly planning review with the whole design and engineering team';
  await day(page, now).getByRole('button', { name: `Add event on ${label(now)}` }).click();
  await page.keyboard.type(long);
  await form(page).getByRole('button', { name: 'Save' }).click();
  // The Week view's names are unchanged: at most two lines, then cut.
  await expect(day(page, now).locator('.cal-title').first()).toHaveCSS('-webkit-line-clamp', '2');
  await panel(page).getByRole('button', { name: 'Month', exact: true }).click();
  const cell = panel(page).getByRole('grid').getByRole('gridcell', { name: new RegExp(`^${label(now)}`) });
  const chip = cell.locator('.cal-chip').filter({ hasText: long });
  // At most two 16px lines (job #207 replaces job #131's "never cut"), cut with … (line-clamp), the rest hidden.
  await expect(chip).toHaveCSS('-webkit-line-clamp', '2');
  expect((await chip.boundingBox())!.height).toBeLessThanOrEqual(34);
  await expect(chip).toHaveAttribute('title', new RegExp(`${long}$`));
  const [cellBox, chipBox] = [(await cell.boundingBox())!, (await chip.boundingBox())!];
  expect(chipBox.y + chipBox.height).toBeLessThanOrEqual(cellBox.y + cellBox.height);
  // The picked day's list under the grid shows the full name (no two-line cut).
  await expect(day(page, now).locator('.cal-title').filter({ hasText: long })).toHaveCSS('-webkit-line-clamp', 'none');
  expect(errors).toEqual([]);
});

// Job #207 (owner complaint 2026-10-24): the name read as a thin ragged column beside the time, broken mid-word.
// Now the time and the name are one run of text: the name continues after the time and wraps under it, at spaces,
// and an event shows at most two lines, then …
test('Month: a long name continues after the time, wraps under it in two lines at most, and no word is split', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  const now = new Date();
  const long = 'Product Marketing Manager, Business Accounts Interview with Airwallex';
  await day(page, now).getByRole('button', { name: `Add event on ${label(now)}` }).click();
  await page.keyboard.type(long);
  await form(page).getByRole('button', { name: 'Save' }).click();
  await panel(page).getByRole('button', { name: 'Month', exact: true }).click();
  expect((await panel(page).boundingBox())!.width).toBeCloseTo(720, 0);
  const chip = panel(page).getByRole('grid').getByRole('gridcell', { name: new RegExp(`^${label(now)}`) }).locator('.cal-chip').filter({ hasText: long });
  const m = await chip.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const time = el.querySelector('.cal-chip-time')!.getBoundingClientRect();
    const text = el.querySelector('.cal-chip-title')!.firstChild as Text;
    const words: { word: string; rects: { left: number; top: number; bottom: number }[] }[] = [];
    for (const w of text.data.matchAll(/\S+/g)) {
      const r = document.createRange();
      r.setStart(text, w.index!);
      r.setEnd(text, w.index! + w[0].length);
      words.push({ word: w[0], rects: [...r.getClientRects()].map((q) => ({ left: q.left, top: q.top, bottom: q.bottom })) });
    }
    return { box: { top: box.top, bottom: box.bottom }, time: { left: time.left, top: time.top }, words };
  });
  // At most two lines (16px each), and the name is long enough to be cut.
  expect(m.box.bottom - m.box.top).toBeLessThanOrEqual(34);
  const visible = m.words.filter((w) => w.rects.length && w.rects[0].bottom <= m.box.bottom + 1);
  expect(visible.length).toBeGreaterThanOrEqual(2);
  expect(visible.length).toBeLessThan(m.words.length);
  // No visible word is split across lines.
  for (const w of visible) expect(new Set(w.rects.map((q) => Math.round(q.top))).size, `“${w.word}” on one line`).toBe(1);
  // The name starts on the time's line and the second line starts under the time, not in a column beside it.
  const tops = visible.map((w) => w.rects[0].top);
  expect(Math.abs(tops[0] - m.time.top)).toBeLessThan(4);
  const second = visible.filter((w) => w.rects[0].top > tops[0] + 8);
  expect(second.length).toBeGreaterThan(0);
  expect(Math.min(...second.map((w) => w.rects[0].left))).toBeLessThanOrEqual(m.time.left + 1);
  expect(errors).toEqual([]);
});

test('Month: a click on the day that is already picked opens the new-event form for it, as its + does', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  await panel(page).getByRole('button', { name: 'Month', exact: true }).click();
  const now = new Date();
  const other = now.getDate() === 1 ? daysFromToday(1) : daysFromToday(-1);
  const cell = (d: Date) => panel(page).getByRole('grid').getByRole('gridcell', { name: new RegExp(`^${label(d)}`) });
  // A day that isn't picked yet is only picked.
  await cell(other).locator('.cal-date').click();
  await expect(cell(other)).toHaveAttribute('aria-selected', 'true');
  await expect(form(page)).toHaveCount(0);
  // Clicking it again, on the empty part of its cell, opens the form: 9:00 for an hour on that day.
  const box = (await cell(other).boundingBox())!;
  await cell(other).click({ position: { x: box.width - 4, y: box.height - 4 } });
  await expect(form(page)).toBeVisible();
  await expect(form(page).getByRole('heading', { name: 'New event' })).toBeVisible();
  await expect(form(page).getByLabel('Start date')).toHaveValue(key(other));
  await expect(form(page).getByLabel('Start time')).toHaveValue('09:00');
  await expect(form(page).getByLabel('End time')).toHaveValue('10:00');
  await form(page).getByRole('button', { name: 'Cancel' }).click();
  // The picked day's date button (the keyboard's way in) does the same; an event's chip does not.
  await cell(other).locator('.cal-date').press('Enter');
  await expect(form(page).getByLabel('Start date')).toHaveValue(key(other));
  await form(page).getByRole('button', { name: 'Cancel' }).click();
  await cell(now).locator('.cal-date').click();
  await expect(form(page)).toHaveCount(0);
  await cell(now).getByRole('button', { name: /Dentist/ }).click();
  await expect(card(page)).toBeVisible();
  await expect(form(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('clicking an event whose card is already open opens its edit form; a read-only one stays open', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  const now = new Date();
  // Week view.
  const dentist = day(page, now).getByRole('button', { name: /Dentist/ });
  await dentist.click();
  await expect(card(page)).toBeVisible();
  await dentist.click();
  await expect(card(page)).toHaveCount(0);
  await expect(form(page).getByLabel('Title')).toHaveValue('Dentist');
  await form(page).getByRole('button', { name: 'Cancel' }).click();
  // Someone else's event: the second click does nothing new, the card stays.
  const club = day(page, daysFromToday(2)).getByRole('button', { name: /Book club/ });
  await club.click();
  await club.click();
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole('heading', { name: 'Book club' })).toBeVisible();
  await expect(form(page)).toHaveCount(0);
  // Another event's click still just opens that one.
  await day(page, now).getByRole('button', { name: /Dentist/ }).click();
  await expect(card(page).getByRole('heading', { name: 'Dentist' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Month view: the chip, and the picked day's list under the grid.
  await panel(page).getByRole('button', { name: 'Month', exact: true }).click();
  const chip = panel(page).getByRole('grid').getByRole('gridcell', { name: new RegExp(`^${label(now)}`) }).getByRole('button', { name: /Dentist/ });
  await chip.click();
  await expect(card(page)).toBeVisible();
  await chip.click();
  await expect(form(page).getByLabel('Title')).toHaveValue('Dentist');
  await form(page).getByRole('button', { name: 'Cancel' }).click();
  const listed = day(page, now).getByRole('button', { name: /Dentist/ });
  await listed.click();
  await expect(card(page)).toBeVisible();
  await listed.click();
  await expect(form(page).getByLabel('Title')).toHaveValue('Dentist');
  await form(page).getByRole('button', { name: 'Cancel' }).click();
  // The same event shown twice (its chip in the grid, its line in the day's list) counts as the same event.
  await chip.click();
  await expect(card(page)).toBeVisible();
  await listed.click();
  await expect(form(page).getByLabel('Title')).toHaveValue('Dentist');
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
  // Other side panels open 300px wide and have a strip of their own (see panel-resize.spec.ts).
  const corner = page.locator('.corner-controls');
  await corner.getByRole('button', { name: 'Focus timer' }).click();
  await expect.poll(async () => (await page.getByRole('complementary', { name: 'Focus timer' }).boundingBox())!.width).toBe(300);
  await expect(handle(page)).toHaveCount(0);
  await expect(page.getByRole('separator', { name: 'Resize focus timer' })).toBeVisible();
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
  await edit(page, day(page, now).getByRole('button', { name: /Quarterly planning/ }));
  await form(page).getByLabel('Title').fill('word '.repeat(60));
  await form(page).getByRole('button', { name: 'Save' }).click();
  const long = await day(page, now).locator('.cal-title', { hasText: 'word word' }).evaluate((el) => ({ height: el.clientHeight, full: el.scrollHeight }));
  expect(long.height).toBeLessThan(44);
  expect(long.full).toBeGreaterThan(long.height);
  expect(errors).toEqual([]);
});

/** Week view (owner request 2026-10-24, job 210): the date on the left, its events in a column to its right. */
async function expectDateThenEvents(page: Page) {
  const section = day(page, new Date());
  const date = section.getByRole('heading').first();
  const events = section.locator('.cal-event');
  expect(await events.count()).toBeGreaterThanOrEqual(2); // Dentist and the stand-up
  const d = (await date.boundingBox())!;
  const first = (await events.first().boundingBox())!;
  // The first event is level with the date, and each event starts to the right of it.
  expect(Math.abs(first.y - d.y)).toBeLessThanOrEqual(3);
  const panelBox = (await panel(page).boundingBox())!;
  for (const box of await events.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))) {
    expect(box.x).toBeGreaterThanOrEqual(d.x + d.width);
    expect(box.x + box.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
  }
  // The rest cascade downwards, one under the other.
  const second = (await events.nth(1).boundingBox())!;
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
  // Nothing in the day sits under the date: everything but the date's own row starts to its right.
  const others = await section.locator(':scope > :not(h3)').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
  for (const box of others) expect(box.x).toBeGreaterThanOrEqual(d.x + d.width);
  // The + is in the date's row, and nothing makes the panel scroll sideways.
  const add = (await section.getByRole('button', { name: /^Add event on/ }).boundingBox())!;
  expect(add.y + add.height).toBeLessThanOrEqual(d.y + d.height + 1);
  expect(await panel(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
}

test('in the Week view each day is a date on the left with its events in a column to its right', async ({ page }) => {
  const errors = await openAs(page);
  await button(page).click();
  await expect(day(page, new Date()).locator('.cal-event')).toHaveCount(2);
  await expectDateThenEvents(page);
  expect(errors).toEqual([]);
});

test('the date column also fits the panel at its narrowest (300px)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('note-board:calendar-width', '{"week":300,"month":720}'));
  const errors = await openAs(page);
  await button(page).click();
  await expect.poll(() => width(page)).toBe(300);
  await expectDateThenEvents(page);
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

// The access is kept on this device for up to an hour (owner choices, 2026-10-19: job 103 for the
// tab, job 107 "Remember for the hour"), so a reload, a new tab or reopening the browser doesn't
// ask Google again. Locally the "ask" is the demo's: &demo-calendar=blocked makes it fail, so the
// events showing after such a reload prove nothing was asked.
test.describe('calendar access kept on this device for the hour', () => {
  const ACCESS_KEY = 'note-board:calendar-access';
  const blockedNote = 'Google’s window didn’t open or was closed. Click Connect Google Calendar to try again.';
  const kept = (page: Page) => page.evaluate((k) => localStorage.getItem(k), ACCESS_KEY);
  async function connect(page: Page, name: string) {
    const errors = await openAs(page, name);
    await button(page).click();
    await expect(day(page, new Date()).getByRole('button', { name: /Dentist/ })).toBeVisible();
    expect(JSON.parse((await kept(page)) ?? 'null')).toMatchObject({ user: `demo-${name.toLowerCase()}` });
    return errors;
  }

  test('a reload within the hour shows the events without asking again', async ({ page }) => {
    const name = `Cal${tag()}`;
    const errors = await connect(page, name);
    await page.goto(`/?demo-user=${name}&demo-calendar=blocked`);
    await fontsLoaded(page);
    await button(page).click();
    await expect(day(page, new Date()).getByRole('button', { name: /Dentist/ })).toBeVisible();
    await expect(panel(page).getByText(blockedNote)).toHaveCount(0);
    // In a tab that already connected, ?demo-calendar=blocked has no effect: not later either,
    // when the kept access is gone and the demo asks again.
    await page.evaluate((k) => localStorage.removeItem(k), ACCESS_KEY);
    await panel(page).getByRole('button', { name: 'Next week' }).click();
    await panel(page).getByRole('button', { name: 'Previous week' }).click();
    await expect(day(page, new Date()).getByRole('button', { name: /Dentist/ })).toBeVisible();
    await expect(panel(page).getByText(blockedNote)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('a new tab, or the browser closed and opened again, shows the events without asking again', async ({ page, browser }) => {
    test.slow(); // three pages, one after another
    const name = `Cal${tag()}`;
    const errors = await connect(page, name);
    const again = async (other: Page) => {
      other.on('pageerror', (e) => errors.push(e.message));
      await other.goto(`/?demo-user=${name}&demo-calendar=blocked`);
      await fontsLoaded(other);
      await button(other).click();
      await expect(day(other, new Date()).getByRole('button', { name: /Dentist/ })).toBeVisible();
      await expect(panel(other).getByText(blockedNote)).toHaveCount(0);
    };
    // Another tab in the same browser.
    await again(await page.context().newPage());
    // The browser closed and opened again: what it keeps on the device (not a tab's own storage).
    const reopened = await browser.newContext({ storageState: await page.context().storageState() });
    await page.context().close();
    await again(await reopened.newPage());
    await reopened.close();
    expect(errors).toEqual([]);
  });

  test('another person in another tab doesn’t get it: they are asked, and the kept access is dropped', async ({ page }) => {
    await connect(page, `Cal${tag()}`);
    const other = await page.context().newPage();
    await other.goto(`/?demo-user=Other${tag()}&demo-calendar=blocked`);
    await fontsLoaded(other);
    await button(other).click();
    await expect(panel(other).getByText(blockedNote)).toBeVisible();
    expect(await kept(other)).toBeNull();
  });

  test('another person in the same tab doesn’t get it: they are asked, and the kept access is dropped', async ({ page }) => {
    await connect(page, `Cal${tag()}`);
    await page.goto(`/?demo-user=Other${tag()}&demo-calendar=blocked`);
    await fontsLoaded(page);
    await button(page).click();
    await expect(panel(page).getByText(blockedNote)).toBeVisible();
    expect(await kept(page)).toBeNull();
  });

  test('with a minute or less left it is dropped and Google is asked again', async ({ page }) => {
    const name = `Cal${tag()}`;
    await connect(page, name);
    await page.evaluate((k) => {
      const a = JSON.parse(localStorage.getItem(k)!);
      localStorage.setItem(k, JSON.stringify({ ...a, expiresAt: Date.now() + 30_000 }));
    }, ACCESS_KEY);
    await page.goto(`/?demo-user=${name}&demo-calendar=blocked`);
    await fontsLoaded(page);
    await button(page).click();
    await expect(panel(page).getByText(blockedNote)).toBeVisible();
  });

  test('damaged kept access is ignored: the usual ask happens and nothing breaks', async ({ page }) => {
    const name = `Cal${tag()}`;
    const errors = await openAs(page, name);
    await page.evaluate((k) => localStorage.setItem(k, '{not json'), ACCESS_KEY);
    await page.goto(`/?demo-user=${name}&demo-calendar=blocked`);
    await fontsLoaded(page);
    await button(page).click();
    await expect(panel(page).getByText(blockedNote)).toBeVisible();
    await panel(page).getByRole('button', { name: 'Connect Google Calendar' }).click();
    await expect(day(page, new Date()).getByRole('button', { name: /Dentist/ })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('when Google refuses it (401) it is dropped', async ({ page }) => {
    const name = `Cal${tag()}`;
    await connect(page, name);
    await page.route('**/__calendar/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"code":401}}' }));
    await panel(page).getByRole('button', { name: 'Next week' }).click();
    await expect(panel(page).getByText('Google Calendar isn’t connected yet. Try again later.')).toBeVisible();
    expect(await kept(page)).toBeNull();
  });
});

test.describe('on a wide phone-layout screen (month cells 70px or wider)', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 590, height: 1000 } });

  test('month cells show start times and up to three lines', async ({ page }) => {
    await openAs(page);
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Google Calendar' }).tap();
    await panel(page).getByRole('button', { name: 'Month', exact: true }).tap();
    const now = new Date();
    const todayCell = panel(page).getByRole('grid').getByRole('gridcell', { name: new RegExp(`^${label(now)}`) });
    await expect(todayCell.locator('.cal-chip')).toHaveText(['9amTeam stand-up', '10amDentist']);
    await expect(todayCell.locator('.cal-chip-time').first()).toBeVisible();
    // A third event still fits: three lines, no "+n more".
    await day(page, now).getByRole('button', { name: `Add event on ${label(now)}` }).tap();
    await page.keyboard.type('Swim');
    await form(page).getByLabel('Start time').fill('07:00');
    await form(page).getByLabel('End time').fill('07:45');
    await form(page).getByRole('button', { name: 'Save' }).tap();
    await expect(todayCell.locator('.cal-chip')).toHaveText(['7amSwim', '9amTeam stand-up', '10amDentist']);
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

  test('the week list is a date column with the events to its right', async ({ page }) => {
    await openAs(page);
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Google Calendar' }).tap();
    await expect(day(page, new Date()).locator('.cal-event')).toHaveCount(2);
    await expectDateThenEvents(page);
  });

  test('an event opens its card as a sheet from the bottom', async ({ page }) => {
    await openAs(page);
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Google Calendar' }).tap();
    await day(page, new Date()).getByRole('button', { name: /Dentist/ }).tap();
    await expect(card(page).getByRole('heading', { name: 'Dentist' })).toBeVisible();
    const box = (await card(page).boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.width).toBe(390);
    expect(Math.round(box.y + box.height)).toBe(800);
    await card(page).getByRole('button', { name: 'Edit event' }).tap();
    await expect(form(page).getByLabel('Title')).toHaveValue('Dentist');
  });
});
