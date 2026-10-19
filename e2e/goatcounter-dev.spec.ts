import { expect, test } from '@playwright/test';

// Job 117: `npm run dev` and the browser tests never load the usage counter.
test('the dev app and pages carry no GoatCounter and request nothing from it', async ({ page }) => {
  const counted: string[] = [];
  page.on('request', (r) => /gc\.zgo\.at|goatcounter\.com/.test(r.url()) && counted.push(r.url()));
  for (const path of ['/', '/about/', '/privacy/']) {
    const html = await (await page.request.get(path)).text();
    expect(html, path).not.toMatch(/gc\.zgo\.at|goatcounter\.com\/count/);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  expect(counted).toEqual([]);
});

test('the Privacy page says plainly that visits are counted with GoatCounter, and no longer says there is no analytics', async ({ page }) => {
  await page.goto('/privacy/');
  const main = page.locator('main');
  await expect(main).toContainText('GoatCounter');
  await expect(main).toContainText('no cookies');
  await expect(main).not.toContainText(/no analytics/i);
  await expect(main.locator('a[href="https://www.goatcounter.com"]')).toHaveCount(1);
});
