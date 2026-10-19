import { expect, test, type Locator, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Phone touch fixes (owner-approved after a mobile review): 16px text fields so iOS does not zoom
// in on focus, touch-action on the bars, the caret kept above the keyboard, and 44px touch targets.
// Everything runs on a 390x844 touch screen (pointer: coarse, under 600px wide).

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const bar = (page: Page) => page.getByRole('toolbar', { name: 'Board actions' });
const addMenu = async (page: Page, item: 'Note' | 'Checklist' | 'Container') => {
  await bar(page).getByRole('button', { name: 'Add', exact: true }).tap();
  await page.getByRole('menuitem', { name: item }).tap();
};
const more = async (page: Page) => {
  await bar(page).getByRole('button', { name: 'More', exact: true }).tap();
  return page.getByRole('dialog', { name: 'More' });
};
const rect = async (l: Locator) => (await l.boundingBox())!;
const fontSize = (l: Locator) => l.first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
/**
 * A card or container made on a phone fills the screen's width (job 113), so the part of a resize
 * handle's touch area that lies outside the block would be off the screen. Move the board 40px left
 * (a scroll, which keeps the selection) to leave room, as a finger would by panning.
 */
const makeRoomAtRight = async (page: Page) => {
  await page.mouse.move(200, 400);
  await page.mouse.wheel(80, 0);
  await page.waitForTimeout(100);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
});

/**
 * How far a press on `el` reaches from its middle in each direction, counting pixels that land on
 * the element itself (or inside it): the size of its real touch area, drawn or not.
 */
async function reach(el: Locator, within = 'self') {
  return el.evaluate(
    (node, scope) => {
      const r = node.getBoundingClientRect();
      const cx = Math.round(r.x + r.width / 2);
      const cy = Math.round(r.y + r.height / 2);
      const root = scope === 'parent' ? (node.parentElement as Element) : node;
      const hit = (x: number, y: number) => {
        const t = document.elementFromPoint(x, y);
        return !!t && root.contains(t);
      };
      const run = (dx: number, dy: number) => {
        let n = 0;
        while (n < 120 && hit(cx + dx * (n + 1), cy + dy * (n + 1))) n++;
        return n;
      };
      return { w: run(-1, 0) + run(1, 0) + 1, h: run(0, -1) + run(0, 1) + 1, left: run(-1, 0), right: run(1, 0), up: run(0, -1), down: run(0, 1) };
    },
    within,
  );
}

/** True when pressing inside the element's drawn box (middle and near the corners; or the middle and top corners) reaches the element itself. */
function keepsItsOwnBox(el: Locator, which: 'all' | 'top' | 'centre' = 'all') {
  return el.evaluate((node, which) => {
    const r = node.getBoundingClientRect();
    const pts = [
      [r.x + r.width / 2, r.y + r.height / 2],
      [r.x + 2, r.y + 2],
      [r.right - 2, r.y + 2],
      [r.x + 2, r.bottom - 2],
      [r.right - 2, r.bottom - 2],
    ];
    return (which === 'centre' ? pts.slice(0, 1) : which === 'top' ? pts.slice(0, 3) : pts).every(([x, y]) => {
      const t = document.elementFromPoint(x, y);
      return !!t && node.contains(t);
    });
  }, which);
}

/**
 * Pixels around `el` where a press reaches `el` although another button, text box or handle is
 * drawn there. Zero means the enlarged area never takes presses meant for another control.
 */
function takenFromOthers(el: Locator) {
  return el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const owner = node.closest('[data-card-id], [data-col-id]') ?? document.body;
    const others = [...owner.querySelectorAll('button, input, textarea')].filter((o) => o !== node && !node.contains(o) && !o.contains(node) && getComputedStyle(o).visibility !== 'hidden');
    const boxes = others.map((o) => o.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0);
    let bad = 0;
    for (let x = Math.floor(r.x) - 40; x <= r.right + 40; x++) {
      for (let y = Math.floor(r.y) - 40; y <= r.bottom + 40; y++) {
        const t = document.elementFromPoint(x, y);
        if (!t || !node.contains(t)) continue;
        if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) continue; // its own box is not an enlargement
        if (boxes.some((b) => x >= b.left && x < b.right && y >= b.top && y < b.bottom)) bad++;
      }
    }
    return bad;
  });
}

