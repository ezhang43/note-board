import { expect, test } from '@playwright/test';

// The published site's sign-in screen opens fast (job 165a, from the UX audit: Lighthouse on a phone
// scored 78, the main content showing after 4.8 s, because it first downloaded the whole board app and
// five font families to draw one button). It loads without the board's code, and only the font it shows.

// Uncompressed JavaScript the sign-in screen may download, in KB (before this job: 1,137).
const BUDGET_KB = 900;

test('the sign-in screen loads without the board code and with only IBM Plex Sans', async ({ page }) => {
  const scripts: string[] = [];
  const fontSheets: string[] = [];
  page.on('response', async (r) => {
    const url = r.url();
    if (/\.js$/.test(new URL(url).pathname)) scripts.push(await r.text());
  });
  page.on('request', (r) => {
    if (r.url().startsWith('https://fonts.googleapis.com/')) fontSheets.push(decodeURIComponent(r.url()));
  });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  // Words only the board's own screens contain (the version bar, the panels): none of that code came down.
  expect(scripts.length).toBeGreaterThan(0);
  for (const marker of ['Looking at an earlier version', 'Nothing cleaned up yet', 'Resize journal']) {
    expect(scripts.some((js) => js.includes(marker)), marker).toBe(false);
  }

  // One font sheet: the upright Plex Sans weights the screen uses, none of the typefaces only the board offers.
  expect(fontSheets).toHaveLength(1);
  expect(fontSheets[0]).toContain('family=IBM+Plex+Sans:wght@400;500;600');
  expect(fontSheets[0]).not.toMatch(/Mono|Lora|Nunito|Caveat|ital/);
});

test('the sign-in screen downloads well under the old 1.1 MB of script', async ({ page }) => {
  let bytes = 0;
  page.on('response', async (r) => {
    if (/\.js$/.test(new URL(r.url()).pathname)) bytes += (await r.body()).length;
  });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(bytes).toBeLessThan(BUDGET_KB * 1024);
});
