import { expect, test, type Locator, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Speed on a big board (job perf-fewer-elements): the hover-only buttons of a checklist row (Move up / down, trash, drag
// grip, estimate clock) and of a card's header (collapse arrow, trash, estimate clock, resize corner) draw their icon
// with CSS on the button itself instead of a little SVG tree each. Half the board's elements were those icons; fewer
// elements make typing, dragging and panning a big board faster. Same look, same buttons, same keys.

type Item = { id: string; text: string; done: boolean; children: Item[] };
const base = { color: null, collapsed: false, h: null, w: null };

/** A board like the speed audit's: 10 checklists of 50 items (some with a sub-item) and 300 notes. */
function bigBoard() {
  const cards: Record<string, unknown> = {};
  const order: string[] = [];
  for (let l = 0; l < 10; l++) {
    const items: Item[] = Array.from({ length: 50 }, (_, k) => ({
      id: `i${l}-${k}`,
      text: `Item ${l}.${k} do the thing`,
      done: k % 7 === 0,
      children: k % 10 === 0 ? [{ id: `s${l}-${k}`, text: 'sub', done: false, children: [] }] : [],
    }));
    cards[`t${l}`] = { ...base, id: `t${l}`, kind: 'todo', title: `List ${l}`, x: 40 + l * 300, y: 40, items };
    order.push(`t${l}`);
  }
  for (let i = 0; i < 300; i++) {
    cards[`n${i}`] = { ...base, id: `n${i}`, kind: 'note', text: `Note ${i} some words here`, x: 40 + (i % 20) * 260, y: 2200 + Math.floor(i / 20) * 200 };
    order.push(`n${i}`);
  }
  return { name: 'Big', snap: true, cards, columns: {}, order };
}

async function seed(page: Page, board: unknown) {
  await page.evaluate((b) => localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board: b })), board);
  await page.reload();
  await fontsLoaded(page);
}

/** The icon drawn on a button: its ::after's size, and whether it has a picture. */
const icon = (l: Locator) =>
  l.evaluate((el) => {
    const s = getComputedStyle(el, '::after');
    return { w: parseFloat(s.width), h: parseFloat(s.height), drawn: s.content !== 'none' && s.maskImage !== 'none', transform: s.transform };
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
});

test('a big board (10 checklists of 50 items, 300 notes) draws far fewer elements: no SVG in hover-only buttons', async ({ page }) => {
  test.slow();
  await seed(page, bigBoard());
  await expect(page.locator('[data-item-id]')).toHaveCount(550);
  await expect(page.locator('.card')).toHaveCount(310);
  const r = await page.evaluate(() => ({
    all: document.querySelectorAll('.world *').length,
    svgInControls: document.querySelectorAll(
      '.world :is(.item-trash, .item-grip, .item-arrows, .estimate-chip, .card-header > .icon-button, .resize-corner) svg',
    ).length,
  }));
  expect(r.svgInControls).toBe(0);
  // Before: about 22,600 for this board (26 per item row, 16 of them icon parts); now about 11,000. Kept under, so the win stays.
  expect(r.all).toBeLessThan(12_000);
});

test('a hovered row shows its controls with their icons at the same sizes, and they still work', async ({ page }) => {
  await seed(page, {
    name: 'T',
    snap: true,
    cards: {
      t1: {
        ...base,
        id: 't1',
        kind: 'todo',
        title: 'List',
        x: 100,
        y: 120,
        w: 260,
        items: ['First', 'Second', 'Third'].map((text, i) => ({ id: `i${i}`, text, done: false, children: [] })),
      },
    },
    columns: {},
    order: ['t1'],
  });
  const row = page.locator('[data-item-id="i1"]');
  await row.hover();
  const up = row.getByRole('button', { name: 'Move up' });
  const down = row.getByRole('button', { name: 'Move down' });
  const trash = row.getByRole('button', { name: 'Delete item' });
  const grip = row.getByRole('button', { name: 'Drag item' });
  const clock = row.getByRole('button', { name: 'Add a time estimate' });
  for (const b of [up, down, trash, grip, clock]) await expect(b).toHaveCSS('opacity', '1');
  // The same sizes as the SVG icons they replace (Normal text).
  const near = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThan(0.6);
  const sizes: [Locator, number, number][] = [[up, 18, 18], [down, 18, 18], [trash, 16, 16], [grip, 10, 15], [clock, 14, 14]];
  for (const [b, w, h] of sizes) {
    const i = await icon(b);
    expect(i.drawn).toBe(true);
    near(i.w, w);
    near(i.h, h);
  }
  // Move down, then Move up again.
  await down.click();
  await expect(page.locator('[data-item-id]').nth(2)).toHaveAttribute('data-item-id', 'i1');
  await page.locator('[data-item-id="i1"]').hover();
  await page.locator('[data-item-id="i1"]').getByRole('button', { name: 'Move up' }).click();
  await expect(page.locator('[data-item-id]').nth(1)).toHaveAttribute('data-item-id', 'i1');
  // The clock opens the estimate box.
  await page.locator('[data-item-id="i1"]').hover();
  await page.locator('[data-item-id="i1"]').getByRole('button', { name: 'Add a time estimate' }).click();
  await page.getByRole('dialog', { name: 'Time estimate' }).getByRole('button', { name: '15m' }).click();
  await expect(page.locator('[data-item-id="i1"]').getByRole('button', { name: 'Time estimate: 15m' })).toBeVisible();
  // The grip drags it to the end.
  await page.locator('[data-item-id="i1"]').hover();
  const g = (await page.locator('[data-item-id="i1"]').getByRole('button', { name: 'Drag item' }).boundingBox())!;
  const last = (await page.locator('[data-item-id="i2"]').boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + 30, last.y + last.height - 4, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('[data-item-id]').nth(2)).toHaveAttribute('data-item-id', 'i1');
  // The trash can deletes it.
  await page.locator('[data-item-id="i1"]').hover();
  await page.locator('[data-item-id="i1"]').getByRole('button', { name: 'Delete item' }).click();
  await expect(page.locator('[data-item-id]')).toHaveCount(2);
});