test('1. text boxes are at least 16px on a phone, so iOS does not zoom in when one is tapped', async ({ page }) => {
  expect(await fontSize(page.getByLabel('Board name'))).toBeGreaterThanOrEqual(16);
  await addMenu(page, 'Note');
  expect(await fontSize(page.getByLabel('Note text'))).toBeGreaterThanOrEqual(16);
  await addMenu(page, 'Checklist');
  expect(await fontSize(page.getByLabel('List title'))).toBeGreaterThanOrEqual(16);
  await page.keyboard.press('Enter');
  await page.keyboard.type('one');
  expect(await fontSize(page.getByLabel('Item text'))).toBeGreaterThanOrEqual(16);
  await page.mouse.click(200, 70); // done typing, so the item bar gives the bottom bar back
  await addMenu(page, 'Container');
  expect(await fontSize(page.getByLabel('Container title'))).toBeGreaterThanOrEqual(16);
  // The smaller text size (A−) must not take them back under 16px.
  const menu = await more(page);
  await menu.getByRole('button', { name: 'Smaller text' }).tap();
  await expect(menu.getByRole('button', { name: 'Smaller text' })).toHaveAttribute('aria-disabled', 'true'); // as small as it goes
  await page.mouse.click(200, 70);
  expect(await fontSize(page.getByLabel('Note text'))).toBeGreaterThanOrEqual(16);
  expect(await fontSize(page.getByLabel('Item text'))).toBeGreaterThanOrEqual(16);
  // The Timer's minutes.
  const again = await more(page);
  await again.getByRole('button', { name: /Focus timer/ }).tap();
  expect(await fontSize(page.getByLabel('Focus (minutes)'))).toBeGreaterThanOrEqual(16);
  // Zooming the page is not blocked.
  expect(await page.locator('meta[name=viewport]').getAttribute('content')).not.toMatch(/maximum-scale|user-scalable/);
});

test('2. the top bar and the bottom bars do not let a pinch zoom the whole page', async ({ page }) => {
  const touchAction = (sel: string) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).touchAction);
  expect(await touchAction('header.toolbar')).toBe('none');
  expect(await touchAction('.phone-bar')).toBe('none');
  await addMenu(page, 'Checklist');
  await page.keyboard.press('Enter');
  await page.keyboard.type('one');
  await expect(page.getByRole('toolbar', { name: 'Item actions' })).toBeVisible();
  expect(await touchAction('.item-bar')).toBe('none');
  // Their buttons still work with a finger.
  await page.getByRole('toolbar', { name: 'Item actions' }).getByRole('button', { name: 'Indent' }).tap();
  await page.mouse.click(200, 70);
  await bar(page).getByRole('button', { name: 'Undo' }).tap();
  await expect(bar(page).getByRole('button', { name: 'Redo' })).not.toHaveAttribute('aria-disabled', 'true');
});

test('3. the caret stays above the keyboard while typing a long note', async ({ page }) => {
  // Stand in for the phone keyboard: a visual viewport we can shrink (as in mobile.spec.ts).
  await page.addInitScript(() => {
    const fake = Object.assign(new EventTarget(), { height: window.innerHeight, offsetTop: 0 });
    Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true });
    (window as unknown as { openKeyboard: (h: number) => void }).openKeyboard = (h) => {
      fake.height = window.innerHeight - h;
      fake.dispatchEvent(new Event('resize'));
    };
  });
  await page.reload();
  await fontsLoaded(page);
  await addMenu(page, 'Note');
  await page.evaluate(() => (window as unknown as { openKeyboard: (h: number) => void }).openKeyboard(336));
  const visibleBottom = 844 - 336;
  const note = page.getByLabel('Note text');
  for (let i = 1; i <= 18; i++) {
    await page.keyboard.type(`line ${i}`);
    await page.keyboard.press('Enter');
  }
  await page.keyboard.type('the last line');
  // The note has grown well past the keyboard, and the line being typed is still in view.
  const b = await rect(note);
  expect(b.height).toBeGreaterThan(300);
  await expect.poll(async () => (await rect(note)).y + (await rect(note)).height).toBeLessThanOrEqual(visibleBottom);
  expect((await rect(note)).y + (await rect(note)).height).toBeGreaterThan(visibleBottom - 40); // not panned further than needed
});

