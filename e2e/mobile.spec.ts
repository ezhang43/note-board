import { expect, test, type Page } from '@playwright/test';
import { add, clickEmpty, freshBoardEachTest } from './helpers';

// Phone and touch-screen use (owner request, 2026-10-04): no hover, small screens.

freshBoardEachTest();

/** A one-finger drag, sent as real touch events (Playwright's touchscreen only taps). */
async function fingerDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  const at = (p: { x: number; y: number }) => [{ x: p.x, y: p.y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(from) });
  for (let i = 1; i <= 12; i++)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at({ x: from.x + ((to.x - from.x) * i) / 12, y: from.y + ((to.y - from.y) * i) / 12 }) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('the item you tap shows its grip and trash; the others stay hidden and cannot be hit', async ({ page }) => {
    expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
    await clickEmpty(page);
    await add(page, 'To-do list');
    await page.keyboard.type('Buy milk');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Call plumber');
    const rows = page.locator('.card.selected [data-item-id]');
    const [first, second] = [rows.nth(0), rows.nth(1)];
    await first.getByLabel('Item text').tap();
    await expect(first.getByRole('button', { name: 'Delete item' })).toBeVisible();
    await expect(first.getByRole('button', { name: 'Drag item' })).toBeVisible();
    await expect(second.getByRole('button', { name: 'Delete item' })).toBeHidden();
    await expect(second.getByRole('button', { name: 'Drag item' })).toBeHidden();
    // Tapping the trash on the item being typed in deletes it.
    await first.getByRole('button', { name: 'Delete item' }).tap();
    await expect(page.locator('.card.selected').getByLabel('Item text')).toHaveCount(1);
    await expect(page.locator('.card.selected').getByLabel('Item text')).toHaveValue('Call plumber');
  });

  test('an item can be dragged by its grip with a finger', async ({ page }) => {
    await clickEmpty(page);
    await add(page, 'To-do list');
    for (const [i, t] of ['one', 'two', 'three'].entries()) {
      if (i) await page.keyboard.press('Enter');
      await page.keyboard.type(t);
    }
    const list = page.locator('.card.selected');
    const rows = list.locator('[data-item-id]');
    await rows.nth(0).getByLabel('Item text').tap();
    const grip = (await rows.nth(0).getByRole('button', { name: 'Drag item' }).boundingBox())!;
    const last = (await rows.nth(2).boundingBox())!;
    await fingerDrag(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, { x: last.x + 30, y: last.y + last.height - 4 });
    await expect(list.getByLabel('Item text')).toHaveCount(3);
    expect(await list.getByLabel('Item text').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value))).toEqual(['two', 'three', 'one']);
  });
});
