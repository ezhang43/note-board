import { expect, test } from '@playwright/test';
import { add, freshBoardEachTest, looseCards } from './helpers';

// Owner bug report: with the Select tool, the selection box was drawn several units above the
// pointer. The browser had scrolled the board area to show a text box hanging off its edge,
// which moved everything drawn on it.

freshBoardEachTest();

test('the board area never scrolls, so the selection box starts right at the pointer', async ({ page }) => {
  await add(page, 'Note');
  const canvas = page.getByTestId('canvas');
  const c = (await canvas.boundingBox())!;
  // Move the board so the note sits at the bottom edge, then type until the text runs past it
  // (the browser scrolls to keep the cursor in view).
  const card = (await looseCards(page).first().boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.wheel(0, -(c.y + c.height - card.y - 70));
  await page.getByLabel('Note text').first().click();
  for (let i = 0; i < 8; i++) await page.keyboard.press('Enter');
  await page.keyboard.type('end');
  expect(await canvas.evaluate((el) => [el.scrollTop, el.scrollLeft])).toEqual([0, 0]);

  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  const from = { x: c.x + 100, y: c.y + 100 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 150, from.y + 120, { steps: 3 });
  const box = (await page.getByTestId('marquee').boundingBox())!;
  await page.mouse.up();
  expect(box.x).toBeCloseTo(from.x, 0);
  expect(box.y).toBeCloseTo(from.y, 0);
});
