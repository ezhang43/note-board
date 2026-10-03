import { expect, test } from '@playwright/test';
import { add, cards, clickEmpty, columns, dragTo, freshBoardEachTest } from './helpers';

// Design fixes from the 2026-10-02 Impeccable review.

freshBoardEachTest();

test('typing straight after adding a note, link or column goes into it', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'To-do list');
  await page.keyboard.type('first item');

  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.type('Water the plants');
  await expect(page.getByLabel('Note text')).toHaveValue('Water the plants');
  await expect(page.getByLabel('Item text').first()).toHaveValue('first item');

  await clickEmpty(page);
  await add(page, 'Link');
  await page.keyboard.type('Recipes');
  await expect(page.getByLabel('Link title')).toHaveValue('Recipes');

  await clickEmpty(page);
  await add(page, 'New column');
  await page.keyboard.type('Ideas');
  await expect(page.getByLabel('Column title')).toHaveValue('Ideas');
  await expect(cards(page)).toHaveCount(3);
  await expect(columns(page)).toHaveCount(1);
});

const toolbarButton = (page: import('@playwright/test').Page, name: string) => page.locator('header.toolbar').getByRole('button', { name, exact: true });
const style = (l: import('@playwright/test').Locator, prop: string, pseudo?: string) =>
  l.evaluate((el, [p, ps]) => getComputedStyle(el, ps ?? null).getPropertyValue(p as string), [prop, pseudo] as const);

test('the dark-mode button looks pressed while dark mode is on, like Snap to grid', async ({ page }) => {
  const moon = toolbarButton(page, 'Dark mode');
  const snap = toolbarButton(page, 'Snap to grid');
  await expect(snap).toHaveAttribute('aria-pressed', 'true');
  const off = await style(moon, 'background-color');
  await moon.click();
  await page.mouse.move(0, 400); // not hovering
  const on = await style(moon, 'background-color');
  expect(on).not.toBe(off);
  expect(on).toBe(await style(snap, 'background-color'));
});

test('placeholder text is dark enough to read (light and dark mode)', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  const note = page.getByLabel('Note text');
  expect(await style(note, 'color', '::placeholder')).toBe('rgb(115, 108, 98)');
  await toolbarButton(page, 'Dark mode').click();
  expect(await style(note, 'color', '::placeholder')).toBe('rgb(163, 157, 147)');
});

test('faded toolbar buttons are a little stronger in dark mode', async ({ page }) => {
  const colour = page.getByRole('button', { name: 'Colour of selected cards and columns' });
  expect(await style(colour, 'opacity')).toBe('0.45');
  await toolbarButton(page, 'Dark mode').click();
  expect(await style(colour, 'opacity')).toBe('0.55');
});

test('cards in an uncoloured column use the usual teal title band', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'To-do list');
  const loose = page.locator('.card.loose').first();
  const looseBand = await style(loose, '--band');
  await clickEmpty(page);
  await add(page, 'New column');
  await add(page, 'To-do list');
  const inColumn = columns(page).first().locator('.card').first();
  expect(await style(inColumn, '--band')).toBe(looseBand);
});

test('Add Note / To-do list / Link are plain buttons (cards are always white); New column stays teal', async ({ page }) => {
  const plain = await style(toolbarButton(page, 'Undo (Ctrl+Z)'), 'background-color');
  for (const name of ['Note', 'To-do list', 'Link']) {
    const b = toolbarButton(page, name);
    expect(await style(b, 'background-color')).toBe(plain);
    await expect(b.locator('.add-dot')).toHaveCount(0);
  }
  expect(await style(toolbarButton(page, 'New column'), 'background-color')).not.toBe(plain);
});

test('the toolbar is grouped by dividers, and rarely used buttons are quiet until hovered', async ({ page }) => {
  await expect(page.locator('header.toolbar .toolbar-divider')).toHaveCount(3);
  const importButton = toolbarButton(page, 'Import');
  expect(await style(importButton, 'border-top-color')).toBe('rgba(0, 0, 0, 0)');
  await importButton.hover();
  expect(await style(importButton, 'border-top-color')).not.toBe('rgba(0, 0, 0, 0)');
});

test('the board name keeps at least 140px in a narrower window', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 800 });
  await page.getByLabel('Board name').fill('My first board for the summer');
  const name = await page.locator('header.toolbar .board-name').boundingBox();
  expect(name!.width).toBeGreaterThanOrEqual(140);
});

test('collapse and × buttons on cards and columns say what they do when hovered', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  await expect(page.getByRole('button', { name: 'Collapse card' })).toHaveAttribute('title', 'Collapse card');
  await expect(page.getByRole('button', { name: 'Delete card' })).toHaveAttribute('title', 'Delete card (Ctrl+Z brings it back)');
  await clickEmpty(page);
  await add(page, 'New column');
  await expect(page.getByRole('button', { name: 'Collapse column' })).toHaveAttribute('title', 'Collapse column');
  await expect(page.getByRole('button', { name: 'Delete column and its cards' })).toHaveAttribute('title', 'Delete column and its cards');
});

test('the Colour menu names the swatch under the pointer, and rings each swatch in its own edge colour', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'New column');
  await page.getByRole('button', { name: 'Colour of selected cards and columns' }).click();
  const menu = page.locator('.colour-menu');
  const sky = menu.getByRole('button', { name: 'Sky' });
  await sky.hover();
  await expect(menu.locator('.swatch-name')).toHaveText('Sky');
  expect(await style(sky, 'border-top-width')).toBe('2px');
});

