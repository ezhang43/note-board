import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, box, cards, clickEmpty, freshBoardEachTest, looseCards } from './helpers';

// Step 5: checklists — items, nesting, Completed section, item drag, multi-select and drop-to-board.

freshBoardEachTest();

/** Adds a loose to-do list and types each text as an item (Enter between them). Returns the card. */
async function makeList(page: Page, texts: string[]) {
  await clickEmpty(page);
  await add(page, 'To-do list');
  const id = await page.locator('.card.selected').getAttribute('data-card-id');
  for (const [i, t] of texts.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  return page.locator(`[data-card-id="${id}"]`);
}

const rows = (list: Locator) => list.locator('[data-item-id]');
const texts = (list: Locator) => list.getByLabel('Item text').evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));
const depthOf = (row: Locator) => row.evaluate((el) => parseFloat((el as HTMLElement).style.paddingLeft) / 22);
const rowWithText = (list: Locator, text: string) =>
  list.locator('[data-item-id]').filter({ has: list.page().locator(`textarea:text-is("${text}")`) });

async function center(l: Locator) {
  const b = await box(l);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Drag an item by its grip to a point. */
async function dragItem(page: Page, row: Locator, to: { x: number; y: number }, during?: () => Promise<void>) {
  await row.hover();
  const grip = await center(row.getByRole('button', { name: 'Drag item' }));
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  if (during) await during();
  await page.mouse.up();
}

test('Enter adds an item below; Tab nests it; Shift+Tab moves it out; Backspace deletes an empty one', async ({ page }) => {
  const list = await makeList(page, ['Plan trip', 'Book flights']);
  await expect.poll(() => texts(list)).toEqual(['Plan trip', 'Book flights']);
  await expect(rows(list).nth(1).getByLabel('Item text')).toBeFocused();

  await page.keyboard.press('Tab');
  expect(await depthOf(rows(list).nth(1))).toBe(1);
  await expect(rows(list).nth(1).getByLabel('Item text')).toBeFocused();
  await page.keyboard.press('Enter'); // new item at the same (nested) level
  expect(await depthOf(rows(list).nth(2))).toBe(1);
  await page.keyboard.press('Shift+Tab');
  expect(await depthOf(rows(list).nth(2))).toBe(0);

  await page.keyboard.press('Backspace'); // empty: deleted, cursor goes up
  await expect(rows(list)).toHaveCount(2);
  await expect(rows(list).nth(1).getByLabel('Item text')).toBeFocused();

  // The last item of a list can't be deleted with Backspace.
  const single = await makeList(page, []);
  await page.keyboard.press('Backspace');
  await expect(rows(single)).toHaveCount(1);
});

test('Up and Down arrows move between items, line by line inside multi-line items', async ({ page }) => {
  const list = await makeList(page, ['one', 'two', 'three']);
  await rowWithText(list, 'two').getByLabel('Item text').press('Tab');
  const field = (t: string) => rowWithText(list, t).getByLabel('Item text');
  const caret = (t: string) => field(t).evaluate((el) => (el as HTMLTextAreaElement).selectionStart);

  await field('one').focus();
  await page.keyboard.press('ArrowDown');
  await expect(field('two')).toBeFocused(); // into a nested item
  expect(await caret('two')).toBe(0);
  await page.keyboard.press('ArrowDown');
  await expect(field('three')).toBeFocused();
  await page.keyboard.press('ArrowDown'); // already the last item: stays
  await expect(field('three')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(field('two')).toBeFocused();
  expect(await caret('two')).toBe(3); // at the end of its text

  // A two-line item: Down first moves to its second line, then to the next item.
  await field('two').press('End');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('more');
  await field('one').focus();
  await page.keyboard.press('ArrowDown');
  await expect(rows(list).nth(1).getByLabel('Item text')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(rows(list).nth(1).getByLabel('Item text')).toBeFocused(); // now on its second line
  await page.keyboard.press('ArrowDown');
  await expect(field('three')).toBeFocused();
});

test('arrows move line by line through long text that wraps, before leaving the item', async ({ page }) => {
  const long = 'This item has quite a lot of text so that it wraps onto several lines in the card';
  const list = await makeList(page, ['top', long, 'bottom']);
  const field = rows(list).nth(1).getByLabel('Item text');
  expect(await field.evaluate((el) => (el as HTMLElement).offsetHeight)).toBeGreaterThan(50); // it really wraps
  await rowWithText(list, 'top').getByLabel('Item text').focus();
  await page.keyboard.press('ArrowDown'); // into the long item, first line
  await expect(field).toBeFocused();
  await page.keyboard.press('ArrowDown'); // second line: still inside
  await expect(field).toBeFocused();
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
  await expect(rowWithText(list, 'bottom').getByLabel('Item text')).toBeFocused();
});

test('arrows skip completed items while the Completed section is collapsed', async ({ page }) => {
  const list = await makeList(page, ['open', 'finished']);
  await rowWithText(list, 'finished').getByLabel('Done').click();
  const open = rowWithText(list, 'open').getByLabel('Item text');
  await open.focus();
  await page.keyboard.press('ArrowDown');
  await expect(rowWithText(list, 'finished').getByLabel('Item text')).toBeFocused();
  await list.getByRole('button', { name: 'Completed · 1' }).click();
  await open.focus();
  await page.keyboard.press('ArrowDown');
  await expect(open).toBeFocused();
});

test('ticking a top-level item moves it to "Completed · N"; ticking a sub-item only strikes it', async ({ page }) => {
  const list = await makeList(page, ['A', 'A sub', 'B']);
  await rows(list).nth(1).getByLabel('Item text').press('Tab');

  await rowWithText(list, 'A sub').getByLabel('Done').click(); // sub-item
  await expect(list.locator('.completed')).toHaveCount(0);
  await expect(rows(list).nth(1).getByLabel('Item text')).toHaveCSS('text-decoration-line', 'line-through');

  // Click (not check): ticking moves the row, so the test must not re-check whatever row takes its place.
  await rowWithText(list, 'A').getByLabel('Done').click(); // top-level A (with its sub-item)
  const completed = list.locator('.completed');
  await expect(completed.getByRole('button', { name: 'Completed · 1' })).toBeVisible();
  await expect(completed.locator('[data-item-id]')).toHaveCount(2);
  expect(await texts(list)).toEqual(['B', 'A', 'A sub']);
  await expect(list.locator('.card-meta')).toHaveText(''); // no "2/3 done" (owner request)

  await completed.getByRole('button', { name: 'Completed · 1' }).click();
  await expect(completed.locator('[data-item-id]')).toHaveCount(0);
  await completed.getByRole('button', { name: 'Completed · 1' }).click();
  await expect(completed.locator('[data-item-id]')).toHaveCount(2);

  // Unticking brings it back.
  await rowWithText(list, 'A').getByLabel('Done').click();
  await expect(list.locator('.completed')).toHaveCount(0);
});

test('grip and trash show on hover on every item; trash deletes the item with its sub-items', async ({ page }) => {
  const list = await makeList(page, ['A', 'A sub', 'B', 'B sub']);
  await rowWithText(list, 'A sub').getByLabel('Item text').press('Tab');
  await rowWithText(list, 'B sub').getByLabel('Item text').press('Tab');
  const row = rowWithText(list, 'B');
  await clickEmpty(page);
  await expect(row.getByRole('button', { name: 'Drag item' })).toHaveCSS('opacity', '0');
  await expect(row.getByRole('button', { name: 'Delete item' })).toHaveCSS('opacity', '0');
  await row.hover();
  await expect(row.getByRole('button', { name: 'Drag item' })).toHaveCSS('opacity', '1');

  // An open (not ticked) item can be trashed too.
  const openTrash = row.getByRole('button', { name: 'Delete item' });
  await expect(openTrash).toHaveCSS('opacity', '1');
  await openTrash.click();
  expect(await texts(list)).toEqual(['A', 'A sub']);

  await rowWithText(list, 'A').getByLabel('Done').click();
  await rowWithText(list, 'A').hover();
  const trash = rowWithText(list, 'A').getByRole('button', { name: 'Delete item' });
  await expect(trash).toHaveCSS('opacity', '1');
  await trash.click();
  // The list became empty, so a blank item replaces it.
  await expect(rows(list)).toHaveCount(1);
  expect(await texts(list)).toEqual(['']);
});

test('deleting a blank item keeps its sub-items with text, moving them up a level', async ({ page }) => {
  const list = await makeList(page, ['first', 'parent', 'child one', 'child two']);
  await rowWithText(list, 'child one').getByLabel('Item text').press('Tab');
  await rowWithText(list, 'child two').getByLabel('Item text').press('Tab');
  expect(await depthOf(rowWithText(list, 'child one'))).toBe(1);

  // Clear the parent's text, then trash it: the children stay, one level up.
  await rowWithText(list, 'parent').getByLabel('Item text').fill('');
  const blankRow = rows(list).nth(1);
  await blankRow.hover();
  await blankRow.getByRole('button', { name: 'Delete item' }).click();
  expect(await texts(list)).toEqual(['first', 'child one', 'child two']);
  expect(await depthOf(rowWithText(list, 'child one'))).toBe(0);
  expect(await depthOf(rowWithText(list, 'child two'))).toBe(0);

  // Same with Backspace in a blank item that has sub-items.
  await rowWithText(list, 'child two').getByLabel('Item text').press('Tab');
  await rowWithText(list, 'child one').getByLabel('Item text').fill('');
  await rows(list).nth(1).getByLabel('Item text').press('Backspace');
  expect(await texts(list)).toEqual(['first', 'child two']);
  expect(await depthOf(rowWithText(list, 'child two'))).toBe(0);
  await expect(rowWithText(list, 'first').getByLabel('Item text')).toBeFocused();

  // An item with text still takes its sub-items with it.
  await rowWithText(list, 'child two').getByLabel('Item text').press('Tab');
  await rowWithText(list, 'first').hover();
  await rowWithText(list, 'first').getByRole('button', { name: 'Delete item' }).click();
  expect(await texts(list)).toEqual(['']);
});

test('drag an item before another (teal line), and nested under one (drop to the right)', async ({ page }) => {
  const list = await makeList(page, ['one', 'two', 'three']);
  await clickEmpty(page);
  const top = await box(rows(list).nth(0));
  await dragItem(page, rowWithText(list, 'three'), { x: top.x + 30, y: top.y + 4 }, async () => {
    await expect(rows(list).nth(0)).toHaveClass(/mark-before/);
    await expect(page.getByTestId('item-ghost')).toContainText('three');
  });
  expect(await texts(list)).toEqual(['three', 'one', 'two']);

  const target = await box(rowWithText(list, 'one'));
  await dragItem(page, rowWithText(list, 'two'), { x: target.x + target.width - 30, y: target.y + target.height - 4 }, async () => {
    await expect(rowWithText(list, 'one')).toHaveClass(/mark-nest/);
  });
  expect(await depthOf(rowWithText(list, 'two'))).toBe(1);
  expect(await texts(list)).toEqual(['three', 'one', 'two']);
});

test('drag an item into another list, or onto empty list space to append', async ({ page }) => {
  const a = await makeList(page, ['a1', 'a2']);
  const b = await makeList(page, ['b1']);
  await clickEmpty(page);
  const target = await box(rows(b).nth(0));
  await dragItem(page, rowWithText(a, 'a1'), { x: target.x + 30, y: target.y + target.height - 4 });
  expect(await texts(b)).toEqual(['b1', 'a1']);
  expect(await texts(a)).toEqual(['a2']);

  const title = await box(b.getByLabel('List title'));
  await dragItem(page, rowWithText(a, 'a2'), { x: title.x + title.width + 30, y: title.y + 10 }, async () => {
    await expect(b.locator('.todo-body')).toHaveClass(/append-target/);
  });
  expect(await texts(b)).toEqual(['b1', 'a1', 'a2']);
  expect(await texts(a)).toEqual(['']); // emptied list gets a blank item
});

test('dropping items on empty board makes a new list "New list"', async ({ page }) => {
  const list = await makeList(page, ['keep', 'move me']);
  await clickEmpty(page);
  const canvas = await box(page.getByTestId('canvas'));
  await dragItem(page, rowWithText(list, 'move me'), { x: canvas.x + 120, y: canvas.y + 120 }, async () => {
    await expect(page.getByTestId('item-ghost')).toContainText('New list');
  });
  await expect(looseCards(page)).toHaveCount(2);
  const made = page.locator('.card.selected');
  await expect(made.getByLabel('List title')).toHaveValue('New list');
  expect(await texts(made)).toEqual(['move me']);
  expect(await texts(list)).toEqual(['keep']);
});

test('press and drag over items selects a range; Shift+click extends; Delete removes them; Escape clears', async ({ page }) => {
  const list = await makeList(page, ['one', 'two', 'three', 'four']);
  await clickEmpty(page);
  const from = await center(rows(list).nth(0).getByLabel('Item text'));
  const to = await center(rows(list).nth(1).getByLabel('Item text'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await expect(list.locator('.todo-item.picked')).toHaveCount(2);

  await rows(list).nth(2).getByLabel('Item text').click({ modifiers: ['Shift'] });
  await expect(list.locator('.todo-item.picked')).toHaveCount(3);

  await page.keyboard.press('Escape');
  await expect(list.locator('.todo-item.picked')).toHaveCount(0);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press('Delete');
  expect(await texts(list)).toEqual(['three', 'four']);
  await expect(cards(page)).toHaveCount(1); // the card itself was not deleted
});

test('with several items selected, ticking one ticks all, and dragging one moves all in order', async ({ page }) => {
  const list = await makeList(page, ['one', 'two', 'three', 'four']);
  await clickEmpty(page);
  const from = await center(rows(list).nth(1).getByLabel('Item text'));
  const to = await center(rows(list).nth(2).getByLabel('Item text'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();

  // Drag the selected pair below "four".
  const last = await box(rowWithText(list, 'four'));
  await dragItem(page, rowWithText(list, 'two'), { x: last.x + 30, y: last.y + last.height - 3 }, async () => {
    await expect(page.getByTestId('item-ghost')).toContainText('2 items');
  });
  expect(await texts(list)).toEqual(['one', 'four', 'two', 'three']);

  await expect(list.locator('.todo-item.picked')).toHaveCount(2);
  await rowWithText(list, 'three').getByLabel('Done').click();
  await expect(list.locator('.completed [data-item-id]')).toHaveCount(2);
  await expect(list.getByRole('button', { name: 'Completed · 2' })).toBeVisible();
});

test('Ctrl+C / Ctrl+V pastes copied items after the selection; Ctrl+X cuts; Ctrl+Z undoes', async ({ page }) => {
  const list = await makeList(page, ['one', 'two', 'three']);
  await clickEmpty(page);
  const select = async (a: number, b: number) => {
    const from = await center(rows(list).nth(a).getByLabel('Item text'));
    const to = await center(rows(list).nth(b).getByLabel('Item text'));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
  };
  await select(0, 1);
  await page.keyboard.press('Control+c');
  await select(2, 1);
  await page.keyboard.press('Control+v');
  expect(await texts(list)).toEqual(['one', 'two', 'three', 'one', 'two']);

  await page.keyboard.press('Control+x'); // the pasted pair is selected: cut it
  expect(await texts(list)).toEqual(['one', 'two', 'three']);
  await page.keyboard.press('Control+z');
  expect(await texts(list)).toEqual(['one', 'two', 'three', 'one', 'two']);
  await page.keyboard.press('Control+z');
  expect(await texts(list)).toEqual(['one', 'two', 'three']);
});

test('Tab and Shift+Tab move all selected items together (owner request)', async ({ page }) => {
  const list = await makeList(page, ['one', 'two', 'three', 'four']);
  await clickEmpty(page);
  const from = await center(rows(list).nth(1).getByLabel('Item text'));
  const to = await center(rows(list).nth(2).getByLabel('Item text'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await expect(list.locator('.todo-item.picked')).toHaveCount(2);
  await page.keyboard.press('Tab');
  expect(await Promise.all(['one', 'two', 'three', 'four'].map((t) => depthOf(rowWithText(list, t))))).toEqual([0, 1, 1, 0]);
  await expect(list.locator('.todo-item.picked')).toHaveCount(2); // still selected
  await page.keyboard.press('Shift+Tab');
  expect(await Promise.all(['one', 'two', 'three', 'four'].map((t) => depthOf(rowWithText(list, t))))).toEqual([0, 0, 0, 0]);
  expect(await texts(list)).toEqual(['one', 'two', 'three', 'four']);
});

test('Delete at the end of an item pulls the next item up into it (owner request)', async ({ page }) => {
  const list = await makeList(page, ['Buy ', 'milk', 'eggs']);
  const first = rows(list).nth(0).getByLabel('Item text');
  await first.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Delete');
  expect(await texts(list)).toEqual(['Buy milk', 'eggs']);
  await expect(first).toBeFocused();
  await page.keyboard.type('!');
  expect(await texts(list)).toEqual(['Buy !milk', 'eggs']); // cursor stayed at the join
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect(await texts(list)).toEqual(['Buy ', 'milk', 'eggs']);
});
