import { expect, test, type Page } from '@playwright/test';
import { add, clickEmpty, emptySpot, freshBoardEachTest } from './helpers';

// Speed (job perf-pan-layer): while the board is panned or zoomed by a gesture, the moving layer is
// marked `will-change: transform`, so the browser slides the picture it already has instead of drawing
// every card again each frame. Shortly after the gesture stops the mark comes off, so the text is drawn
// sharp again. Only the view moves: the saved board is untouched.

freshBoardEachTest();

const hint = (page: Page) => page.locator('.world').evaluate((el) => getComputedStyle(el).willChange);
/** Reads the hint just after the next event of this type has been handled (a window listener runs after the board's own). */
const readAfterNext = (page: Page, type: string) =>
  page.evaluate((type) => {
    addEventListener(type, () => ((window as unknown as { seen: string }).seen = getComputedStyle(document.querySelector('.world')!).willChange), { once: true });
  }, type);
const seen = (page: Page) => page.evaluate(() => (window as unknown as { seen?: string }).seen);
const savedBoard = (page: Page) => page.evaluate(() => localStorage.getItem('note-board:v1'));

/** Sends one wheel event over the empty board and reads the hint straight after it, in the same task. */
const wheelAndRead = (page: Page, ctrlKey: boolean) =>
  page.evaluate((ctrlKey) => {
    const el = document.querySelector('.canvas')!;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 30, deltaY: ctrlKey ? -20 : 40, ctrlKey, clientX: r.left + 40, clientY: r.bottom - 60 }));
    return getComputedStyle(document.querySelector('.world')!).willChange;
  }, ctrlKey);

test('at rest the board layer has no hint', async ({ page }) => {
  expect(await hint(page)).toBe('auto');
});

test('a wheel pan marks the layer while it moves and clears it shortly after; the saved board is untouched', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.type('hello');
  await clickEmpty(page);
  await expect.poll(() => savedBoard(page)).toContain('hello');
  const before = await savedBoard(page);
  const pan = await page.getByTestId('canvas').getAttribute('data-pan-x');

  expect(await wheelAndRead(page, false)).toBe('transform');
  expect(await page.getByTestId('canvas').getAttribute('data-pan-x')).not.toBe(pan);
  // Off again soon after the last wheel (about 150 ms), not left on.
  await expect.poll(() => hint(page), { timeout: 1000 }).toBe('auto');

  // A real wheel turn marks it too, and it comes off after.
  const p = await emptySpot(page);
  await page.mouse.move(p.x, p.y);
  await readAfterNext(page, 'wheel');
  await page.mouse.wheel(0, 120);
  await expect.poll(() => seen(page)).toBe('transform');
  await expect.poll(() => hint(page), { timeout: 1000 }).toBe('auto');
  expect(await savedBoard(page)).toBe(before);
});

test('a Ctrl+wheel zoom marks the layer and clears it after', async ({ page }) => {
  const zoom = await page.getByTestId('canvas').getAttribute('data-zoom');
  expect(await wheelAndRead(page, true)).toBe('transform');
  expect(await page.getByTestId('canvas').getAttribute('data-zoom')).not.toBe(zoom);
  await expect.poll(() => hint(page), { timeout: 1000 }).toBe('auto');
});

test('dragging empty board with the left button marks the layer while it moves', async ({ page }) => {
  const p = await emptySpot(page);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 30, p.y - 20, { steps: 2 });
  await readAfterNext(page, 'pointermove');
  await page.mouse.move(p.x + 60, p.y - 40);
  await expect.poll(() => seen(page)).toBe('transform');
  await page.mouse.up();
  await expect.poll(() => hint(page), { timeout: 1000 }).toBe('auto');
});
