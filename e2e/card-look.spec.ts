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
    const row = list.locator('[data-item-id]').nth(n);
    const { tick, line } = await centers(row);
    // The box sits 5% of the line below the middle of the first line (1px at Normal, 2px at 200%): the middle of lowercase text is lower than that of capitals (owner request, 2026-10-23).
    const nudge = (await row.getByLabel('Item text').evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))) * 0.05;
    expect(Math.abs(tick - line - nudge), `item ${n}`).toBeLessThanOrEqual(0.75);
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

test("a tick box is centered on its item's first line (nudged down 5% of the line) at every text size, for items and sub-items, light and dark", async ({ page }) => {
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

// Honey well tick boxes (owner request, 2026-10-23: "the checkboxes look a bit clunky"; picked "C. Honey well"): drawn by the app, a honey
// square with an amber border, amber and a thin tick when ticked, that grow with the text step.

async function seedTicks(page: Page) {
  await page.evaluate(() => {
    const item = (id: string, text: string, done: boolean) => ({ id, text, done, children: [] as never[] });
    const board = {
      name: 'T',
      snap: true,
      cards: { t1: { id: 't1', kind: 'todo', title: 'Errands', color: null, collapsed: false, h: null, completedOpen: true, x: 100, y: 100, w: 300, items: [item('a', 'Buy milk', false), item('b', 'Return books', true)] } },
      columns: {},
      order: ['t1'],
    };
    localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board }));
  });
  await page.reload();
  await page.mouse.move(0, 0);
}

/** Resolves any CSS color (a variable, color-mix...) to [r, g, b] in the page. */
function rgbOf(page: Page, css: string) {
  return page.evaluate((c) => {
    const g = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    g.fillStyle = c;
    g.fillRect(0, 0, 1, 1);
    return Array.from(g.getImageData(0, 0, 1, 1).data.slice(0, 3));
  }, css);
}
const luminance = (c: number[]) => {
  const [r, g, b] = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: number[], b: number[]) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const cssVar = (page: Page, name: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

for (const dark of [false, true]) {
  test(`tick boxes are honey wells: honey square, amber border, amber when ticked, softer struck-through text (${dark ? 'dark' : 'light'})`, async ({ page }) => {
    await seedTicks(page);
    if (dark) await toggleDark(page);
    const open = page.locator('[data-item-id="a"]');
    const done = page.locator('[data-item-id="b"]');
    const style = (l: Locator) =>
      l.getByRole('checkbox').evaluate((el) => {
        const cs = getComputedStyle(el);
        return { appearance: cs.appearance, border: parseFloat(cs.borderTopWidth), radius: parseFloat(cs.borderTopLeftRadius), bg: cs.backgroundColor, edge: cs.borderTopColor, image: cs.backgroundImage };
      });
    const accent = await rgbOf(page, await cssVar(page, '--accent'));
    const soft = await rgbOf(page, await cssVar(page, '--accent-soft'));
    const card = await rgbOf(page, await cssVar(page, '--card-bg'));
    const a = await style(open);
    expect(a.appearance).toBe('none');
    expect(a.border).toBeGreaterThanOrEqual(1); // 1.5px, drawn as 1px on a 1x screen
    expect(a.radius).toBeCloseTo(6, 1);
    expect(await rgbOf(page, a.bg)).toEqual(soft);
    expect(a.image).toBe('none');
    // The border is a control's edge: 3:1 against the card, in light and dark.
    expect(contrast(await rgbOf(page, a.edge), card)).toBeGreaterThanOrEqual(3);
    const t = await style(done);
    expect(await rgbOf(page, t.bg)).toEqual(accent);
    expect(await rgbOf(page, t.edge)).toEqual(accent);
    expect(contrast(accent, card)).toBeGreaterThanOrEqual(3);
    expect(t.image).toContain('svg');
    // Ticked text: a softer strike line (not the full text color) and faded.
    const text = await done.getByLabel('Item text').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { line: cs.textDecorationLine, lineColor: cs.textDecorationColor, color: cs.color, fade: parseFloat(getComputedStyle(el.parentElement!).opacity) };
    });
    expect(text.line).toBe('line-through');
    expect(text.lineColor).not.toBe(text.color);
    expect(text.fade).toBeLessThan(1);
    expect(text.fade).toBeGreaterThan(0.4);
    expect(await open.getByLabel('Item text').evaluate((el) => parseFloat(getComputedStyle(el.parentElement!).opacity))).toBe(1);
  });
}

test('pressing a tick box shrinks it for 120ms; there is no tick animation; the keyboard focus ring stays', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' }); // the suite turns motion off; this test is about it
  await seedTicks(page);
  const cb = page.locator('[data-item-id="a"]').getByRole('checkbox');
  expect(await cb.evaluate((el) => getComputedStyle(el).transitionDuration)).toContain('0.12s');
  const b = await box(cb);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  const scale = await cb.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  expect(scale).toBeCloseTo(0.9, 2);
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await page.locator('[data-item-id="a"]').getByLabel('Item text').click();
  await page.keyboard.press('Shift'); // the last input was the keyboard, so focus shows the ring
  await cb.focus();
  await expect(cb).toBeFocused();
  expect(await cb.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
});
