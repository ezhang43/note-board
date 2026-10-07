import { expect, test } from '@playwright/test';

// Job 29: the website pages on the published build (served under /note-board/, as GitHub Pages does).

test('the website pages are published beside the app, with working links', async ({ page }) => {
  for (const [path, h1] of [
    ['about/', 'BusyAnts'],
    ['faq/', 'Questions and answers'],
    ['terms/', 'Terms of use'],
    ['privacy/', 'Privacy policy'],
  ]) {
    const res = await page.goto(path);
    expect(res?.ok(), path).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(h1);
    // The stylesheet and the ant icon load under /note-board/.
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  }
  await page.goto('about/');
  expect(await page.getByRole('img', { name: /BusyAnts board/ }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('link', { name: 'Start your board, free' }).click();
  await expect(page).toHaveURL(/\/note-board\/$/);
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
});

test('visiting a website page never replaces the offline copy of the app', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(async () => (await (await caches.open('busyants-v5')).keys()).length))
    .toBeGreaterThan(2);

  await page.goto('faq/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Questions and answers');

  await context.setOffline(true);
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await context.setOffline(false);
});
