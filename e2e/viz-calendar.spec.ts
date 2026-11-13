import { expect, test, type Browser, type Page, type Route } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Past and deleted calendar events in the Visualizer (owner request, 2026-11-13): "can the visualizer also
// take into account calendar events that have passed or were deleted?". With ?demo-user=… the dev server's
// pretend calendar (src/calendar/devServer.ts) holds two past events for this: "Kayaking lesson" 3 days ago
// (passed) and "Pottery workshop" 2 days ago (deleted after it started). The Visualizer reads them only when
// the person has opened the Calendar panel once in this browser (no Google window is ever opened from here),
// counts them like a ticked item, and NEVER sends their titles to Anthropic.

const tag = () => Math.random().toString(36).slice(2, 8);
const KEY = 'sk-ant-api03-SECRET-abcd1234';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST' };
const BOARD_ITEM = 'water the plants'; // shares no words with the event titles
const EVENTS = ['Kayaking lesson', 'Pottery workshop'];

/** A board with a Completed panel holding one finished item, cleaned up today. */
function completedBoard(text: string) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const entries = [{ item: { id: 'home_0', text, done: true, children: [] }, fromCardId: 'home_l', fromTitle: 'List', fromParentId: null }];
  return { home: { name: 'Home', snap: true, cards: { home_done: { id: 'home_done', kind: 'completed', color: 'stone', x: 0, y: 0, groups: [{ date, entries }] } }, columns: {}, order: ['home_done'] } };
}

