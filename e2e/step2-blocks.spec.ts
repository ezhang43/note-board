import { expect, test, type Locator, type Page } from '@playwright/test';
import { fontsLoaded, importLinkCard } from './helpers';

// Step 2: cards and columns — add, edit, move, drop into columns, collapse, colour, delete with confirmation.

type WithErrors = Page & { errors: string[] };

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  (page as WithErrors).errors = errors;
  await page.goto('/');
  await fontsLoaded(page);
});

test.afterEach(async ({ page }) => {
  expect((page as WithErrors).errors).toEqual([]);
});

const cards = (page: Page) => page.locator('[data-card-id]');
const looseCards = (page: Page) => page.locator('.card.loose');
const columns = (page: Page) => page.locator('[data-col-id]');
/** A loose block's position on the board (not on screen), from its style. */
const boardPos = (l: Locator) => l.evaluate((el) => ({ x: parseFloat((el as HTMLElement).style.left), y: parseFloat((el as HTMLElement).style.top) }));
const add = (page: Page, name: 'Note' | 'Checklist' | 'New column') =>
  page.locator('header.toolbar').getByRole('button', { name, exact: true }).click();

async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error('not visible');
  return b;
}

/** A blank spot in a block's header, safe to grab for dragging. */
async function grabPoint(block: Locator) {
  const b = await box(block);
  const isColumn = (await block.getAttribute('data-col-id')) !== null;
  return isColumn ? { x: b.x + b.width - 70, y: b.y + 26 } : { x: b.x + 30, y: b.y + 18 };
}

