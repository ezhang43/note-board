import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, box, clickEmpty, freshBoardEachTest } from './helpers';

freshBoardEachTest();

// Owner request (2026-10-05): every item Clean up sends into the Completed card moves an ant a step
// higher up a hill. The hill sits at the top of the board, fixed on screen, and can't be clicked.

const cleanUpButton = (page: Page) => page.locator('header.toolbar').getByRole('button', { name: 'Clean up', exact: true });
const hill = (page: Page) => page.getByTestId('canvas').locator('.ant-hill');
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

test('the hill is on the board from the start, at the top, not inside any card', async ({ page }) => {
  await expect(hill(page)).toHaveCount(1);
  await expect(hill(page)).toHaveAttribute('aria-label', 'Ant on hill 1: 0 of 10 steps to the top');
  await expect(hill(page).locator('.hill-caption')).toHaveText('Hill 1 · 0 of 10');
  await expect(page.locator('[data-card-id] .ant-hill')).toHaveCount(0);
  const canvas = await box(page.getByTestId('canvas'));
  const h = await box(hill(page));
  expect(h.y - canvas.y).toBeLessThan(40); // near the top
  expect(Math.abs(h.x + h.width / 2 - (canvas.x + canvas.width / 2))).toBeLessThan(2); // centred

  // Collapsing the Completed card leaves it alone.
  const list = await makeList(page, ['a']);
  await tick(list, 'a');
  await cleanUpButton(page).click();
  await page.locator('.card').filter({ has: page.locator('.completed-card-body') }).getByRole('button', { name: 'Collapse card' }).click();
  await expect(hill(page)).toHaveAttribute('aria-label', 'Ant on hill 1: 1 of 10 steps to the top');
});

test('the hill stays put while the board is panned or zoomed, and clicks go through it', async ({ page }) => {
  const before = await box(hill(page));
  const canvas = await box(page.getByTestId('canvas'));
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.wheel(120, 200);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  expect(await box(hill(page))).toEqual(before);

  // Nothing on it takes the pointer: a card under it can still be clicked.
  await expect(hill(page)).toHaveCSS('pointer-events', 'none');
  await page.getByRole('button', { name: 'Reset zoom' }).click();
  await clickEmpty(page);
  await add(page, 'Note');
  const id = await page.locator('.card.selected').getAttribute('data-card-id');
  const note = page.locator(`[data-card-id="${id}"]`);
  const n = await box(note);
  // Drag the note up under the hill, by its header.
  await page.mouse.move(n.x + n.width / 2, n.y + 6);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2, before.y + 6, { steps: 8 });
  await page.mouse.up();
  await clickEmpty(page);
  await expect(page.locator('.card.selected')).toHaveCount(0);
  await page.mouse.click(before.x + before.width / 2, before.y + 20);
  await expect(note).toHaveClass(/selected/);
});

test('each board has its own hill; opening another board puts the ant there at once, without walking', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const list = await makeList(page, ['a', 'b', 'c']);
  for (const t of ['a', 'b', 'c']) await tick(list, t);
  await expect(list.locator('.completed [data-item-id]')).toHaveCount(3);
  await cleanUpButton(page).click();
  await expect(ant(page)).not.toHaveClass(/walking/, { timeout: 5000 });
  await expect(hill(page)).toHaveAttribute('aria-label', 'Ant on hill 1: 3 of 10 steps to the top');

  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'Add a sub-board here' }).click();
  await page.locator('[data-kind="board"]').getByRole('button', { name: 'Open board' }).click();
  await expect(hill(page)).toHaveAttribute('aria-label', 'Ant on hill 1: 0 of 10 steps to the top');
  await expectStill(page);
  await page.getByRole('button', { name: /^Back to/ }).click();
  await expect(hill(page)).toHaveAttribute('aria-label', 'Ant on hill 1: 3 of 10 steps to the top');
  await expectStill(page);
});

/** The ant is already where it belongs: it doesn't move over the next half second. */
async function expectStill(page: Page) {
  const now = await box(ant(page));
  await page.waitForTimeout(500);
  expect(await box(ant(page))).toEqual(now);
}
