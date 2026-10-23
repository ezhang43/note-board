import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';
import { FONT_KEY, FONT_SCALE, FONT_SIZES } from '../src/model/font';
import { THEME_KEY } from '../src/model/theme';

// Checklist centering guard (owner request, 2026-10-23: "there have been a few instances in which the centering of the text
// for checklists gets moved, so please ensure that this stays consistent going forward").
//
// The rule (SPEC.md, Look and feel): a tick box sits 5% of its item's line height BELOW the middle of the item's first line of
// text, because the middle of lowercase letters is lower than the middle of capitals. The gap from the box to the text is
// 6px times the item buttons' step (capped at 190%). This file measures both in the real app, over every case that has
// ever moved it: all 12 A- / A+ steps, every per-item text style, open and ticked, top-level and sub-items, one line and
// wrapped, light and dark, desktop and phone layout. All failures are collected and reported together.

// Half a pixel, in the card's own (unzoomed) pixels: tighter than the owner's 1px, so that a one-pixel slip at Normal (a 5% nudge is 1px there) is caught.
const TOLERANCE = 0.5;

type Style = { size?: 'small' | 'large'; bold?: true; font?: 'serif' | 'rounded' | 'hand' | 'mono' };
type Item = { id: string; text: string; done: boolean; children: Item[]; style?: Style };

const LONG = 'A long item that needs several lines of text, so that the tick box has to stay beside the first line only and not drift to the middle of the whole item';

let n = 0;
/** One row of the board, and the words that name it in a failure message. */
const labels = new Map<string, string>();
function row(label: string, o: { text?: string; done?: boolean; style?: Style; children?: Item[] } = {}): Item {
  const id = `r${++n}`;
  labels.set(id, label);
  return { id, text: o.text ?? 'Milk and eggs', done: o.done ?? false, children: o.children ?? [], ...(o.style ? { style: o.style } : {}) };
}

const STYLES: [string, Style][] = [
  ['small size', { size: 'small' }],
  ['large size', { size: 'large' }],
  ['bold', { bold: true }],
  ['serif font', { font: 'serif' }],
  ['rounded font', { font: 'rounded' }],
  ['hand font', { font: 'hand' }],
  ['mono font', { font: 'mono' }],
  ['hand font, large, bold', { font: 'hand', size: 'large', bold: true }],
];

function items(): Item[] {
  n = 0;
  labels.clear();
  return [
    row('plain, open, top-level'),
    ...STYLES.map(([name, style]) => row(`${name}, open, top-level`, { style })),
    row('plain, open, top-level, wrapped', { text: LONG }),
    row('hand font, large, open, top-level, wrapped', { text: LONG, style: { font: 'hand', size: 'large' } }),
    row('plain, open, top-level (parent)', {
      children: [
        row('plain, open, sub-item'),
        ...STYLES.map(([name, style]) => row(`${name}, open, sub-item`, { style })),
        row('mono font, open, sub-item, wrapped', { text: LONG, style: { font: 'mono' } }),
        row('plain, ticked, sub-item', { done: true }),
      ],
    }),
    row('plain, ticked, top-level', { done: true }),
    ...STYLES.map(([name, style]) => row(`${name}, ticked, top-level`, { done: true, style })),
    row('plain, ticked, top-level, wrapped', { text: LONG, done: true }),
    row('plain, ticked, top-level (parent)', {
      done: true,
      children: [row('serif font, large, ticked, sub-item', { done: true, style: { font: 'serif', size: 'large' } }), row('hand font, ticked, sub-item, wrapped', { done: true, text: LONG, style: { font: 'hand' } })],
    }),
  ];
}
const WRAPPED = / wrapped/;

async function seed(page: Page) {
  const list = items();
  const labelList = [...labels];
  await page.evaluate(
    ({ list, key }) => {
      const base = { color: null, collapsed: false, h: null };
      const board = {
        name: 'T',
        snap: true,
        cards: { t1: { ...base, id: 't1', kind: 'todo', title: 'Centering', completedOpen: true, x: 100, y: 100, w: 700, items: list } },
        columns: {},
        order: ['t1'],
      };
      localStorage.setItem(key, JSON.stringify({ version: 2, board }));
    },
    { list, key: 'note-board:v1' },
  );
  return new Map(labelList);
}

