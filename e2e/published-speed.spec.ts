import { expect, test } from '@playwright/test';

// The published site's sign-in screen opens fast (job 165a, from the UX audit: Lighthouse on a phone
// scored 78, the main content showing after 4.8 s, because it first downloaded the whole board app and
// five font families to draw one button). It loads without the board's code, and only the font it shows.

// Uncompressed JavaScript the sign-in screen may download, in KB (before job 165a: 1,137; after it: about 975;
// since job 169 loads Firebase's database code only once someone is signed in: about 460).
const BUDGET_KB = 520;

test('the sign-in screen loads without the board code and with only IBM Plex Sans and Roboto Medium', async ({ page }) => {
  const reading: Promise<string>[] = [];
  const fontSheets: string[] = [];
  page.on('response', (r) => {
    if (/\.js$/.test(new URL(r.url()).pathname)) reading.push(r.text());
  });
  page.on('request', (r) => {
    if (r.url().startsWith('https://fonts.googleapis.com/')) fontSheets.push(decodeURIComponent(r.url()));
  });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  // Every script read in full before checking what is in them.
  const scripts = await Promise.all(reading);

  // Words only the board's own screens contain (the version bar, the panels): none of that code came down.
  expect(scripts.length).toBeGreaterThan(0);
  for (const marker of ['Looking at an earlier version', 'Nothing cleaned up yet', 'Resize journal']) {
    expect(scripts.some((js) => js.includes(marker)), marker).toBe(false);
  }
  // Only Firebase's sign-in code (job 169): its database code (Firestore) comes down once someone is signed in.
  expect(scripts.some((js) => js.includes('identitytoolkit.googleapis.com')), 'Firebase sign-in').toBe(true);
  expect(scripts.some((js) => js.includes('firestore.googleapis.com')), 'Firestore').toBe(false);

  // One font sheet: the upright Plex Sans weights the screen uses, none of the typefaces only the board offers.
  expect(fontSheets).toHaveLength(1);
  expect(fontSheets[0]).toContain('family=IBM+Plex+Sans:wght@400;500;600');
  // Plus Roboto Medium, the typeface Google's own sign-in button is set in (job #165b).
  expect(fontSheets[0]).toContain('family=Roboto:wght@500');
  expect(fontSheets[0]).not.toMatch(/Mono|Lora|Nunito|Caveat|ital/);
});

test('the sign-in screen downloads less script than before the board code was split off', async ({ page }) => {
  // Every script's size is read in full before adding up (a sum taken while some were still being
  // read came out about 100 KB short).
  const sizes: Promise<number>[] = [];
  page.on('response', (r) => {
    if (/\.js$/.test(new URL(r.url()).pathname)) sizes.push(r.body().then((b) => b.length));
  });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const bytes = (await Promise.all(sizes)).reduce((a, b) => a + b, 0);
  expect(bytes).toBeLessThan(BUDGET_KB * 1024);
});
