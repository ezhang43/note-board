import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';
import { FONT_KEY, type FontSize } from '../src/model/font';
import { THEME_KEY } from '../src/model/theme';

// A list's Clean up button never squeezes its title (owner request, 2026-10-24, job 208: "fix the squeezed list titles").
// When the title, Clean up and the collapse arrow and trash can all fit on one line, they share it (Clean up left of the
// arrow). When they don't, Clean up drops onto its own short line under the title, at the right, and the title keeps the
// width it has without Clean up; the arrow and trash can stay on the title line.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
});

/** One list with the given title and width; its first item is ticked (so Clean up shows) or not. */
async function seed(page: Page, o: { w: number; title: string; ticked: boolean; collapsed?: boolean; size?: FontSize; theme?: 'light' | 'dark' }) {
  await page.evaluate(
    ({ o, fk, tk }) => {
      const items = [{ id: 'i1', text: 'Socks', done: o.ticked, children: [] }, { id: 'i2', text: 'Toothbrush', done: false, children: [] }];
      const board = { name: 'T', snap: true, cards: { t1: { id: 't1', kind: 'todo', color: null, collapsed: o.collapsed ?? false, h: null, x: 100, y: 100, w: o.w, title: o.title, completedOpen: true, items } }, columns: {}, order: ['t1'] };
      localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board }));
      localStorage.setItem(fk, o.size ?? 'normal');
      localStorage.setItem(tk, o.theme ?? 'light');
    },
    { o, fk: FONT_KEY, tk: THEME_KEY },
  );
  await page.reload();
  await fontsLoaded(page);
}

const card = (page: Page) => page.locator('[data-card-id="t1"]');
const cleanUp = (page: Page) => card(page).locator('.card-header').getByRole('button', { name: 'Clean up', exact: true });

/** Where the title row's parts are, in screen pixels, and whether the title's text is cut off. */
async function rects(page: Page) {
  await card(page).hover();
  return page.evaluate(() => {
    const c = document.querySelector('[data-card-id="t1"]')!;
    const r = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
    const box = c.querySelector('.card-title')!;
    const title = box.querySelector('input')!;
    return {
      title: r(box)!,
      titleCut: title.scrollWidth > title.clientWidth + 0.5,
      clean: r(c.querySelector('.list-clean-up')),
      collapse: r(c.querySelector('button[aria-label="Collapse card"]'))!,
      trash: r(c.querySelector('button[aria-label^="Delete card"]'))!,
      card: r(c)!,
    };
  });
}
const midY = (r: { top: number; height: number }) => r.top + r.height / 2;

test('a 240px list titled "Packing list" shows the whole title, and Clean up is visible and works', async ({ page }) => {
  await seed(page, { w: 240, title: 'Packing list', ticked: true });
  await expect(cleanUp(page)).toBeVisible();
  const r = await rects(page);
  expect(r.titleCut, 'the title text is cut off').toBe(false);
  // Clean up has its own line under the title, at the right; the arrow and trash can stay on the title's line.
  expect(r.clean!.top).toBeGreaterThanOrEqual(r.title.bottom - 1);
  expect(Math.abs(midY(r.collapse) - midY(r.title))).toBeLessThan(6);
  expect(Math.abs(midY(r.trash) - midY(r.title))).toBeLessThan(6);
  expect(r.clean!.right).toBeLessThanOrEqual(r.card.right);
  expect(r.clean!.right).toBeGreaterThan(r.card.left + r.card.width / 2);
  await cleanUp(page).click();
  await expect(cleanUp(page)).toHaveCount(0);
  await expect(card(page).getByLabel('Item text')).toHaveCount(1);
});

test('a wide list keeps Clean up on the title line, between the title and the collapse arrow', async ({ page }) => {
  await seed(page, { w: 420, title: 'Packing list', ticked: true });
  const r = await rects(page);
  expect(r.titleCut).toBe(false);
  for (const part of [r.clean!, r.collapse, r.trash]) expect(Math.abs(midY(part) - midY(r.title))).toBeLessThan(6);
  expect(r.clean!.left).toBeGreaterThanOrEqual(r.title.right - 1);
  expect(r.clean!.right).toBeLessThanOrEqual(r.collapse.left + 0.5);
  expect(r.collapse.right).toBeLessThanOrEqual(r.trash.left + 0.5);
});

for (const theme of ['light', 'dark'] as const) {
  for (const size of ['normal', 'largest', 'maximum', 'ultimate'] as const) {
    test(`the title is as wide with Clean up as without it (${size} text, ${theme})`, async ({ page }) => {
      for (const w of [200, 240, 320]) {
        await seed(page, { w, title: 'Packing list for the trip', ticked: false, size, theme });
        const without = await rects(page);
        await seed(page, { w, title: 'Packing list for the trip', ticked: true, size, theme });
        const withIt = await rects(page);
        const where = `${w}px wide`;
        // In the card's own pixels (the board is zoomed to fit, and a taller card can change the zoom).
        const own = (r: typeof withIt) => (r.title.width / r.card.width) * w;
        expect(own(withIt), `${where}: the title was squeezed by Clean up`).toBeGreaterThanOrEqual(own(without) - 1);
        expect(withIt.titleCut, `${where}: title cut`).toBe(without.titleCut);
        // Nothing runs out of the card or over another part, and Clean up can be pressed.
        const c = withIt.card;
        for (const [name, p] of Object.entries({ clean: withIt.clean!, title: withIt.title, collapse: withIt.collapse, trash: withIt.trash })) {
          expect(p.left, `${where}: ${name} left`).toBeGreaterThanOrEqual(c.left - 1);
          expect(p.right, `${where}: ${name} right`).toBeLessThanOrEqual(c.right + 1);
        }
        const apart = (a: { left: number; right: number; top: number; bottom: number }, b: typeof a) => a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5;
        expect(apart(withIt.clean!, withIt.title), `${where}: Clean up over the title`).toBe(true);
        expect(apart(withIt.clean!, withIt.collapse), `${where}: Clean up over the arrow`).toBe(true);
        expect(apart(withIt.clean!, withIt.trash), `${where}: Clean up over the trash can`).toBe(true);
        await expect(cleanUp(page)).toBeVisible();
      }
    });
  }
}

test('a collapsed list has no Clean up and keeps its preview text', async ({ page }) => {
  await seed(page, { w: 240, title: 'Packing list', ticked: true, collapsed: true });
  await expect(cleanUp(page)).toHaveCount(0);
  await expect(card(page).locator('.card-meta')).toBeVisible();
  await expect(card(page).locator('.card-meta')).toHaveText('Packing list');
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  for (const theme of ['light', 'dark'] as const) {
    test(`a narrow list's title is not squeezed by Clean up (phone, ${theme})`, async ({ page }) => {
      await seed(page, { w: 240, title: 'Packing list', ticked: false, theme });
      await card(page).getByLabel('Item text').first().tap(); // selects the list, so its buttons show
      const without = await rects(page);
      await seed(page, { w: 240, title: 'Packing list', ticked: true, theme });
      await card(page).getByLabel('Item text').first().tap();
      await expect(cleanUp(page)).toBeVisible();
      const withIt = await rects(page);
      expect(withIt.titleCut).toBe(false);
      expect((withIt.title.width / withIt.card.width) * 240).toBeGreaterThanOrEqual((without.title.width / without.card.width) * 240 - 1);
      await cleanUp(page).tap();
      await expect(cleanUp(page)).toHaveCount(0);
    });
  }
});
