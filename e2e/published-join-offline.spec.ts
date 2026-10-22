import { expect, test } from '@playwright/test';

// Guard (review pass, job 156): a share link (?join=) opened without internet still opens the app from
// its offline copy, asks to sign in, and keeps the link in the address so it works after signing in.

test('a share link opened without internet shows the sign-in screen and keeps the link', async ({ page, context, browserName }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(async () => (await (await caches.open('busyants-v6')).keys()).length))
    .toBeGreaterThan(2);
  test.skip(browserName === 'webkit', "Playwright's WebKit can't fake offline past a service worker");

  await context.setOffline(true);
  await page.goto('./?join=sabc123.k3y');
  await expect(page.getByText('Sign in to open the board shared with you.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  expect(page.url()).toContain('join=sabc123.k3y');
  await context.setOffline(false);
});
