import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';
import { FONT_KEY, FONT_SCALE, type FontSize } from '../src/model/font';

// Checklist row spacing (owner request 2026-10-24: "the spacing between checklist items feels just slightly too close").
// Owner feedback on the first version (2px): "the spacing is a bit too large now", so it went to 1px; on 2026-10-26 the owner
// picked halfway between the two, 1.5px.
// The space between two rows' text boxes is 1.5px more than it was, times the A- / A+ step (1.5px at Normal), for top-level
// items and sub-items alike. A row was at least 30px tall, so before this the space was 30px less the text box's height (2px
// at Normal on a computer, none from Large up).

type Item = { id: string; text: string; done: boolean; children: Item[] };
const item = (id: string, children: Item[] = []): Item => ({ id, text: `Item ${id}`, done: false, children });

async function seed(page: Page, size: FontSize) {
  const list = [item('a'), item('b', [item('c'), item('d')]), item('e')];
  await page.evaluate(
    ({ list, key, fk, size }) => {
      const base = { color: null, collapsed: false, h: null };
      const board = { name: 'T', snap: true, cards: { t1: { ...base, id: 't1', kind: 'todo', title: 'Spacing', completedOpen: true, x: 100, y: 100, w: 400, items: list } }, columns: {}, order: ['t1'] };
      localStorage.setItem(key, JSON.stringify({ version: 2, board }));
      localStorage.setItem(fk, size);
    },
    { list, key: 'note-board:v1', fk: FONT_KEY, size },
  );
  await page.reload();
  await fontsLoaded(page);
}

/** The space (card px) between each row's text box and the next row's, in page order: a, b, c, d, e. */
async function gaps(page: Page) {
  return page.evaluate(() => {
    const rowEls = [...document.querySelectorAll<HTMLElement>('.todo-item[data-item-id]')];
    const areas = rowEls.map((r) => r.querySelector('textarea')!);
    const boxes = areas.map((t) => t.getBoundingClientRect());
    const rows = rowEls.map((r) => r.getBoundingClientRect());
    const scale = boxes[0].width / areas[0].offsetWidth;
    return boxes.slice(1).map((b, i) => ({ gap: (b.top - boxes[i].bottom) / scale, boxH: boxes[i].height / scale, rowGap: (rows[i + 1].top - rows[i].bottom) / scale }));
  });
}

const SIZES: FontSize[] = ['normal', 'large', 'huge', 'ultimate'];

function check(layout: 'desktop' | 'phone') {
  for (const size of SIZES) {
    test(`rows are 1.5px x step further apart, sub-items too (${size}, ${layout})`, async ({ page }) => {
      await page.goto('/');
      await fontsLoaded(page);
      await seed(page, size);
      const fs = FONT_SCALE[size];
      const rows = await gaps(page);
      expect(rows).toHaveLength(4);
      for (const [i, r] of rows.entries()) {
        // What was there before: a row is at least 30px tall.
        const before = Math.max(0, 30 - r.boxH);
        expect(r.gap, `${size}, ${layout}, row ${i + 1} to ${i + 2}`).toBeCloseTo(before + 1.5 * fs, 1);
        // No dead gap between rows: the space belongs to a row (a drop there lands on the row above), so rows touch.
        expect(Math.abs(r.rowGap), `${size}, ${layout}, rows touch`).toBeLessThan(0.05);
      }
    });
  }
}

test.describe('desktop', () => check('desktop'));
test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  check('phone');
});
