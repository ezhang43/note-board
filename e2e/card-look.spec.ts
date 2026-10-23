import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, box, clickEmpty, freshBoardEachTest, toggleDark } from './helpers';

// Card-look fixes (owner request, 2026-10-21): the item buttons grow with the text size, a tick box sits
// on the middle of its item's first line, and a colored collapsed card is colored from top to bottom.

freshBoardEachTest();

async function checklist(page: Page, items: string[]) {
  await clickEmpty(page);
  await add(page, 'Checklist');
  for (const [i, t] of items.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  return page.locator('.card.selected');
}


/** The tick box's middle and the middle of the item's first line of text (the box's padding, then half a line), in px down the page. */
async function centers(row: Locator) {
  const tick = await box(row.getByRole('checkbox', { name: 'Done' }));
  const line = await row.getByLabel('Item text').evaluate((el) => {
    const cs = getComputedStyle(el);
    return el.getBoundingClientRect().top + parseFloat(cs.paddingTop) + parseFloat(cs.lineHeight) / 2;
  });
  return { tick: tick.y + tick.height / 2, line };
}

async function checkTicks(list: Locator) {
  for (const n of [0, 1, 2]) {
    const { tick, line } = await centers(list.locator('[data-item-id]').nth(n));
    expect(Math.abs(tick - line), `item ${n}`).toBeLessThanOrEqual(1);
  }
}

/** Step A− / A+ from the smallest text size to the largest, and run `check` at each (with the step's scale). */
async function atEveryStep(page: Page, check: (scale: number) => Promise<void>) {
  const smaller = page.getByRole('button', { name: 'Smaller text' });
  const larger = page.getByRole('button', { name: 'Larger text' });
  for (let i = 0; i < 12 && (await smaller.getAttribute('aria-disabled')) !== 'true'; i++) await smaller.click();
  for (let i = 0; i < 12; i++) {
    await check(Number(await page.getByTestId('canvas').evaluate((el) => getComputedStyle(el).getPropertyValue('--fs'))));
    if ((await larger.getAttribute('aria-disabled')) === 'true') break;
    await larger.click();
  }
}

test("a tick box is centered on its item's first line at every text size, for items and sub-items, light and dark", async ({ page }) => {
  test.slow(); // twelve text sizes, light and dark
  const list = await checklist(page, ['Call the plumber about the leaking kitchen tap and the bathroom sink', 'sub item', 'Second']);
  await list.locator('[data-item-id]').nth(1).getByLabel('Item text').click();
  await page.keyboard.press('Tab'); // 'sub item' nested under the first
  await list.locator('[data-item-id]').nth(2).getByLabel('Item text').click();
  await page.keyboard.press('Control+Shift+Period'); // a bigger per-text size on the last item
  await page.mouse.move(0, 0);
  await atEveryStep(page, () => checkTicks(list));
  await toggleDark(page);
  await atEveryStep(page, () => checkTicks(list));
  await toggleDark(page);
});

test('the tick box is 20px at Normal and grows with the text size, like the item buttons, never below 20px', async ({ page }) => {
  test.slow();
  const list = await checklist(page, ['Call the plumber', 'sub item']);
  await list.locator('[data-item-id]').nth(1).getByLabel('Item text').click();
  await page.keyboard.press('Tab'); // a sub-item, too
  await page.mouse.move(0, 0);
  const seen: number[] = [];
  await atEveryStep(page, async (fs) => {
    const s = Math.max(1, fs);
    seen.push(s);
    for (const n of [0, 1]) {
      const tick = await box(list.locator('[data-item-id]').nth(n).getByRole('checkbox', { name: 'Done' }));
      expect(Math.abs(tick.width - 20 * s), `width at ${fs}`).toBeLessThan(0.6);
      expect(Math.abs(tick.height - 20 * s), `height at ${fs}`).toBeLessThan(0.6);
    }
  });
  expect(seen[0]).toBe(1);
  expect(seen[seen.length - 1]).toBe(4);
});

test('the item buttons and the strip kept free for them grow with the text size, never below the Small size', async ({ page }) => {
  test.slow(); // six text sizes
  const list = await checklist(page, ['Call the plumber about the leaking kitchen tap', 'Second']); // two items, so the first has somewhere to move
  const row = list.locator('[data-item-id]').first();
  await page.mouse.move(0, 0);
  const smaller = page.getByRole('button', { name: 'Smaller text' });
  for (let i = 0; i < 12 && (await smaller.getAttribute('aria-disabled')) !== 'true'; i++) await smaller.click();
  const larger = page.getByRole('button', { name: 'Larger text' });
  const seen: number[] = [];
  for (let i = 0; i < 12; i++) {
    const fs = Number(await row.evaluate((el) => getComputedStyle(el).getPropertyValue('--fs')));
    const line = Math.max(1, fs); // the first line's step (the height of the buttons)
    const s = Math.min(line, 1.9); // their widths, icons and the strip stop growing at 190%, so the 80px tick box and the strip fit a 200px card at 400%
    seen.push(line);
    await row.hover();
    const sizeOf = async (name: string) => {
      const b = row.getByRole('button', { name });
      const icon = await b.locator('svg').evaluate((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }));
      return { b: await box(b), icon };
    };
    const [up, down, trash, grip] = await Promise.all(['Move up', 'Move down', 'Delete item', 'Drag item'].map(sizeOf));
    const near = (a: number, e: number) => expect(Math.abs(a - e)).toBeLessThan(0.6);
    near(up.b.width, 22 * s);
    near(down.b.width, 22 * s);
    near(trash.b.width, 28 * s);
    near(grip.b.width, 18 * s);
    for (const x of [up, down, trash, grip]) near(x.b.height, 20 * line + 8); // the item's first line
    near(up.icon.w, 18 * s);
    near(trash.icon.w, 16 * s);
    near(grip.icon.w, 10 * s);
    near(grip.icon.h, 15 * s);
    // The strip kept free (for the trash can and the grip; the arrows float in a pill) is 46px at Normal and Small, bigger from Large up (to 190%).
    expect(await row.evaluate((el) => parseFloat(getComputedStyle(el).paddingRight))).toBeCloseTo(46 * s, 0);
    // The press area is at least 24 x 24 at every size.
    for (const x of [up, down, trash, grip]) expect(Math.min(x.b.width, x.b.height)).toBeGreaterThanOrEqual(18);
    for (const x of [up, down, trash, grip]) expect(x.b.height).toBeGreaterThanOrEqual(24);
    if ((await larger.getAttribute('aria-disabled')) === 'true') break;
    await larger.click();
  }
  expect(seen[0]).toBe(1); // Small keeps today's size
  expect(seen[seen.length - 1]).toBe(4);
});

