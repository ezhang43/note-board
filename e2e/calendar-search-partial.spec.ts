import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Partial-match calendar search (owner request, 2026-11-23): typing part of a word (prefix, middle,
// suffix, multi-word partial, or partial guest email) still finds matching events even when Google's
// server-side `q` parameter only matches whole words.

const tag = () => Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, '');
const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const PINNED = new Date(2026, 10, 15, 12, 0);

async function openPanel(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(PINNED);
  await page.setExtraHTTPHeaders({ 'x-demo-today': key(PINNED) });
  await page.goto(`/?demo-user=Par${tag()}`);
  await fontsLoaded(page);
  await page.locator('.corner-controls').getByRole('button', { name: 'Google Calendar' }).click();
  await expect(panel(page).getByRole('button', { name: '10 – 11am Dentist' })).toBeVisible();
  return errors;
}

const panel = (page: Page) => page.getByRole('complementary', { name: 'Google Calendar' });
const searchButton = (page: Page) => panel(page).getByRole('button', { name: 'Search events' });
const box = (page: Page) => panel(page).getByRole('searchbox', { name: 'Search events' });

test('partial matches (prefix, middle, suffix, multi-word, guest email) find events even when q returns none', async ({ page }) => {
  const errors = await openPanel(page);
  await searchButton(page).click();

  // Prefix: "dent" -> "Dentist"
  await box(page).fill('dent');
  await expect(panel(page).getByRole('button', { name: '10 – 11am Dentist' })).toBeVisible();

  // Suffix: "ist" -> "Dentist"
  await box(page).fill('ist');
  await expect(panel(page).getByRole('button', { name: '10 – 11am Dentist' })).toBeVisible();

  // Middle of word: "yak" -> "Kayaking lesson"
  await box(page).fill('yak');
  await expect(panel(page).getByRole('button', { name: '2 – 3pm Kayaking lesson' })).toBeVisible();

  // Multi-word partial: "kayak less" -> "Kayaking lesson"
  await box(page).fill('kayak less');
  await expect(panel(page).getByRole('button', { name: '2 – 3pm Kayaking lesson' })).toBeVisible();

  // Partial guest email: "sam@ex" -> "Lunch with Sam"
  await box(page).fill('sam@ex');
  await expect(panel(page).getByRole('button', { name: /Lunch with Sam/ })).toBeVisible();

  expect(errors).toEqual([]);
});

test('a newly added event is found by a partial match right after saving', async ({ page }) => {
  const errors = await openPanel(page);
  // Warm the search index first.
  await searchButton(page).click();
  await box(page).fill('physio');
  await expect(panel(page).getByText('No events found')).toBeVisible();
  await page.keyboard.press('Escape');

  // Add a new event, then search with a partial match.
  await panel(page).getByRole('button', { name: 'Add event on Sun 15 Nov' }).click();
  await panel(page).getByRole('form').getByLabel('Title').fill('Physiotherapy');
  await panel(page).getByRole('form').getByRole('button', { name: 'Save' }).click();
  await expect(panel(page).locator('[aria-busy="true"]')).toHaveCount(0);

  await searchButton(page).click();
  await box(page).fill('physio');
  await expect(panel(page).getByRole('button', { name: '12 – 1pm Physiotherapy' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('instant results appear immediately while typing even when Google q search is slow', async ({ page }) => {
  const errors = await openPanel(page);
  // Hold all Google `q` searches so only the preloaded local index can answer immediately.
  let releaseQ = () => {};
  const qGate = new Promise<void>((done) => (releaseQ = done));
  await page.route(
    (url) => url.pathname.includes('__calendar') && url.searchParams.has('q'),
    async (route) => {
      await qGate;
      await route.continue();
    },
  );
  await searchButton(page).click();
  // Let the preload finish (a few ms against local dev server), then type a partial query.
  await page.waitForTimeout(150);
  await box(page).fill('dent');
  // Dentist shows right away without waiting for the held `q` request.
  await expect(panel(page).getByRole('button', { name: '10 – 11am Dentist' })).toBeVisible({ timeout: 1000 });
  releaseQ();
  expect(errors).toEqual([]);
});
