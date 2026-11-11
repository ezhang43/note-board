import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';
import { FONT_KEY, FONT_SCALE, FONT_SIZES } from '../src/model/font';
import { THEME_KEY } from '../src/model/theme';

// Fold arrow gap (owner request, 2026-11-11: a parent item's fold arrow was hard to see because it touched the tick box's
// border). The arrow's drawn chevron (the svg path's own box, stroke included, not the button around it) must end clear of
// the tick box's visible left edge (its border included) at every A- / A+ step, on a computer and a phone, light and dark,
// open and folded, top-level and sub-items. It must also stay inside the card (a top-level arrow sits in the card's padding)
// and, for a sub-item, inside its indent (right of its parent's tick box's left edge).

// The rule: about 4px at Normal, growing with the item buttons' step, held at 110% so that a top-level arrow still fits the card's 12px padding (SPEC.md). The test asks for 3px at
// Normal, times the arrow's step, so it is a floor under the rule and not the rule itself.
const MIN_GAP = 3;
const ARROW_CAP = 1.1;

type Item = { id: string; text: string; done: boolean; children: Item[]; folded?: true };
const item = (id: string, children: Item[] = [], folded = false): Item => ({ id, text: `Item ${id}`, done: false, children, ...(folded ? { folded: true as const } : {}) });

async function seed(page: Page) {
  // a: an open parent with an open sub-parent (b) and a folded one (d); e: a folded top-level parent.
  const items = [item('a', [item('b', [item('c')]), item('d', [item('f')], true)]), item('e', [item('g')], true)];
  await page.evaluate((items) => {
    const base = { color: null, collapsed: false, h: null };
    const board = { name: 'T', snap: true, cards: { t1: { ...base, id: 't1', kind: 'todo', title: 'Plans', completedOpen: true, x: 100, y: 100, w: 800, items } }, columns: {}, order: ['t1'] };
    localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board }));
  }, items);
}

/** For each arrow: how far its drawn chevron ends from its tick box's left edge, and where it sits (card px, unzoomed). */
async function measure(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector('[data-card-id="t1"]') as HTMLElement;
    const cardBox = card.getBoundingClientRect();
    return [...card.querySelectorAll<HTMLElement>('.todo-item[data-item-id]')]
      .filter((row) => row.querySelector(':scope > .item-fold'))
      .map((row) => {
        const btn = row.querySelector(':scope > .item-fold') as HTMLElement;
        const svg = btn.querySelector('svg') as SVGElement;
        const path = svg.querySelector('path') as SVGPathElement;
        const box = row.querySelector(':scope > .tick input') as HTMLElement;
        const b = box.getBoundingClientRect(); // border included
        const scale = b.width / box.offsetWidth; // the board's zoom
        const p = path.getBoundingClientRect(); // the line's centre; the stroke is drawn half its width (1.8 of the icon's 12 units) further out
        const half = (svg.getBoundingClientRect().width / 12) * 0.9;
        const level = Math.round(parseFloat(getComputedStyle(row).getPropertyValue('--indent') || '0') / 32);
        return {
          id: row.dataset.itemId!,
          folded: btn.getAttribute('aria-expanded') === 'false',
          gap: (b.left - (p.right + half)) / scale,
          glyphToCard: (p.left - half - cardBox.left) / scale,
          // a sub-item's indent starts at its parent's tick box, 32 card px to the left of its own
          glyphToIndent: level > 0 ? (p.left - half - (b.left - 32 * scale)) / scale : null,
        };
      });
  });
}

async function run(page: Page, layout: 'desktop' | 'phone', theme: 'light' | 'dark') {
  const failures: string[] = [];
  const table: string[] = [];
  let checked = 0;
  for (const size of FONT_SIZES) {
    await page.evaluate(([fk, f, tk, th]) => { localStorage.setItem(fk, f); localStorage.setItem(tk, th); }, [FONT_KEY, size, THEME_KEY, theme]);
    await page.reload();
    await fontsLoaded(page);
    const where = `${Math.round(FONT_SCALE[size] * 100)}%, ${layout}, ${theme}`;
    const step = layout === 'phone' ? 1 : Math.max(1, FONT_SCALE[size]); // the item buttons' step; the phone keeps it at 1
    const bb = Math.min(step, 1.9, ARROW_CAP); // the arrow's own step: the item buttons' step, held at 110% so a top-level arrow fits the card's 12px padding
    const rows = await measure(page);
    expect(rows.length, `${where}: arrows found`).toBe(4);
    for (const r of rows) {
      checked++;
      table.push(`${where} ${r.id}${r.folded ? ' (folded)' : ''}: gap ${r.gap.toFixed(2)}px, from card edge ${r.glyphToCard.toFixed(1)}px, from indent ${r.glyphToIndent?.toFixed(1) ?? '-'}px`);
      if (r.gap < MIN_GAP * bb) failures.push(`Too close: ${r.id}${r.folded ? ' (folded)' : ''}, ${where}: the arrow ends ${r.gap.toFixed(2)}px from the tick box, should be at least ${(MIN_GAP * bb).toFixed(1)}px`);
      if (r.glyphToCard < 1) failures.push(`Clipped: ${r.id}, ${where}: the arrow starts ${r.glyphToCard.toFixed(1)}px from the card's outer edge, so it is not inside the card's 1px border`);
      if (r.glyphToIndent !== null && r.glyphToIndent < 0) failures.push(`Out of its indent: ${r.id}, ${where}: the arrow starts ${(-r.glyphToIndent).toFixed(1)}px left of its parent's tick box`);
      if (size === 'normal' && !r.folded && Math.abs(r.gap - 4) > 0.6) failures.push(`Not about 4px at Normal: ${r.id}, ${where}: ${r.gap.toFixed(2)}px`);
    }
  }
  if (process.env.FOLD_GAP_TABLE) console.log(table.join('\n'));
  expect(checked).toBe(FONT_SIZES.length * 4);
  const shown = failures.slice(0, 40).join('\n') + (failures.length > 40 ? `\n...and ${failures.length - 40} more` : '');
  expect(failures, `${failures.length} problems:\n${shown}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
  await seed(page);
});

for (const theme of ['light', 'dark'] as const) {
  test(`the fold arrow ends clear of the tick box at every text size (desktop, ${theme})`, async ({ page }) => {
    test.slow();
    await run(page, 'desktop', theme);
  });
}

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  for (const theme of ['light', 'dark'] as const) {
    test(`the fold arrow ends clear of the tick box at every text size (phone, ${theme})`, async ({ page }) => {
      test.slow();
      await run(page, 'phone', theme);
    });
  }
});
