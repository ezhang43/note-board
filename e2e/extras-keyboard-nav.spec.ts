import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, box, clickEmpty, columns, dragPointer, freshBoardEachTest, grabPoint, looseCards } from './helpers';

// Owner's additions: arrow keys move through cards in a column; Ctrl+arrows jump card to card.

freshBoardEachTest();

const header = { position: { x: 200, y: 26 } };
const idOf = (l: Locator) => l.getAttribute('data-card-id');
const byId = (page: Page, id: string | null) => page.locator(`[data-card-id="${id}"]`);

/** A column holding a note, a to-do list and a link, top to bottom. */
async function columnOfThree(page: Page) {
  await add(page, 'New column');
  const col = columns(page).first();
  await add(page, 'Note');
  await col.click(header);
  await add(page, 'To-do list');
  await page.keyboard.type('item one');
  await col.click(header);
  await add(page, 'Link');
  const cards = col.locator('[data-card-id]');
  return { col, note: cards.nth(0), list: cards.nth(1), link: cards.nth(2) };
}

const caret = (l: Locator) => l.evaluate((el) => (el as HTMLInputElement).selectionStart);

test('Down / Up move through every field of the cards in a column, selecting each card on the way', async ({ page }) => {
  const { note, list, link } = await columnOfThree(page);
  await note.getByLabel('Note text').fill('hello');

  await page.keyboard.press('ArrowDown');
  await expect(list.getByLabel('List title')).toBeFocused();
  await expect(list).toHaveClass(/selected/);
  await page.keyboard.press('ArrowDown');
  await expect(list.getByLabel('Item text')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(link.getByLabel('Link title')).toBeFocused();
  await expect(link).toHaveClass(/selected/);
  await page.keyboard.press('ArrowDown');
  await expect(link.getByLabel('Link address')).toBeFocused();
  await page.keyboard.press('ArrowDown'); // bottom of the column: stays
  await expect(link.getByLabel('Link address')).toBeFocused();

  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(list.getByLabel('Item text')).toBeFocused();
  expect(await caret(list.getByLabel('Item text'))).toBe('item one'.length); // arriving from below: at the end
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(note.getByLabel('Note text')).toBeFocused();
  await expect(note).toHaveClass(/selected/);
  expect(await caret(note.getByLabel('Note text'))).toBe(5);
});

test('collapsed cards are skipped; a loose card stays put at its last field', async ({ page }) => {
  const { note, list, link } = await columnOfThree(page);
  await list.getByRole('button', { name: 'Collapse card' }).click();
  await note.getByLabel('Note text').click();
  await page.keyboard.press('ArrowDown');
  await expect(link.getByLabel('Link title')).toBeFocused();

  await clickEmpty(page);
  await add(page, 'Note');
  const loose = looseCards(page).first();
  await loose.getByLabel('Note text').click();
  await page.keyboard.press('ArrowDown');
  await expect(loose.getByLabel('Note text')).toBeFocused();
});

test('Ctrl + arrows jump to the nearest card in that direction, select it, and put the cursor in it', async ({ page }) => {
  const { col, note, link } = await columnOfThree(page);
  // A loose note to the right of the column.
  await clickEmpty(page);
  await add(page, 'Note');
  const loose = looseCards(page).first();
  const c = await box(col);
  const g = await grabPoint(loose);
  const l = await box(loose);
  await dragPointer(page, g, { x: c.x + c.width + 80 + (g.x - l.x), y: c.y + (g.y - l.y) });

  await note.getByLabel('Note text').click();
  await page.keyboard.type('typing here');
  await page.keyboard.press('Control+ArrowRight');
  await expect(loose).toHaveClass(/selected/);
  await expect(loose.getByLabel('Note text')).toBeFocused();
  await page.keyboard.type('keep editing');
  await expect(loose.getByLabel('Note text')).toHaveValue('keep editing');

  await page.keyboard.press('Control+ArrowLeft');
  await expect(note).toHaveClass(/selected/);
  await expect(note.getByLabel('Note text')).toBeFocused();
  expect(await caret(note.getByLabel('Note text'))).toBe('typing here'.length);

  await page.keyboard.press('Control+ArrowDown');
  await page.keyboard.press('Control+ArrowDown');
  await expect(link).toHaveClass(/selected/);
  await expect(link.getByLabel('Link title')).toBeFocused();
});

test('Ctrl + arrows also work from a selected card, and with nothing selected start near the middle', async ({ page }) => {
  await add(page, 'Note');
  const first = looseCards(page).first();
  await clickEmpty(page);
  await add(page, 'Link');
  const second = byId(page, await idOf(page.locator('.card.selected')));
  await clickEmpty(page);

  // Nothing selected: Ctrl+arrow picks a card to start from.
  await page.keyboard.press('Control+ArrowUp');
  await expect(page.locator('.card.selected')).toHaveCount(1);

  // From a selected (not edited) card.
  await first.click({ position: { x: 30, y: 18 } });
  const a = await box(first);
  const b = await box(second);
  const dir = Math.abs(b.y - a.y) > Math.abs(b.x - a.x) ? (b.y > a.y ? 'ArrowDown' : 'ArrowUp') : b.x > a.x ? 'ArrowRight' : 'ArrowLeft';
  await page.keyboard.press(`Control+${dir}`);
  await expect(second).toHaveClass(/selected/);
  await expect(second.getByLabel('Link title')).toBeFocused();
});

test('Ctrl + arrow pans the board to a card that is off-screen', async ({ page }) => {
  await add(page, 'Note');
  const first = looseCards(page).first();
  await clickEmpty(page);
  await add(page, 'Note');
  const other = byId(page, await idOf(page.locator('.card.selected')));
  // Put the second note far to the right, then pan so it is off-screen.
  const canvas = await box(page.getByTestId('canvas'));
  const g = await grabPoint(other);
  await dragPointer(page, g, { x: canvas.x + canvas.width - 60, y: (await box(first)).y + 18 });
  await page.mouse.move(canvas.x + 400, canvas.y + 300);
  await page.mouse.wheel(-500, 0); // board moves right: the far note leaves the screen
  await expect.poll(async () => (await box(other)).x > canvas.x + canvas.width).toBe(true);

  await first.getByLabel('Note text').click();
  await page.keyboard.press('Control+ArrowRight');
  await expect(other.getByLabel('Note text')).toBeFocused();
  const r = await box(other);
  expect(r.x + r.width).toBeLessThanOrEqual(canvas.x + canvas.width);
  expect(r.x).toBeGreaterThanOrEqual(canvas.x);
});

test('Ctrl + arrows in the board name still move word by word', async ({ page }) => {
  await add(page, 'Note');
  const name = page.getByLabel('Board name');
  await name.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Control+ArrowLeft');
  await expect(name).toBeFocused();
  expect(await caret(name)).toBe('My first '.length);
});
