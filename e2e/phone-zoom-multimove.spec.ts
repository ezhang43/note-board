import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Phone zoom taps and moving several selected blocks by finger (owner requests, 2026-10-18).
// Everything runs on a 390x844 touch screen, with real touch events.

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

type Pt = { x: number; y: number };
type Step = { type: 'touchStart' | 'touchMove' | 'touchEnd'; p?: Pt; wait?: number };

async function touch(page: Page, steps: Step[]) {
  const cdp = await page.context().newCDPSession(page);
  for (const s of steps) {
    if (s.wait) await page.waitForTimeout(s.wait);
    await cdp.send('Input.dispatchTouchEvent', { type: s.type, touchPoints: s.p ? [{ x: s.p.x, y: s.p.y, id: 1 }] : [] });
  }
}
/** A quick tap, starting `gap` ms after the last step. */
const tapSteps = (p: Pt, gap = 0): Step[] => [{ type: 'touchStart', p, wait: gap }, { type: 'touchEnd' }];
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
/** Rest a finger for `holdMs`, then move it to `to`; letting go. */
const holdAndDrag = (page: Page, from: Pt, to: Pt, holdMs = 700) =>
  touch(page, [
    { type: 'touchStart', p: from },
    ...Array.from({ length: 12 }, (_, i): Step => ({ type: 'touchMove', p: lerp(from, to, (i + 1) / 12), wait: i === 0 ? holdMs : 0 })),
    { type: 'touchEnd' },
  ]);
/** A finger swipe from `from` to `to` straight away. */
const swipe = (page: Page, from: Pt, to: Pt) => holdAndDrag(page, from, to, 0);

const canvas = (page: Page) => page.getByTestId('canvas');
const zoom = async (page: Page) => Number(await canvas(page).getAttribute('data-zoom'));
const pan = async (page: Page) => ({ x: Number(await canvas(page).getAttribute('data-pan-x')), y: Number(await canvas(page).getAttribute('data-pan-y')) });
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Board actions' });
const addMenu = async (page: Page, item: 'Note' | 'Container') => {
  await bar(page).getByRole('button', { name: 'Add', exact: true }).tap();
  await page.getByRole('menuitem', { name: item }).tap();
};
const chooseTool = async (page: Page, tool: 'Hand (H)' | 'Select (V)') => {
  await bar(page).getByRole('button', { name: 'More', exact: true }).tap();
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: tool, exact: true }).tap();
};
const STEP = 1.2;
const EMPTY = { x: 300, y: 300 };

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
});

