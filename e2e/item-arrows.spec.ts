import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, box, clickEmpty, columns, dragPointer, dragTo, freshBoardEachTest } from './helpers';

// Up / down arrows on a checklist item (owner request, 2026-10-18): the same as the phone's Move up /
// Move down and Ctrl+Shift+Up / Down. Since job 186 (owner pick, 2026-10-22) the item's text gets the
// whole row but for a 46px strip holding the trash can and the grip; Move up / Move down sit in a small
// pill over the free strip of the row above (below the row, for the first one), shown on hover or focus.

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
  await expect(row(list, 1).locator('.item-arrows')).toHaveCSS('opacity', '0'); // only on hover
  await row(list, 1).hover();
  const up = row(list, 1).getByRole('button', { name: 'Move up' });
  await expect(row(list, 1).locator('.item-arrows')).toHaveCSS('opacity', '1');
  await expect(up).toBeVisible();
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

test('the text keeps the whole row but for a 46px strip, and nothing on hover covers or moves it', async ({ page }) => {
  const list = await checklist(page, ['Call the plumber about the leaking kitchen tap', 'Second', 'Third']);
  await page.mouse.move(0, 0);
  const r = row(list, 1);
  const field = r.getByLabel('Item text');
  const rowBox = await box(r);
  const before = await box(field);
  // Only the trash can and the grip keep room: 46px, so the text column is most of the row.
  await expect(r).toHaveCSS('padding-right', '46px');
  expect(Math.abs(before.x + before.width - (rowBox.x + rowBox.width - 46))).toBeLessThan(1);
  expect(before.width).toBeGreaterThan(rowBox.width * 0.6);
  await r.hover();
  const after = await box(field);
  expect(after.width).toBe(before.width);
  for (const name of ['Delete item', 'Drag item']) {
    const b = await box(r.getByRole('button', { name }));
    expect(after.x + after.width).toBeLessThanOrEqual(b.x);
  }
  const g = await box(r.getByRole('button', { name: 'Drag item' }));
  expect(g.x + g.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
  // Move up / Move down are in a pill just above the row, over the free strip of the row above: clear of that row's text too.
  const pill = await box(r.locator('.item-arrows'));
  const above = await box(row(list, 0).getByLabel('Item text'));
  expect(pill.y + pill.height).toBeLessThanOrEqual(rowBox.y + 3);
  expect(pill.y + pill.height).toBeGreaterThan(rowBox.y);
  expect(above.x + above.width).toBeLessThanOrEqual(pill.x + 0.5);
  expect(pill.x + pill.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 0.5);
  expect(pill.x).toBeGreaterThanOrEqual(rowBox.x + rowBox.width - 46 - 0.5);
  // The first item has no row above it that is clear of the card's buttons, so its pill is below it.
  await row(list, 0).hover();
  const first = await box(row(list, 0));
  const pill0 = await box(row(list, 0).locator('.item-arrows'));
  expect(pill0.y).toBeGreaterThanOrEqual(first.y + first.height - 3);
  expect(pill0.y).toBeLessThan(first.y + first.height);
  const next = await box(row(list, 1).getByLabel('Item text'));
  expect(next.x + next.width).toBeLessThanOrEqual(pill0.x + 0.5);
});

test('the pill stays while the pointer is on it, goes when it leaves, and a hidden one takes no presses', async ({ page }) => {
  const list = await checklist(page, ['one', 'two', 'three']);
  await page.mouse.move(0, 0);
  const pill = row(list, 2).locator('.item-arrows');
  await row(list, 2).hover();
  await expect(pill).toHaveCSS('opacity', '1');
  const p = await box(pill);
  await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2); // up into the pill, over the row above
  await expect(pill).toHaveCSS('opacity', '1');
  await page.mouse.move(0, 0);
  await expect(pill).toHaveCSS('opacity', '0');
  // Hovering the row above, the pill of the row below (hidden) is not in the way of its trash can.
  await row(list, 1).hover();
  const trash = await box(row(list, 1).getByRole('button', { name: 'Delete item' }));
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label'), { x: trash.x + trash.width / 2, y: trash.y + trash.height / 2 })).toBe('Delete item');
});

