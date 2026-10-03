import { expect, test } from '@playwright/test';
import { add, boardPos, box, clickEmpty, dragBy, freshBoardEachTest, looseCards } from './helpers';

freshBoardEachTest();

test('blocks pushed aside by expanding a card go back when it collapses again (owner request)', async ({ page }) => {
  await add(page, 'Note');
  const aId = await looseCards(page).first().getAttribute('data-card-id');
  const a = page.locator(`[data-card-id="${aId}"]`);
  await a.getByLabel('Note text').fill('one\ntwo\nthree\nfour\nfive\nsix');
  await a.getByRole('button', { name: 'Collapse card' }).click();
  await clickEmpty(page);

  // A second note, moved into the space the first one used before it collapsed.
  await add(page, 'Note');
  const bId = await page.locator('.card.selected').getAttribute('data-card-id');
  const b = page.locator(`[data-card-id="${bId}"]`);
  const ra = await box(a);
  const rb = await box(b);
  await dragBy(page, b, ra.x - rb.x, ra.y + ra.height + 40 - rb.y);
  await clickEmpty(page);
  const home = await boardPos(b);

  await a.getByRole('button', { name: 'Expand card' }).click();
  await expect.poll(() => boardPos(b)).not.toEqual(home); // pushed out of the way

  await a.getByRole('button', { name: 'Collapse card' }).click();
  await expect.poll(() => boardPos(b)).toEqual(home);
  await page.waitForTimeout(200);
  expect(await boardPos(b)).toEqual(home);
});
