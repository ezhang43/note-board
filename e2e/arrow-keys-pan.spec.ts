import { expect, test, type Page } from '@playwright/test';
import { add, box, clickEmpty, freshBoardEachTest, looseCards } from './helpers';

// Owner request 2026-10-29: with nothing selected, the arrow keys pan the board (like scrolling).

freshBoardEachTest();

async function pan(page: Page) {
  const c = page.getByTestId('canvas');
  return { x: Number(await c.getAttribute('data-pan-x')), y: Number(await c.getAttribute('data-pan-y')) };
}

test('nothing selected: arrows pan 80px, Shift + arrow 400px, like scrolling', async ({ page }) => {
  await clickEmpty(page);
  const start = await pan(page);

  await page.keyboard.press('ArrowRight'); // shows what is further right: the board moves left
  await expect.poll(() => pan(page)).toEqual({ x: start.x - 80, y: start.y });
  await page.keyboard.press('ArrowDown'); // shows what is further down: the board moves up
  await expect.poll(() => pan(page)).toEqual({ x: start.x - 80, y: start.y - 80 });
  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(() => pan(page)).toEqual({ x: start.x - 80, y: start.y - 480 });
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(() => pan(page)).toEqual({ x: start.x, y: start.y - 80 });

  // Only the view moved: nothing to undo.
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('a selected card still moves with the arrows, and the board stays put', async ({ page }) => {
  await add(page, 'Note');
  const card = looseCards(page).first();
  await card.click({ position: { x: 8, y: 18 } });
  const start = await box(card);
  const view = await pan(page);

  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await box(card)).x - start.x).toBeCloseTo(20, 0);
  expect(await pan(page)).toEqual(view);

  // Escape out of the text keeps the card selected: arrows move it, they do not pan.
  await card.getByLabel('Note text').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await box(card)).y - start.y).toBeCloseTo(20, 0);
  expect(await pan(page)).toEqual(view);
});

test('typing in a note, the arrows stay in the text and the board stays put', async ({ page }) => {
  await add(page, 'Note');
  const text = looseCards(page).first().getByLabel('Note text');
  await text.fill('hello');
  await text.click();
  const view = await pan(page);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+ArrowRight');
  expect(await pan(page)).toEqual(view);
});

test('Alt + arrow still jumps to a card, and does not pan 80px', async ({ page }) => {
  await add(page, 'Note');
  await clickEmpty(page);
  const view = await pan(page);
  await page.keyboard.press('Alt+ArrowUp');
  await expect(page.locator('.card.selected')).toHaveCount(1);
  expect(await pan(page)).toEqual(view);
});

test('on a phone-sized window the arrows do not pan', async ({ page }) => {
  // Same keys pan at desktop size; then the window shrinks and they stop.
  await clickEmpty(page);
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await pan(page)).y).toBe(-80);
  await page.setViewportSize({ width: 500, height: 800 });
  const view = await pan(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+ArrowRight');
  expect(await pan(page)).toEqual(view);
});

test('a focused resize handle keeps its arrows: neither the card handles nor the panel strip pan the board', async ({ page }) => {
  await add(page, 'Note');
  await looseCards(page).first().getByRole('button', { name: 'Collapse card' }).click();
  await clickEmpty(page);
  const view = await pan(page);

  // The collapsed card's side handle has no use for up / down, but they are still its keys.
  const edge = looseCards(page).first().locator('.resize-edge');
  await edge.focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Shift+ArrowDown');
  expect(await pan(page)).toEqual(view);

  // The side panels' width strip only uses left / right.
  await page.locator('.corner-controls').getByRole('button', { name: 'Completed' }).first().click();
  await page.getByRole('separator', { name: 'Resize completed' }).focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  expect(await pan(page)).toEqual(view);
});

test('Ctrl + arrow (switch boards) does not pan', async ({ page }) => {
  await clickEmpty(page);
  const view = await pan(page);
  await page.keyboard.press('Control+ArrowDown');
  await page.keyboard.press('Control+ArrowRight');
  await page.keyboard.press('Control+Shift+ArrowLeft');
  expect(await pan(page)).toEqual(view);
});
