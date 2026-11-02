import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, clickEmpty, freshBoardEachTest } from './helpers';

// Word-style highlights across checklist items (owner request, 2026-11-01: "It should work like a word document
// editor. It shouldn't highlight all of the row"). A drag from an item's text highlights exact letters across items;
// Delete, Backspace and typing act on just those words; Ctrl+C / Ctrl+X take exactly them.

freshBoardEachTest();

const SPLITWISE = 'Splitwise -- finish up credit card payment and check through and pay back and settle';
const CHECK_UP = 'Check up on leatherworking again';

async function makeList(page: Page, texts: string[]) {
  await clickEmpty(page);
  await add(page, 'Checklist');
  const id = await page.locator('.card.selected').getAttribute('data-card-id');
  for (const [i, t] of texts.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  return page.locator(`[data-card-id="${id}"]`);
}

const rows = (list: Locator) => list.locator('[data-item-id]');
const field = (list: Locator, n: number) => rows(list).nth(n).getByLabel('Item text');
const texts = (list: Locator) => list.getByLabel('Item text').evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));
const marks = (list: Locator) => rows(list).evaluateAll((els) => els.map((el) => el.querySelector('.word-mark')?.textContent ?? null));

/**
 * Where letter `offset` of an item's text is drawn on screen: its left edge (+1px) and the middle of its line.
 * Measured on a copy of the text laid out like the text box (the page's own styles), with the browser's Range.
 */
