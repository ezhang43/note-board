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

test.describe('on a phone-sized screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('the top bar fits the screen; Undo, Redo, + and ⋯ sit in a bar at the bottom', async ({ page }) => {
    const top = page.locator('.toolbar');
    expect(await top.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(top.getByLabel('Board name')).toBeVisible();
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    for (const name of ['Undo', 'Redo', 'Add', 'More']) {
      const b = (await bar.getByRole('button', { name, exact: true }).boundingBox())!;
      expect(b.y + b.height).toBeLessThanOrEqual(800);
      expect(b.y).toBeGreaterThan(800 - 100);
      expect(b.width).toBeGreaterThanOrEqual(44); // big enough for a thumb
    }
    // The desktop corner (zoom, text size, ?) is not shown on a phone; pinch zooms instead.
    await expect(page.getByRole('group', { name: 'Zoom' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Keyboard shortcuts' })).toBeHidden();
  });

  test('+ adds a note, a to-do list, a link or a column, and the menu closes', async ({ page }) => {
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    await bar.getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'To-do list' }).tap();
    await expect(page.getByRole('menu')).toBeHidden();
    const card = page.locator('[data-card-id]');
    await expect(card).toHaveCount(1);
    const b = (await card.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0); // in view
    for (const kind of ['Note', 'Link', 'Column']) {
      await bar.getByRole('button', { name: 'Add', exact: true }).tap();
      await page.getByRole('menuitem', { name: kind }).tap();
    }
    await expect(page.locator('[data-card-id]')).toHaveCount(3);
    await expect(page.locator('[data-col-id]')).toHaveCount(1);
    await bar.getByRole('button', { name: 'Undo', exact: true }).tap();
    await expect(page.locator('[data-col-id]')).toHaveCount(0);
  });

  test('⋯ holds the rest: dark mode, snap, text size and the other board actions', async ({ page }) => {
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    await bar.getByRole('button', { name: 'More', exact: true }).tap();
    const menu = page.getByRole('dialog', { name: 'More' });
    for (const name of ['Snap to grid', 'Auto-colour', 'Collapse all', 'Same width', 'Clean up', 'Import', 'Larger text', 'Smaller text', 'Hand (H)', 'Select (V)'])
      await expect(menu.getByRole('button', { name, exact: true })).toBeVisible();
    const m = (await menu.boundingBox())!;
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x + m.width).toBeLessThanOrEqual(390);
    await menu.getByRole('button', { name: 'Dark mode' }).tap();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // Tapping the board closes it.
    await page.mouse.click(200, 70); // just under the top bar, above the menu
    await expect(menu).toBeHidden();
  });

  test('while typing in a checklist item, a bar of item actions shows: indent, outdent, move, tick, delete', async ({ page }) => {
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    await bar.getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'To-do list' }).tap();
    await page.keyboard.press('Enter'); // from the title to the first item
    for (const [i, t] of ['one', 'two', 'three'].entries()) {
      if (i) await page.keyboard.press('Enter');
      await page.keyboard.type(t);
    }
    const list = page.locator('[data-card-id]').first();
    const texts = () => list.getByLabel('Item text').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
    const depth = (n: number) => list.locator('[data-item-id]').nth(n).evaluate((el) => parseFloat((el as HTMLElement).style.paddingLeft) || 0);
    const items = page.getByRole('toolbar', { name: 'Item actions' });
    await list.getByLabel('Item text').nth(1).tap();
    await expect(items).toBeVisible();
    const box = (await items.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(800);

    await items.getByRole('button', { name: 'Indent' }).tap();
    expect(await depth(1)).toBeGreaterThan(0);
    await expect(list.getByLabel('Item text').nth(1)).toBeFocused(); // still typing in it
    await items.getByRole('button', { name: 'Outdent' }).tap();
    expect(await depth(1)).toBe(0);
    await items.getByRole('button', { name: 'Move up' }).tap();
    expect(await texts()).toEqual(['two', 'one', 'three']);
    await items.getByRole('button', { name: 'Move down' }).tap();
    expect(await texts()).toEqual(['one', 'two', 'three']);
    await items.getByRole('button', { name: 'Delete item' }).tap();
    expect(await texts()).toEqual(['one', 'three']);

    await list.getByLabel('Item text').nth(0).tap();
    await items.getByRole('button', { name: 'Tick' }).tap();
    // Ticked, it moves down into the Completed section.
    await expect(list.getByRole('button', { name: /Completed/ })).toBeVisible();
    await expect(list.getByLabel('Item text').first()).toHaveValue('three');

    // Gone once nothing is being typed in.
    await page.mouse.click(200, 70);
    await expect(items).toBeHidden();
  });
});
