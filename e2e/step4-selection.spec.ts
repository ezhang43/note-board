import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, boardPos, box, cards, clickEmpty, columns, dragBy, emptySpot, expectNoOverlaps, freshBoardEachTest, looseCards } from './helpers';

// Step 4: selection, rectangle select, clipboard, delete, and undo/redo for everything.

freshBoardEachTest();

const undoButton = (page: Page) => page.getByRole('button', { name: 'Undo (Ctrl+Z)' });
const redoButton = (page: Page) => page.getByRole('button', { name: 'Redo (Ctrl+Y)' });

/** Three loose notes, nothing selected. */
async function threeNotes(page: Page) {
  for (let i = 0; i < 3; i++) {
    await add(page, 'Note');
    await clickEmpty(page);
  }
  await expect(looseCards(page)).toHaveCount(3);
  // Follow each card by its id: the on-page order changes as blocks move to the front.
  const ids = await looseCards(page).evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.cardId!));
  return ids.map((id) => page.locator(`[data-card-id="${id}"]`)) as [Locator, Locator, Locator];
}

const header = { position: { x: 30, y: 18 } };

test('Ctrl + click and Shift + click add and remove blocks; Colour recolours all selected columns and card title bands', async ({ page }) => {
  const [a, b, c] = await threeNotes(page);
  await a.click(header);
  await b.click({ ...header, modifiers: ['Control'] });
  await c.click({ ...header, modifiers: ['Shift'] });
  for (const n of [a, b, c]) await expect(n).toHaveClass(/selected/);
  await b.click({ ...header, modifiers: ['Control'] });
  await expect(b).not.toHaveClass(/selected/);

  // Cards selected: Colour is available (it colours their title bands).
  await expect(page.getByRole('button', { name: 'Colour of selected block' })).not.toHaveAttribute('aria-disabled');

  // With columns in the selection, Colour recolours every selected column.
  await clickEmpty(page);
  await add(page, 'New column');
  await clickEmpty(page);
  await add(page, 'New column');
  const [c1, c2] = [columns(page).nth(0), columns(page).nth(1)];
  await c1.click({ position: { x: 40, y: 80 } });
  await c2.click({ position: { x: 40, y: 80 }, modifiers: ['Control'] });
  await a.click({ ...header, modifiers: ['Control'] });
  await page.getByRole('button', { name: 'Colour of selected block' }).click();
  await page.getByRole('group', { name: 'Colours' }).getByRole('button', { name: 'Sky' }).click();
  await expect(c1).toHaveCSS('background-color', 'rgb(230, 238, 252)');
  await expect(c2).toHaveCSS('background-color', 'rgb(230, 238, 252)');
  await expect(a).toHaveCSS('background-color', 'rgb(255, 255, 255)'); // the card stays white
  await expect(a.locator('.card-header')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)'); // its band is coloured
});