async function dragTo(page: Page, block: Locator, to: { x: number; y: number }) {
  const from = await grabPoint(block);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

async function emptySpot(page: Page) {
  const c = await box(page.getByTestId('canvas'));
  return { x: c.x + 40, y: c.y + c.height - 60 };
}

async function clickEmpty(page: Page) {
  const p = await emptySpot(page);
  await page.mouse.click(p.x, p.y);
}

function overlapping(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test('Add Note puts a white note on the board, selected, and it grows as you type', async ({ page }) => {
  await add(page, 'Note');
  const note = cards(page).first();
  await expect(note).toHaveAttribute('data-kind', 'note');
  await expect(note).toHaveClass(/selected/);
  await expect(note).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  const before = (await box(note)).height;
  await note.getByLabel('Note text').fill('one\ntwo\nthree\nfour\nfive\nsix\nseven');
  await expect.poll(async () => (await box(note)).height).toBeGreaterThan(before + 40);
});

test('Add Checklist starts untitled with one blank item; the cursor is in the title, and Enter moves it to the item', async ({ page }) => {
  await add(page, 'Checklist');
  const list = cards(page).first();
  await expect(list).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(list.getByLabel('List title')).toHaveValue('');
  await expect(list.getByLabel('Item text')).toHaveCount(1);
  await expect(list.getByLabel('List title')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(list.getByLabel('Item text')).toBeFocused();
  await page.keyboard.type('Buy milk');
  await list.getByLabel('Done').click();
  await expect(list.locator('.card-meta')).toHaveText(''); // no "1/1 done" (owner request)
  await expect(list.getByLabel('Item text')).toHaveValue('Buy milk');
});

test('Link card opens the address in a new tab', async ({ page }) => {
  // The toolbar no longer adds links (owner request, 2026-10-05); boards can still hold them.
  const link = await importLinkCard(page, 'Inspiration', 'https://example.org');
  await expect(link).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  const open = link.locator('.link-open');
  await link.getByLabel('Link address').fill('');
  await expect(open).toHaveText('Open link');
  await expect(open).not.toHaveAttribute('href');
  await link.getByLabel('Link address').fill('www.example.com/ideas');
  await expect(open).toHaveText('Open example.com');
  await expect(open).toHaveAttribute('href', 'https://www.example.com/ideas');
  await expect(open).toHaveAttribute('target', '_blank');
});

test('new cards and columns never appear on top of existing blocks', async ({ page }) => {
  for (const kind of ['Note', 'Checklist', 'Note', 'New column', 'Note', 'New column'] as const) {
    await clickEmpty(page); // nothing selected, so every card goes loose on the board
    await add(page, kind);
  }
  const blocks = page.locator('.card.loose, [data-col-id]');
  await expect(blocks).toHaveCount(6);
  const rects = await Promise.all((await blocks.all()).map(box));
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlapping(rects[i], rects[j])).toBe(false);
});

test('adding with a column selected puts the card at the end; with a card in a column, directly below it', async ({ page }) => {
  await add(page, 'New column');
  const col = columns(page).first();
  await expect(col).toHaveClass(/selected/);
  await expect(col.getByLabel('Column title')).toHaveValue('');
  await expect(col.locator('.column-empty')).toHaveText('Drop cards here');

  await add(page, 'Note'); // column selected → end of column
  await col.locator('[data-card-id]').first().getByLabel('Note text').fill('first');
  await col.click({ position: { x: 200, y: 26 } }); // select the column again
  await add(page, 'Note');
  await col.locator('[data-card-id]').nth(1).getByLabel('Note text').fill('last');

  // Select the first card, then add: it goes directly below the first card.
  await col.locator('[data-card-id]').first().click({ position: { x: 30, y: 18 } });
  await add(page, 'Checklist');
  await expect(col.locator('[data-card-id]')).toHaveCount(3);
  await expect(col.locator('[data-card-id]').nth(1)).toHaveAttribute('data-kind', 'todo');
  await expect(col.locator('.column-count')).toHaveText('3');
  await expect(looseCards(page)).toHaveCount(0);
});

test('drag a loose card into a column at the pointer, then out again', async ({ page }) => {
  await add(page, 'New column');
  const col = columns(page).first();
  await add(page, 'Note');
  await col.locator('[data-card-id]').first().getByLabel('Note text').fill('top');
  await col.click({ position: { x: 200, y: 26 } });
  await add(page, 'Note');
  await col.locator('[data-card-id]').nth(1).getByLabel('Note text').fill('bottom');

  await clickEmpty(page);
  await add(page, 'Checklist');
  const list = looseCards(page).first();

  // Drop it between the two notes.
  const top = await box(col.locator('[data-card-id]').first());
  await dragTo(page, list, { x: top.x + 60, y: top.y + top.height + 2 });
  await expect(looseCards(page)).toHaveCount(0);
  await expect(col.locator('[data-card-id]').nth(1)).toHaveAttribute('data-kind', 'todo');

  // Drag it back out onto empty board.
  const moved = col.locator('[data-card-id]').nth(1);
  const target = await emptySpot(page);
  await dragTo(page, moved, { x: target.x + 300, y: target.y - 150 });
  await expect(col.locator('[data-card-id]')).toHaveCount(2);
  await expect(looseCards(page)).toHaveCount(1);
  await expect(looseCards(page).first()).toHaveAttribute('data-kind', 'todo');
});

test('dropping a card on a collapsed column opens it', async ({ page }) => {
  await add(page, 'New column');
  const col = columns(page).first();
  await col.getByRole('button', { name: 'Collapse column' }).click();
  await expect(col).toHaveClass(/collapsed/);
  await clickEmpty(page);
  await add(page, 'Note');
  const colBox = await box(col);
  await dragTo(page, looseCards(page).first(), { x: colBox.x + 100, y: colBox.y + 20 });
  await expect(col).not.toHaveClass(/collapsed/);
  await expect(col.locator('[data-card-id]')).toHaveCount(1);
});

test('a small nudge only selects; a real drag moves the block and lands on the grid', async ({ page }) => {
  await add(page, 'Note');
  const note = looseCards(page).first();
  const start = await note.evaluate((el) => [el.style.left, el.style.top]);
  await clickEmpty(page);

  const g = await grabPoint(note);
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  await page.mouse.move(g.x + 3, g.y + 2);
  await page.mouse.up();
  await expect(note).toHaveClass(/selected/);
  expect(await note.evaluate((el) => [el.style.left, el.style.top])).toEqual(start);

  // During a drag the block shows the dragging style.
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  await page.mouse.move(g.x + 137, g.y + 93, { steps: 10 });
  await expect(looseCards(page).first()).toHaveClass(/dragging/);
  await page.mouse.up();
  await expect(looseCards(page).first()).not.toHaveClass(/dragging/);

  const [left, top] = await note.evaluate((el) => [parseFloat(el.style.left), parseFloat(el.style.top)]);
  expect(left).not.toBe(parseFloat(start[0]));
  expect(left % 20).toBe(0);
  expect(top % 20).toBe(0);
});

test('dragging a column moves its cards with it', async ({ page }) => {
  await add(page, 'New column');
  const col = columns(page).first();
  await add(page, 'Note');
  const before = await box(col);
  const g = await grabPoint(col);
  await dragTo(page, col, { x: g.x + 200, y: g.y + 100 });
  const after = await box(col);
  expect(after.x - before.x).toBeGreaterThan(150);
  expect(after.y - before.y).toBeGreaterThan(60);
  await expect(col.locator('[data-card-id]')).toHaveCount(1);
});

test('collapse: a note shows its first line; a column hides its cards', async ({ page }) => {
  await add(page, 'New column');
  const col = columns(page).first();
  await add(page, 'Note');
  const note = col.locator('[data-card-id]').first();
  await note.getByLabel('Note text').fill('Shopping ideas\nmore detail');
  await note.getByRole('button', { name: 'Collapse card' }).click();
  await expect(note.locator('.card-meta')).toHaveText('Shopping ideas');
  await expect(note.getByLabel('Note text')).toHaveCount(0);
  await note.getByRole('button', { name: 'Expand card' }).click();
  await expect(note.getByLabel('Note text')).toHaveValue('Shopping ideas\nmore detail');

  await col.getByRole('button', { name: 'Collapse column' }).click();
  await expect(col.locator('[data-card-id]')).toHaveCount(0);
  await expect(col.locator('.column-count')).toHaveText('1');
  await col.getByRole('button', { name: 'Expand column' }).click();
  await expect(col.locator('[data-card-id]')).toHaveCount(1);
});

test("Colour is faded with nothing selected; it colours a card's title band (card stays white) and a column", async ({ page }) => {
  const colour = page.getByRole('button', { name: 'Colour of selected cards and columns' });
  await expect(colour).toHaveAttribute('aria-disabled', 'true');
  await colour.click({ force: true }); // clicking the faded button does nothing
  await expect(page.getByRole('group', { name: 'Colours' })).toHaveCount(0);

  // A selected card: Colour tints its title band; the card stays white, text stays black.
  await add(page, 'Checklist');
  const list = cards(page).first();
  const header = list.locator('.card-header');
  const usual = await header.evaluate((el) => getComputedStyle(el).backgroundColor);
  await expect(colour).not.toHaveAttribute('aria-disabled');
  await colour.click();
  const menu = page.getByRole('group', { name: 'Colours' });
  await menu.getByRole('button', { name: 'Rose' }).click();
  await expect(header).not.toHaveCSS('background-color', usual);
  await expect(list).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(list.getByLabel('Item text')).toHaveCSS('color', 'rgb(31, 29, 26)');
  // Default puts the usual band back (the menu stays open after picking).
  await menu.getByRole('button', { name: 'Default' }).click();
  await expect(header).toHaveCSS('background-color', usual);

  // A note has no title: a colour tints its header strip.
  await clickEmpty(page);
  await add(page, 'Note');
  const note = page.locator('.card.selected');
  await expect(note.locator('.card-header')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await colour.click();
  await menu.getByRole('button', { name: 'Sky' }).click();
  await expect(note.locator('.card-header')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await clickEmpty(page);

  await add(page, 'New column');
  const col = columns(page).first();
  await expect(col).toHaveCSS('background-color', 'rgb(239, 236, 230)');
  await expect(colour).not.toHaveAttribute('aria-disabled');
  await colour.click();
  await expect(menu.locator('.swatch')).toHaveCount(16);
  await menu.getByRole('button', { name: 'Teal' }).click();
  await expect(col).toHaveCSS('background-color', 'rgb(224, 242, 241)');
});

test('card trash can deletes it; column trash can asks first, then deletes the column and its cards', async ({ page }) => {
  await add(page, 'Note');
  await cards(page).first().getByRole('button', { name: 'Delete card' }).click();
  await expect(cards(page)).toHaveCount(0);

  await add(page, 'New column');
  const col = columns(page).first();
  await col.getByLabel('Column title').fill('Ideas');
  await add(page, 'Note');
  await col.click({ position: { x: 240, y: 26 } });
  await add(page, 'Note');

  await col.getByRole('button', { name: 'Delete column and its cards' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete “Ideas” and its 2 cards?');
  await dialog.getByRole('button', { name: 'Keep column' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(columns(page)).toHaveCount(1);

  await col.getByRole('button', { name: 'Delete column and its cards' }).click();
  await expect(dialog.getByRole('button', { name: 'Delete column' })).toHaveCSS('background-color', 'rgb(163, 38, 63)');
  await dialog.getByRole('button', { name: 'Delete column' }).click();
  await expect(columns(page)).toHaveCount(0);
  await expect(cards(page)).toHaveCount(0);
});

test('clicking empty space or pressing Escape clears the selection', async ({ page }) => {
  await add(page, 'Note');
  const note = cards(page).first();
  await expect(note).toHaveClass(/selected/);
  await clickEmpty(page);
  await expect(note).not.toHaveClass(/selected/);
  await note.click({ position: { x: 30, y: 18 } });
  await expect(note).toHaveClass(/selected/);
  await page.keyboard.press('Escape');
  await expect(note).not.toHaveClass(/selected/);
});

test('Auto-colour gives every column its own colour, and can be undone', async ({ page }) => {
  const auto = page.getByRole('button', { name: 'Auto-colour' });
  await expect(auto).toHaveAttribute('aria-disabled', 'true');
  for (let i = 0; i < 3; i++) {
    await add(page, 'New column');
    await clickEmpty(page);
  }
  await expect(auto).not.toHaveAttribute('aria-disabled');
  await auto.click();
  const bgs = await columns(page).evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  expect(new Set(bgs).size).toBe(3);
  expect(bgs).not.toContain('rgb(239, 236, 230)');
  await page.keyboard.press('Control+z');
  for (const c of await columns(page).all()) await expect(c).toHaveCSS('background-color', 'rgb(239, 236, 230)');
});

test('everything is kept after reload', async ({ page }) => {
  await add(page, 'New column');
  const col = columns(page).first();
  await col.getByLabel('Column title').fill('This week');
  await add(page, 'Checklist');
  await page.keyboard.press('Enter'); // from the new list's title to its first item
  await page.keyboard.type('Pack bags');
  await clickEmpty(page);
  await col.click({ position: { x: 200, y: 26 } });
  await page.getByRole('button', { name: 'Colour of selected cards and columns' }).click();
  await page.getByRole('group', { name: 'Colours' }).getByRole('button', { name: 'Rose' }).click();
  await clickEmpty(page);
  await add(page, 'Note');
  await looseCards(page).first().getByLabel('Note text').fill('Loose thought');
  const notePos = await boardPos(looseCards(page).first());
  const noteSize = await box(looseCards(page).first());

  await page.reload();

  await expect(columns(page).first().getByLabel('Column title')).toHaveValue('This week');
  await expect(columns(page).first().getByLabel('Item text')).toHaveValue('Pack bags');
  const note = looseCards(page).first();
  await expect(note.getByLabel('Note text')).toHaveValue('Loose thought');
  await expect(columns(page).first()).toHaveCSS('background-color', 'rgb(252, 231, 236)');
  // Same spot on the board and same size (the screen opens centred on the board, so not the same screen spot).
  expect(await boardPos(note)).toEqual(notePos);
  const size = await box(note);
  expect([size.width, size.height]).toEqual([noteSize.width, noteSize.height]);
});
