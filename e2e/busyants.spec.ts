import { expect, test } from '@playwright/test';
import { add, clickEmpty, columns, freshBoardEachTest } from './helpers';

// BusyAnts: the agreed features from the 2026-10-03 owner interview.

freshBoardEachTest();

test('the app is called BusyAnts', async ({ page }) => {
  await expect(page).toHaveTitle('BusyAnts');
});

test('an empty board shows a hint, which goes once anything is on the board', async ({ page }) => {
  const hint = page.getByText('Add a note, a to-do list or a column from the toolbar, or drag one onto the board');
  await expect(hint).toBeVisible();
  await add(page, 'Note');
  await expect(hint).toHaveCount(0);
});

test('new lists and columns start untitled; a new list takes the cursor in its title, and Enter moves to its first item', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'To-do list', { stayInTitle: true });
  const list = page.locator('.card.selected');
  await expect(list.getByLabel('List title')).toHaveValue('');
  await expect(list.getByLabel('List title')).toHaveAttribute('placeholder', 'List title');
  await page.keyboard.type('Groceries');
  await page.keyboard.press('Enter');
  await page.keyboard.type('milk');
  await expect(list.getByLabel('List title')).toHaveValue('Groceries');
  await expect(list.getByLabel('Item text').first()).toHaveValue('milk');

  await clickEmpty(page);
  await add(page, 'New column');
  const title = columns(page).first().getByLabel('Column title');
  await expect(title).toHaveValue('');
  await expect(title).toHaveAttribute('placeholder', 'Column title');
});

const css = (l: import('@playwright/test').Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test('A+ / A− change the text size on cards and columns (not the toolbar), and it is remembered', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'To-do list');
  await page.keyboard.type('milk');
  const item = page.getByLabel('Item text').first();
  const before = parseFloat(await css(item, 'font-size'));
  const toolbarBefore = await css(page.getByLabel('Board name'), 'font-size');
  await page.getByRole('button', { name: 'Larger text' }).click();
  await expect.poll(async () => parseFloat(await css(item, 'font-size'))).toBeGreaterThan(before);
  expect(await css(page.getByLabel('Board name'), 'font-size')).toBe(toolbarBefore);
  await page.reload();
  await expect.poll(async () => parseFloat(await css(page.getByLabel('Item text').first(), 'font-size'))).toBeGreaterThan(before);
  // Down to the smallest size, where A− fades.
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Smaller text' }).click(); // Large → Normal → Small
  await expect(page.getByRole('button', { name: 'Smaller text' })).toHaveAttribute('aria-disabled', 'true');
});

test('the Hand tool shows a glove over empty board, and the normal arrow over cards', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  const canvas = page.getByTestId('canvas');
  expect(await css(canvas, 'cursor')).toContain('url(');
  expect(await css(page.locator('.card').first(), 'cursor')).toBe('default');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('v'); // Select tool
  expect(await css(canvas, 'cursor')).toBe('default');
});

test('Same width makes the selected blocks as wide as the first one selected', async ({ page }) => {
  const sameWidth = page.locator('header.toolbar').getByRole('button', { name: 'Same width' });
  await expect(sameWidth).toHaveAttribute('aria-disabled', 'true');
  await clickEmpty(page);
  await add(page, 'New column');
  await page.keyboard.press('Escape');
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  const note = page.locator('.card.loose').first();
  const col = columns(page).first();
  await note.click({ position: { x: 30, y: 10 } });
  await col.click({ position: { x: 20, y: 20 }, modifiers: ['Control'] });
  await expect(sameWidth).not.toHaveAttribute('aria-disabled', 'true');
  await sameWidth.click();
  await expect.poll(async () => (await col.boundingBox())!.width).toBeCloseTo((await note.boundingBox())!.width, 0);
});

test('dragging a card near another shows an alignment guide', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  const [first, second] = [page.locator('.card.loose').nth(0), page.locator('.card.loose').nth(1)];
  const a = (await first.boundingBox())!;
  const b = (await second.boundingBox())!;
  // Grab the second note and bring its left edge to 3px right of the first's, well below it.
  await page.mouse.move(b.x + 30, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(a.x + 3 + 30, a.y + a.height + 200 + 10, { steps: 10 });
  await expect(page.locator('.align-guide').first()).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.align-guide')).toHaveCount(0);
  expect(Math.round((await second.boundingBox())!.x)).toBe(Math.round(a.x));
});

const panOf = async (page: import('@playwright/test').Page) => {
  const c = page.getByTestId('canvas');
  return { x: Number(await c.getAttribute('data-pan-x')), y: Number(await c.getAttribute('data-pan-y')) };
};

test('dragging a card to the edge of the screen keeps moving the board', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  const card = (await page.locator('.card.loose').first().boundingBox())!;
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  const start = await panOf(page);
  await page.mouse.move(card.x + 30, card.y + 10);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width - 4, card.y + 10, { steps: 10 });
  await expect.poll(async () => (await panOf(page)).x).toBeLessThan(start.x - 50);
  await page.mouse.up();
});

test('a selection box at the bottom edge keeps moving the board and selecting', async ({ page }) => {
  await page.getByRole('button', { name: 'Select (V)' }).click();
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  const start = await panOf(page);
  await page.mouse.move(canvas.x + 40, canvas.y + 40);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 300, canvas.y + canvas.height - 3, { steps: 10 });
  await expect.poll(async () => (await panOf(page)).y).toBeLessThan(start.y - 50);
  // The box still starts where it was first pressed on the board, so it has grown taller than the screen.
  await expect.poll(async () => (await page.getByTestId('marquee').boundingBox())?.height ?? 0).toBeGreaterThan(canvas.height - 80);
  await page.mouse.up();
});