test('checklist text uses the width of the card; grip and trash appear over the row on hover', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'To-do list');
  await page.keyboard.type('Call the plumber about the leaking kitchen tap');
  const card = page.locator('.card.selected');
  const row = card.locator('[data-item-id]').first();
  const field = row.getByLabel('Item text');
  const cardWidth = (await card.boundingBox())!.width;
  expect((await field.boundingBox())!.width).toBeGreaterThan(cardWidth - 70);
  await row.hover();
  const trash = (await row.getByRole('button', { name: 'Delete item' }).boundingBox())!;
  const rowBox = (await row.boundingBox())!;
  expect(trash.x + trash.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
  await expect(row.getByRole('button', { name: 'Delete item' })).toBeVisible();
});

test('Enter in a checklist item works like a text editor (owner request)', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'To-do list');
  const list = page.locator('.card.selected');
  const values = () => list.getByLabel('Item text').evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));
  await page.keyboard.type('Buy milk and bread');
  // Middle: the rest moves to a new item below, cursor at its start.
  for (let i = 0; i < ' and bread'.length; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  expect(await values()).toEqual(['Buy milk', 'and bread']); // the space at the split is dropped
  // Start of an item: a blank item above; the cursor stays with the text.
  await page.keyboard.press('Enter');
  expect(await values()).toEqual(['Buy milk', '', 'and bread']);
  await page.keyboard.type('X ');
  expect(await values()).toEqual(['Buy milk', '', 'X and bread']);
  // End: a new item directly below.
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('last');
  expect(await values()).toEqual(['Buy milk', '', 'X and bread', 'last']);
});

test('a collapsed to-do list can be made taller from its corner; expanding it keeps its open height (owner request)', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'To-do list');
  await page.keyboard.type('one');
  const card = page.locator('.card.selected');
  const openHeight = (await card.boundingBox())!.height;
  await card.getByRole('button', { name: 'Collapse card' }).click();
  const collapsed = (await card.boundingBox())!;
  const corner = (await card.getByRole('button', { name: 'Resize card', exact: true }).boundingBox())!;
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + 40, corner.y + 120, { steps: 8 });
  await page.mouse.up();
  const taller = (await card.boundingBox())!;
  expect(taller.height).toBeGreaterThan(collapsed.height + 80);
  await card.getByRole('button', { name: 'Expand card' }).click();
  expect(Math.abs((await card.boundingBox())!.height - openHeight)).toBeLessThan(2);
  await card.getByRole('button', { name: 'Collapse card' }).click();
  expect(Math.abs((await card.boundingBox())!.height - taller.height)).toBeLessThan(2);
});

test('a long board name shrinks (with …) instead of pushing buttons off a 1280px toolbar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByLabel('Board name').fill('Kitchen and bathroom renovation plans for the whole summer of 2027');
  await clickEmpty(page);
  const toolbar = page.locator('header.toolbar');
  expect(await toolbar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const moon = (await toolbarButton(page, 'Dark mode').boundingBox())!;
  expect(moon.x + moon.width).toBeLessThanOrEqual(1280);
  expect((await page.locator('header.toolbar .board-name').boundingBox())!.width).toBeGreaterThanOrEqual(140);
  expect(await style(page.getByLabel('Board name'), 'text-overflow')).toBe('ellipsis');
});

test('"Open link" is faded until the link has an address', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Link');
  const open = page.locator('.link-open');
  expect(await style(open, 'opacity')).toBe('0.45');
  await page.getByLabel('Link address').fill('https://example.com');
  expect(await style(open, 'opacity')).toBe('1');
});

test('the fade behind a hovered item\'s grip and trash covers the text under them', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'To-do list');
  await page.keyboard.type('Call the plumber about the leaking kitchen tap');
  const row = page.locator('.card.selected [data-item-id]').first();
  await row.hover();
  await expect.poll(() => style(row, 'opacity', '::after')).toBe('1'); // after its short fade-in
  const fadeWidth = parseFloat(await style(row, 'width', '::after'));
  const trash = (await row.getByRole('button', { name: 'Delete item' }).boundingBox())!;
  const rowBox = (await row.boundingBox())!;
  // The fully covered part reaches past the trash can's left edge.
  expect(rowBox.x + rowBox.width - (fadeWidth - 24)).toBeLessThanOrEqual(trash.x);
});

test('the Colour menu has bigger swatches and never covers the block being coloured', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'New column');
  await page.keyboard.press('Escape');
  const col = columns(page).first();
  const button = (await page.getByRole('button', { name: 'Colour of selected cards and columns' }).boundingBox())!;
  // Put the column right under the Colour button, where the menu opens.
  await dragTo(page, col, { x: button.x + 200, y: button.y + button.height + 40 });
  await page.getByRole('button', { name: 'Colour of selected cards and columns' }).click();
  const menu = page.locator('.colour-menu');
  expect((await menu.getByRole('button', { name: 'Sky' }).boundingBox())!.width).toBeGreaterThanOrEqual(32);
  await expect.poll(async () => (await col.boundingBox())!.y).toBeGreaterThan((await menu.boundingBox())!.y + (await menu.boundingBox())!.height);
});

test('a keyboard shortcuts panel opens from the ? button or the ? key, and closes with Escape', async ({ page }) => {
  const panel = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(panel).toHaveCount(0);
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Ctrl+Z');
  await expect(panel).toContainText('Alt+arrows');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await clickEmpty(page);
  await page.keyboard.press('?');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toHaveCount(0);
  // Typing ? in a card is just text.
  await add(page, 'Note');
  await page.keyboard.type('Why?');
  await expect(page.getByLabel('Note text')).toHaveValue('Why?');
  await expect(panel).toHaveCount(0);
});