test.describe('zoom taps on the empty board', () => {
  test('a double tap zooms in one step around the finger', async ({ page }) => {
    const z0 = await zoom(page);
    const p0 = await pan(page);
    const r = (await canvas(page).boundingBox())!;
    const local = { x: EMPTY.x - r.x, y: EMPTY.y - r.y };
    const boardPoint = { x: (local.x - p0.x) / z0, y: (local.y - p0.y) / z0 };
    await touch(page, [...tapSteps(EMPTY), ...tapSteps(EMPTY)]);
    await expect.poll(() => zoom(page)).toBeCloseTo(z0 * STEP, 3);
    // The board point under the finger has not moved.
    const p1 = await pan(page);
    expect(local.x - p1.x).toBeCloseTo(boardPoint.x * (await zoom(page)), 1);
    expect(local.y - p1.y).toBeCloseTo(boardPoint.y * (await zoom(page)), 1);
  });

  test('a single tap, or two taps far apart or too slow, do not zoom', async ({ page }) => {
    const z0 = await zoom(page);
    await touch(page, tapSteps(EMPTY));
    await touch(page, [...tapSteps({ x: 100, y: 200 }), ...tapSteps({ x: 300, y: 500 })]);
    await touch(page, [...tapSteps(EMPTY, 600), ...tapSteps(EMPTY, 500)]);
    await page.waitForTimeout(300);
    expect(await zoom(page)).toBe(z0);
  });

  test('double taps stop at 250%', async ({ page }) => {
    for (let i = 0; i < 8; i++) await touch(page, [...tapSteps(EMPTY, 450), ...tapSteps(EMPTY)]);
    await expect.poll(() => zoom(page)).toBe(2.5);
  });

  test('a long tap zooms out one step around the finger, on release', async ({ page }) => {
    const z0 = await zoom(page);
    const p0 = await pan(page);
    const r = (await canvas(page).boundingBox())!;
    const local = { x: EMPTY.x - r.x, y: EMPTY.y - r.y };
    const boardPoint = { x: (local.x - p0.x) / z0, y: (local.y - p0.y) / z0 };
    await touch(page, [{ type: 'touchStart', p: EMPTY }, { type: 'touchEnd', wait: 700 }]);
    await expect.poll(() => zoom(page)).toBeCloseTo(z0 / STEP, 3);
    const p1 = await pan(page);
    expect(local.x - p1.x).toBeCloseTo(boardPoint.x * (await zoom(page)), 1);
  });

  test('a long tap starts no selection box with the Select tool, and a rest then a move still draws it', async ({ page }) => {
    await chooseTool(page, 'Select (V)');
    await page.mouse.click(200, 70); // the menu stays open and covers the board; this closes it
    const z0 = await zoom(page);
    await touch(page, [{ type: 'touchStart', p: EMPTY }, { type: 'touchEnd', wait: 700 }]);
    await expect.poll(() => zoom(page)).toBeCloseTo(z0 / STEP, 3);
    await expect(page.getByTestId('marquee')).toHaveCount(0);
    // A rest and then a move draws the box, as before, and does not zoom.
    const z1 = await zoom(page);
    await holdAndDrag(page, EMPTY, { x: EMPTY.x + 60, y: EMPTY.y + 80 });
    expect(await zoom(page)).toBe(z1);
  });

  test('with the Hand tool (the default), a rest then a swipe still pans and does not zoom', async ({ page }) => {
    const z0 = await zoom(page);
    const p0 = await pan(page);
    await holdAndDrag(page, EMPTY, { x: EMPTY.x + 60, y: EMPTY.y + 80 });
    expect(await zoom(page)).toBe(z0);
    expect((await pan(page)).x).toBeGreaterThan(p0.x + 40);
  });

  test('two quick swipes in the same place pan and never zoom', async ({ page }) => {
    const z0 = await zoom(page);
    await swipe(page, EMPTY, { x: 330, y: 340 });
    await swipe(page, { x: 330, y: 340 }, { x: 360, y: 380 });
    expect(await zoom(page)).toBe(z0);
  });

  test('a mouse double click and a mouse long press do not zoom', async ({ page }) => {
    const z0 = await zoom(page);
    await page.mouse.dblclick(EMPTY.x, EMPTY.y);
    await page.mouse.move(EMPTY.x, EMPTY.y);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    expect(await zoom(page)).toBe(z0);
  });
});

test.describe('on a note, nothing changes', () => {
  test('a double tap types, a long press without moving does not zoom, and a long press then move drags it', async ({ page }) => {
    await addMenu(page, 'Note');
    await page.keyboard.type('Hello');
    await page.mouse.click(200, 70); // done typing
    const card = page.locator('[data-card-id]').first();
    const z0 = await zoom(page);
    const b = (await card.boundingBox())!;
    const inside = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await touch(page, [...tapSteps(inside), ...tapSteps(inside, 100)]);
    await expect(page.getByLabel('Note text')).toBeFocused();
    expect(await zoom(page)).toBe(z0);
    await page.mouse.click(200, 70);
    await touch(page, [{ type: 'touchStart', p: inside }, { type: 'touchEnd', wait: 700 }]);
    expect(await zoom(page)).toBe(z0);
    await page.mouse.click(200, 70);
    const before = (await card.boundingBox())!;
    await holdAndDrag(page, { x: before.x + 20, y: before.y + before.height / 2 }, { x: before.x + 20, y: before.y + before.height / 2 + 160 });
    await expect.poll(async () => (await card.boundingBox())!.y).toBeGreaterThan(before.y + 120);
    expect(await zoom(page)).toBe(z0);
  });
});

test('a tap on a note between two taps on the board does not make them a double tap', async ({ page }) => {
  await addMenu(page, 'Note');
  await page.mouse.click(200, 70);
  const b = (await page.locator('[data-card-id]').first().boundingBox())!;
  const board = { x: b.x - 12, y: b.y + 30 };
  const z0 = await zoom(page);
  await touch(page, [...tapSteps(board), ...tapSteps({ x: b.x + 10, y: b.y + 30 }), ...tapSteps(board)]);
  await page.waitForTimeout(300);
  expect(await zoom(page)).toBe(z0);
});