test('3b. a line typed in the middle of a long note is also kept in view', async ({ page }) => {
  await page.addInitScript(() => {
    const fake = Object.assign(new EventTarget(), { height: window.innerHeight, offsetTop: 0 });
    Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true });
    (window as unknown as { openKeyboard: (h: number) => void }).openKeyboard = (h) => {
      fake.height = window.innerHeight - h;
      fake.dispatchEvent(new Event('resize'));
    };
  });
  await page.reload();
  await fontsLoaded(page);
  await addMenu(page, 'Checklist');
  await page.keyboard.press('Enter');
  await page.evaluate(() => (window as unknown as { openKeyboard: (h: number) => void }).openKeyboard(336));
  // An item that wraps onto many lines keeps growing downwards as it is typed.
  await page.keyboard.type('word '.repeat(50));
  const items = page.getByRole('toolbar', { name: 'Item actions' });
  const field = page.getByLabel('Item text');
  await expect.poll(async () => (await rect(field)).y + (await rect(field)).height).toBeLessThanOrEqual((await rect(items)).y);
});

test('4. a checklist tick box has a 44px wide tap area, and Completed buttons are 40px tall with 8px gaps', async ({ page }) => {
  await addMenu(page, 'Checklist');
  await page.keyboard.press('Enter');
  for (const [i, t] of ['one', 'two', 'three'].entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  await page.mouse.click(200, 70);
  const tick = page.locator('.todo-item .tick').nth(1);
  const r = await reach(tick);
  expect(r.w).toBeGreaterThanOrEqual(44);
  // As tall as its row (a taller area would run into the next item's box).
  expect(r.h).toBeGreaterThanOrEqual(30);
  // The drawn box is unchanged.
  const drawn = await rect(page.locator('.todo-item input[type=checkbox]').nth(1));
  expect(drawn.width).toBe(16);
  // A press 12px left of the box ticks it.
  const row = await rect(page.locator('.todo-item input[type=checkbox]').nth(1));
  await page.touchscreen.tap(row.x - 12, row.y + 8);
  await expect(page.locator('.completed [type=checkbox]')).toHaveCount(1);
  // The Completed section's buttons.
  const buttons = page.locator('.completed-toggle, .uncheck-all');
  await expect(buttons).toHaveCount(3);
  const boxes = await buttons.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height })));
  for (const b of boxes) expect(b.h).toBeGreaterThanOrEqual(40);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const c = boxes[j];
      const gapX = Math.max(a.x - (c.x + c.w), c.x - (a.x + a.w));
      const gapY = Math.max(a.y - (c.y + c.h), c.y - (a.y + a.h));
      expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(8);
    }
});

test('5. the empty-board hint points at the Add button on a phone', async ({ page }) => {
  await expect(page.locator('.empty-hint')).toHaveText('Tap the Add button (+) below to add a note, a checklist or a container.');
});

test.describe('on a computer', () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });
  test('5b. the empty-board hint keeps its usual wording', async ({ page }) => {
    await expect(page.locator('.empty-hint')).toHaveText('Add a note, a checklist or a container from the toolbar, or drag one onto the board. Press ? for keyboard shortcuts.');
  });
});

