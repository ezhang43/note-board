import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';
import { FONT_KEY, type FontSize } from '../src/model/font';
import { THEME_KEY } from '../src/model/theme';

// "3 of 5 done" on checklists (owner request, 2026-11-03). A small gray "3/5" right after the list's title counts every
// item, sub-items included; a parent item shows the same for what is under it, right after its text. It is worked out from
// the items (never saved), is plain text (not editable, not focusable, not part of the title), and the list's title
// has the accessible description "3 of 5 done". When everything is ticked it takes the ticked color.

type Item = { id: string; text: string; done: boolean; children: Item[] };
const item = (id: string, text: string, done = false, children: Item[] = []): Item => ({ id, text, done, children });

/*
  Groceries (3/5)
    Trip            1/3   (sub-items: Flights ticked, Hotel, Car)
      Flights  x
      Hotel
      Car
    Milk  x
    Eggs  x
    (blank trailing item, not counted)
*/
const list = () => [
  item('trip', 'Trip', false, [item('fl', 'Flights', true), item('ho', 'Hotel'), item('ca', 'Car')]),
  item('milk', 'Milk', true),
  item('eggs', 'Eggs', true),
  item('end', ''),
];

async function seed(page: Page, o: { items?: Item[]; title?: string; size?: FontSize; theme?: 'light' | 'dark'; w?: number; style?: { size: 'small' | 'large' } } = {}) {
  await page.evaluate(
    ({ o, items, fk, tk }) => {
      const base = { color: null, collapsed: false, h: null };
      const board = { name: 'T', snap: true, cards: { t1: { ...base, id: 't1', kind: 'todo', title: o.title ?? 'Groceries', style: o.style, completedOpen: true, x: 100, y: 100, w: o.w ?? 400, items } }, columns: {}, order: ['t1'] };
      localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board }));
      localStorage.setItem(fk, o.size ?? 'normal');
      localStorage.setItem(tk, o.theme ?? 'light');
    },
    { o, items: o.items ?? list(), fk: FONT_KEY, tk: THEME_KEY },
  );
  await page.reload();
  await fontsLoaded(page);
}

const card = (page: Page) => page.locator('[data-card-id="t1"]');
const listCount = (page: Page) => card(page).locator('.title-count');
const row = (page: Page, id: string) => card(page).locator(`[data-item-id="${id}"]`);
const rowCount = (page: Page, id: string) => row(page, id).locator('.item-count');

