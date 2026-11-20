import { expect, test } from '@playwright/test';
import { freshBoardEachTest, togglePanel } from './helpers';

// Opening and resizing a side panel stays quick on a big board (job perf-panels): the panel's width
// variables are not inherited by the board (every card would restyle on each mouse move), and the
// heavy panels (Journal, Habits, Visualizer) are loaded on first use, not at startup.

freshBoardEachTest();

test('the board does not inherit the panel width variables, so resizing a panel never restyles it', async ({ page }) => {
  await togglePanel(page, 'Habits');
  await expect(page.getByRole('complementary', { name: 'Habits' })).toBeVisible();
  const vars = await page.evaluate(() => {
    const app = getComputedStyle(document.querySelector('.app')!).getPropertyValue('--side-width').trim();
    const world = getComputedStyle(document.querySelector('.world')!);
    return { app, side: world.getPropertyValue('--side-width').trim(), left: world.getPropertyValue('--left-width').trim() };
  });
  expect(vars.app).not.toBe('0px'); // the panel itself still gets its width
  expect(vars.side).toBe('0px');
  expect(vars.left).toBe('0px');
});

test('the Visualizer loads when first opened, not at startup', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.reload();
  await expect(page.locator('.canvas')).toBeVisible();
  expect(urls.some((u) => u.includes('/VisualizerOverlay.tsx')), 'at startup').toBe(false);
  await page.locator('header.toolbar').getByRole('button', { name: 'Visualizer', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Visualizer' })).toBeVisible();
  expect(urls.some((u) => u.includes('/VisualizerOverlay.tsx'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Visualizer' })).toHaveCount(0);
});

test('Habits opens with the keyboard at its usual width', async ({ page }) => {
  await page.locator('.corner-controls').getByRole('button', { name: /^Habits/ }).focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('complementary', { name: 'Habits' });
  await expect(panel).toBeVisible();
  expect((await panel.boundingBox())!.width).toBe(420);
  await page.keyboard.press('Escape');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('the Habits panel opens from ⋯', async ({ page }) => {
    await page.reload();
    await page.getByRole('button', { name: 'More' }).first().click();
    await page.getByRole('button', { name: /Habits/ }).first().click();
    await expect(page.getByRole('complementary', { name: 'Habits' })).toBeVisible();
  });
});
