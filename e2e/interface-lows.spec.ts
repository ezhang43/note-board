import { expect, test, type Page } from '@playwright/test';
import { add, arrange, cards, fontsLoaded, freshBoardEachTest } from './helpers';

// Interface review 181 C, the small findings (job 182): arrow keys in the File and Boards menus (C-L1),
// focus after Undo (C-L2), a board card's count (C-L3), focus back after the Share and Feedback panels
// close (C-L4) and three small screen-reader names (C-L11).

freshBoardEachTest();

const toolbar = (page: Page) => page.locator('header.toolbar');

test('C-L1: ↓ ↑ Home End move through the File and Boards menus, wrapping round', async ({ page }) => {
  await toolbar(page).getByRole('button', { name: 'File', exact: true }).click();
  const file = page.getByRole('menu', { name: 'File' });
  const items = file.getByRole('menuitem');
  await items.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('ArrowUp'); // wraps to the last
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Escape');

  await toolbar(page).getByRole('button', { name: 'Boards', exact: true }).click();
  const boards = page.getByRole('menu', { name: 'Boards' });
  const rows = boards.getByRole('menuitem');
  await rows.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(rows.last()).toBeFocused();
});

test('C-L2: Undo on the Undo message, pressed from the keyboard, moves focus to Redo (not lost to the top of the page)', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Delete');
  const undo = page.locator('.undo-toast').getByRole('button', { name: 'Undo' });
  await undo.focus();
  await page.keyboard.press('Enter');
  await expect(cards(page)).toHaveCount(1);
  await expect(page.locator('.undo-toast')).toHaveCount(0);
  await expect(toolbar(page).getByRole('button', { name: /^Redo/ })).toBeFocused();
});

test('C-L3: a board card counts the cards you can see, not the hidden Completed record', async ({ page }) => {
  await toolbar(page).getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'Add a sub-board here' }).click();
  await cards(page).first().getByRole('button', { name: 'Open board' }).click();
  await add(page, 'Checklist');
  await page.keyboard.type('milk');
  await page.locator('[data-card-id] input[type="checkbox"]').first().check();
  await (await arrange(page)).getByRole('button', { name: 'Clean up', exact: true }).click();
  await expect(cards(page)).toHaveCount(1);
  await page.getByRole('button', { name: /^Back to/ }).click();
  await expect(cards(page).first().locator('.board-card-count')).toHaveText('1 card');
});

test('C-L4: Escape and × in the Share panel give focus back to the Share button', async ({ page }) => {
  await page.goto(`/?demo-user=Focus${Math.random().toString(36).slice(2, 8)}`);
  await fontsLoaded(page);
  const share = toolbar(page).getByRole('button', { name: 'Share', exact: true });
  await share.click();
  const panel = page.getByRole('dialog', { name: /Share/ });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Close' }).focus();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(share).toBeFocused();
  await share.click();
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toHaveCount(0);
  await expect(share).toBeFocused();
});

test('C-L4: closing Send feedback gives focus back to the Feedback button', async ({ page }) => {
  await page.goto(`/?demo-user=Focus${Math.random().toString(36).slice(2, 8)}`);
  await fontsLoaded(page);
  const button = toolbar(page).getByRole('button', { name: 'Feedback', exact: true });
  await button.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Send feedback' });
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(button).toBeFocused();
});

test('C-L11: the card count, the zoom button and the item grip say what they are to a screen reader', async ({ page }) => {
  await add(page, 'New container');
  await expect(page.locator('.column-count')).toHaveAttribute('role', 'img');
  await expect(page.getByRole('button', { name: /^Reset zoom \(\d+%\)$/ })).toBeVisible();
  await add(page, 'Checklist');
  await expect(page.locator('.item-grip').first()).toHaveAttribute('tabindex', '-1');
});