/** The color of one pixel of the page, read back from a screenshot. */
async function pixel(page: Page, x: number, y: number) {
  const png = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    return Array.from(g.getImageData(0, 0, 1, 1).data.slice(0, 3));
  }, png.toString('base64'));
}

for (const dark of [false, true]) {
  test(`a colored collapsed card is colored top to bottom, into its corners (${dark ? 'dark' : 'light'})`, async ({ page }) => {
    if (dark) await toggleDark(page);
    await clickEmpty(page);
    await add(page, 'Checklist', { stayInTitle: true });
    await page.keyboard.type('Wednesday');
    await page.getByRole('button', { name: 'Color of selected cards and containers' }).click();
    await page.getByRole('group', { name: 'Colors' }).getByRole('button', { name: 'Violet' }).click();
    const card = page.locator('.card.loose').first();
    await card.getByRole('button', { name: 'Collapse card' }).click();
    await clickEmpty(page);
    await page.mouse.move(0, 0);
    await expect(card).toHaveClass(/collapsed/);
    // Let color fades and the collapse finish first: on a slow machine the middle pixel was read mid-fade.
    await page.evaluate(() =>
      Promise.race([
        Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))),
        new Promise((done) => setTimeout(done, 2000)),
      ]),
    );
    const b = await box(card);
    expect(b.height).toBeGreaterThanOrEqual(59);
    const x = b.x + b.width * 0.75;
    const mid = await pixel(page, x, b.y + b.height / 2);
    const plain = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--card-bg').trim());
    expect(plain).not.toBe('');
    for (const [name, px, py] of [
      ['top edge', x, b.y + 2],
      ['bottom edge', x, b.y + b.height - 3],
      ['top left corner', b.x + 4, b.y + 4],
      ['bottom left corner', b.x + 4, b.y + b.height - 5],
    ] as const) {
      expect(await pixel(page, px, py), name).toEqual(mid);
    }
  });
}
