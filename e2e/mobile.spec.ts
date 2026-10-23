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

/** Press and hold one finger, then drag (real touch events). */
async function holdAndDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, holdMs = 700) {
  const cdp = await page.context().newCDPSession(page);
  const at = (p: { x: number; y: number }) => [{ x: p.x, y: p.y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(from) });
  await page.waitForTimeout(holdMs);
  for (let i = 1; i <= 12; i++)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at({ x: from.x + ((to.x - from.x) * i) / 12, y: from.y + ((to.y - from.y) * i) / 12 }) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('the item you tap shows its grip and trash; the others stay hidden and cannot be hit', async ({ page }) => {
    expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
    await clickEmpty(page);
    await add(page, 'Checklist');
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
    await add(page, 'Checklist');
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

  test('+ adds a note, a to-do list, a column or a sub-board (no link), and the menu closes', async ({ page }) => {
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    await bar.getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'Checklist' }).tap();
    await expect(page.getByRole('menu')).toBeHidden();
    const card = page.locator('[data-card-id]');
    await expect(card).toHaveCount(1);
    const b = (await card.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0); // in view
    await bar.getByRole('button', { name: 'Add', exact: true }).tap();
    await expect(page.getByRole('menuitem', { name: 'Link' })).toHaveCount(0);
    await bar.getByRole('button', { name: 'Add', exact: true }).tap();
    for (const kind of ['Note', 'Sub-board', 'Container']) {
      await bar.getByRole('button', { name: 'Add', exact: true }).tap();
      await page.getByRole('menuitem', { name: kind, exact: true }).tap();
    }
    await expect(page.locator('[data-card-id]')).toHaveCount(3);
    await expect(page.locator('[data-col-id]')).toHaveCount(1);
    await bar.getByRole('button', { name: 'Undo', exact: true }).tap();
    await expect(page.locator('[data-col-id]')).toHaveCount(0);
  });

  test('⋯ holds the rest: appearance (dark mode), snap, text size and the other board actions', async ({ page }) => {
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    await bar.getByRole('button', { name: 'More', exact: true }).tap();
    const menu = page.getByRole('dialog', { name: 'More' });
    for (const name of ['Snap to grid', 'Collapse all', 'Same width', 'Clean up', 'File', 'Larger text', 'Smaller text'])
      await expect(menu.getByRole('button', { name, exact: true })).toBeVisible();
    const m = (await menu.boundingBox())!;
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x + m.width).toBeLessThanOrEqual(390);
    await menu.getByRole('button', { name: 'Appearance', exact: true }).tap();
    await menu.getByRole('button', { name: 'Dark mode' }).tap();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // Tapping the board closes it.
    await page.mouse.click(200, 70); // just under the top bar, above the menu
    await expect(menu).toBeHidden();
  });

  test('⋯ has a Color button whose menu holds Auto-color, and it fits the screen', async ({ page }) => {
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    const menu = page.getByRole('dialog', { name: 'More' });
    await expect(menu.getByRole('button', { name: 'Auto-color', exact: true })).toHaveCount(0); // not a button of its own
    await menu.getByRole('button', { name: 'Color of selected cards and containers' }).tap();
    const auto = menu.getByRole('group', { name: 'Colors' }).getByRole('button', { name: 'Auto-color' });
    await expect(auto).toBeVisible();
    await expect(auto).toBeInViewport();
    const a = (await auto.boundingBox())!;
    const m = (await menu.boundingBox())!;
    expect(a.x).toBeGreaterThanOrEqual(m.x);
    expect(a.x + a.width).toBeLessThanOrEqual(m.x + m.width);
  });

  test('while typing in a checklist item, a bar of item actions shows: indent, outdent, move, tick, delete', async ({ page }) => {
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    await bar.getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'Checklist' }).tap();
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
    // Ticked, it stays in its place, struck through (job 200).
    await expect(list.getByRole('checkbox', { name: 'Done: one' })).toBeChecked();
    expect(await texts()).toEqual(['one', 'three']);

    // Gone once nothing is being typed in.
    await page.mouse.click(200, 70);
    await expect(items).toBeHidden();
  });

  test('small card buttons can be pressed a little outside their drawn edge', async ({ page }) => {
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    await bar.getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'Checklist' }).tap();
    await page.keyboard.press('Enter');
    await page.keyboard.type('Milk');
    const card = page.locator('[data-card-id]').first();
    // What a tap this far outside a control's drawn edge (below it) would land on.
    const hitBelow = (name: string, gap: number) =>
      card.getByRole('button', { name, exact: true }).evaluate((el, g) => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.bottom + g));
      }, gap);
    // (The card header's buttons reach up and sideways instead, so they never cover the card's text: see phone-touch.spec.ts.)
    expect(await hitBelow('Delete card', 1)).toBe(true); // 1px: the 32px buttons end 2px above the header's bottom, where its text starts (their press area reaches 12px up instead)
    expect(await hitBelow('Collapse card', 1)).toBe(true);
    expect(await hitBelow('Drag item', 6)).toBe(true);
    // (No trash can on each row on a phone since 2026-10-19: Delete is in the item bar. See phone-item-bar.spec.ts.)
    await expect(card.getByRole('button', { name: 'Delete item', exact: true })).toBeHidden();
    const corner = await card.getByRole('button', { name: 'Resize card' }).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.right + 8, r.bottom + 8)); // just past the card's corner
    });
    expect(corner).toBe(true);
  });

  test('the item being typed in stays in view above the keyboard and the item buttons', async ({ page }) => {
    // Stand in for the phone keyboard: a visual viewport we can shrink.
    await page.addInitScript(() => {
      const fake = Object.assign(new EventTarget(), { height: window.innerHeight, offsetTop: 0 });
      Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true });
      (window as unknown as { openKeyboard: (h: number) => void }).openKeyboard = (h) => {
        fake.height = window.innerHeight - h;
        fake.dispatchEvent(new Event('resize'));
      };
    });
    await page.reload();
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    await bar.getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'Checklist' }).tap();
    await page.keyboard.press('Enter');
    await page.keyboard.type('Milk');
    const field = page.locator('[data-card-id]').first().getByLabel('Item text');
    await page.evaluate(() => (window as unknown as { openKeyboard: (h: number) => void }).openKeyboard(420));
    const items = page.getByRole('toolbar', { name: 'Item actions' });
    await expect.poll(async () => Math.round((await items.boundingBox())!.y + (await items.boundingBox())!.height)).toBe(800 - 420);
    await expect.poll(async () => (await field.boundingBox())!.y + (await field.boundingBox())!.height).toBeLessThanOrEqual((await items.boundingBox())!.y);
    expect((await field.boundingBox())!.y).toBeGreaterThan(52); // and not up under the top bar
  });

  test('press and hold on a card, even on its title text, then move to drag it', async ({ page }) => {
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    await bar.getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'Checklist' }).tap();
    await page.keyboard.type('Groceries');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Milk');
    await page.mouse.click(200, 70); // done typing
    const card = page.locator('[data-card-id]').first();
    const before = (await card.boundingBox())!;
    // On the list title...
    const title = (await card.getByLabel('List title').boundingBox())!;
    await holdAndDrag(page, { x: title.x + 20, y: title.y + title.height / 2 }, { x: title.x + 20, y: title.y + title.height / 2 + 160 });
    await expect.poll(async () => (await card.boundingBox())!.y).toBeGreaterThan(before.y + 120);
    // ...and back up again. (On a phone, resting on an item lifts the item instead: e2e/phone-hold-drag.spec.ts.)
    const mid = (await card.boundingBox())!;
    const title2 = (await card.getByLabel('List title').boundingBox())!;
    await holdAndDrag(page, { x: title2.x + 20, y: title2.y + title2.height / 2 }, { x: title2.x + 20, y: title2.y + title2.height / 2 - 160 });
    await expect.poll(async () => (await card.boundingBox())!.y).toBeLessThan(mid.y - 120);
    expect(await card.getByLabel('Item text').first().inputValue()).toBe('Milk');
  });

  test('a quick swipe over a card, a column or a resize corner moves the board, not the block (owner request)', async ({ page }) => {
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    await bar.getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'Note' }).tap();
    await page.keyboard.type('Hello');
    await page.mouse.click(200, 70);
    const card = page.locator('[data-card-id]').first();
    const pos = () => card.evaluate((el) => ({ x: (el as HTMLElement).style.left, y: (el as HTMLElement).style.top, w: el.getBoundingClientRect().width }));
    const before = await pos();
    const canvas = page.getByTestId('canvas');
    const pan = async () => Number(await canvas.getAttribute('data-pan-y'));
    // On its text.
    let p0 = await pan();
    const text = (await card.getByRole('textbox').first().boundingBox())!;
    await holdAndDrag(page, { x: text.x + 10, y: text.y + 10 }, { x: text.x + 10, y: text.y + 130 }, 50);
    await expect.poll(pan).toBeGreaterThan(p0 + 80);
    expect(await pos()).toEqual(before);
    // On its resize corner.
    p0 = await pan();
    const corner = (await card.getByRole('button', { name: 'Resize card' }).boundingBox())!;
    await holdAndDrag(page, { x: corner.x + 9, y: corner.y + 9 }, { x: corner.x + 9 - 60, y: corner.y + 9 - 100 }, 50);
    await expect.poll(pan).toBeLessThan(p0 - 60);
    expect(await pos()).toEqual(before);
  });

  test('holding a resize corner for a moment, then moving, resizes the card', async ({ page }) => {
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    await bar.getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'Note' }).tap();
    await page.mouse.click(200, 70);
    const card = page.locator('[data-card-id]').first();
    const w0 = (await card.boundingBox())!.width;
    const corner = (await card.getByRole('button', { name: 'Resize card' }).boundingBox())!;
    const pan0 = await page.getByTestId('canvas').getAttribute('data-pan-x');
    await holdAndDrag(page, { x: corner.x + 9, y: corner.y + 9 }, { x: corner.x + 9 + 60, y: corner.y + 9 + 80 });
    await expect.poll(async () => (await card.boundingBox())!.width).toBeGreaterThan(w0 + 30);
    expect(await page.getByTestId('canvas').getAttribute('data-pan-x')).toBe(pan0);
  });

  test('a column moves by a quick swipe (the board moves) or by holding first (the column moves)', async ({ page }) => {
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    await bar.getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'Container' }).tap();
    await page.mouse.click(200, 70);
    const col = page.locator('[data-col-id]').first();
    const left = () => col.evaluate((el) => (el as HTMLElement).style.left + ',' + (el as HTMLElement).style.top);
    const before = await left();
    const b = (await col.boundingBox())!;
    const grab = { x: b.x + 12, y: b.y + 26 }; // header, beside the title
    await holdAndDrag(page, grab, { x: grab.x, y: grab.y + 150 }, 50);
    expect(await left()).toBe(before);
    const b2 = (await col.boundingBox())!;
    const grab2 = { x: b2.x + 12, y: b2.y + 26 };
    await holdAndDrag(page, grab2, { x: grab2.x, y: grab2.y + 150 });
    await expect.poll(left).not.toBe(before);
  });
});
