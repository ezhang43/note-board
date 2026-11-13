import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';
import { FONT_KEY, FONT_SCALE, FONT_SIZES } from '../src/model/font';
import { THEME_KEY } from '../src/model/theme';

// Fold arrow gap (owner request, 2026-11-11: a parent item's fold arrow was hard to see because it touched the tick box's
// border). The arrow's drawn chevron (the svg path's own box, stroke included, not the button around it) must end clear of
// the tick box's visible left edge (its border included) at every A- / A+ step, on a computer and a phone, light and dark,
// open and folded, top-level and sub-items. It must also stay inside the card (a top-level arrow sits in the card's padding)
// and, for a sub-item, inside its indent (right of its parent's tick box's left edge).

// The rule: about 4px at Normal, growing with the item buttons' step like the rest (SPEC.md). The test asks for 3px at
// Normal, times the step, so it is a floor under the rule and not the rule itself.
const MIN_GAP = 3;

// Bigger and darker (owner request, 2026-11-11: "make it a bit bigger and darker"). The open arrow's drawn width was 6.5px at Normal
// (the folded one's 4px); it is at least 25% bigger now, with a heavier stroke (1.8 icon units before), in the ink color (contrast on the card at
// least 9:1; the old faint gray gave about 5.5:1 in light mode and 6:1 in dark). It grows with the step, so sizes are checked per unit of step.
const MIN_OPEN_WIDTH = 8.1;
const MIN_FOLDED_WIDTH = 5.0;
const MIN_STROKE = 2.0;
const MIN_CONTRAST = 9;

type Item = { id: string; text: string; done: boolean; children: Item[]; folded?: true };
const item = (id: string, children: Item[] = [], folded = false): Item => ({ id, text: `Item ${id}`, done: false, children, ...(folded ? { folded: true as const } : {}) });

async function seed(page: Page, items: Item[] = [item('a', [item('b', [item('c'), item('c2')]), item('d', [item('f'), item('f2')], true)]), item('e', [item('g'), item('g2')], true)]) {
  // a: an open parent with an open sub-parent (b) and a folded one (d); e: a folded top-level parent.
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
        const p = path.getBoundingClientRect(); // the line's centre; the stroke is drawn half its width (in the icon's 12 units) further out
        const half = (svg.getBoundingClientRect().width / 12) * (parseFloat(getComputedStyle(path).strokeWidth) / 2);
        const lum = (css: string) => {
          const c = (css.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
          return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        };
        const [l1, l2] = [lum(getComputedStyle(btn).color), lum(getComputedStyle(card).backgroundColor)].sort((x, y) => y - x);
        const line = parseFloat(getComputedStyle(row.querySelector('.item-text') as HTMLElement).lineHeight);
        const level = Math.round(parseFloat(getComputedStyle(row).getPropertyValue('--indent') || '0') / 32);
        return {
          id: row.dataset.itemId!,
          folded: btn.getAttribute('aria-expanded') === 'false',
          width: (p.width + 2 * half) / scale,
          stroke: parseFloat(getComputedStyle(path).strokeWidth),
          contrast: (l1 + 0.05) / (l2 + 0.05),
          // the glyph's middle against the middle of the item's first line, which the box sits 2.5% of a line below
          midOff: ((b.top + b.bottom) / 2 - (p.top + p.bottom) / 2) / scale - 0.025 * line,
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
    const bb = Math.min(step, 1.9); // the item buttons' step, capped like them
    const rows = await measure(page);
    expect(rows.length, `${where}: arrows found`).toBe(4);
    for (const r of rows) {
      checked++;
      table.push(`${where} ${r.id}${r.folded ? ' (folded)' : ''}: gap ${r.gap.toFixed(2)}px, width ${r.width.toFixed(1)}px, stroke ${r.stroke}, contrast ${r.contrast.toFixed(1)}, off-centre ${r.midOff.toFixed(2)}px, from card edge ${r.glyphToCard.toFixed(1)}px, from indent ${r.glyphToIndent?.toFixed(1) ?? '-'}px`);
      if (r.gap < MIN_GAP * bb) failures.push(`Too close: ${r.id}${r.folded ? ' (folded)' : ''}, ${where}: the arrow ends ${r.gap.toFixed(2)}px from the tick box, should be at least ${(MIN_GAP * bb).toFixed(1)}px`);
      if (r.glyphToCard < 2) failures.push(`Clipped: ${r.id}, ${where}: the arrow starts ${r.glyphToCard.toFixed(1)}px from the card's outer edge, should be at least 2px (inside its 1px border)`);
      if (r.width / bb < (r.folded ? MIN_FOLDED_WIDTH : MIN_OPEN_WIDTH)) failures.push(`Too small: ${r.id}${r.folded ? ' (folded)' : ''}, ${where}: drawn ${(r.width / bb).toFixed(1)}px wide per step, should be at least ${r.folded ? MIN_FOLDED_WIDTH : MIN_OPEN_WIDTH}px`);
      if (r.stroke < MIN_STROKE) failures.push(`Too thin: ${r.id}, ${where}: stroke ${r.stroke}, should be at least ${MIN_STROKE}`);
      if (r.contrast < MIN_CONTRAST) failures.push(`Too faint: ${r.id}, ${where}: contrast ${r.contrast.toFixed(1)}:1 on the card, should be at least ${MIN_CONTRAST}:1`);
      if (Math.abs(r.midOff) > 1) failures.push(`Off the middle of the first line: ${r.id}, ${where}: ${r.midOff.toFixed(2)}px`);
      if (r.glyphToIndent !== null && r.glyphToIndent < 0) failures.push(`Out of its indent: ${r.id}, ${where}: the arrow starts ${(-r.glyphToIndent).toFixed(1)}px left of its parent's tick box`);
      if (size === 'normal' && !r.folded && Math.abs(r.gap - 4) > 0.6) failures.push(`Not about 4px at Normal: ${r.id}, ${where}: ${r.gap.toFixed(2)}px`);
    }
  }
  if (process.env.FOLD_GAP_TABLE) console.log(table.join('\n'));
  expect(checked).toBe(FONT_SIZES.length * 4);
  const shown = failures.slice(0, 40).join('\n') + (failures.length > 40 ? `\n...and ${failures.length - 40} more` : '');
  expect(failures, `${failures.length} problems:\n${shown}`).toEqual([]);
}

// The room for a top-level arrow goes to a list that has one, and to no other (SPEC.md): a list without a parent item keeps its tick boxes
// 13px (the card's padding and border) from the card's edge; a list with one has them a little further in, so the arrow fits.
for (const [name, items, shifted] of [['without', [item('a'), item('b', [], false)], false], ['with', [item('a', [item('b'), item('b2')]), item('c')], true]] as const) {
  test(`a list ${name} a parent item has its tick boxes ${shifted ? 'shifted in to make room for the arrow' : '13px from the card edge, as before'}`, async ({ page }) => {
    await seed(page, items as unknown as Item[]);
    await page.reload();
    await fontsLoaded(page);
    const left = await page.evaluate(() => {
      const card = document.querySelector('[data-card-id="t1"]')!.getBoundingClientRect();
      const box = document.querySelector('[data-card-id="t1"] .todo-item input[type=checkbox]')!;
      return box.getBoundingClientRect().left - card.left;
    });
    if (shifted) expect(left).toBeGreaterThan(14);
    else expect(left).toBeCloseTo(13, 0);
  });
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
