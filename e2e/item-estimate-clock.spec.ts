import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';
import { FONT_KEY, type FontSize } from '../src/model/font';

// Owner decision 2026-11-11 (option A): every checklist item has a faint add-estimate clock in its hover strip, which is
// 26px wider for it. Since the same day's item-count-no-wrap job, a parent's "0/2" count may reach into that strip when
// the last line of text is full. The count and the clock must never overlap, and the count must still never drop to a
// line of its own. (Same sweep of last-word lengths as item-count-no-wrap.spec.ts.)

type Item = { id: string; text: string; done: boolean; children: Item[] };
const item = (id: string, text: string, done = false, children: Item[] = []): Item => ({ id, text, done, children });

const SWEEP = 60; // (single-line items fill their first line, where the clock is, around the lower half; two-line ones fill the second)
const base = 'Buy ';
const text = (k: number) => base + 'b'.repeat(k);
// Parents with 1 sub-item ("0/1") or 12 ("0/12", a wider count), and a plain item with the same text beside each.
const items = (kids: number) =>
  Array.from({ length: SWEEP }, (_, i) => [
    item(`p${i}`, text(i + 1), false, Array.from({ length: kids }, (_, j) => item(`c${i}-${j}`, 'Sub'))),
    item(`l${i}`, text(i + 1)),
  ]).flat();

async function seed(page: Page, size: FontSize, kids: number) {
  await page.evaluate(
    ({ items, fk, size }) => {
      const b = { color: null, collapsed: false, h: null };
      const board = { name: 'T', snap: true, cards: { t1: { ...b, id: 't1', kind: 'todo', title: 'Shopping', completedOpen: true, x: 100, y: 100, w: 240, items } }, columns: {}, order: ['t1'] };
      localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board }));
      localStorage.setItem(fk, size);
    },
    { items: items(kids), fk: FONT_KEY, size },
  );
  await page.reload();
  await fontsLoaded(page);
}

function check(layout: 'desktop' | 'phone') {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await fontsLoaded(page);
  });

  // 'giant' (225%) is where the strip drops the clock: the count still must not leave its line.
  for (const size of ['normal', 'huge', 'giant'] as FontSize[]) {
    for (const kids of [1, 12]) {
      test(`a parent's count and the clock never overlap, and the count stays on the text's last line, with ${kids} sub-items at ${size} text (${layout})`, async ({ page }) => {
        await seed(page, size, kids);
        const r = await page.evaluate((n) => {
          const out: { k: number; overlap: boolean; below: boolean; taller: number; clockShown: boolean; past: boolean }[] = [];
          for (let i = 0; i < n; i++) {
            const p = document.querySelector(`[data-item-id="p${i}"]`)!;
            const l = document.querySelector(`[data-item-id="l${i}"]`)!;
            const pa = p.querySelector('textarea')!.getBoundingClientRect();
            const la = l.querySelector('textarea')!.getBoundingClientRect();
            const c = p.querySelector('.item-count')!.getBoundingClientRect();
            const clockEl = p.querySelector('.estimate-chip.add') as HTMLElement;
            const k = clockEl.getBoundingClientRect();
            const shown = getComputedStyle(clockEl).display !== 'none';
            out.push({
              k: i + 1,
              clockShown: shown,
              overlap: shown && c.right > k.left && c.left < k.right && c.bottom > k.top && c.top < k.bottom,
              below: c.bottom > pa.bottom + 1,
              taller: pa.height - la.height,
              past: c.right > pa.right + 0.5,
            });
          }
          return out;
        }, SWEEP);
        expect(r.filter((x) => x.overlap).map((x) => x.k), 'last-word lengths where the count covers the clock').toEqual([]);
        expect(r.filter((x) => x.below).map((x) => x.k), 'counts under the text').toEqual([]);
        expect(r.filter((x) => Math.abs(x.taller) > 0.5).map((x) => x.k), 'counts that made the item taller').toEqual([]);
        expect(r.every((x) => x.clockShown === (size !== 'giant'))).toBe(true);
        // The sweep reaches the case it is about: a count reaching into the strip.
        expect(r.some((x) => x.past)).toBe(true);
      });
    }
  }

  // Deterministic version of the sweep above (which only hits the worst case when a last word happens to end exactly at the
  // text's edge, so it passed on one machine's fonts and failed on another's): however the text wraps, the last word can end
  // at the text box's right edge, so the room between that edge and the clock must hold a whole count, whatever the font.
  for (const size of ['normal', 'huge'] as FontSize[]) {
    test(`the room before the clock holds a whole "0/12" count, so the count can never reach the clock at ${size} text (${layout})`, async ({ page }) => {
      await seed(page, size, 12);
      const r = await page.evaluate(() => {
        const p = document.querySelector('[data-item-id="p5"]')!;
        const edge = p.querySelector('textarea')!.getBoundingClientRect().right;
        const clock = p.querySelector('.estimate-chip.add')!.getBoundingClientRect().left;
        const c = p.querySelector('.item-count') as HTMLElement;
        const scale = p.querySelector('textarea')!.getBoundingClientRect().width / (p.querySelector('textarea') as HTMLElement).offsetWidth;
        return { room: clock - edge, need: c.getBoundingClientRect().width + parseFloat(getComputedStyle(c).marginLeft) * scale };
      });
      expect(r.room).toBeGreaterThanOrEqual(r.need);
    });
  }

  test(`the strip's buttons do not overlap each other, and the clock is the last one (${layout})`, async ({ page }) => {
    await seed(page, 'normal', 1);
    const row = page.locator('[data-item-id="l0"]');
    await row.locator('textarea').focus(); // (shows them on a touch screen)
    await row.hover();
    const box = async (sel: string) => (await row.locator(sel).first().boundingBox())!;
    const clock = await box('.estimate-chip.add');
    const grip = await box('.item-grip');
    const card = (await page.locator('[data-card-id="t1"]').boundingBox())!;
    expect(clock.x + clock.width).toBeLessThanOrEqual(card.x + card.width + 0.5);
    expect(grip.x + grip.width).toBeLessThanOrEqual(clock.x + 0.5);
    if (layout === 'desktop') {
      const trash = await box('.item-trash');
      expect(trash.x + trash.width).toBeLessThanOrEqual(grip.x + 0.5);
    }
    // The text never runs into the strip.
    const text = (await row.locator('textarea').boundingBox())!;
    const leftmost = layout === 'desktop' ? (await box('.item-trash')).x : grip.x;
    expect(text.x + text.width).toBeLessThanOrEqual(leftmost + 0.5);
  });
}

test.describe('desktop', () => check('desktop'));
test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  check('phone');
});
