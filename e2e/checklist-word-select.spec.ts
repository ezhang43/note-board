import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, clickEmpty, freshBoardEachTest, rowSpace } from './helpers';

// Word-style highlights across checklist items (owner request, 2026-11-01: "It should work like a word document
// editor. It shouldn't highlight all of the row"). A drag from an item's text highlights exact letters across items;
// Delete, Backspace and typing act on just those words; Ctrl+C / Ctrl+X take exactly them.

freshBoardEachTest();

const SPLITWISE = 'Splitwise -- finish up credit card payment and check through and pay back and settle';
const CHECK_UP = 'Check up on leather again'; // (short enough that "again" stays on the first line of the narrower text column, with the estimate clock's strip)

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

const ORIGINAL = ['alpha beta', 'gamma delta', 'epsilon zeta'];

test('with a highlight, Ctrl+Shift+Backspace still asks first, and keys pressed while it asks leave the list alone', async ({ page }) => {
  // A ticked item in another list, so there is something to ask about.
  const other = await makeList(page, ['done one']);
  await rows(other).nth(0).getByRole('checkbox').check();
  const list = await threeHighlighted(page);
  await page.keyboard.press('Control+Shift+Backspace');
  const ask = page.getByRole('alertdialog', { name: 'Delete completed items?' });
  await expect(ask).toContainText('Delete 1 completed item?');
  expect(await texts(list)).toEqual(ORIGINAL);
  for (const k of ['Delete', 'Backspace', 'x']) await page.keyboard.press(k);
  expect(await texts(list)).toEqual(ORIGINAL);
  await page.keyboard.press('Escape');
  await expect(ask).toHaveCount(0);
  expect(await texts(list)).toEqual(ORIGINAL);
  expect(await texts(other)).toEqual(['done one']);
});

test('with a highlight, ? opens the shortcuts list, and keys typed while it is open leave the list alone', async ({ page }) => {
  const list = await threeHighlighted(page);
  await page.keyboard.press('?');
  const panel = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(panel).toBeVisible();
  expect(await texts(list)).toEqual(ORIGINAL);
  await page.keyboard.press('x');
  await page.keyboard.press('Delete');
  expect(await texts(list)).toEqual(ORIGINAL);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('a highlight from the very start of the first item: Delete leaves the last item as it was, ticked and bold (owner decision 2026-11-02)', async ({ page }) => {
  const list = await makeList(page, ['Buy milk', 'Pay rent']);
  await page.keyboard.press('Control+b');
  await rows(list).nth(1).getByRole('checkbox').check();
  await clickEmpty(page);
  const id = await rows(list).nth(1).getAttribute('data-item-id');
  const weight = (n: number) => field(list, n).evaluate((el) => getComputedStyle(el).fontWeight);
  const bold = await weight(1);
  expect(bold).not.toBe(await weight(0));
  const start = (await field(list, 0).boundingBox())!;
  await drag(page, { x: start.x + 1, y: start.y + start.height / 2 }, await letterAt(field(list, 1), 4));
  await expect.poll(() => marks(list)).toEqual(['Buy milk ', 'Pay ']);
  await page.keyboard.press('Delete');
  expect(await texts(list)).toEqual(['rent']);
  await expect(rows(list).nth(0)).toHaveAttribute('data-item-id', id!);
  await expect(rows(list).nth(0).getByRole('checkbox')).toBeChecked();
  expect(await weight(0)).toBe(bold);
  await expect(page.locator('.undo-toast')).toContainText('Deleted 1 item');
  await page.keyboard.press('Control+z');
  expect(await texts(list)).toEqual(['Buy milk', 'Pay rent']);
});

test('a highlight from the very end of the first item: that item is not touched, and Ctrl+C copies no blank first line', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const list = await makeList(page, ORIGINAL);
  await clickEmpty(page);
  const end = (await field(list, 0).boundingBox())!;
  await drag(page, { x: end.x + end.width - 3, y: end.y + end.height / 2 }, await letterAt(field(list, 2), 7));
  await expect.poll(() => marks(list)).toEqual([' ', 'gamma delta ', 'epsilon']);
  await expect(rows(list).nth(0)).not.toHaveClass(/picked/);
  await page.keyboard.press('Control+c');
  await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n'))).toBe('gamma delta\nepsilon');
});

/** A spot on row `n` that is neither its text nor a button: the row's own space under its text box. */
test("pressing on a row's own space (not its text) and dragging still selects whole items", async ({ page }) => {
  const list = await makeList(page, ['one', 'two', 'three', 'four']);
  await clickEmpty(page);
  await drag(page, await rowSpace(list, 0), await rowSpace(list, 2));
  await expect(list.locator('.todo-item.picked')).toHaveCount(3);
  await expect(list.locator('.todo-item.words')).toHaveCount(0);
  await page.keyboard.press('Delete');
  expect(await texts(list)).toEqual(['four']);
  await expect(page.locator('.undo-toast')).toContainText('Deleted 3 items');
});

test('"!" typed over a highlight replaces it like any letter; it does not fit the board to the screen', async ({ page }) => {
  const list = await threeHighlighted(page);
  await page.keyboard.press('Shift+Digit1');
  expect(await texts(list)).toEqual(['alpha ! zeta']);
  await page.keyboard.press('Control+z');
  expect(await texts(list)).toEqual(ORIGINAL);
});

test('an empty highlight: Ctrl+C and Ctrl+X leave the earlier copy (and the system clipboard) alone and change nothing', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const list = await threeHighlighted(page);
  await page.keyboard.press('Control+c');
  const clip = () => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n'));
  await expect.poll(clip).toBe('beta\ngamma delta\nepsilon');
  // An empty highlight: Shift+click back on the spot the highlight started from.
  const spot = await letterAt(field(list, 0), 6);
  await page.keyboard.down('Shift');
  await page.mouse.click(spot.x, spot.y);
  await page.keyboard.up('Shift');
  await expect(list.locator('.todo-item.picked.words')).toHaveCount(1); // the highlight exists, with both ends on the same spot
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+x');
  expect(await texts(list)).toEqual(ORIGINAL);
  expect(await clip()).toBe('beta\ngamma delta\nepsilon');
  // The earlier copy still pastes as items.
  const other = await makeList(page, []);
  await field(other, 0).click();
  await page.keyboard.press('Control+v');
  expect(await texts(other)).toEqual(['beta', 'gamma delta', 'epsilon']);
});

