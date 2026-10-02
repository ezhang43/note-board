import { expect, test } from '@playwright/test';

// The published site: only a sign-in screen until the owner signs in, and it opens offline.

test('shows only a sign-in screen to someone who is not signed in', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await expect(page.locator('header.toolbar')).toHaveCount(0);
  await expect(page.getByTestId('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('opens without internet after one visit online', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  // Wait until the offline copy is running and has saved this visit's files.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(async () => (await (await caches.open('busyants-v3')).keys()).length))
    .toBeGreaterThan(2);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await context.setOffline(false);
});

test('can be installed as an app (manifest and icons)', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifestUrl = new URL(href!, page.url()).href;
  expect(manifestUrl).toBe(new URL('manifest.webmanifest', page.url()).href);

  const manifest = await (await request.get(manifestUrl)).json();
  expect(manifest.name).toBe('BusyAnts');
  expect(manifest.display).toBe('standalone');
  expect(new URL(manifest.start_url, manifestUrl).href).toBe(page.url());

  // Windows needs a 192px and a 512px icon; each must load as a picture.
  for (const icon of manifest.icons) {
    const res = await request.get(new URL(icon.src, manifestUrl).href);
    expect(res.ok()).toBe(true);
    expect(res.headers()['content-type']).toContain('image/png');
  }
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
});

test('a new version of the offline copy clears out the old one (so new icons show)', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // An old version's offline copy is still there when a new version of the worker starts.
  await page.evaluate(async () => {
    await (await caches.open('note-board-v1')).put('/old', new Response('old'));
    await (await navigator.serviceWorker.getRegistration())?.unregister();
  });
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes('note-board-v1'))).toBe(false);
});