test('Select tool: dragging a box selects everything it touches, live; Ctrl adds to the selection', async ({ page }) => {
  const [a, b, c] = await threeNotes(page);
  await page.keyboard.press('v');
  const ra = await box(a);
  const rb = await box(b);
  const start = await emptySpot(page);

  // A box from empty space that just clips the first note.
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(ra.x + 5, ra.y + 5, { steps: 10 });
  await expect(page.getByTestId('marquee')).toBeVisible();
  await expect(a).toHaveClass(/selected/); // selected while still dragging
  await page.mouse.up();
  await expect(page.getByTestId('marquee')).toHaveCount(0);
  await expect(b).not.toHaveClass(/selected/);

  // Ctrl + box around the second adds it.
  await page.keyboard.down('Control');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(rb.x + 5, rb.y + 5, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Control');
  await expect(a).toHaveClass(/selected/);
  await expect(b).toHaveClass(/selected/);

  // With the Select tool, dragging empty space doesn't pan.
  expect(await page.getByTestId('canvas').getAttribute('data-pan-x')).toBe('0');
  void c;
});

test('Ctrl + A then Delete asks about the column, then deletes everything selected', async ({ page }) => {
  await add(page, 'New column');
  await add(page, 'Note'); // into the column
  await clickEmpty(page);
  await add(page, 'Link');
  await clickEmpty(page);
  await page.keyboard.press('Control+a');
  await expect(columns(page).first()).toHaveClass(/selected/);
  await expect(looseCards(page).first()).toHaveClass(/selected/);
  await page.keyboard.press('Delete');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete “New column”?');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(cards(page)).toHaveCount(2);

  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await dialog.getByRole('button', { name: 'Delete column' }).click();
  await expect(columns(page)).toHaveCount(0);
  await expect(cards(page)).toHaveCount(0);
});

test('Delete removes selected loose cards straight away, but not while typing', async ({ page }) => {
  const [a] = await threeNotes(page);
  // Typing Backspace in a note edits the text, it doesn't delete the card.
  await a.getByLabel('Note text').fill('abc');
  await a.getByLabel('Note text').press('Backspace');
  await expect(a.getByLabel('Note text')).toHaveValue('ab');
  await expect(looseCards(page)).toHaveCount(3);

  await a.click(header);
  await page.keyboard.press('Delete');
  await expect(looseCards(page)).toHaveCount(2);
});

test('Ctrl + C, Ctrl + V pastes copies 40px further each time; a column copies with its cards', async ({ page }) => {
  await add(page, 'New column');
  const col = columns(page).first();
  await col.getByLabel('Column title').fill('Ideas');
  await add(page, 'Note');
  await col.click({ position: { x: 240, y: 26 } });
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(columns(page)).toHaveCount(2);
  const copy = page.locator('[data-col-id].selected');
  await expect(copy.getByLabel('Column title')).toHaveValue('Ideas copy');
  await expect(copy.locator('[data-card-id]')).toHaveCount(1);
  await expectNoOverlaps(page);

  await clickEmpty(page);
  await add(page, 'Link');
  const link = page.locator('.card.loose.selected');
  const p0 = await boardPos(link);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await page.keyboard.press('Control+v');
  await expect(looseCards(page)).toHaveCount(3);
  const pasted = page.locator('.card.loose.selected');
  const p2 = await boardPos(pasted);
  expect(p2).toEqual({ x: p0.x + 80, y: p0.y + 80 });
});

test('Ctrl + D duplicates the selection', async ({ page }) => {
  await add(page, 'To-do list');
  await page.keyboard.type('Pack');
  await clickEmpty(page);
  await looseCards(page).first().click(header);
  await page.keyboard.press('Control+d');
  await expect(looseCards(page)).toHaveCount(2);
  await expect(looseCards(page).nth(1).getByLabel('Item text')).toHaveValue('Pack');
  await expect(looseCards(page).nth(1)).toHaveClass(/selected/);
});

test('dragging one selected block moves the whole selection together', async ({ page }) => {
  const [a, b] = await threeNotes(page);
  await a.click(header);
  await b.click({ ...header, modifiers: ['Control'] });
  const pa = await boardPos(a);
  const pb = await boardPos(b);
  await dragBy(page, a, 0, 300);
  const qa = await boardPos(a);
  const qb = await boardPos(b);
  expect(qa.y - pa.y).toBeGreaterThan(200);
  expect(qb.y - pb.y).toBe(qa.y - pa.y);
  expect(qb.x - pb.x).toBe(qa.x - pa.x);
  await expectNoOverlaps(page);
});

test('Ctrl + Z undoes a burst of typing as one step, even from inside the text box; Ctrl + Y redoes', async ({ page }) => {
  await expect(undoButton(page)).toHaveAttribute('aria-disabled', 'true');
  await add(page, 'Note');
  await expect(undoButton(page)).not.toHaveAttribute('aria-disabled');
  const text = cards(page).first().getByLabel('Note text');
  await text.click();
  await page.keyboard.type('Hello there');
  await page.keyboard.press('Control+z');
  await expect(text).toHaveValue('');
  await expect(text).toBeFocused();
  await expect(redoButton(page)).not.toHaveAttribute('aria-disabled');
  await page.keyboard.press('Control+Shift+z'); // does nothing
  await expect(text).toHaveValue('');
  await page.keyboard.press('Control+y');
  await expect(text).toHaveValue('Hello there');
  await expect(redoButton(page)).toHaveAttribute('aria-disabled', 'true');
});

test('undo and redo buttons undo moves, colours and deletes', async ({ page }) => {
  await add(page, 'New column');
  const col = columns(page).first();
  const p0 = await boardPos(col);
  await dragBy(page, col, 200, 100);
  const p1 = await boardPos(col);
  expect(p1).not.toEqual(p0);
  await page.getByRole('button', { name: 'Colour of selected block' }).click();
  await page.getByRole('group', { name: 'Colours' }).getByRole('button', { name: 'Peach' }).click();
  await col.getByRole('button', { name: 'Delete column and its cards' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete column' }).click();
  await expect(columns(page)).toHaveCount(0);

  await undoButton(page).click();
  await expect(columns(page)).toHaveCount(1);
  await expect(columns(page).first()).toHaveCSS('background-color', 'rgb(253, 235, 221)');
  await undoButton(page).click();
  await expect(columns(page).first()).toHaveCSS('background-color', 'rgb(239, 236, 230)');
  await undoButton(page).click();
  expect(await boardPos(columns(page).first())).toEqual(p0);
  await undoButton(page).click();
  await expect(columns(page)).toHaveCount(0);
  await expect(undoButton(page)).toHaveAttribute('aria-disabled', 'true');

  await redoButton(page).click();
  await redoButton(page).click();
  expect(await boardPos(columns(page).first())).toEqual(p1);
});

test('Escape clears the selection and closes the colour menu; Ctrl + A while typing selects text only', async ({ page }) => {
  const [a, b] = await threeNotes(page);
  await add(page, 'New column');
  await a.click({ ...header, modifiers: ['Control'] });
  await page.getByRole('button', { name: 'Colour of selected block' }).click();
  await expect(page.getByRole('group', { name: 'Colours' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Colours' })).toHaveCount(0);
  await expect(page.locator('.selected')).toHaveCount(0);

  await a.getByLabel('Note text').fill('some text');
  await a.getByLabel('Note text').press('Control+a');
  await expect(b).not.toHaveClass(/selected/);
});