test('while a container\'s "Delete …?" asks, Tab moves between its buttons, Escape closes it, and the list behind is left alone', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'New container');
  await add(page, 'Checklist');
  const id = await page.locator('.card.selected').getAttribute('data-card-id');
  for (const [i, t] of ORIGINAL.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  const list = page.locator(`[data-card-id="${id}"]`);
  await clickEmpty(page);
  await drag(page, await letterAt(field(list, 0), 6), await letterAt(field(list, 2), 7));
  await expect.poll(() => marks(list)).toEqual(['beta ', 'gamma delta ', 'epsilon']);
  const x = async () => (await rows(list).nth(1).boundingBox())!.x;
  const x0 = await x();
  // A mouse click on the trash can clears the highlight first; a click made without the pointer (as a screen reader does) does not.
  await page.locator('[data-col-id]').first().getByRole('button', { name: 'Delete container and its cards' }).evaluate((el) => (el as HTMLButtonElement).click());
  const ask = page.getByRole('alertdialog', { name: 'Delete container?' });
  await expect(ask).toBeVisible();
  await expect(list.locator('.todo-item.picked')).toHaveCount(3); // the highlight is still there behind the question
  await expect(ask.getByRole('button', { name: 'Keep container' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(ask.getByRole('button', { name: 'Delete container' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(ask.getByRole('button', { name: 'Keep container' })).toBeFocused();
  expect(await x()).toBe(x0); // nothing was indented
  expect(await texts(list)).toEqual(ORIGINAL);
  await page.keyboard.press('Escape');
  await expect(ask).toHaveCount(0);
  expect(await texts(list)).toEqual(ORIGINAL);
  expect(await x()).toBe(x0);
  await expect(list.locator('.todo-item.picked')).toHaveCount(3); // Escape closed only the question: the items are still highlighted
});

test('a highlight from the very start of the first item to the very end of the last: both go whole, nothing blank is left behind', async ({ page }) => {
  const list = await makeList(page, ORIGINAL);
  await clickEmpty(page);
  const first = (await field(list, 0).boundingBox())!;
  const second = (await field(list, 1).boundingBox())!;
  await drag(page, { x: first.x + 1, y: first.y + first.height / 2 }, { x: second.x + second.width - 3, y: second.y + second.height / 2 });
  await expect.poll(() => marks(list)).toEqual(['alpha beta ', 'gamma delta', null]);
  await page.keyboard.press('Delete');
  expect(await texts(list)).toEqual(['epsilon zeta']);
  await expect(page.locator('.undo-toast')).toContainText('Deleted 2 items');
  await page.keyboard.press('Control+z');
  expect(await texts(list)).toEqual(ORIGINAL);
});

for (const key of ['Enter', 'Space']) {
  test(`${key} on a focused button acts on the button, not on the highlighted words`, async ({ page }) => {
    const list = await threeHighlighted(page);
    // Focus a row's "Move up" button the way the keyboard would (Tab), without a mouse click that would clear the highlight.
    const up = rows(list).nth(2).getByRole('button', { name: 'Move up' });
    await up.focus();
    await expect(up).toBeFocused();
    await expect(list.locator('.todo-item.picked.words')).toHaveCount(3);
    await page.keyboard.press(key);
    // The button moved the item up; the words were neither replaced by a split nor deleted.
    await expect.poll(() => texts(list)).toEqual(['alpha beta', 'epsilon zeta', 'gamma delta']);
  });
}
