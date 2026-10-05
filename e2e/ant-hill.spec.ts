import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, box, clickEmpty, freshBoardEachTest } from './helpers';

freshBoardEachTest();

// Owner request (2026-10-05): every item Clean up sends into the Completed card moves an ant a step
// higher up a hill drawn at the top of the Completed card.

const cleanUpButton = (page: Page) => page.locator('header.toolbar').getByRole('button', { name: 'Clean up', exact: true });
const hill = (page: Page) => page.locator('.completed-card-body .ant-hill');
const ant = (page: Page) => hill(page).locator('.hill-ant');

async function makeList(page: Page, items: string[]) {
  await clickEmpty(page);
  await add(page, 'Checklist');
  const id = await page.locator('.card.selected').getAttribute('data-card-id');
  const list = page.locator(`[data-card-id="${id}"]`);
  await list.getByLabel('Item text').first().click();
  for (const [i, t] of items.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  return list;
}

async function tick(list: Locator, text: string) {
  await list.locator('[data-item-id]').filter({ has: list.page().locator(`textarea:text-is("${text}")`) }).getByLabel('Done').first().click();
}

test('each item cleaned up moves the ant higher up the hill; sending one back or undoing moves it down', async ({ page }) => {
  const list = await makeList(page, ['a', 'b', 'c', 'd']);
  await tick(list, 'a');
  await cleanUpButton(page).click();

  await expect(hill(page)).toHaveAttribute('aria-label', 'Ant on hill 1: 1 of 10 steps to the top');
  await expect(hill(page).locator('.hill-caption')).toHaveText('Hill 1 · 1 of 10');
  const first = await box(ant(page));

  await tick(list, 'b');
  await tick(list, 'c');
  await cleanUpButton(page).click();
  await expect(hill(page)).toHaveAttribute('aria-label', 'Ant on hill 1: 3 of 10 steps to the top');
  const higher = await box(ant(page));
  expect(higher.y).toBeLessThan(first.y);
  expect(higher.x).toBeGreaterThan(first.x);

  // Unticking an item in the Completed card sends it back to its list: the ant steps down.
  await page.locator('.completed-card-body').getByLabel('Send "b" back to', { exact: false }).click();
  await expect(hill(page)).toHaveAttribute('aria-label', 'Ant on hill 1: 2 of 10 steps to the top');

  // Undo puts it back up.
  await page.keyboard.press('Control+z');
  await expect(hill(page)).toHaveAttribute('aria-label', 'Ant on hill 1: 3 of 10 steps to the top');

  // Kept after a reload (it is worked out from the Completed card, which is saved).
  await page.reload();
  await expect(hill(page)).toHaveAttribute('aria-label', 'Ant on hill 1: 3 of 10 steps to the top');
});

test('reaching the top says so, and the next item starts a bigger hill', async ({ page }) => {
  const words = Array.from({ length: 11 }, (_, i) => `t${i + 1}`);
  const list = await makeList(page, words.slice(0, 10));
  for (const w of words.slice(0, 10)) await tick(list, w);
  await cleanUpButton(page).click();
  await expect(hill(page)).toHaveAttribute('aria-label', 'Ant at the top of hill 1');
  await expect(hill(page).locator('.hill-caption')).toHaveText('Top of hill 1!');

  // The emptied list keeps one blank item: type the 11th there.
  await list.getByLabel('Item text').first().click();
  await page.keyboard.type(words[10]);
  await tick(list, words[10]);
  await cleanUpButton(page).click();
  await expect(hill(page)).toHaveAttribute('aria-label', 'Ant on hill 2: 1 of 20 steps to the top');
  await expect(hill(page).locator('.hill-caption')).toHaveText('Hill 2 · 1 of 20');
});

test('with motion allowed the ant walks up slowly instead of jumping', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const list = await makeList(page, ['a', 'b', 'c', 'd', 'e']);
  await tick(list, 'a');
  await cleanUpButton(page).click();
  await expect(ant(page)).not.toHaveClass(/walking/);
  const start = await box(ant(page));

  for (const t of ['b', 'c', 'd', 'e']) await tick(list, t);
  // Items moving to Completed glide for a moment first; wait until all four are in the section.
  await expect(list.locator('.completed [data-item-id]')).toHaveCount(4);
  await cleanUpButton(page).click();
  await expect(ant(page)).toHaveClass(/walking/);
  const early = await box(ant(page));
  await expect(ant(page)).not.toHaveClass(/walking/, { timeout: 5000 });
  const end = await box(ant(page));
  expect(end.y).toBeLessThan(start.y - 10);
  expect(early.y).toBeGreaterThan(end.y + 5); // just after Clean up it was still on its way
});

test('a collapsed Completed card hides the hill', async ({ page }) => {
  const list = await makeList(page, ['a']);
  await tick(list, 'a');
  await cleanUpButton(page).click();
  await expect(hill(page)).toBeVisible();
  await page.locator('.card').filter({ has: page.locator('.completed-card-body') }).getByRole('button', { name: 'Collapse card' }).click();
  await expect(hill(page)).toHaveCount(0);
});
