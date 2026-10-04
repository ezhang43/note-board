import { expect, test, type Page } from '@playwright/test';
import { add, cards, freshBoardEachTest } from './helpers';

// Due dates on checklist items, and the Due today / Overdue panel (owner request, 2026-10-05).

freshBoardEachTest();

/** The browser's own today, plus `n` days, as YYYY-MM-DD. */
const day = (page: Page, n = 0) =>
  page.evaluate((n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, n);

async function listWith(page: Page, text: string) {
  await add(page, 'To-do list');
  const card = cards(page).first();
  await card.getByLabel('Item text').first().fill(text);
  return card;
}

const picker = (page: Page) => page.getByRole('dialog', { name: 'Due date' });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Due' });

test('Due date → Today puts a "Today" chip on the item, and the Due panel lists it until it is ticked', async ({ page }) => {
  const card = await listWith(page, 'Pay rent');
  const row = card.locator('[data-item-id]').first();
  await row.hover();
  await row.getByRole('button', { name: 'Due date' }).click();
  await picker(page).getByRole('button', { name: 'Today' }).click();
  await expect(picker(page)).toHaveCount(0);
  await expect(row.getByRole('button', { name: /^Due Today/ })).toBeVisible();

  await page.getByRole('button', { name: /^Due today and overdue/ }).click();
  await expect(panel(page).getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: /Pay rent/ })).toBeVisible();

  await row.getByRole('checkbox', { name: 'Done' }).check();
  await expect(panel(page).getByRole('button', { name: /Pay rent/ })).toHaveCount(0);
  await expect(panel(page)).toContainText('Nothing is due today');
});

test('a date picked in the calendar box: yesterday shows as overdue; No due date clears it', async ({ page }) => {
  const card = await listWith(page, 'Call the bank');
  const row = card.locator('[data-item-id]').first();
  await row.hover();
  await row.getByRole('button', { name: 'Due date' }).click();
  await picker(page).getByLabel('Pick a day').fill(await day(page, -1));
  await expect(row.getByRole('button', { name: /^Due Yesterday/ })).toHaveClass(/overdue/);

  await page.getByRole('button', { name: /^Due today and overdue/ }).click();
  await expect(panel(page).getByRole('heading', { name: 'Overdue' })).toBeVisible();

  await row.getByRole('button', { name: /^Due Yesterday/ }).click();
  await picker(page).getByRole('button', { name: 'No due date' }).click();
  await expect(row.locator('.due-chip')).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Due date' })).toHaveCount(1);
});

test('clicking an item in the Due panel opens the board it is on', async ({ page }) => {
  await page.getByLabel('Board name').fill('Home');
  const card = await listWith(page, 'Renew passport');
  const row = card.locator('[data-item-id]').first();
  await row.hover();
  await row.getByRole('button', { name: 'Due date' }).click();
  await picker(page).getByRole('button', { name: 'Today' }).click();

  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New board' }).click();
  await page.getByLabel('Board name').fill('Elsewhere');

  await page.getByRole('button', { name: /^Due today and overdue/ }).click();
  await panel(page).getByRole('button', { name: /Renew passport/ }).click();
  await expect(page.getByLabel('Board name')).toHaveValue('Home');
  await expect(cards(page).first().getByLabel('Item text').first()).toBeFocused();
});

test('if the item vanishes while its date menu is open (Ctrl+Z), the menu goes and Escape still closes the Due list', async ({ page }) => {
  const card = await listWith(page, 'First');
  await card.getByLabel('Item text').first().press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second');
  await page.getByRole('button', { name: /^Due today and overdue/ }).click();
  const row = card.locator('[data-item-id]').nth(1);
  await row.hover();
  await row.getByRole('button', { name: 'Due date' }).click();
  await expect(picker(page)).toBeVisible();
  while ((await card.locator('[data-item-id]').count()) > 1) await page.keyboard.press('Control+z');
  await expect(picker(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
});
