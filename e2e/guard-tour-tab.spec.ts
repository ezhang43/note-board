import { expect, test } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Guard (review pass, job 156): while the welcome tour is open, Tab stays inside its card (it is a
// dialog, so the board behind it can't be tabbed to). Starts like a new device, as e2e/tour.spec.ts does.
test.use({ storageState: { cookies: [], origins: [] } });

test('Tab never leaves the tour card', async ({ page }) => {
  await page.goto('/?demo-user=Alice');
  await fontsLoaded(page);
  await expect(page.getByRole('dialog', { name: /Step \d of \d/ })).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.tour-card')))).toBe(true);
  }
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.tour-card')))).toBe(true);
  }
});
