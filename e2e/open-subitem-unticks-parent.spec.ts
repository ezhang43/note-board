import { expect, test, type Page } from '@playwright/test';
import { freshBoardEachTest } from './helpers';

// Owner report 2026-11-03: when a checklist is fully ticked and a new, open sub-item is added, the
// parent must be unticked (it is complete only when every sub-item under it is). Undo restores both.

freshBoardEachTest();

/** One list: "Trip" with sub-items "Pack" and "Book", all ticked. */
async function seed(page: Page) {
  await page.evaluate(() => {
    const it = (id: string, text: string, children: unknown[] = []) => ({ id, text, done: true, children });
    const board = {
      name: 'T',
      snap: true,
      cards: {
        t1: {
          id: 't1', kind: 'todo', color: null, collapsed: false, h: null, x: 100, y: 100, w: 260, title: 'Plans', completedOpen: true,
          items: [it('p', 'Trip', [it('a', 'Pack'), it('b', 'Book')])],
        },
      },
      columns: {},
      order: ['t1'],
    };
    localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board }));
  });
  await page.reload();
}

const list = (page: Page) => page.locator('[data-card-id="t1"]');
const ticks = (page: Page) => list(page).getByLabel('Done').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).checked));
const boxes = (page: Page) => list(page).getByLabel('Item text');

test('Enter at the end of the last ticked sub-item adds an open one and unticks the parent; Undo restores both', async ({ page }) => {
  await seed(page);
  expect(await ticks(page)).toEqual([true, true, true]);
  await boxes(page).nth(2).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(boxes(page)).toHaveCount(4);
  // Parent open, the two ticked sub-items still ticked, the new blank sub-item open.
  expect(await ticks(page)).toEqual([false, true, true, false]);
  await page.keyboard.press('Control+z');
  await expect(boxes(page)).toHaveCount(3);
  expect(await ticks(page)).toEqual([true, true, true]);
});
