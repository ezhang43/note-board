import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, clickEmpty, freshBoardEachTest } from './helpers';

// Up / down arrows on a checklist item's hover strip (owner request, 2026-10-18): the same as the
// phone's Move up / Move down and Ctrl+Shift+Up / Down.

freshBoardEachTest();

async function checklist(page: Page, items: string[]) {
  await clickEmpty(page);
  await add(page, 'Checklist');
  const list = page.locator('.card.selected');
  for (const [i, t] of items.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  return list;
}

const texts = (list: Locator) => list.getByLabel('Item text').evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));
const row = (list: Locator, n: number) => list.locator('[data-item-id]').nth(n);

test('hovering an item shows Move up and Move down; clicking them moves it, one undo step each', async ({ page }) => {
  const list = await checklist(page, ['one', 'two', 'three']);
  await page.mouse.move(0, 0);
  await expect(row(list, 1).getByRole('button', { name: 'Move up' })).toHaveCSS('opacity', '0'); // only on hover
  await row(list, 1).hover();
  const up = row(list, 1).getByRole('button', { name: 'Move up' });
  await expect(up).toHaveCSS('opacity', '1');
  await expect(up).toHaveAttribute('title', 'Move up');
  await expect(row(list, 1).getByRole('button', { name: 'Move down' })).toHaveAttribute('title', 'Move down');
  await up.click();
  await expect.poll(() => texts(list)).toEqual(['two', 'one', 'three']);
  // The cursor is in the moved item, as with Ctrl+Shift+Up.
  await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLTextAreaElement).value)).toBe('two');
  await row(list, 0).hover();
  await row(list, 0).getByRole('button', { name: 'Move down' }).click();
  await expect.poll(() => texts(list)).toEqual(['one', 'two', 'three']);
  // One undo step each.
  await page.keyboard.press('Control+z');
  await expect.poll(() => texts(list)).toEqual(['two', 'one', 'three']);
  await page.keyboard.press('Control+z');
  await expect.poll(() => texts(list)).toEqual(['one', 'two', 'three']);
});

test('sub-items travel with their item; the arrows stay at the same level', async ({ page }) => {
  const list = await checklist(page, ['a', 'a1', 'b']);
  await row(list, 1).getByLabel('Item text').click();
  await page.keyboard.press('Tab'); // a1 nested under a
  await row(list, 0).hover();
  await row(list, 0).getByRole('button', { name: 'Move down' }).click();
  await expect.poll(() => texts(list)).toEqual(['b', 'a', 'a1']);
});

test('at the top or bottom of its level an arrow is faded and does nothing', async ({ page }) => {
  const list = await checklist(page, ['one', 'two']);
  await row(list, 0).hover();
  const up = row(list, 0).getByRole('button', { name: 'Move up' });
  await expect(up).toHaveAttribute('aria-disabled', 'true');
  await expect(row(list, 0).getByRole('button', { name: 'Move down' })).not.toHaveAttribute('aria-disabled', 'true');
  await up.click({ force: true }); // aria-disabled, so Playwright won't click it unforced
  await expect.poll(() => texts(list)).toEqual(['one', 'two']);
  await row(list, 1).hover();
  await expect(row(list, 1).getByRole('button', { name: 'Move down' })).toHaveAttribute('aria-disabled', 'true');
});

test('the arrows never cover the text or make it move, and take a keyboard focus ring', async ({ page }) => {
  const list = await checklist(page, ['Call the plumber about the leaking kitchen tap', 'Second']);
  await page.mouse.move(0, 0);
  const r = row(list, 0);
  const field = r.getByLabel('Item text');
  const before = (await field.boundingBox())!;
  await r.hover();
  const after = (await field.boundingBox())!;
  expect(after.width).toBe(before.width);
  for (const name of ['Move up', 'Move down', 'Delete item', 'Drag item']) {
    const b = (await r.getByRole('button', { name }).boundingBox())!;
    expect(after.x + after.width).toBeLessThanOrEqual(b.x);
  }
  const rowBox = (await r.boundingBox())!;
  const g = (await r.getByRole('button', { name: 'Drag item' }).boundingBox())!;
  expect(g.x + g.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);

  // Reached by keyboard, an arrow shows (without hover) and has a focus ring.
  await page.mouse.move(0, 0);
  await page.keyboard.press('Shift'); // the last input was the keyboard, so focus shows as a ring
  const down = r.getByRole('button', { name: 'Move down' });
  await down.focus();
  await expect(down).toBeFocused();
  await expect(down).toHaveCSS('opacity', '1');
  await expect(down).not.toHaveCSS('outline-style', 'none');
});

test('in Completed, an arrow moves past ticked neighbours only', async ({ page }) => {
  const list = await checklist(page, ['one', 'two', 'three']);
  await list.getByRole('checkbox', { name: 'Done' }).nth(0).click();
  await list.getByRole('checkbox', { name: 'Done' }).nth(0).click();
  const toggle = list.getByRole('button', { name: /Completed/ });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect.poll(() => texts(list)).toEqual(['three', 'one', 'two']);
  await row(list, 0).hover();
  await expect(row(list, 0).getByRole('button', { name: 'Move down' })).toHaveAttribute('aria-disabled', 'true'); // an open item stays out of Completed
  await row(list, 2).hover();
  await row(list, 2).getByRole('button', { name: 'Move up' }).click();
  await expect.poll(() => texts(list)).toEqual(['three', 'two', 'one']);
});

test.describe('touch screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('the on-item arrows stay hidden; the phone row has Move up / Move down', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'Checklist' }).tap();
    await page.keyboard.press('Enter');
    await page.keyboard.type('one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    const list = page.locator('[data-card-id]').first();
    await list.getByLabel('Item text').nth(1).tap();
    await expect(page.getByRole('toolbar', { name: 'Item actions' }).getByRole('button', { name: 'Move up' })).toBeVisible();
    await expect(list.getByRole('button', { name: 'Move up' })).toHaveCount(0);
    await expect(row(list, 1).locator('.item-arrow').first()).toBeHidden();
    // No room is kept for buttons that never show here: the strip stays the 40px of the grip and trash.
    await expect(row(list, 1)).toHaveCSS('padding-right', '40px');
  });
});