function check(layout: 'desktop' | 'phone') {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await fontsLoaded(page);
  });

  test(`the list title is followed by a quiet count of every item, sub-items included (${layout})`, async ({ page }) => {
    await seed(page);
    // 6 counted items (Trip, Flights, Hotel, Car, Milk, Eggs), 3 ticked; the blank trailing item is not counted.
    await expect(listCount(page)).toHaveText('3/6');
    // It is plain text after the title, on the title's line: not an input, not focusable, not part of the title's text.
    const title = card(page).getByLabel('List title');
    await expect(title).toHaveValue('Groceries');
    const r = await page.evaluate(() => {
      const c = document.querySelector('[data-card-id="t1"]')!;
      const count = c.querySelector('.title-count')!;
      const box = c.querySelector('.card-title')!.getBoundingClientRect();
      const n = count.getBoundingClientRect();
      return { after: n.left - box.right, sameLine: Math.abs(n.top + n.height / 2 - (box.top + box.height / 2)), tab: (count as HTMLElement).tabIndex, editable: (count as HTMLElement).isContentEditable, tag: count.tagName };
    });
    expect(r.after, 'the count starts right after the title').toBeGreaterThanOrEqual(-1);
    expect(r.after, 'and close to it').toBeLessThan(16);
    expect(r.sameLine, 'on the same line').toBeLessThan(6);
    expect(r.tab).toBe(-1);
    expect(r.editable).toBe(false);
    expect(r.tag).toBe('SPAN');
    // Tabbing from the title goes to the first item, never to the count.
    await title.focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('.title-count') ?? null)).toBeNull();
  });

  test(`screen readers get "3 of 6 done" on the list title; the visual count is hidden from them (${layout})`, async ({ page }) => {
    await seed(page);
    await expect(card(page).getByLabel('List title')).toHaveAccessibleDescription('3 of 6 done');
    await expect(listCount(page)).toHaveAttribute('aria-hidden', 'true');
  });

  test(`a parent item shows a count of everything under it, right after its text (${layout})`, async ({ page }) => {
    await seed(page);
    await expect(rowCount(page, 'trip')).toHaveText('1/3');
    // Leaf items have none.
    await expect(rowCount(page, 'fl')).toHaveCount(0);
    await expect(rowCount(page, 'milk')).toHaveCount(0);
    // It sits on the first line of the row, to the right of the text "Trip", not covering it.
    const r = await page.evaluate(() => {
      const el = document.querySelector('[data-item-id="trip"]')!;
      const count = el.querySelector('.item-count')!.getBoundingClientRect();
      const ta = el.querySelector('textarea')!;
      const t = ta.getBoundingClientRect();
      // The width of the text "Trip" in the textarea's font.
      const probe = document.createElement('span');
      probe.textContent = 'Trip';
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:' + getComputedStyle(ta).font;
      document.body.append(probe);
      const w = probe.getBoundingClientRect().width;
      probe.remove();
      return { countLeft: count.left, textEnd: t.left + (parseFloat(getComputedStyle(ta).paddingLeft) + w) * (t.width / ta.offsetWidth), countTop: count.top, rowTop: t.top, rowBottom: t.bottom, countBottom: count.bottom };
    });
    expect(r.countLeft, 'after the text').toBeGreaterThanOrEqual(r.textEnd - 0.5);
    expect(r.countLeft - r.textEnd, 'close to the text').toBeLessThan(24);
    expect(r.countTop).toBeGreaterThanOrEqual(r.rowTop - 1);
    expect(r.countBottom).toBeLessThanOrEqual(r.rowBottom + 1);
    // The item's own text is untouched, and the count does not take clicks away from it.
    await expect(row(page, 'trip').getByLabel('Item text')).toHaveValue('Trip');
    await rowCount(page, 'trip').click({ force: true });
    await expect(row(page, 'trip').getByLabel('Item text')).toBeFocused();
  });

  test(`the counts follow ticking and unticking (${layout})`, async ({ page }) => {
    await seed(page);
    await expect(listCount(page)).toHaveText('3/6');
    await row(page, 'ho').getByRole('checkbox').check();
    await expect(listCount(page)).toHaveText('4/6');
    await expect(rowCount(page, 'trip')).toHaveText('2/3');
    await expect(card(page).getByLabel('List title')).toHaveAccessibleDescription('4 of 6 done');
    await row(page, 'ho').getByRole('checkbox').uncheck();
    await expect(listCount(page)).toHaveText('3/6');
    await expect(rowCount(page, 'trip')).toHaveText('1/3');
    // Adding an item changes the total.
    await row(page, 'eggs').getByLabel('Item text').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Bread');
    await expect(listCount(page)).toHaveText('3/7');
    // Deleting one changes it too.
    await row(page, 'milk').getByLabel('Item text').click();
    await page.keyboard.press('Delete'); // Delete in a ticked item removes it
    await expect(listCount(page)).toHaveText('2/6');
  });

  test(`everything ticked: the count takes the ticked color (${layout})`, async ({ page }) => {
    await seed(page, { items: [item('a', 'One', true), item('b', 'Two', true, [item('b1', 'Inner', true)]), item('end', '')] });
    await expect(listCount(page)).toHaveText('3/3');
    await expect(listCount(page)).toHaveClass(/all-done/);
    await expect(rowCount(page, 'b')).toHaveClass(/all-done/);
    const colors = await page.evaluate(() => {
      const probe = document.createElement('i');
      probe.style.color = 'var(--checkbox)';
      document.body.append(probe);
      const tick = getComputedStyle(probe).color;
      probe.remove();
      return { tick, count: getComputedStyle(document.querySelector('.title-count')!).color };
    });
    expect(colors.count).toBe(colors.tick);
    // Unticking one puts the quiet gray back.
    await row(page, 'a').getByRole('checkbox').uncheck();
    await expect(listCount(page)).toHaveText('2/3');
    await expect(listCount(page)).not.toHaveClass(/all-done/);
  });

  test(`a list with nothing to count shows no count, and neither does a blank parent (${layout})`, async ({ page }) => {
    await seed(page, { items: [item('only', '')] });
    await expect(card(page)).toBeVisible();
    await expect(listCount(page)).toHaveCount(0);
    await expect(card(page).getByLabel('List title')).not.toHaveAccessibleDescription(/done/);
  });

  test(`the count stays on the card and clear of the title at every text size, in dark mode too (${layout})`, async ({ page }) => {
    for (const size of ['normal', 'large', 'huge', 'ultimate'] as FontSize[]) {
      for (const theme of ['light', 'dark'] as const) {
        await seed(page, { size, theme });
        await expect(listCount(page), `${size} ${theme}`).toHaveText('3/6');
        const r = await page.evaluate(() => {
          const c = document.querySelector('[data-card-id="t1"]')!;
          const cardBox = c.getBoundingClientRect();
          const count = c.querySelector('.title-count')!.getBoundingClientRect();
          const title = c.querySelector('.card-title')!.getBoundingClientRect();
          const sub = c.querySelector('[data-item-id="trip"] .item-count')!.getBoundingClientRect();
          const area = c.querySelector('[data-item-id="trip"] textarea')!.getBoundingClientRect();
          const bg = getComputedStyle(c).backgroundColor;
          const fg = getComputedStyle(c.querySelector('.title-count')!).color;
          return {
            titleClear: count.left >= title.right - 1 || count.top >= title.bottom - 1,
            inCard: count.right <= cardBox.right + 0.5 && sub.right <= cardBox.right + 0.5,
            subInRow: sub.right <= area.right + 0.5,
            differs: bg !== fg,
          };
        });
        expect(r, `${size} ${theme}`).toEqual({ titleClear: true, inCard: true, subInRow: true, differs: true });
      }
    }
  });

  test(`only a top-level parent shows a count; an indented item with its own sub-items shows none (${layout})`, async ({ page }) => {
    // Trip (top level) > Flights (level 1) > Seat, Meal (level 2); Hotel (level 1, leaf).
    await seed(page, {
      items: [item('trip', 'Trip', false, [item('fl', 'Flights', false, [item('seat', 'Seat', true), item('meal', 'Meal')]), item('ho', 'Hotel', true)])],
    });
    // The top-level parent still counts everything under it at every level (2 of 4).
    await expect(rowCount(page, 'trip')).toHaveText('2/4');
    // The indented parent has sub-items of its own but shows no count; nor does a leaf.
    await expect(row(page, 'fl')).toBeVisible();
    await expect(rowCount(page, 'fl')).toHaveCount(0);
    await expect(rowCount(page, 'ho')).toHaveCount(0);
    // The list title's count is unchanged.
    await expect(listCount(page)).toHaveText('2/5');
  });

  test(`a folded indented parent shows no count either (${layout})`, async ({ page }) => {
    await seed(page, {
      items: [item('trip', 'Trip', false, [{ ...item('fl', 'Flights', false, [item('seat', 'Seat', true), item('meal', 'Meal')]), folded: true } as Item])],
    });
    await expect(row(page, 'fl')).toBeVisible();
    await expect(rowCount(page, 'fl')).toHaveCount(0);
    await expect(rowCount(page, 'trip')).toHaveText('1/3');
  });

  test(`a blank parent shows no count of its own (nothing to put it after), and the placeholder is clear (${layout})`, async ({ page }) => {
    await seed(page, { items: [item('p', '', false, [item('k', 'Kid', true), item('l', 'Other')])] });
    await expect(listCount(page)).toHaveText('1/2');
    await expect(rowCount(page, 'p')).toHaveCount(0);
  });

  test(`a parent's count is drawn, not text: no second copy of the item's words in the page (${layout})`, async ({ page }) => {
    await seed(page);
    const text = await row(page, 'trip').locator('.tail-marks').evaluate((el) => el.textContent);
    expect(text).toBe('1/3');
  });

  test(`the list count follows the title's own text size (${layout})`, async ({ page }) => {
    await seed(page);
    const normal = await listCount(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    await seed(page, { style: { size: 'large' } });
    const large = await listCount(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(large).toBeGreaterThan(normal);
  });

  test(`the title is never cut off by the count: beside it when there is room, under it when there is not (${layout})`, async ({ page }) => {
    for (const [w, title, sameLine] of [[240, 'Weekend packing', false], [400, 'Weekend packing', true]] as const) {
      await seed(page, { w, title });
      const r = await page.evaluate(() => {
        const c = document.querySelector('[data-card-id="t1"]')!;
        const input = c.querySelector<HTMLInputElement>('.card-title input')!;
        const count = c.querySelector('.title-count')!.getBoundingClientRect();
        const box = c.querySelector('.card-title')!.getBoundingClientRect();
        const card = c.getBoundingClientRect();
        return { cut: input.scrollWidth > input.clientWidth + 0.5, together: Math.abs(count.top + count.height / 2 - (box.top + box.height / 2)) < 8, inCard: count.right <= card.right && count.left >= card.left };
      });
      expect(r.cut, `${w}px: title cut off`).toBe(false);
      expect(r.inCard, `${w}px: count inside the card`).toBe(true);
      if (sameLine) expect(r.together, `${w}px: same line`).toBe(true);
    }
  });
}

test.describe('desktop', () => check('desktop'));
test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  check('phone');
});