test.describe('6. 44px touch targets in menus and panels', () => {
  const atLeast = (b: { width: number; height: number }, w = 44, h = 44) => {
    expect(b.width).toBeGreaterThanOrEqual(w);
    expect(b.height).toBeGreaterThanOrEqual(h);
  };
  /** The smallest gap between any two of these boxes (0 when they touch or overlap). */
  const smallestGap = async (l: Locator) => {
    const bs = await l.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((b) => ({ l: b.left, t: b.top, r: b.right, b: b.bottom })));
    let min = Infinity;
    for (let i = 0; i < bs.length; i++)
      for (let j = i + 1; j < bs.length; j++) {
        const dx = Math.max(bs[i].l - bs[j].r, bs[j].l - bs[i].r, 0);
        const dy = Math.max(bs[i].t - bs[j].b, bs[j].t - bs[i].b, 0);
        min = Math.min(min, Math.hypot(dx, dy));
      }
    return min;
  };

  test('the welcome tour', async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('note-board:tour-done'));
    await page.reload();
    await fontsLoaded(page);
    const tour = page.getByRole('dialog', { name: /Step \d of \d/ });
    await expect(tour).toBeVisible();
    atLeast(await rect(tour.getByRole('button', { name: 'Close tour' })));
    const row = tour.locator('.tour-actions button');
    for (const b of await row.all()) atLeast(await rect(b), 44, 44);
    expect(await smallestGap(row)).toBeGreaterThanOrEqual(8);
    const card = await rect(tour);
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(390);
    expect(card.y + card.height).toBeLessThanOrEqual(844);
  });

  test('Version history and the Focus timer', async ({ page }) => {
    const menu = await more(page);
    await menu.getByRole('button', { name: 'Version history' }).tap();
    atLeast(await rect(page.getByRole('button', { name: 'Close version history' })));
    await page.getByRole('button', { name: 'Close version history' }).tap();
    const again = await more(page);
    await again.getByRole('button', { name: /Focus timer/ }).tap();
    const panel = page.getByRole('complementary', { name: 'Focus timer' });
    atLeast(await rect(panel.getByRole('button', { name: 'Close focus timer' })));
    const actions = panel.locator('.pomodoro-actions button');
    for (const b of await actions.all()) atLeast(await rect(b), 44, 44);
    expect(await smallestGap(actions)).toBeGreaterThanOrEqual(8);
  });

  test('Search: bigger buttons, 8px apart, and a wider box', async ({ page }) => {
    const menu = await more(page);
    await menu.getByRole('button', { name: 'Search' }).tap();
    const find = page.getByRole('search', { name: 'Search the board' });
    const buttons = find.locator('.icon-button');
    await expect(buttons).toHaveCount(3);
    for (const b of await buttons.all()) atLeast(await rect(b));
    expect(await smallestGap(buttons)).toBeGreaterThanOrEqual(8);
    expect((await rect(find.getByRole('searchbox'))).width).toBeGreaterThanOrEqual(180);
    // Still roomy once there is a count beside it.
    await find.getByRole('searchbox').fill('a');
    expect((await rect(find.getByRole('searchbox'))).width).toBeGreaterThanOrEqual(120);
    const bar = await rect(find);
    expect(bar.x + bar.width).toBeLessThanOrEqual(390);
  });

  test('the Boards and File menus have 44px rows', async ({ page }) => {
    await page.locator('.boards-menu-wrap > button').tap();
    const rows = page.locator('.boards-menu button[role=menuitem]');
    expect(await rows.count()).toBeGreaterThan(2);
    for (const b of await rows.all()) atLeast(await rect(b), 0, 44);
    expect(await smallestGap(rows)).toBeGreaterThanOrEqual(4);
    await page.mouse.click(300, 400);
    const menu = await more(page);
    await menu.getByRole('button', { name: 'File' }).tap();
    const items = page.locator('.file-menu button[role=menuitem]');
    expect(await items.count()).toBeGreaterThan(2);
    for (const b of await items.all()) atLeast(await rect(b), 0, 44);
    expect(await smallestGap(items)).toBeGreaterThanOrEqual(4);
  });

  test('the colors: 44px swatches 8px apart that stay inside the menu, and 44px Default / Auto-color', async ({ page }) => {
    const menu = await more(page);
    await menu.getByRole('button', { name: 'Color of selected cards and containers' }).tap();
    const colors = menu.getByRole('group', { name: 'Colors' });
    const swatches = colors.locator('.swatch');
    expect(await swatches.count()).toBe(24);
    const g = await rect(colors);
    for (const b of await swatches.all()) {
      const r = await rect(b);
      atLeast(r);
      expect(r.x).toBeGreaterThanOrEqual(g.x);
      expect(r.x + r.width).toBeLessThanOrEqual(g.x + g.width);
    }
    expect(await smallestGap(swatches)).toBeGreaterThanOrEqual(8);
    const rows = colors.locator('.swatch-default');
    for (const b of await rows.all()) atLeast(await rect(b), 0, 44);
    expect(await smallestGap(rows)).toBeGreaterThanOrEqual(8);
  });

  test('at 320px wide the swatches still stay inside the menu, and the whole color menu can be scrolled into view', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const menu = await more(page);
    await menu.getByRole('button', { name: 'Color of selected cards and containers' }).tap();
    const colors = menu.getByRole('group', { name: 'Colors' });
    const g = await rect(colors);
    for (const b of await colors.locator('.swatch').all()) {
      const r = await rect(b);
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.x).toBeGreaterThanOrEqual(g.x);
      expect(r.x + r.width).toBeLessThanOrEqual(g.x + g.width);
    }
    await expect(colors.getByRole('button', { name: 'Auto-color' })).toBeInViewport();
  });

  test('More: Hand / Select and A− / A+ are 44px and at least 8px apart', async ({ page }) => {
    const menu = await more(page);
    const tools = menu.locator('.tool-button');
    for (const b of await tools.all()) atLeast(await rect(b));
    expect(await smallestGap(tools)).toBeGreaterThanOrEqual(8);
    const sizes = menu.locator('.phone-row .zoom-control button');
    expect(await sizes.count()).toBe(2);
    for (const b of await sizes.all()) atLeast(await rect(b));
    expect(await smallestGap(sizes)).toBeGreaterThanOrEqual(8);
  });
});

