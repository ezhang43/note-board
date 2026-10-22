import { expect, test } from '@playwright/test';
import { add, appearance, arrange, cards, clickEmpty, columns, dragTo, freshBoardEachTest, importLinkCard, toggleDark } from './helpers';

// Design fixes from the 2026-10-02 Impeccable review.

freshBoardEachTest();

test('typing straight after adding a note, to-do list or column goes into it', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Checklist');
  await page.keyboard.type('first item');

  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.type('Water the plants');
  await expect(page.getByLabel('Note text')).toHaveValue('Water the plants');
  await expect(page.getByLabel('Item text').first()).toHaveValue('first item');

  await clickEmpty(page);
  await add(page, 'New container');
  await page.keyboard.type('Ideas');
  await expect(page.getByLabel('Container title')).toHaveValue('Ideas');
  await expect(cards(page)).toHaveCount(2);
  await expect(columns(page)).toHaveCount(1);
});

const toolbarButton = (page: import('@playwright/test').Page, name: string) => page.locator('header.toolbar').getByRole('button', { name, exact: true });
const style = (l: import('@playwright/test').Locator, prop: string, pseudo?: string) =>
  l.evaluate((el, [p, ps]) => getComputedStyle(el, ps ?? null).getPropertyValue(p as string), [prop, pseudo] as const);

test('the Dark mode switch in the Appearance menu reads as on while dark mode is on (a switch, like the phone menu)', async ({ page }) => {
  const menu = await appearance(page);
  const dark = menu.getByRole('button', { name: 'Dark mode' });
  expect(await style(dark, 'width', '::after')).toBe('40px');
  const off = await style(dark, 'background-color', '::after');
  await dark.click();
  await page.mouse.move(0, 400); // not hovering
  await expect(dark).toHaveAttribute('aria-pressed', 'true');
  expect(await style(dark, 'background-color', '::after')).not.toBe(off);
});

test('placeholder text is dark enough to read (light and dark mode)', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  const note = page.getByLabel('Note text');
  expect(await style(note, 'color', '::placeholder')).toBe('rgb(115, 108, 98)');
  await toggleDark(page);
  expect(await style(note, 'color', '::placeholder')).toBe('rgb(163, 157, 147)');
});

test('faded toolbar buttons are a little stronger in dark mode', async ({ page }) => {
  await arrange(page);
  const faded = page.getByRole('button', { name: 'Same width' }); // faded while fewer than two blocks are selected
  expect(await style(faded, 'opacity')).toBe('0.45');
  await toggleDark(page);
  await arrange(page); // the click on Appearance closed it
  expect(await style(faded, 'opacity')).toBe('0.55');
});

