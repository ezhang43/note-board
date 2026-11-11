import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';
import { FONT_KEY, type FontSize } from '../src/model/font';

// Owner request 2026-11-11: "the 0/2, etc. should never force an item to become another line ... in this case then it
// should just force the width of the container/box to be larger so it can accommodate it". Owner decision the same day
// (instead of a wider box): a parent item's count may reach into the room kept free at the row's right end for the hover
// buttons, so it never wraps onto a line of its own and no card or container changes width.

type Item = { id: string; text: string; done: boolean; children: Item[] };
const item = (id: string, text: string, done = false, children: Item[] = []): Item => ({ id, text, done, children });

// For every length of the last word, a top-level parent (one sub-item, so "0/1") and a plain item with the same text.
const SWEEP = 30;
const base = 'To buy potentially ';
const text = (k: number) => base + 'b'.repeat(k);
const items = () =>
  Array.from({ length: SWEEP }, (_, i) => [item(`p${i}`, text(i + 1), false, [item(`c${i}`, 'Sub')]), item(`l${i}`, text(i + 1))]).flat();

async function seed(page: Page, size: FontSize) {
  await page.evaluate(
    ({ items, fk, size }) => {
      const b = { color: null, collapsed: false, h: null };
      const board = { name: 'T', snap: true, cards: { t1: { ...b, id: 't1', kind: 'todo', title: 'Shopping', completedOpen: true, x: 100, y: 100, w: 240, items } }, columns: {}, order: ['t1'] };
      localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board }));
      localStorage.setItem(fk, size);
    },
    { items: items(), fk: FONT_KEY, size },
  );
  await page.reload();
  await fontsLoaded(page);
}

function check(layout: 'desktop' | 'phone') {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await fontsLoaded(page);
  });

  for (const size of ['normal', 'huge'] as FontSize[]) {
    test(`a parent's count never drops to a line of its own, however full the last line is, at ${size} text (${layout})`, async ({ page }) => {
      await seed(page, size);
      const r = await page.evaluate((n) => {
        const card = document.querySelector('[data-card-id="t1"]')!.getBoundingClientRect();
        const out: { k: number; taller: number; below: boolean; outside: boolean; past: boolean }[] = [];
        for (let i = 0; i < n; i++) {
          const p = document.querySelector(`[data-item-id="p${i}"]`)!;
          const l = document.querySelector(`[data-item-id="l${i}"]`)!;
          const pa = p.querySelector('textarea')!.getBoundingClientRect();
          const la = l.querySelector('textarea')!.getBoundingClientRect();
          const c = p.querySelector('.item-count')!.getBoundingClientRect();
          out.push({
            k: i + 1,
            taller: pa.height - la.height, // the same words without a count take the same lines
            below: c.bottom > pa.bottom + 1, // the count is on the text's last line
            outside: c.right > card.right + 0.5 || c.left < card.left,
            past: c.right > pa.right + 0.5, // it reaches into the strip kept free for the buttons
          });
        }
        return out;
      }, SWEEP);
      expect(r.filter((x) => Math.abs(x.taller) > 0.5).map((x) => x.k + ":" + x.taller.toFixed(1)), 'last-word lengths where the count made the item taller').toEqual([]);
      expect(r.filter((x) => x.below).map((x) => x.k), 'counts under the text').toEqual([]);
      expect(r.filter((x) => x.outside).map((x) => x.k), 'counts outside the card').toEqual([]);
      // The sweep reaches the case it is about: at least one count is past the text column.
      expect(r.some((x) => x.past)).toBe(true);
    });
  }

  test(`the card keeps its width (${layout})`, async ({ page }) => {
    await seed(page, 'normal');
    const w = await page.locator('[data-card-id="t1"]').evaluate((el) => (el as HTMLElement).offsetWidth);
    expect(w).toBe(240);
  });
}

test.describe('desktop', () => check('desktop'));
test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  check('phone');
});