test('reached by keyboard, Move up / Move down show (without hover) and take a focus ring', async ({ page }) => {
  const list = await checklist(page, ['one', 'two']);
  await page.mouse.move(0, 0);
  await page.keyboard.press('Shift'); // the last input was the keyboard, so focus shows as a ring
  const down = row(list, 0).getByRole('button', { name: 'Move down' });
  await down.focus();
  await expect(down).toBeFocused();
  await expect(row(list, 0).locator('.item-arrows')).toHaveCSS('opacity', '1');
  await expect(down).not.toHaveCSS('outline-style', 'none');
  await page.keyboard.press('Enter');
  await expect.poll(() => texts(list)).toEqual(['two', 'one']);
});

test('a list of one item has nothing to move: no pill', async ({ page }) => {
  const list = await checklist(page, ['only']);
  await row(list, 0).hover();
  await expect(list.locator('.item-arrows')).toHaveCount(0);
});

// Bigger hover controls on a computer (owner request, 2026-10-19): arrows 22px wide, trash 28px, grip 18px; they grow with the text size step (owner request, 2026-10-21).
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

/**
 * Hover a row and check its four controls: sizes; the trash can and the grip in one line at the row's right end,
 * flush; Move up / Move down in a pill over the free strip of the row above (below the row, for the first one), clear of the text.
 */
async function checkControls(row: Locator, first: boolean) {
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
  // The sizes grow with the text step (never under the Small size), and as tall as the item's first line.
  const fs = Number(await row.evaluate((el) => getComputedStyle(el).getPropertyValue('--fs')));
  const s = Math.max(1, fs);
  const near = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThan(0.6);
  [up.width, down.width, trash.width, grip.width].forEach((w, i) => near(w, [22, 22, 28, 18][i] * s));
  for (const b of boxes) near(b.height, 20 * s + 8);
  const icons = await Promise.all(buttons.map(iconSize));
  [18, 18, 16, 10].forEach((w, i) => near(icons[i].w, w * s));
  near(icons[3].h, 15 * s);
  const r = await box(row);
  // The trash can and the grip: one line, flush, the grip flush with the row's right end, inside the row.
  expect(trash.y).toBe(grip.y);
  near(trash.x + trash.width, grip.x);
  near(grip.x + grip.width, r.x + r.width);
  expect(trash.y).toBeGreaterThanOrEqual(r.y);
  expect(trash.y + trash.height).toBeLessThanOrEqual(r.y + r.height);
  // The pill: Move up beside Move down, over the strip (46px, grown with the text size) at the row's right end,
  // above the row (the first row: below it), touching it.
  expect(up.y).toBe(down.y);
  near(up.x + up.width, down.x);
  expect(down.x + down.width).toBeLessThanOrEqual(r.x + r.width + 0.5);
  expect(up.x).toBeGreaterThanOrEqual(r.x + r.width - 46 * s - 0.5);
  if (first) expect(up.y).toBeGreaterThanOrEqual(r.y + r.height - 3);
  else expect(up.y + up.height).toBeLessThanOrEqual(r.y + 3);
  // The text stops before the trash can and does not move on hover.
  const f = await box(field);
  expect(f.width).toBe(fieldBefore);
  expect(f.x + f.width).toBeLessThanOrEqual(trash.x);
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

test('on a computer the hover controls are bigger, trash and grip in a line, the arrows in a pill, clear of the text, at every text size', async ({ page }) => {
  test.slow(); // six text sizes, each checked on every row
  const list = await checklist(page, ['Call the plumber about the leaking kitchen tap', 'sub item', 'sub two', 'Second']);
  await row(list, 1).getByLabel('Item text').click();
  await page.keyboard.press('Tab'); // 'sub item' nested under the first
  await row(list, 2).getByLabel('Item text').click();
  await page.keyboard.press('Tab'); // and 'sub two' beside it, so each can move
  // A new card is narrow; at the biggest text the strip kept free for the buttons (81px) would leave a sub-item little room, so widen it.
  const corner = await box(list.getByRole('button', { name: 'Resize card' }));
  const from = { x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 };
  await dragPointer(page, from, { x: from.x + 260, y: from.y });
  await page.mouse.move(0, 0);
  const card = page.locator('.card.loose').first(); // the resize left nothing selected
  await atEveryTextSize(page, async () => {
    for (const n of [0, 1, 2]) await checkControls(row(card, n), n === 0); // the second and third are sub-items
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
    for (const n of [0, 1]) await checkControls(col.locator('.card.in-column [data-item-id]').nth(n), n === 0);
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
  await expect(row(list, 0).getByRole('button', { name: 'Move down' })).toHaveCount(0); // an open item stays out of Completed, and it is alone: nothing to move
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
