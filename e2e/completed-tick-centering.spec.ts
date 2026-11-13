import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded, toggleCompleted } from './helpers';

// The Completed panel's tick boxes follow the same rule as a checklist's (owner request, 2026-11-13: "center the Completed
// panel's text on its box", with the checklist rule at 2.5%): the middle of the box sits 2.5% of the line height BELOW the
// middle of the item's first line of text (0.5px), for top-level items and sub-items, one line or wrapped. The panel's text does not
// grow with A− / A+ (it is not inside the canvas), so there is one size to check.
// Measured as geometry (box and line boxes), not as ink pixels, so it does not depend on the font the machine has.

// A quarter of a pixel: the nudge is only 0.5px, so half a pixel would let a lost nudge pass (the same as e2e/checklist-centering.spec.ts).
const TOLERANCE = 0.25;
const NUDGE = 0.025;
const LONG = 'A long item that needs several lines of text, so that the tick box has to stay beside the first line only';

async function seed(page: Page) {
  await page.evaluate(
    ({ long, key }) => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const item = (id: string, text: string, children: unknown[] = [], done = true) => ({ id, text, done, children });
      const entry = (i: unknown) => ({ item: i, fromCardId: 'l1', fromTitle: 'Errands', fromParentId: null });
      const entries = [
        entry(item('a', 'Milk and eggs', [item('a1', 'Brown bread', [item('a2', 'Plan work for next week', [], false)])])),
        entry(item('b', long)),
        entry(item('c', 'Brainstorm ideas', [item('c1', long)])),
      ];
      const board = { name: 'Home', snap: true, cards: { dn: { id: 'dn', kind: 'completed', color: 'stone', x: 0, y: 0, groups: [{ date, entries }] } }, columns: {}, order: ['dn'] };
      localStorage.setItem(key, JSON.stringify({ version: 6, home: 'home', boards: { home: board } }));
    },
    { long: LONG, key: 'note-board:v1' },
  );
}

/** For every row of the open Completed panel: how far the middle of its box is below the middle of the first line of its text. */
function measure(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.completed-panel .completed-row')].map((row) => {
      const box = row.querySelector<HTMLInputElement>('input[type="checkbox"]')!.getBoundingClientRect();
      const text = row.querySelector<HTMLElement>('.completed-text')!;
      const t = text.getBoundingClientRect();
      const cs = getComputedStyle(text);
      const lineH = parseFloat(cs.lineHeight);
      const lineMid = t.top + parseFloat(cs.paddingTop) + lineH / 2;
      return { name: text.textContent!.slice(0, 24), sub: row.classList.contains('sub'), lineH, size: box.width, below: box.top + box.height / 2 - lineMid };
    }),
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
  await seed(page);
  await page.reload();
  await fontsLoaded(page);
});

test("the Completed panel's tick boxes sit 2.5% of a line below the middle of the first line", async ({ page }) => {
  await toggleCompleted(page);
  await expect(page.locator('.completed-panel .completed-row').first()).toBeVisible();
  const rows = await measure(page);
  expect(rows.length, 'rows found').toBe(6);
  const failures: string[] = [];
  for (const r of rows) {
    const off = r.below - NUDGE * r.lineH;
    if (Math.abs(off) > TOLERANCE) failures.push(`Completed box moved: "${r.name}"${r.sub ? ' (sub-item)' : ''}: the box is ${off.toFixed(1)}px ${off > 0 ? 'lower' : 'higher'} than the rule puts it (2.5% of the line below the middle of the first line)`);
    if (r.size !== 16) failures.push(`Completed box size moved: "${r.name}": ${r.size}px, should stay 16px`);
  }
  expect(failures, `${failures.length} problems:\n${failures.join('\n')}`).toEqual([]);
});