/** For every item row on the board: how far the tick box is from its place, and the gap to the text (card px). */
async function measure(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.todo-item[data-item-id]')].map((rowEl) => {
      const tick = rowEl.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      const ta = rowEl.querySelector<HTMLTextAreaElement>('textarea.item-text, .item-text > textarea')!;
      const t = tick.getBoundingClientRect();
      const a = ta.getBoundingClientRect();
      const scale = t.width / tick.offsetWidth; // the board's zoom
      const cs = getComputedStyle(ta);
      const lineH = parseFloat(cs.lineHeight);
      const padTop = parseFloat(cs.paddingTop);
      // The first line of the text, measured the way the browser lays it out: the same text in a plain box of the same width and font,
      // asking for the rectangle of its first character (a text field has no ranges of its own). That rectangle is the glyphs' box, which
      // the browser rounds to whole pixels, so it only says WHICH line box the text is in; the line box's own middle is exact.
      const mirror = document.createElement('div');
      const ms = mirror.style;
      ms.cssText = `position:absolute;visibility:hidden;padding:0;border:0;box-sizing:content-box;white-space:pre-wrap;overflow-wrap:${cs.overflowWrap};word-break:${cs.wordBreak}`;
      ms.width = `${ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)}px`;
      ms.font = cs.font;
      ms.letterSpacing = cs.letterSpacing;
      ms.fontStyle = cs.fontStyle;
      ms.lineHeight = cs.lineHeight;
      mirror.textContent = ta.value;
      ta.parentElement!.appendChild(mirror);
      const m = mirror.getBoundingClientRect();
      const range = document.createRange();
      range.setStart(mirror.firstChild!, 0);
      range.setEnd(mirror.firstChild!, 1);
      const first = range.getClientRects()[0];
      const firstLine = Math.floor((first.top + first.height / 2 - m.top) / scale / lineH);
      const lines = Math.round(m.height / scale / lineH);
      mirror.remove();
      return {
        id: rowEl.dataset.itemId!,
        lineH,
        lines,
        boxSize: tick.offsetWidth,
        // How far the middle of the box is below the middle of the first line of text.
        below: (t.top + t.height / 2 - a.top) / scale - (padTop + (firstLine + 0.5) * lineH),
        firstLine,
        gap: (a.left - t.right) / scale,
      };
    }),
  );
}

async function run(page: Page, layout: 'desktop' | 'phone', theme: 'light' | 'dark') {
  const names = await seed(page);
  const failures: string[] = [];
  let checked = 0;
  for (const size of FONT_SIZES) {
    await page.evaluate(([fk, f, tk, th]) => { localStorage.setItem(fk, f); localStorage.setItem(tk, th); }, [FONT_KEY, size, THEME_KEY, theme]);
    await page.reload();
    await fontsLoaded(page);
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
    const where = `${size === 'normal' ? 'Normal' : size} ${Math.round(FONT_SCALE[size] * 100)}%, ${layout}, ${theme}`;
    const step = layout === 'phone' ? 1 : Math.max(1, FONT_SCALE[size]); // the item buttons' step; the phone keeps it at 1
    const expectedBox = layout === 'phone' ? 16 : 20 * step;
    const expectedGap = 6 * Math.min(step, 1.9);
    const rows = await measure(page);
    expect(rows.length, `${where}: rows found`).toBe(names.size);
    for (const r of rows) {
      const name = names.get(r.id)!;
      checked++;
      const off = r.below - 0.05 * r.lineH;
      if (Math.abs(off) > TOLERANCE) failures.push(`Centering moved: ${name}, ${where}: the box is ${off.toFixed(1)}px ${off > 0 ? "lower" : "higher"} than the rule puts it, 5% of the line height below the middle of the first line (off by ${Math.abs(off).toFixed(1)}px)`);
      if (Math.abs(r.gap - expectedGap) > TOLERANCE) failures.push(`Gap moved: ${name}, ${where}: box to text is ${r.gap.toFixed(1)}px, should be ${expectedGap.toFixed(1)}px`);
      if (Math.abs(r.boxSize - expectedBox) > TOLERANCE) failures.push(`Box size moved: ${name}, ${where}: ${r.boxSize}px, should be ${expectedBox}px`);
      if (r.firstLine !== 0) failures.push(`Test cannot find the first line: ${name}, ${where}: the first character is in line ${r.firstLine + 1}`);
      if (WRAPPED.test(name) && r.lines < 2) failures.push(`Test case broken: ${name}, ${where}: expected a wrapped item but it has ${r.lines} line`);
    }
  }
  expect(checked).toBe(names.size * FONT_SIZES.length);
  // Every failure is listed (the first 40; the rest are counted), each naming the case.
  const shown = failures.slice(0, 40).join('\n') + (failures.length > 40 ? `\n...and ${failures.length - 40} more` : '');
  expect(failures, `${failures.length} problems:\n${shown}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
});

for (const theme of ['light', 'dark'] as const) {
  test(`checklist tick boxes stay centered on the first line at every text size (desktop, ${theme})`, async ({ page }) => {
    test.slow();
    await run(page, 'desktop', theme);
  });
}

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  for (const theme of ['light', 'dark'] as const) {
    test(`checklist tick boxes stay centered on the first line at every text size (phone, ${theme})`, async ({ page }) => {
      test.slow();
      await run(page, 'phone', theme);
    });
  }
});
