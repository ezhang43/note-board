import { expect, test } from '@playwright/test';
import { freshBoardEachTest } from './helpers';

// Owner request: the app and toolbar take on the app icon's warm yellow, so it all feels like one thing.

freshBoardEachTest();

test('the toolbar shows the BusyAnts ant and is warm cream (Honey Workshop, 2026-10-16), with the window bar to match', async ({ page }) => {
  const toolbar = page.locator('.toolbar');
  await expect(toolbar.getByRole('link', { name: 'BusyAnts website' }).locator('img.toolbar-logo')).toBeVisible();
  await expect(toolbar).toHaveCSS('background-color', 'rgb(255, 253, 248)');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#FFFDF8');
});

test('dark mode keeps a warm, dark toolbar', async ({ page }) => {
  await page.getByRole('button', { name: /dark mode/i }).click();
  await expect(page.locator('.toolbar')).toHaveCSS('background-color', 'rgb(36, 34, 30)');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#24221E');
});