test('the keyboard still reaches a row\'s clock, arrows and trash can, which show and draw their icons', async ({ page }) => {
  await seed(page, {
    name: 'T',
    snap: true,
    cards: {
      t1: { ...base, id: 't1', kind: 'todo', title: 'List', x: 100, y: 120, w: 260, items: ['First', 'Second'].map((text, i) => ({ id: `i${i}`, text, done: false, children: [] })) },
    },
    columns: {},
    order: ['t1'],
  });
  await page.mouse.move(0, 0);
  await page.keyboard.press('Shift'); // the last input was the keyboard
  const row = page.locator('[data-item-id="i1"]');
  // (Tab in an item's text indents it; the buttons after it are in the page's Tab order.)
  await row.getByRole('button', { name: 'Add a time estimate' }).focus();
  for (const [n, name] of ['Add a time estimate', 'Move up', 'Delete item'].entries()) {
    if (n) await page.keyboard.press('Tab');
    const b = row.getByRole('button', { name });
    await expect(b).toBeFocused();
    await expect(b).toHaveCSS('opacity', '1');
    expect((await icon(b)).drawn).toBe(true);
  }
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-item-id]')).toHaveCount(1);
});

test('a card\'s header buttons and resize corner draw their icons too; the arrow turns when collapsed', async ({ page }) => {
  await seed(page, {
    name: 'T',
    snap: true,
    cards: { n1: { ...base, id: 'n1', kind: 'note', text: 'A note', x: 100, y: 120 } },
    columns: {},
    order: ['n1'],
  });
  const card = page.locator('[data-card-id="n1"]');
  await card.hover();
  const near = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThan(0.6);
  const sizes: [string, number, number][] = [['Add a time estimate', 14, 14], ['Collapse card', 16, 16], ['Delete card', 16, 16], ['Resize card', 10, 10]];
  for (const [name, w, h] of sizes) {
    const i = await icon(card.getByRole('button', { name }));
    expect(i.drawn, name).toBe(true);
    near(i.w, w);
    near(i.h, h);
  }
  expect((await icon(card.getByRole('button', { name: 'Collapse card' }))).transform).toBe('none');
  await card.getByRole('button', { name: 'Collapse card' }).click();
  const turned = (await icon(card.getByRole('button', { name: 'Expand card' }))).transform;
  expect(turned).not.toBe('none'); // turned a quarter, pointing right
  await card.getByRole('button', { name: 'Delete card' }).click();
  await expect(page.locator('[data-card-id]')).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('the row being typed in shows its drag grip with its icon; the others show none', async ({ page }) => {
    await seed(page, {
      name: 'T',
      snap: true,
      cards: { t1: { ...base, id: 't1', kind: 'todo', title: 'List', x: 0, y: 0, items: ['First', 'Second'].map((text, i) => ({ id: `i${i}`, text, done: false, children: [] })) } },
      columns: {},
      order: ['t1'],
    });
    await page.locator('[data-item-id="i1"]').getByLabel('Item text').tap();
    const grip = page.locator('[data-item-id="i1"] .item-grip');
    await expect(grip).toBeVisible();
    expect((await icon(grip)).drawn).toBe(true);
    await expect(page.locator('[data-item-id="i0"] .item-grip')).toBeHidden();
  });
});

test.describe('in forced colors (Windows High Contrast)', () => {
  test.use({ forcedColors: 'active' });

  test('the icons drawn by CSS still show, in the text color, not the background', async ({ page }) => {
    await seed(page, {
      name: 'T',
      snap: true,
      cards: { t1: { ...base, id: 't1', kind: 'todo', title: 'List', x: 100, y: 120, w: 260, items: ['First', 'Second'].map((text, i) => ({ id: `i${i}`, text, done: false, children: [] })) } },
      columns: {},
      order: ['t1'],
    });
    const card = page.locator('[data-card-id="t1"]');
    const row = page.locator('[data-item-id="i1"]');
    await row.hover();
    const back = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
    const fill = (name: string) => (name.endsWith('item') || name.includes('Move') || name.includes('estimate') ? row : card).getByRole('button', { name, exact: true }).evaluate((el) => getComputedStyle(el, '::after').backgroundColor);
    for (const name of ['Delete item', 'Drag item', 'Move up', 'Add a time estimate', 'Collapse card', 'Delete card', 'Resize card']) {
      expect(await fill(name), name).not.toBe(back);
    }
  });
});