test.describe('on a container, nothing changes', () => {
  test('a double tap and a long press without moving do not zoom; a long press then move drags it', async ({ page }) => {
    await addMenu(page, 'Container');
    await page.mouse.click(200, 70);
    const col = page.locator('[data-col-id]').first();
    const z0 = await zoom(page);
    const b = (await col.boundingBox())!;
    const inside = { x: b.x + b.width / 2, y: b.y + b.height - 30 };
    await touch(page, [...tapSteps(inside), ...tapSteps(inside)]);
    await touch(page, [{ type: 'touchStart', p: inside }, { type: 'touchEnd', wait: 700 }]);
    expect(await zoom(page)).toBe(z0);
    await holdAndDrag(page, inside, { x: inside.x, y: inside.y + 100 });
    await expect.poll(async () => (await col.boundingBox())!.y).toBeGreaterThan(b.y + 60);
    expect(await zoom(page)).toBe(z0);
  });
});

test.describe('several selected blocks move together by finger', () => {
  /** Two notes and a container, then the Select tool and a finger box around all of them. */
  async function selectSeveral(page: Page) {
    for (const item of ['Note', 'Note', 'Container'] as const) {
      await addMenu(page, item);
      await page.mouse.click(200, 70); // done typing / close
    }
    await chooseTool(page, 'Select (V)');
    await page.mouse.click(200, 70); // closes the menu
    // New cards are screen-wide (job 113), so the three no longer fit one screen: zoom out to see them all.
    await page.keyboard.press('Control+Minus');
    await page.keyboard.press('Control+Minus');
    const rects = await page.locator('.card.loose, [data-col-id]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom })));
    expect(rects.length).toBe(3);
    const from = { x: Math.max(2, Math.min(...rects.map((r) => r.l)) - 6), y: Math.max(60, Math.min(...rects.map((r) => r.t)) - 6) };
    const to = { x: Math.min(388, Math.max(...rects.map((r) => r.r)) + 6), y: Math.min(740, Math.max(...rects.map((r) => r.b)) + 6) };
    await touch(page, [{ type: 'touchStart', p: from }, ...Array.from({ length: 10 }, (_, i): Step => ({ type: 'touchMove', p: lerp(from, to, (i + 1) / 10) })), { type: 'touchEnd' }]);
    await expect(page.locator('.card.selected, .column.selected, [data-col-id].selected')).toHaveCount(3);
  }
  const positions = (page: Page) =>
    page.locator('.card.loose, [data-col-id]').evaluateAll((els) => els.map((e) => ({ x: parseFloat((e as HTMLElement).style.left), y: parseFloat((e as HTMLElement).style.top) })));
  /** How far each block moved: when they moved together, every entry is the same, and not zero. */
  const moves = async (page: Page, before: Pt[]) => (await positions(page)).map((p, i) => `${p.x - before[i].x},${p.y - before[i].y}`);
  const allMovedTogether = async (page: Page, before: Pt[]) => {
    const m = await moves(page, before);
    return m.length === 3 && m[0] !== '0,0' && m.every((v) => v === m[0]);
  };

  test('a long press then move on a blank part of one of them moves all of them', async ({ page }) => {
    await selectSeveral(page);
    const before = await positions(page);
    const note = (await page.locator('.card.loose').first().boundingBox())!;
    await holdAndDrag(page, { x: note.x + 10, y: note.y + 10 }, { x: note.x + 10 + 40, y: note.y + 10 + 120 });
    await expect.poll(() => allMovedTogether(page, before)).toBe(true);
    await expect(page.locator('.card.selected, [data-col-id].selected')).toHaveCount(3);
  });

  test('a long press on the text of one of them moves all of them too', async ({ page }) => {
    await selectSeveral(page);
    const before = await positions(page);
    const field = (await page.getByLabel('Note text').first().boundingBox())!;
    await holdAndDrag(page, { x: field.x + 20, y: field.y + 10 }, { x: field.x + 20, y: field.y + 130 });
    await expect.poll(() => allMovedTogether(page, before)).toBe(true);
  });
});
