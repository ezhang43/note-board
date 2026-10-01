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
    .poll(() => page.evaluate(async () => (await (await caches.open('note-board-v1')).keys()).length))
    .toBeGreaterThan(2);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await context.setOffline(false);
});
