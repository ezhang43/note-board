import { expect, test, type Page } from '@playwright/test';
import { add, cards, clickEmpty, freshBoardEachTest } from './helpers';

// Owner request (2026-10-16): the first arrows between cards and containers were removed, and boards
// saved with them (saved versions 3 and 4) open without them, everything else kept. Arrows came back
// on 2026-11-03 (job card-arrows, e2e/card-arrows.spec.ts) from saved version 5; the old ones stay erased.

freshBoardEachTest();

const anyArrowBits = (page: Page) => page.locator('[data-arrow-id]');

test('a board saved with the old arrows (version 4) opens without them, keeping its cards; the next save drops them', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.type('first');
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.type('second');
  await clickEmpty(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('note-board:v1') ?? '')).toContain('second');
  const saved = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
    const board = raw.boards[raw.home];
    const [a, b] = board.order;
    board.arrows = [{ id: 'x1', from: a, to: b }];
    raw.version = 4;
    return JSON.stringify(raw);
  });
  // Put in before the app starts (it saves its own board as the page closes).
  await page.addInitScript((raw) => localStorage.setItem('note-board:v1', raw), saved);
  await page.reload();
  await expect(cards(page)).toHaveCount(2);
  await expect(page.getByLabel('Note text').first()).toHaveValue(/first|second/);
  await expect(anyArrowBits(page)).toHaveCount(0);

  await add(page, 'Note');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('note-board:v1')!).boards.home.order.length)).toBe(3);
  const after = await page.evaluate(() => localStorage.getItem('note-board:v1')!);
  expect(after).not.toContain('"arrows"');
  expect(after).toContain('first');
  expect(after).toContain('second');
});
