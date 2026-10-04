import { expect, test, type Page } from '@playwright/test';
import { add, clickEmpty, freshBoardEachTest } from './helpers';

// Opening the board brings what's on it into view, centred (owner request, 2026-10-04).

freshBoardEachTest();

async function inView(page: Page) {
  const c = (await page.getByTestId('canvas').boundingBox())!;
  return page.locator('[data-card-id], [data-col-id]').evaluateAll(
    (els, c) =>
      els.every((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= c.x && r.right <= c.x + c.width && r.top >= c.y && r.bottom <= c.y + c.height;
      }),
    c,
  );
}

async function scrollAway(page: Page) {
  const c = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(900, 700);
}

test('reopening the board shows its cards and columns, centred, even after scrolling far away', async ({ page }) => {
  for (const kind of ['Note', 'To-do list', 'New column'] as const) {
    await clickEmpty(page);
    await add(page, kind);
    await page.keyboard.press('Escape');
  }
  await scrollAway(page);
  expect(await inView(page)).toBe(false);
  await page.reload();
  await expect.poll(() => inView(page)).toBe(true);
  // Centred: the middle of everything is the middle of the screen.
  const c = (await page.getByTestId('canvas').boundingBox())!;
  const mid = await page.locator('[data-card-id], [data-col-id]').evaluateAll((els) => {
    const rs = els.map((el) => el.getBoundingClientRect());
    return { x: (Math.min(...rs.map((r) => r.left)) + Math.max(...rs.map((r) => r.right))) / 2, y: (Math.min(...rs.map((r) => r.top)) + Math.max(...rs.map((r) => r.bottom))) / 2 };
  });
  expect(Math.abs(mid.x - (c.x + c.width / 2))).toBeLessThan(4);
  expect(Math.abs(mid.y - (c.y + c.height / 2))).toBeLessThan(4);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('reopening shows the cards on the small screen, zooming out if needed', async ({ page }) => {
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    for (const kind of ['Note', 'Note', 'To-do list']) {
      await bar.getByRole('button', { name: 'Add', exact: true }).tap();
      await page.getByRole('menuitem', { name: kind, exact: true }).tap();
    }
    await page.mouse.click(200, 70);
    await scrollAway(page);
    await page.reload();
    await expect.poll(() => inView(page)).toBe(true);
  });
});
