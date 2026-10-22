import { expect, test, type Page } from '@playwright/test';
import { add, box, cards, fontsLoaded } from './helpers';

// Interface review 181 C-M1 and C-M2 (job 182): keys pressed while focus is in a toolbar menu, the
// Share panel, the ⋯ menu or the Undo message never act on the board behind them (Delete, the arrows,
// the tool keys), and Escape in the format bar never closes a side panel behind it.

const toolbar = (page: Page) => page.locator('header.toolbar');

async function start(page: Page, search = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${search}`);
  await fontsLoaded(page);
  return errors;
}

/** A note, selected (Escape leaves its text box with the note still selected). */
async function selectedNote(page: Page) {
  await add(page, 'Note');
  await page.keyboard.type('keep me');
  await page.keyboard.press('Escape');
  await expect(page.locator('.card.selected')).toHaveCount(1);
}

/** Presses the board keys that used to leak through, then checks the note is unmoved, undeleted and still selected. */
async function pressBoardKeys(page: Page, keys = ['ArrowDown', 'ArrowDown', 'ArrowUp', 'Delete', 'Backspace', 'Control+d', 'v']) {
  const before = await box(page.locator('[data-card-id]').first());
  for (const key of keys) await page.keyboard.press(key);
  await expect(cards(page)).toHaveCount(1);
  const after = await box(page.locator('[data-card-id]').first());
  expect(after.y).toBe(before.y);
  expect(after.x).toBe(before.x);
  await expect(page.locator('.card.selected')).toHaveCount(1);
  await expect(page.getByTestId('canvas')).toHaveClass(/tool-hand/); // V would switch to the Select tool
}

test('keys on an item in the File menu leave the selected note alone', async ({ page }) => {
  await start(page);
  await selectedNote(page);
  await toolbar(page).getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menu', { name: 'File' }).getByRole('menuitem').first().focus();
  await pressBoardKeys(page);
});

test('keys on an item in the Boards menu leave the selected note alone', async ({ page }) => {
  await start(page);
  await selectedNote(page);
  await toolbar(page).getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'New board' }).focus();
  await pressBoardKeys(page);
});

test('keys on Snap to grid in the Arrange menu leave the selected note alone', async ({ page }) => {
  await start(page);
  await selectedNote(page);
  await toolbar(page).getByRole('button', { name: 'Arrange', exact: true }).click();
  await page.getByRole('group', { name: 'Arrange' }).getByRole('button', { name: /Snap to grid/ }).focus();
  await pressBoardKeys(page);
});

test('keys on Snap to grid in the ⋯ menu leave the selected note alone (a narrow window)', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await start(page);
  await selectedNote(page);
  await toolbar(page).getByRole('button', { name: 'More', exact: true }).click();
  const more = page.getByRole('dialog', { name: 'More' });
  await more.getByRole('button', { name: 'Arrange', exact: true }).click();
  await more.getByRole('button', { name: /Snap to grid/ }).focus();
  await pressBoardKeys(page);
});

test('keys in the Share panel and its role menu leave the selected note alone, and arrows still move through the menu', async ({ page }) => {
  await start(page, `?demo-user=Menu${Math.random().toString(36).slice(2, 8)}`);
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'New board' }).click();
  await selectedNote(page);
  await toolbar(page).getByRole('button', { name: 'Share', exact: true }).click();
  const panel = page.getByRole('dialog', { name: /Share/ });
  await panel.getByRole('button', { name: 'Share this board' }).click();
  await expect(panel.getByLabel('Share link')).toHaveValue(/\?join=/);

  await panel.getByRole('button', { name: 'Copy link' }).focus();
  await pressBoardKeys(page);

  await panel.getByRole('button', { name: /^Link role:/ }).click();
  const menu = panel.getByRole('menu', { name: /^Link role/ });
  await expect(menu.getByRole('menuitemradio').first()).toBeVisible();
  await menu.getByRole('menuitemradio').first().focus();
  await pressBoardKeys(page, ['ArrowDown', 'ArrowDown', 'ArrowUp']);
  await expect(menu.getByRole('menuitemradio').nth(1)).toBeFocused();
  // Escape closes the menu only: the note stays selected.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.locator('.card.selected')).toHaveCount(1);
});

test('Delete on the Undo message leaves the selected note alone', async ({ page }) => {
  await start(page);
  await selectedNote(page);
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Delete'); // deletes the second (selected) note and shows the Undo message
  const undo = page.locator('.undo-toast').getByRole('button', { name: 'Undo' });
  await expect(undo).toBeVisible();
  await expect(cards(page)).toHaveCount(1);
  // Select the first note again, then put the keyboard on the Undo button.
  await page.locator('[data-card-id]').first().click({ position: { x: 4, y: 4 } });
  await expect(page.locator('.card.selected')).toHaveCount(1);
  await undo.focus();
  await page.keyboard.press('Delete');
  await expect(cards(page)).toHaveCount(1);
});

test('Delete works on the note again once the menu is closed', async ({ page }) => {
  await start(page);
  await selectedNote(page);
  await toolbar(page).getByRole('button', { name: 'File', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.locator('[data-card-id]').first().click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Delete');
  await expect(cards(page)).toHaveCount(0);
});

for (const name of ['Focus timer', 'Version history']) {
  test(`Escape in the format bar goes back to the text and does not close ${name}`, async ({ page }) => {
    await start(page);
    await add(page, 'Note');
    await page.keyboard.type('hello world');
    await page.locator('.corner-controls').getByRole('button', { name, exact: true }).click();
    const panel = page.getByRole('complementary', { name });
    await expect(panel).toBeVisible();
    await page.getByLabel('Note text').focus();
    await page.keyboard.press('Control+a');
    const bar = page.getByRole('toolbar', { name: 'Text format' });
    await page.keyboard.press('Alt+F10');
    await expect(bar.getByRole('button', { name: 'Bold' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Note text')).toBeFocused();
    await expect(panel).toBeVisible();
  });
}
