import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, box, clickEmpty, columns, dragTo, freshBoardEachTest } from './helpers';

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

// Bigger hover controls on a computer (owner request, 2026-10-19): arrows 22px wide, trash 28px, grip 18px.
const size = async (l: Locator) => {
  const b = (await l.boundingBox())!;
  return { w: b.width, h: b.height };
};
const iconSize = (l: Locator) => l.locator('svg').evaluate((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }));

/** At the biggest text sizes a list is taller than the window: scroll the board until the row sits clear of the toolbar and the bottom bar. */
async function panIntoView(row: Locator) {
  for (let i = 0; i < 40; i++) {
    const b = await box(row);
    if (b.y >= 90 && b.y + b.height <= 780) return;
    await row.page().mouse.wheel(0, b.y < 90 ? -150 : 150);
    await row.page().waitForTimeout(50);
  }
}

/** Hover a row and check its four controls: sizes, one aligned line at the row's right end, clear of the text and of each other. */
async function checkControls(row: Locator) {
  await panIntoView(row);
  const field = row.getByLabel('Item text');
  const fieldBefore = (await box(field)).width;
  await row.hover();
  const buttons = ['Move up', 'Move down', 'Delete item', 'Drag item'].map((n) => row.getByRole('button', { name: n }));
  const boxes = [];
  for (const b of buttons) {
    await expect(b).toHaveCSS('opacity', /^(1|0\.3)$/);
    boxes.push(await box(b));
  }
  const [up, down, trash, grip] = boxes;
  expect([up.width, down.width, trash.width, grip.width]).toEqual([22, 22, 28, 18]);
  expect([up.height, down.height, trash.height, grip.height]).toEqual([28, 28, 28, 28]);
  expect(await iconSize(buttons[0])).toEqual({ w: 18, h: 18 });
  expect(await iconSize(buttons[1])).toEqual({ w: 18, h: 18 });
  expect(await iconSize(buttons[2])).toEqual({ w: 16, h: 16 });
  expect(await iconSize(buttons[3])).toEqual({ w: 10, h: 15 });
  // One line, in order, never overlapping a neighbour, the grip flush with the row's right end.
  expect(new Set(boxes.map((b) => b.y)).size).toBe(1);
  for (let i = 0; i < 3; i++) expect(boxes[i].x + boxes[i].width).toBeLessThanOrEqual(boxes[i + 1].x + 0.01);
  const r = await box(row);
  expect(grip.x + grip.width).toBeCloseTo(r.x + r.width, 0);
  expect(up.y).toBeGreaterThanOrEqual(r.y);
  expect(up.y + up.height).toBeLessThanOrEqual(r.y + r.height);
  // The text stops before the first control and does not move on hover.
  const f = await box(field);
  expect(f.width).toBe(fieldBefore);
  expect(f.x + f.width).toBeLessThanOrEqual(up.x);
}

/** Step A− / A+ from the smallest text size to the largest, whatever the steps are, and run `check` at each. */
async function atEveryTextSize(page: Page, check: () => Promise<void>) {
  const smaller = page.getByRole('button', { name: 'Smaller text' });
  const larger = page.getByRole('button', { name: 'Larger text' });
  for (let i = 0; i < 12 && (await smaller.getAttribute('aria-disabled')) !== 'true'; i++) await smaller.click();
  for (let i = 0; i < 12; i++) {
    await check();
    if ((await larger.getAttribute('aria-disabled')) === 'true') break;
    await larger.click();
  }
}

test('on a computer the hover controls are bigger, in one aligned line clear of the text, at every text size', async ({ page }) => {
  test.slow(); // six text sizes, each checked on every row
  const list = await checklist(page, ['Call the plumber about the leaking kitchen tap', 'sub item', 'Second']);
  await row(list, 1).getByLabel('Item text').click();
  await page.keyboard.press('Tab'); // 'sub item' nested under the first
  await page.mouse.move(0, 0);
  await atEveryTextSize(page, async () => {
    for (const n of [0, 1, 2]) await checkControls(row(list, n)); // the middle one is a sub-item
  });
});

test('inside a container the hover controls have the same sizes and stay clear of the text', async ({ page }) => {
  test.slow(); // six text sizes, each checked on every row
  await checklist(page, ['Call the plumber about the leaking kitchen tap', 'Second']);
  await clickEmpty(page);
  await add(page, 'New container');
  const col = columns(page).first();
  await clickEmpty(page);
  const colBox = await box(col);
  await dragTo(page, page.locator('.card.loose').first(), { x: colBox.x + 100, y: colBox.y + 20 });
  await expect(col.locator('.card.in-column')).toHaveCount(1);
  await page.mouse.move(0, 0);
  await atEveryTextSize(page, async () => {
    for (const n of [0, 1]) await checkControls(col.locator('.card.in-column [data-item-id]').nth(n));
  });
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
    // No room is kept for buttons that never show here, nor for the trash can the phone layout has no row button for: the strip is the grip's 14px plus a gap.
    await expect(row(list, 1)).toHaveCSS('padding-right', '24px');
    // The bigger computer sizes do not reach a touch screen: the grip keeps its size.
    await expect(row(list, 1).getByRole('button', { name: 'Delete item' })).toBeHidden(); // phone layout: Delete is in the item bar
    const grip = row(list, 1).getByRole('button', { name: 'Drag item' });
    expect(await size(grip)).toEqual({ w: 14, h: 24 });
    expect(await iconSize(grip)).toEqual({ w: 8, h: 12 });
  });
});
