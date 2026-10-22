import { expect, test, type Page } from '@playwright/test';
import { add, clickEmpty, columns, freshBoardEachTest, toggleDark } from './helpers';

// The app's new look, direction A "Honey Workshop" (owner decision, 2026-10-16): a calm cream
// toolbar with honey accents, Snap / Collapse all / Same width / Clean up in an Arrange menu,
// labelled panel buttons at the bottom right, plain white cards whose controls show on pointing.

freshBoardEachTest();

const toolbar = (page: Page) => page.locator('header.toolbar');

test('the toolbar adds Note, Checklist and Container; the arrange buttons live in the Arrange menu', async ({ page }) => {
  const bar = toolbar(page);
  await expect(bar.getByRole('button', { name: 'Note', exact: true })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Checklist', exact: true })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'New container', exact: true })).toHaveText('Container');
  for (const name of ['Snap to grid', 'Collapse all', 'Same width', 'Clean up']) await expect(bar.getByRole('button', { name, exact: true })).toHaveCount(0);

  const arrange = bar.getByRole('button', { name: 'Arrange', exact: true });
  await expect(arrange).toHaveAttribute('aria-expanded', 'false');
  await arrange.click();
  await expect(arrange).toHaveAttribute('aria-expanded', 'true');
  const menu = page.getByRole('group', { name: 'Arrange' });
  for (const name of ['Snap to grid', 'Collapse all', 'Same width', 'Clean up']) await expect(menu.getByRole('button', { name, exact: true })).toBeVisible();

  // Snap to grid still switches on and off, and the menu stays open to show it.
  const snap = menu.getByRole('button', { name: 'Snap to grid' });
  await expect(snap).toHaveAttribute('aria-pressed', 'true');
  await snap.click();
  await expect(snap).toHaveAttribute('aria-pressed', 'false');
  await expect(menu).toBeVisible();

  // A click on the board closes it.
  await clickEmpty(page);
  await expect(menu).toHaveCount(0);
});

test('Escape closes the Arrange and File menus and puts focus back on their button', async ({ page }) => {
  const bar = toolbar(page);
  for (const [name, inside] of [['Arrange', 'Snap to grid'], ['File', 'Download backup']] as const) {
    const toggle = bar.getByRole('button', { name, exact: true });
    await toggle.click();
    await bar.getByRole(name === 'File' ? 'menuitem' : 'button', { name: inside, exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  }
});

test('a button in the Arrange menu lights up when pointed at', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'New container');
  await toolbar(page).getByRole('button', { name: 'Arrange', exact: true }).click();
  const menu = page.getByRole('group', { name: 'Arrange' });
  const collapseAll = menu.getByRole('button', { name: 'Collapse all', exact: true });
  const before = await collapseAll.evaluate((el) => getComputedStyle(el).backgroundColor);
  await collapseAll.hover();
  await expect.poll(() => collapseAll.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(before);
});

test('a list shows Clean up and Uncheck all only while its Completed row is open', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Checklist');
  await page.keyboard.type('Pack');
  const list = page.locator('.card.selected');
  await list.getByRole('checkbox').first().check();
  const toggle = list.getByRole('button', { name: 'Completed' });
  // A new list starts with the row open, so its buttons show.
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(list.getByRole('button', { name: 'Clean up' })).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(list.getByRole('button', { name: 'Clean up' })).toHaveCount(0);
  await expect(list.getByRole('button', { name: 'Uncheck all' })).toHaveCount(0);

  await toggle.click();
  await expect(list.getByRole('button', { name: 'Clean up' })).toBeVisible();
  await list.getByRole('button', { name: 'Uncheck all' }).click();
  await expect(list.getByRole('checkbox').first()).not.toBeChecked();
});

test("a card's and a container's buttons show only while pointing at it, or while it is selected", async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  await clickEmpty(page);
  const note = page.locator('[data-kind="note"]');
  const trash = note.getByRole('button', { name: 'Delete card' });
  const collapse = note.getByRole('button', { name: 'Collapse card' });
  await page.mouse.move(5, 500);
  await expect(trash).toHaveCSS('opacity', '0');
  await expect(collapse).toHaveCSS('opacity', '0');

  await note.hover();
  await expect(trash).toHaveCSS('opacity', '1');
  await expect(collapse).toHaveCSS('opacity', '1');

  await note.locator('.card-header').click();
  await page.mouse.move(5, 500);
  await expect(note).toHaveClass(/selected/);
  await expect(trash).toHaveCSS('opacity', '1');

  await clickEmpty(page);
  await add(page, 'New container');
  await clickEmpty(page);
  const col = columns(page).first();
  const colTrash = col.getByRole('button', { name: 'Delete container and its cards' });
  await page.mouse.move(5, 500);
  await expect(colTrash).toHaveCSS('opacity', '0');
  await col.hover();
  await expect(colTrash).toHaveCSS('opacity', '1');
});

test('cards have no title band: white with a bold title, and Color tints the header lightly', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Checklist', { stayInTitle: true });
  await page.keyboard.type('Trip');
  const list = page.locator('.card.selected');
  const header = list.locator('.card-header');
  const title = list.getByLabel('List title');
  await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(title).toHaveCSS('font-weight', '600');

  await toolbar(page).getByRole('button', { name: 'Color of selected cards and containers' }).click();
  await page.getByRole('group', { name: 'Colors' }).getByRole('button', { name: 'Tomato' }).click();
  // A light tint: 60% of the colour on white (rgb 255, 186, 174, as the browser writes a mixed colour), with the usual dark text.
  await expect(header).toHaveCSS('background-color', 'color(srgb 1 0.729412 0.682353)');
  await expect(title).toHaveCSS('color', 'rgb(31, 29, 26)');
  await expect(list).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('the panel buttons at the bottom right are labelled; the ? and zoom stay', async ({ page }) => {
  const dock = page.locator('.corner-controls');
  for (const [name, text] of [
    ['Search', 'Search'],
    ['Completed', 'Completed'],
    ['Version history', 'History'],
    ['Focus timer', 'Timer'],
    ['Journal', 'Journal'],
  ])
    await expect(dock.getByRole('button', { name, exact: true })).toHaveText(text);
  await expect(dock.getByRole('button', { name: 'Keyboard shortcuts' })).toBeVisible();
  await expect(dock.getByRole('group', { name: 'Zoom' })).toBeVisible();
  await expect(dock.getByRole('group', { name: 'Text size' })).toBeVisible();
});

test('the Honey Workshop colours, light and dark', async ({ page }) => {
  await expect(toolbar(page)).toHaveCSS('background-color', 'rgb(255, 253, 248)');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(248, 245, 238)');
  // The Share button's colour (honey) is the theme's own.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--honey').trim().toLowerCase())).toBe('#f2b62b');
  await toggleDark(page);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(27, 26, 23)');
  await expect(toolbar(page)).toHaveCSS('background-color', 'rgb(36, 34, 30)');
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  // Job 113: on a phone the buttons show on the selected card only (there is no pointer to hover with).
  test("a card's buttons are shown while it is selected, and hidden once it is not", async ({ page }) => {
    await page.getByRole('button', { name: 'Add' }).tap();
    await page.getByRole('menuitem', { name: 'Note' }).tap();
    const note = page.locator('[data-kind="note"]');
    await expect(note.getByRole('button', { name: 'Delete card' })).toHaveCSS('opacity', '1');
    await clickEmpty(page);
    await expect(note.locator('button[aria-label="Delete card"]')).toBeHidden();
  });
});