/** A demo person whose board on this device starts with one finished item, Sort automatically off. */
async function person(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext();
  const uid = `demo-${name.toLowerCase()}`;
  await context.addInitScript(
    ([k, v]) => {
      if (!localStorage.getItem(k)) localStorage.setItem(k, v);
      localStorage.setItem('note-board:viz-ai-auto', '0');
    },
    [`${uid}:note-board:v1`, JSON.stringify({ version: 6, home: 'home', boards: completedBoard(BOARD_ITEM) })] as const,
  );
  const page = await context.newPage();
  await page.goto(`/?demo-user=${name}`);
  await fontsLoaded(page);
  return page;
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Visualizer' });
const canvas = (page: Page) => dialog(page).locator('canvas.viz-canvas');
const feed = (page: Page) => dialog(page).locator('.viz-feed');
const calButton = (page: Page) => page.locator('.corner-controls').getByRole('button', { name: 'Google Calendar' });

async function openVisualizer(page: Page) {
  await page.locator('header.toolbar').getByRole('button', { name: 'Visualizer', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
}

/** Opens the Calendar panel once (so this browser keeps calendar access), then closes it. */
async function openCalendarOnce(page: Page) {
  await calButton(page).click();
  const panel = page.getByRole('complementary', { name: 'Google Calendar' });
  await expect(panel).toBeVisible();
  // Wait for the first fetch to land, so the access is kept before we read it in the Visualizer.
  await expect(panel.getByRole('button', { name: /Dentist/ }).first()).toBeVisible();
  await calButton(page).click();
  await expect(panel).toHaveCount(0);
}

test('signed out, nothing about the calendar shows in the Visualizer', async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
  await openVisualizer(page);
  await expect(dialog(page).locator('.viz-cal-note')).toHaveCount(0);
  await expect(dialog(page).locator('.viz-feed-mark')).toHaveCount(0);
});

test('with the Calendar not opened, a quiet line offers to include events and none are counted', async ({ browser }) => {
  const page = await person(browser, `Cal${tag()}`);
  await openVisualizer(page);
  await expect(dialog(page).getByText('Open Calendar once to include your events.')).toBeVisible();
  // Only the one board item is on the disc; no event, no calendar mark.
  await expect(canvas(page)).toHaveAttribute('aria-label', /^1 item cleaned up/);
  await expect(dialog(page).locator('.viz-feed-mark')).toHaveCount(0);
  for (const title of EVENTS) await expect(feed(page).getByText(title)).toHaveCount(0);
  await page.context().close();
});

test('after opening the Calendar once, past and deleted events are counted, shown with a mark, and grouped under Calendar', async ({ browser }) => {
  const page = await person(browser, `Cal${tag()}`);
  await openCalendarOnce(page);
  await openVisualizer(page);

  // By board: the events have their own "Calendar" wedge (read from the canvas summary; deterministic, not animated).
  await dialog(page).getByRole('button', { name: 'By board' }).click();
  await expect(canvas(page)).toHaveAttribute('aria-label', /Calendar \d/);
  // The events arrived, so the offer is gone (checked after the wait, not while the fetch is still in flight).
  await expect(dialog(page).locator('.viz-cal-note')).toHaveCount(0);
  // More than the one board item is counted now (board item + at least the two seeded past events). The range
  // count (the default 30 days) is used, not "This week", which depends on the weekday the test runs.
  const rangeCount = dialog(page).locator('.viz-count', { hasText: 'Last 30 days' }).locator('.viz-count-number');
  expect(Number(await rangeCount.textContent())).toBeGreaterThanOrEqual(3);

  // A shorter range keeps the loop short, so the deleted/past events reliably cycle through the feed with their mark.
  await dialog(page).getByRole('button', { name: '7 days' }).click();
  await expect(dialog(page).locator('.viz-feed-mark').first()).toBeVisible({ timeout: 20000 });
  // The mark is exposed to screen readers as a labelled image, so the calendar cue is actually read.
  await expect(dialog(page).getByRole('img', { name: 'Calendar event' }).first()).toBeAttached();
  await expect(feed(page).getByText('Kayaking lesson', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(feed(page).getByText('Pottery workshop', { exact: true })).toBeVisible({ timeout: 20000 });
  await page.context().close();
});

test('Sort with AI never sends a calendar event title to Anthropic', async ({ browser }) => {
  const page = await person(browser, `Cal${tag()}`);
  const bodies: string[] = [];
  await page.route('https://api.anthropic.com/**', (r: Route) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    const body = r.request().postData() ?? '';
    bodies.push(body);
    const user: string = JSON.parse(body).messages[0].content;
    const texts = JSON.parse(user.slice(user.lastIndexOf('['))) as string[];
    const reply = { type: 'message', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ categories: ['Plants'], labels: texts.map((_, i) => ({ i, c: 0 })) }) }] };
    return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(reply) });
  });
  // Save an Anthropic key.
  await page.locator('header.toolbar').getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'AI settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'AI settings' });
  await settings.getByLabel('Anthropic API key').fill(KEY);
  await settings.getByRole('button', { name: 'Save key' }).click();
  await expect(settings.getByText('sk-ant-…1234')).toBeVisible();
  await page.keyboard.press('Escape');

  await openCalendarOnce(page);
  await openVisualizer(page);
  // Wait until the events are loaded before sorting, so "no titles sent" is a real check, not a race.
  // By board's summary names the Calendar wedge the moment the events arrive (no animation needed).
  await dialog(page).getByRole('button', { name: 'By board' }).click();
  await expect(canvas(page)).toHaveAttribute('aria-label', /Calendar \d/);
  await dialog(page).getByRole('button', { name: 'By category' }).click();

  await dialog(page).getByRole('button', { name: 'Sort with AI' }).click();
  await expect(dialog(page).locator('.viz-ai-status')).toHaveText(/^Sorted|^Nothing left to sort/);
  expect(bodies.length).toBeGreaterThanOrEqual(1);
  const sent = bodies.join('\n');
  expect(sent).toContain(BOARD_ITEM);
  for (const title of EVENTS) expect(sent).not.toContain(title);
  for (const word of ['Kayaking', 'Pottery', 'calendar:', 'Calendar']) expect(sent).not.toContain(word);
  await page.context().close();
});

test('a calendar fetch that fails shows a quiet line and still counts the board items', async ({ browser }) => {
  const page = await person(browser, `Cal${tag()}`);
  await openCalendarOnce(page);
  // The Visualizer's events fetch (showDeleted) fails: the panel's own fetch above already succeeded.
  await page.route(/\/calendars\/primary\/events\?.*showDeleted=true/, (r: Route) => r.fulfill({ status: 500, body: '{}' }));
  await openVisualizer(page);
  await expect(dialog(page).getByText("Couldn't load your calendar events.")).toBeVisible();
  // The board item is still shown; no event mark.
  await expect(canvas(page)).toHaveAttribute('aria-label', /^1 item cleaned up/);
  await expect(dialog(page).locator('.viz-feed-mark')).toHaveCount(0);
  await page.context().close();
});
