import { expect, test, type Page } from '@playwright/test';
import { arrange, fontsLoaded } from './helpers';
import { FONT_KEY, type FontSize } from '../src/model/font';

// Checklist indent (owner request 2026-10-29: "it is not always clear in which hierarchy a set of indented checkboxes are in";
// offered guide lines, a deeper indent or both, picked a deeper indent, 32px per level, up from 22px).
// A sub-item's tick box sits 32px right of its parent's, a sub-sub-item's 64px. The indent is board pixels and does not
// grow with the A- / A+ step (it never did), on a computer or a phone. Nesting by drag still works.

type Item = { id: string; text: string; done: boolean; children: Item[] };
const item = (id: string, children: Item[] = []): Item => ({ id, text: `Item ${id}`, done: false, children });

async function seed(page: Page, size: FontSize, w = 240) {
  const list = [item('a', [item('b', [item('c', [item('d')])])]), item('e')];
  await page.evaluate(
    ({ list, key, fk, size, w }) => {
      const base = { color: null, collapsed: false, h: null };
      const board = { name: 'T', snap: true, cards: { t1: { ...base, id: 't1', kind: 'todo', title: 'Indent', completedOpen: true, x: 100, y: 100, w, items: list } }, columns: {}, order: ['t1'] };
      localStorage.setItem(key, JSON.stringify({ version: 2, board }));
      localStorage.setItem(fk, size);
    },
    { list, key: 'note-board:v1', fk: FONT_KEY, size, w },
  );
  await page.reload();
  await fontsLoaded(page);
}

/** Each row's tick box left edge (card px), taken off the top-level row's: a, b, c, d, e. */
async function boxOffsets(page: Page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('.todo-item[data-item-id]')];
    const boxes = rows.map((r) => r.querySelector('input[type=checkbox]')!.getBoundingClientRect());
    const scale = boxes[0].width / (rows[0].querySelector('input[type=checkbox]') as HTMLElement).offsetWidth;
    return boxes.map((b) => (b.left - boxes[0].left) / scale);
  });
}

function check(layout: 'desktop' | 'phone') {
  for (const size of ['normal', 'ultimate'] as FontSize[]) {
    test(`each level's tick box sits 32px right of its parent's (${size}, ${layout})`, async ({ page }) => {
      await page.goto('/');
      await fontsLoaded(page);
      await seed(page, size, size === 'normal' ? 240 : 800); // the biggest text needs a wide card (the narrow-card cap below)
      const [a, b, c, d, e] = await boxOffsets(page);
      expect(a).toBeCloseTo(0, 1);
      expect(b).toBeCloseTo(32, 1);
      expect(c).toBeCloseTo(64, 1);
      expect(d).toBeCloseTo(96, 1);
      expect(e).toBeCloseTo(0, 1);
    });
  }
}

test.describe('desktop', () => check('desktop'));
test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  check('phone');
});

for (const size of ['normal', 'large'] as FontSize[]) test(`in a narrow list the deepest levels keep a readable line (at least 32px of text) and stay inside the card (${size})`, async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
  const deep = item('a', [item('b', [item('c', [item('d', [item('e', [item('f')])])])])]);
  await page.evaluate(
    ({ deep, key }) => {
      const base = { color: null, collapsed: false, h: null };
      const board = { name: 'T', snap: true, cards: { t1: { ...base, id: 't1', kind: 'todo', title: 'Deep', completedOpen: true, x: 100, y: 100, w: 240, items: [deep] } }, columns: {}, order: ['t1'] };
      localStorage.setItem(key, JSON.stringify({ version: 2, board }));
    },
    { deep, key: 'note-board:v1' },
  );
  await page.evaluate(([fk, sz]) => localStorage.setItem(fk, sz), [FONT_KEY, size]);
  await page.reload();
  await fontsLoaded(page);
  const rows = await page.evaluate(() => {
    const card = document.querySelector('[data-card-id="t1"]')!.getBoundingClientRect();
    return [...document.querySelectorAll('.todo-item[data-item-id]')].map((r) => ({
      text: r.querySelector('textarea')!.getBoundingClientRect().width,
      boxInside: r.querySelector('input[type=checkbox]')!.getBoundingClientRect().right <= card.right,
      indent: parseFloat(getComputedStyle(r).paddingLeft),
    }));
  });
  for (const [i, r] of rows.entries()) {
    expect(r.text, `level ${i} text width`).toBeGreaterThanOrEqual(32);
    expect(r.boxInside, `level ${i} box inside the card`).toBe(true);
    // Never less deeper than the level above it, and a full 32px per level while there is room.
    if (i) expect(r.indent).toBeGreaterThanOrEqual(rows[i - 1].indent);
    if (i <= 3 && size === 'normal') expect(r.indent).toBe(i * 32);
  }
});

test('dropping an item to the right of a row, in the lower half, nests it, one level in at 32px', async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
  await seed(page, 'normal', 400);
  const e = page.locator('[data-item-id="e"]');
  const a = page.locator('[data-item-id="a"]');
  const grip = e.locator('.item-grip');
  await e.hover();
  const g = (await grip.boundingBox())!;
  const t = (await a.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(t.x + 90, t.y + t.height - 4, { steps: 8 });
  await page.mouse.up();
  const levels = await page.locator('.todo-item[data-item-id]').evaluateAll((els) => els.map((el) => [el.getAttribute('data-item-id'), parseFloat(getComputedStyle(el).paddingLeft)]));
  expect(Object.fromEntries(levels).e).toBe(32);
});

test('the Completed panel indents sub-items the same 32px per level', async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
  await seed(page, 'normal', 400);
  await page.getByLabel('Done: Item a').click(); // ticking the top item ticks the ones under it
  await arrange(page).then((menu) => menu.getByRole('button', { name: 'Clean up', exact: true }).click());
  await page.locator('.corner-controls').getByRole('button', { name: 'Completed', exact: true }).click();
  const boxes = await page.getByRole('complementary', { name: 'Completed' }).locator('input[type=checkbox]').evaluateAll((els) => {
    const lefts = els.map((e) => e.getBoundingClientRect().left);
    return lefts.map((l) => l - lefts[0]);
  });
  expect(boxes.slice(0, 4)).toEqual([0, 32, 64, 96]);
});
