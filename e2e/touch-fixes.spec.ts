import { expect, test } from '@playwright/test';
import { add, cards, clickEmpty, fontsLoaded, holdAndMoveSteps, looseCards, touch } from './helpers';

// Touch and keyboard fixes from the interface review (job 140): pinch during an item lift, keyboard
// resize of a collapsed card, the context menu after a touch resize, and holding a checklist item
// inside a multi-selection on a tablet.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
});

test('keyboard-resizing a collapsed card keeps its collapsed height', async ({ page }) => {
  await add(page, 'Note');
  const card = looseCards(page).first();
  const corner = card.getByRole('button', { name: 'Resize card', exact: true });
  await corner.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await card.boundingBox())!.height).toBeGreaterThan(300);
  await card.getByRole('button', { name: 'Collapse card' }).click();
  await expect.poll(async () => (await card.boundingBox())!.height).toBeLessThan(100);
  const collapsed = (await card.boundingBox())!;
  await corner.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await card.boundingBox())!.width).toBeGreaterThan(collapsed.width);
  expect(Math.abs((await card.boundingBox())!.height - collapsed.height)).toBeLessThan(25);
});

test.describe('tablet', () => {
  test.use({ hasTouch: true, viewport: { width: 1024, height: 768 } });

  test('after a touch resize, the right-click menu still works', async ({ page }) => {
    await add(page, 'Note');
    await clickEmpty(page);
    const card = looseCards(page).first();
    const c = (await card.getByRole('button', { name: 'Resize card', exact: true }).boundingBox())!;
    const from = { x: c.x + c.width / 2, y: c.y + c.height / 2 };
    const before = (await card.boundingBox())!;
    await touch(page, [...holdAndMoveSteps(from, { x: from.x + 60, y: from.y + 40 }), { type: 'touchEnd' }]);
    await expect.poll(async () => (await card.boundingBox())!.width).toBeGreaterThan(before.width + 20);
    await page.waitForTimeout(500); // the blocker is lifted a moment after the finger
    const prevented = await page.evaluate(() => {
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      document.body.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(prevented).toBe(false);
  });

  test('holding a checklist item inside a multi-selection drags the whole selection', async ({ page }) => {
    await add(page, 'Note');
    await page.keyboard.type('note one');
    await add(page, 'Checklist');
    await page.keyboard.type('item one');
    await clickEmpty(page);
    await cards(page).nth(0).locator('.card-header').click({ modifiers: ['Control'] });
    await cards(page).nth(1).locator('.card-header').click({ modifiers: ['Control'] });
    await expect(page.locator('.card.selected')).toHaveCount(2);
    // Where each card is, by id (a drag brings the dragged cards to the front, which reorders them).
    const pos = () => cards(page).evaluateAll((els) => Object.fromEntries(els.map((e) => [(e as HTMLElement).dataset.cardId!, [parseFloat((e as HTMLElement).style.left), parseFloat((e as HTMLElement).style.top)]])));
    const before = await pos();
    const item = (await cards(page).nth(1).locator('[data-item-id]').first().boundingBox())!;
    const from = { x: item.x + 60, y: item.y + item.height / 2 };
    await touch(page, [...holdAndMoveSteps(from, { x: from.x + 100, y: from.y + 120 }), { type: 'touchEnd' }]);
    await expect.poll(pos).not.toEqual(before);
    const after = await pos();
    // Both cards moved by the same amount, so the note was not pushed aside.
    const deltas = Object.keys(before).map((id) => [after[id][0] - before[id][0], after[id][1] - before[id][1]]);
    expect(deltas[0]).toEqual(deltas[1]);
    expect(deltas[0][0]).toBeGreaterThan(50);
  });
});

test.describe('phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('a pinch during an item lift cancels it, and a later swipe moves nothing', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number; id: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'Checklist' }).tap();
    await page.keyboard.type('Groceries');
    for (const t of ['Milk', 'Eggs', 'Bread']) {
      await page.keyboard.press('Enter');
      await page.keyboard.type(t);
    }
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    const card = cards(page).first();
    const texts = () => card.getByLabel('Item text').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
    const before = await texts();
    const r = (await card.locator('[data-item-id]').first().boundingBox())!;
    const f1 = { x: r.x + 40, y: r.y + r.height / 2, id: 1 };
    await send('touchStart', [f1]);
    await page.waitForTimeout(700);
    await send('touchMove', [{ ...f1, y: f1.y + 10 }]);
    await expect(page.getByTestId('item-ghost')).toHaveCount(1);
    const f2 = { x: 300, y: 600, id: 2 };
    await send('touchStart', [{ ...f1, y: f1.y + 10 }, f2]);
    await send('touchMove', [{ ...f1, y: f1.y + 20 }, { ...f2, y: 650 }]);
    await send('touchEnd', [{ ...f2, y: 650 }]);
    await send('touchEnd', []);
    await expect(page.getByTestId('item-ghost')).toHaveCount(0);
    await touch(page, [{ type: 'touchStart', p: { x: 200, y: 700 } }, { type: 'touchMove', p: { x: 220, y: 720 } }, { type: 'touchMove', p: { x: 240, y: 740 } }, { type: 'touchEnd' }]);
    await page.waitForTimeout(300);
    expect(await texts()).toEqual(before);
    await expect(cards(page)).toHaveCount(1);
  });
});