test.describe('7. 44px touch areas around the small card controls', () => {
  test('a note: collapse, delete and the resize corner', async ({ page }) => {
    await addMenu(page, 'Note');
    await page.keyboard.type('Hello');
    await makeRoomAtRight(page);
    const card = page.locator('[data-card-id]').first();
    const collapse = card.getByRole('button', { name: 'Collapse card' });
    const del = card.getByRole('button', { name: 'Delete card' });
    const corner = card.getByRole('button', { name: 'Resize card' });
    for (const c of [collapse, del, corner]) {
      const r = await reach(c);
      expect(r.w).toBeGreaterThanOrEqual(44);
      expect(r.h).toBeGreaterThanOrEqual(44);
      expect(await keepsItsOwnBox(c)).toBe(true);
    }
    // The drawn buttons do not move.
    expect(await rect(collapse)).toMatchObject({ width: 28, height: 28 });
    expect(await rect(del)).toMatchObject({ width: 28, height: 28 });
    expect(await rect(corner)).toMatchObject({ width: 18, height: 18 });
    // Delete's area never covers another control; and the text box under the header keeps its top.
    expect(await takenFromOthers(del)).toBe(0);
    expect(await takenFromOthers(collapse)).toBe(0);
    expect(await takenFromOthers(corner)).toBe(0);
  });

  test('a container: collapse, delete, resize corner and the width strip', async ({ page }) => {
    await addMenu(page, 'Container');
    await makeRoomAtRight(page);
    const col = page.locator('[data-col-id]').first();
    const collapse = col.getByRole('button', { name: 'Collapse container' });
    const del = col.getByRole('button', { name: 'Delete container and its cards' });
    const corner = col.getByRole('button', { name: 'Resize container', exact: true });
    const strip = col.getByRole('button', { name: 'Resize container width' });
    for (const c of [collapse, del, corner]) {
      const r = await reach(c);
      expect(r.w).toBeGreaterThanOrEqual(44);
      expect(r.h).toBeGreaterThanOrEqual(44);
      expect(await keepsItsOwnBox(c)).toBe(true);
    }
    expect((await reach(strip)).w).toBeGreaterThanOrEqual(44);
    expect(await keepsItsOwnBox(strip, 'centre')).toBe(true);
    for (const c of [collapse, del, corner, strip]) expect(await takenFromOthers(c)).toBe(0);
  });

  test('a collapsed card: the width strip and the buttons stay apart', async ({ page }) => {
    await addMenu(page, 'Note');
    await page.keyboard.type('Hello');
    const card = page.locator('[data-card-id]').first();
    await card.getByRole('button', { name: 'Collapse card' }).tap();
    await makeRoomAtRight(page);
    const strip = card.getByRole('button', { name: 'Resize card width' });
    const del = card.getByRole('button', { name: 'Delete card' });
    const collapse = card.getByRole('button', { name: 'Expand card' });
    expect((await reach(strip)).w).toBeGreaterThanOrEqual(44);
    expect((await reach(collapse)).w).toBeGreaterThanOrEqual(44);
    expect((await reach(del)).h).toBeGreaterThanOrEqual(44);
    // (The resize corner sits over the strip's lower end, as it always did.)
    expect(await keepsItsOwnBox(strip, 'centre')).toBe(true);
    // (Likewise the resize corner over the lower end of the delete button.)
    for (const c of [del, collapse]) expect(await keepsItsOwnBox(c, 'top')).toBe(true);
    for (const c of [strip, del, collapse]) expect(await takenFromOthers(c)).toBe(0);
  });

  test('a checklist item being typed in: the drag grip', async ({ page }) => {
    await addMenu(page, 'Checklist');
    await page.keyboard.press('Enter');
    await page.keyboard.type('one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    const grip = page.locator('[data-card-id]').first().getByRole('button', { name: 'Drag item' });
    const r = await reach(grip);
    expect(r.w).toBeGreaterThanOrEqual(44);
    expect(r.h).toBeGreaterThanOrEqual(44);
    expect(await keepsItsOwnBox(grip)).toBe(true);
    const trash = page.locator('[data-card-id]').first().getByRole('button', { name: 'Delete item' });
    expect(await keepsItsOwnBox(trash)).toBe(true);
  });
});