test('cards have no title band, loose or in an uncolored column (Honey Workshop, 2026-10-16)', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Checklist');
  const loose = page.locator('.card.loose').first();
  await expect(loose.locator('.card-header')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await clickEmpty(page);
  await add(page, 'New container');
  await add(page, 'Checklist');
  const inColumn = columns(page).first().locator('.card').first();
  await expect(inColumn.locator('.card-header')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

test('Add Note, Checklist and Container look alike: outlined, each with its icon (Honey Workshop, 2026-10-16)', async ({ page }) => {
  const look = await style(toolbarButton(page, 'Note'), 'background-color');
  for (const name of ['Note', 'Checklist', 'New container']) {
    const b = toolbarButton(page, name);
    expect(await style(b, 'background-color')).toBe(look);
    await expect(b.locator('svg')).toHaveCount(1);
    await expect(b.locator('.add-dot')).toHaveCount(0);
  }
});

test('the toolbar is grouped by dividers, and rarely used buttons are quiet until hovered', async ({ page }) => {
  await expect(page.locator('header.toolbar .toolbar-divider')).toHaveCount(3);
  const importButton = toolbarButton(page, 'File');
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

test('collapse and delete buttons on cards and columns say what they do when hovered', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  await expect(page.getByRole('button', { name: 'Collapse card' })).toHaveAttribute('title', 'Collapse card');
  await expect(page.getByRole('button', { name: 'Delete card' })).toHaveAttribute('title', 'Delete card (Ctrl+Z brings it back)');
  await clickEmpty(page);
  await add(page, 'New container');
  await expect(page.getByRole('button', { name: 'Collapse container' })).toHaveAttribute('title', 'Collapse container');
  await expect(page.getByRole('button', { name: 'Delete container and its cards' })).toHaveAttribute('title', 'Delete container and its cards');
});

test('the Color menu names the swatch under the pointer, and rings each swatch in its own edge color', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'New container');
  await page.getByRole('button', { name: 'Color of selected cards and containers' }).click();
  const menu = page.locator('.colour-menu');
  const sky = menu.getByRole('button', { name: 'Sky' });
  await sky.hover();
  await expect(menu.locator('.swatch-name')).toHaveText('Sky');
  expect(await style(sky, 'border-top-width')).toBe('2px');
});

test('checklist text stops before the grip and trash, so hovering never covers it (owner request)', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Checklist');
  await page.keyboard.type('Call the plumber about the leaking kitchen tap');
  const card = page.locator('.card.selected');
  const row = card.locator('[data-item-id]').first();
  const field = row.getByLabel('Item text');
  const before = (await field.boundingBox())!;
  // The strip kept free holds the arrows, trash and grip (92px); the rest (71px) is the card's own padding.
  expect(before.width).toBeGreaterThan((await card.boundingBox())!.width - 163);
  await row.hover();
  const trash = row.getByRole('button', { name: 'Delete item' });
  await expect(trash).toBeVisible();
  const after = (await field.boundingBox())!;
  expect(after.width).toBe(before.width); // the text doesn't re-wrap on hover
  const t = (await trash.boundingBox())!;
  const g = (await row.getByRole('button', { name: 'Drag item' }).boundingBox())!;
  const rowBox = (await row.boundingBox())!;
  expect(after.x + after.width).toBeLessThanOrEqual(t.x);
  expect(after.x + after.width).toBeLessThanOrEqual(g.x);
  expect(g.x + g.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
});

test('Enter in a checklist item works like a text editor (owner request)', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Checklist');
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
  await add(page, 'Checklist');
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
  const moon = (await toolbarButton(page, 'Appearance').boundingBox())!;
  expect(moon.x + moon.width).toBeLessThanOrEqual(1280);
  expect((await page.locator('header.toolbar .board-name').boundingBox())!.width).toBeGreaterThanOrEqual(140);
  expect(await style(page.getByLabel('Board name'), 'text-overflow')).toBe('ellipsis');
});

test('"Open link" is faded until the link has an address', async ({ page }) => {
  await importLinkCard(page);
  const open = page.locator('.link-open');
  await page.getByLabel('Link address').fill('');
  expect(await style(open, 'opacity')).toBe('0.45');
  await page.getByLabel('Link address').fill('https://example.com');
  expect(await style(open, 'opacity')).toBe('1');
});

test('the Color menu has bigger swatches and never covers the block being colored', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'New container');
  await page.keyboard.press('Escape');
  const col = columns(page).first();
  const button = (await page.getByRole('button', { name: 'Color of selected cards and containers' }).boundingBox())!;
  // Put the column right under the Color button, where the menu opens.
  await dragTo(page, col, { x: button.x + 200, y: button.y + button.height + 40 });
  await page.getByRole('button', { name: 'Color of selected cards and containers' }).click();
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

test('card and column delete buttons show the same trash can as checklist items, and still delete or ask', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Checklist');
  await page.keyboard.type('first item');
  const trash = await page.locator('.item-trash svg').first().innerHTML();
  const card = cards(page).first();
  expect(await card.getByRole('button', { name: 'Delete card' }).locator('svg').innerHTML()).toBe(trash);
  const faint = await page.locator('.item-trash').first().evaluate((el) => getComputedStyle(el).color);
  await expect(card.getByRole('button', { name: 'Delete card' })).toHaveCSS('color', faint);

  await clickEmpty(page);
  await add(page, 'New container');
  const col = columns(page).first();
  const colDelete = col.getByRole('button', { name: 'Delete container and its cards' });
  expect(await colDelete.locator('svg').innerHTML()).toBe(trash);
  await expect(colDelete).toHaveCSS('color', faint);

  await colDelete.click(); // empty: it goes without asking, with Undo (owner, 2026-10-22)
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(columns(page)).toHaveCount(0);

  await card.getByRole('button', { name: 'Delete card' }).click();
  await expect(cards(page)).toHaveCount(0);
});
