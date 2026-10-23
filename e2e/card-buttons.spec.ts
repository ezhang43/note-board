import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, box, clickEmpty, columns, fontsLoaded, freshBoardEachTest } from './helpers';

// Bigger card header buttons (owner request, 2026-10-22: "the top right buttons of each card are too
// small"): a 32px button with a 16px icon, growing with the A− / A+ text size like the item buttons.

freshBoardEachTest();

const BUTTON = 32;
const ICON = 16;
// The text size steps worth checking: the step the buttons never go under, and the biggest.
const LARGEST = 2.5;

const largest = async (page: Page) => {
  const larger = page.getByRole('button', { name: 'Larger text' });
  for (let i = 0; i < 12 && (await larger.getAttribute('aria-disabled')) !== 'true'; i++) await larger.click();
};

/** A button's drawn box and its icon, in px. */
async function sizes(btn: Locator) {
  const b = await box(btn);
  const i = await box(btn.locator('svg'));
  return { w: b.width, h: b.height, icon: i.width, iconH: i.height };
}

async function check(blocks: { block: Locator; buttons: string[] }[], scale: number) {
  for (const { block, buttons } of blocks) {
    await block.hover();
    for (const name of buttons) {
      const s = await sizes(block.getByRole('button', { name }));
      expect(s.w, `${name} width`).toBeGreaterThanOrEqual(BUTTON * scale - 0.5);
      expect(s.h, `${name} height`).toBeGreaterThanOrEqual(BUTTON * scale - 0.5);
      expect(s.icon, `${name} icon`).toBeGreaterThanOrEqual(ICON * scale - 0.5);
      expect(s.iconH, `${name} icon height`).toBeGreaterThanOrEqual(ICON * scale - 0.5);
    }
  }
}

async function oneOfEach(page: Page) {
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.type('A note');
  await clickEmpty(page);
  await add(page, 'Checklist');
  await clickEmpty(page);
  await add(page, 'New container');
  await clickEmpty(page);
  await page.mouse.move(0, 0);
  const loose = page.locator('.card.loose');
  return [
    { block: loose.nth(0), buttons: ['Collapse card', 'Delete card'] },
    { block: loose.nth(1), buttons: ['Collapse card', 'Delete card'] },
    { block: columns(page).first(), buttons: ['Collapse container', 'Delete container and its cards'] },
  ];
}

test('a note, a checklist and a container have 32px buttons with 16px icons', async ({ page }) => {
  await check(await oneOfEach(page), 1);
});

test('the buttons grow with the text size, like the item buttons', async ({ page }) => {
  const blocks = await oneOfEach(page);
  await largest(page);
  await check(blocks, LARGEST);
});

test('a collapsed card keeps its title clear of the buttons, at any text size', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.type('A fairly long note that has to be cut short');
  const card = page.locator('.card.loose').first();
  await card.getByRole('button', { name: 'Collapse card' }).click();
  for (const big of [false, true]) {
    if (big) await largest(page);
    const meta = await box(card.locator('.card-meta'));
    const expand = await box(card.getByRole('button', { name: 'Expand card' }));
    const del = await box(card.getByRole('button', { name: 'Delete card' }));
    expect(meta.x + meta.width).toBeLessThanOrEqual(expand.x);
    expect(expand.x + expand.width).toBeLessThanOrEqual(del.x);
    const c = await box(card);
    expect(c.x + c.width).toBeGreaterThan(del.x + del.width);
  }
});

// The smallest card (200px) and container (240px), open and collapsed, at the extremes of zoom and text size:
// the buttons never run into each other, the title or the card's edge, and the top of the stack at a button's
// middle is the button itself (so a resize grip never covers it).
const seeds = {
  'an open card': { kind: 'card', collapsed: false },
  'a collapsed card': { kind: 'card', collapsed: true },
  'an open container': { kind: 'column', collapsed: false },
  'a collapsed container': { kind: 'column', collapsed: true },
} as const;

for (const [name, seed] of Object.entries(seeds)) {
  for (const zoom of ['Zoom out', 'Zoom in'] as const) {
    test(`${name} at its smallest width, ${zoom === 'Zoom out' ? '30%' : '250%'} zoom, biggest text: buttons clear`, async ({ page }) => {
      test.slow();
      await page.evaluate((s) => {
        const card = { id: 'n1', kind: 'note', text: 'A note with a rather long first line of text', color: null, collapsed: s.collapsed, x: 100, y: 100, w: 200, h: s.collapsed ? null : 160 };
        const column = { id: 'c1', title: 'A container with a long name', x: 100, y: 100, w: 240, h: null, color: null, collapsed: s.collapsed, cardIds: [] as string[] };
        const board = s.kind === 'card' ? { cards: { n1: card }, columns: {}, order: ['n1'] } : { cards: {}, columns: { c1: column }, order: ['c1'] };
        localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board: { name: 'T', snap: true, ...board } }));
      }, seed);
      await page.reload();
      await fontsLoaded(page);
      await page.getByRole('button', { name: 'Fit to screen' }).click();
      await largest(page);
      for (let i = 0; i < 12 && !(await page.getByRole('button', { name: 'Reset zoom' }).innerText()).match(zoom === 'Zoom out' ? /^30%/ : /^250%/); i++) {
        await page.getByRole('button', { name: zoom }).click();
      }
      const block = seed.kind === 'card' ? page.locator('.card.loose').first() : columns(page).first();
      await block.hover();
      const buttons = await block.locator('.card-header > .icon-button, .column-actions > .icon-button').all();
      expect(buttons).toHaveLength(2);
      const [a, b, c] = [await box(buttons[0]), await box(buttons[1]), await box(block)];
      expect(a.x + a.width).toBeLessThanOrEqual(b.x);
      expect(b.x + b.width).toBeLessThanOrEqual(c.x + c.width);
      expect(a.x).toBeGreaterThanOrEqual(c.x);
      expect(a.y).toBeGreaterThanOrEqual(c.y);
      expect(b.y + b.height).toBeLessThanOrEqual(c.y + c.height);
      // The title (collapsed card: its preview; container: its name) stops before the first button.
      const t = await box(block.locator(seed.kind === 'card' ? '.card-meta' : '.column-title'));
      expect(t.x + t.width).toBeLessThanOrEqual(a.x + 0.5);
      // Nothing is painted over a button's middle.
      for (const btn of buttons) {
        expect(await btn.evaluate((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!t && el.contains(t); })).toBe(true);
      }
    });
  }
}

test('at the biggest text a header button stays inside its card and its header', async ({ page }) => {
  const blocks = await oneOfEach(page);
  await largest(page);
  for (const { block } of blocks) {
    const b = await box(block);
    for (const btn of await block.locator('.card-header > .icon-button, .column-actions > .icon-button').all()) {
      const r = await box(btn);
      expect(r.x).toBeGreaterThanOrEqual(b.x);
      expect(r.y).toBeGreaterThanOrEqual(b.y);
      expect(r.x + r.width).toBeLessThanOrEqual(b.x + b.width);
      expect(r.y + r.height).toBeLessThanOrEqual(b.y + b.height);
    }
  }
});
