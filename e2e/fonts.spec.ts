import { expect, test } from '@playwright/test';
import { freshBoardEachTest } from './helpers';

// The page first asks only for IBM Plex Sans (all the sign-in screen needs, job 165a); once the board
// opens, the rest of the typefaces (the board's text styles: Mono, Lora, Nunito, Caveat, and Plex's italics) follow.

freshBoardEachTest();

test('the board brings in every typeface it offers', async ({ page }) => {
  await expect(page.getByTestId('canvas')).toBeVisible();
  const sheets = await page.locator('link[rel="stylesheet"][href*="fonts.googleapis.com"]').evaluateAll((els) => els.map((el) => decodeURIComponent((el as HTMLLinkElement).href)));
  const all = sheets.join(' ');
  for (const family of ['IBM+Plex+Sans:ital', 'IBM+Plex+Mono', 'Lora', 'Nunito', 'Caveat']) expect(all, family).toContain(family);
});
