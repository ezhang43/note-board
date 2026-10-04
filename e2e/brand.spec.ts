import { expect, test } from '@playwright/test';
import { freshBoardEachTest } from './helpers';

// Owner request: the app and toolbar take on the app icon's warm yellow, so it all feels like one thing.

freshBoardEachTest();

test('the toolbar shows the BusyAnts ant and is honey-coloured, with the window bar to match', async ({ page }) => {
  const toolbar = page.locator('.toolbar');
  await expect(toolbar.getByRole('img', { name: 'BusyAnts' })).toBeVisible();
  await expect(toolbar).toHaveCSS('background-color', 'rgb(255, 241, 194)');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#FFF1C2');
});

test('dark mode keeps a warm, darker honey toolbar', async ({ page }) => {
  await page.getByRole('button', { name: /dark mode/i }).click();
  await expect(page.locator('.toolbar')).toHaveCSS('background-color', 'rgb(42, 36, 22)');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#2A2416');
});
