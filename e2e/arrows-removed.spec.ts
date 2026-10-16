import { expect, test, type Page } from '@playwright/test';
import { add, box, cards, clickEmpty, freshBoardEachTest, grabPoint } from './helpers';

// Owner request (2026-10-16): arrows between cards and containers are gone. No connection dots
// on hovered or selected blocks, and boards saved with arrows open without them, everything else kept.

freshBoardEachTest();

const anyArrowBits = (page: Page) => page.locator('.arrow-dot, .arrows-layer, [data-arrow-id], .arrow-delete');

test('hovering or selecting a card or container shows no connection dots', async ({ page }) => {
  await add(page, 'New container');
  await add(page, 'Note');
  await clickEmpty(page);
  await add(page, 'Note');
  const note = page.locator('.card.selected');
  await expect(note).toHaveCount(1);
  const c = await box(note);
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.waitForTimeout(400); // the dots used to fade in after a moment
  await expect(anyArrowBits(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Draw an arrow/ })).toHaveCount(0);
  const g = await grabPoint(page.locator('[data-col-id]'));
  await page.mouse.click(g.x, g.y);
  await page.waitForTimeout(400);
  await expect(anyArrowBits(page)).toHaveCount(0);
});

test('a board saved with arrows opens without them, keeping its cards; the next save drops them', async ({ page }) => {
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
