import { expect, test } from '@playwright/test';
import { add, box, clickEmpty, dragTo, freshBoardEachTest, looseCards } from './helpers';

// Review 181 part B, B-L2 (job 183): a pasted copy that lands on a neighbor sends it to a free spot.

freshBoardEachTest();

test('pasting a copy on top of a neighbor moves the neighbor aside to a free spot, not straight down', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  await clickEmpty(page);
  await add(page, 'Note');
  const [a, b] = [looseCards(page).nth(0), looseCards(page).nth(1)];
  await dragTo(page, a, { x: 420, y: 300 });
  const ab = await box(a);
  // Put b where the pasted copy (40px down and right of a) will land on it.
  await dragTo(page, b, { x: ab.x + 260 + 30, y: ab.y + 60 + 18 });
  const before = await box(b);
  await page.mouse.click(ab.x + 30, ab.y + 18);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(looseCards(page)).toHaveCount(3);
  await expect.poll(async () => (await box(b)).x).toBeGreaterThan(before.x);
  expect((await box(b)).y).toBeCloseTo(before.y, 0);
});