function letterAt(f: Locator, offset: number) {
  return f.evaluate((el, at) => {
    const ta = el as HTMLTextAreaElement;
    const copy = document.createElement('span');
    copy.className = 'text-mirror';
    copy.textContent = ta.value;
    ta.parentElement!.append(copy);
    const r = document.createRange();
    r.setStart(copy.firstChild!, at);
    r.setEnd(copy.firstChild!, Math.min(at + 1, ta.value.length));
    const rect = [...r.getClientRects()].find((x) => x.width > 0) ?? r.getBoundingClientRect();
    copy.remove();
    return { x: rect.left + 1, y: (rect.top + rect.bottom) / 2, top: rect.top, bottom: rect.bottom };
  }, offset);
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

/** "alpha beta" / "gamma delta" / "epsilon zeta", highlighted from the "b" of beta to just after "epsilon". */
async function threeHighlighted(page: Page) {
  const list = await makeList(page, ['alpha beta', 'gamma delta', 'epsilon zeta']);
  await clickEmpty(page);
  await drag(page, await letterAt(field(list, 0), 6), await letterAt(field(list, 2), 7));
  await expect.poll(() => marks(list)).toEqual(['beta ', 'gamma delta ', 'epsilon']);
  return list;
}

test("the owner's list: a drag to just above \"again\" ends on the Splitwise item's last line, not the whole row", async ({ page }) => {
  const list = await makeList(page, ['Buy milk', SPLITWISE, CHECK_UP]);
  await clickEmpty(page);
  const split = field(list, 1);
  const box = (await split.boundingBox())!;
  const firstLine = await letterAt(split, 0);
  const lastLine = await letterAt(split, SPLITWISE.length - 1);
  expect(lastLine.top - firstLine.top).toBeGreaterThan(firstLine.bottom - firstLine.top); // it wraps (to 3 lines at this width)
  const again = await letterAt(field(list, 2), CHECK_UP.indexOf('again'));
  // Just above "again": below Splitwise's last line, still inside its box.
  const target = { x: again.x, y: box.y + box.height - 2 };

  // From inside the first item: letters from "milk" on, to the letter of Splitwise's last line above "again".
  await drag(page, await letterAt(field(list, 0), 4), target);
  await expect.poll(async () => (await marks(list))[0]).toBe('milk ');
  const m = await marks(list);
  expect(m[2]).toBeNull(); // "Check up…" is not highlighted
  const end = m[1]!.length;
  expect(SPLITWISE.startsWith(m[1]!)).toBe(true);
  const endLetter = await letterAt(split, end - 1);
  expect(Math.abs(endLetter.y - lastLine.y)).toBeLessThan(2); // on the last line
  // Under the pointer, or the line's end when the last line stops short of "again".
  if (end < SPLITWISE.length) expect(Math.abs(endLetter.x - again.x)).toBeLessThan(20);
  else expect(endLetter.x).toBeLessThan(again.x);
  // Only the letters are highlighted: no row is tinted, and "Check up…" isn't selected.
  await expect(list.locator('.todo-item.picked')).toHaveCount(2);
  await expect(rows(list).nth(2)).not.toHaveClass(/picked/);
  for (const n of [0, 1]) {
    expect(await rows(list).nth(n).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    expect(await field(list, n).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  }

  await page.keyboard.press('Delete');
  expect(await texts(list)).toEqual(['Buy ' + SPLITWISE.slice(end), CHECK_UP]);
  await page.keyboard.press('Control+z');
  expect(await texts(list)).toEqual(['Buy milk', SPLITWISE, CHECK_UP]);

  // From inside the Splitwise item itself: the browser's own letter selection, which stays in that item.
  await clickEmpty(page);
  await drag(page, await letterAt(split, 0), target);
  await expect(list.locator('.todo-item.picked')).toHaveCount(0);
  const sel = await split.evaluate((el) => [(el as HTMLTextAreaElement).selectionStart, (el as HTMLTextAreaElement).selectionEnd]);
  expect(sel[0]).toBe(0);
  expect(Math.abs((await letterAt(split, Math.max(sel[1] - 1, 0))).y - lastLine.y)).toBeLessThan(2);
});

test('a highlight across three items; Delete joins what is left; Ctrl+Z brings it all back', async ({ page }) => {
  const list = await threeHighlighted(page);
  await expect(list.locator('.todo-item.picked.words')).toHaveCount(3);
  await page.keyboard.press('Delete');
  expect(await texts(list)).toEqual(['alpha  zeta']);
  await expect(field(list, 0)).toBeFocused();
  expect(await field(list, 0).evaluate((el) => (el as HTMLTextAreaElement).selectionStart)).toBe(6);
  await page.keyboard.press('Control+z');
  expect(await texts(list)).toEqual(['alpha beta', 'gamma delta', 'epsilon zeta']);
});

test('Backspace does the same; a typed letter replaces the highlight', async ({ page }) => {
  const list = await threeHighlighted(page);
  await page.keyboard.press('Backspace');
  expect(await texts(list)).toEqual(['alpha  zeta']);
  await page.keyboard.press('Control+z');
  await clickEmpty(page);
  await drag(page, await letterAt(field(list, 0), 6), await letterAt(field(list, 2), 7));
  await page.keyboard.type('XY');
  expect(await texts(list)).toEqual(['alpha XY zeta']);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect(await texts(list)).toEqual(['alpha beta', 'gamma delta', 'epsilon zeta']);
});

test('Ctrl+C takes exactly the highlighted words: they paste into another list as items, and go to other apps as text', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const list = await threeHighlighted(page);
  await page.keyboard.press('Control+c');
  await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n'))).toBe('beta\ngamma delta\nepsilon');
  expect(await texts(list)).toEqual(['alpha beta', 'gamma delta', 'epsilon zeta']); // copying changes nothing
  const other = await makeList(page, []);
  await field(other, 0).click();
  await page.keyboard.press('Control+v');
  expect(await texts(other)).toEqual(['beta', 'gamma delta', 'epsilon']);
});

test('Ctrl+X takes the words and removes them as Delete does', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const list = await threeHighlighted(page);
  await page.keyboard.press('Control+x');
  expect(await texts(list)).toEqual(['alpha  zeta']);
  await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n'))).toBe('beta\ngamma delta\nepsilon');
  await page.keyboard.press('Control+z');
  expect(await texts(list)).toEqual(['alpha beta', 'gamma delta', 'epsilon zeta']);
});

test('Shift+click extends from the cursor, letter by letter; ticking one ticks every item it touches', async ({ page }) => {
  const list = await makeList(page, ['alpha beta', 'gamma delta', 'epsilon zeta', 'eta']);
  const from = await letterAt(field(list, 0), 6);
  await page.mouse.click(from.x, from.y);
  const to = await letterAt(field(list, 2), 7);
  await page.keyboard.down('Shift');
  await page.mouse.click(to.x, to.y);
  await page.keyboard.up('Shift');
  await expect.poll(() => marks(list)).toEqual(['beta ', 'gamma delta ', 'epsilon', null]);
  await rows(list).nth(1).getByRole('checkbox').check();
  await expect(list.getByRole('checkbox', { checked: true })).toHaveCount(3);
});
