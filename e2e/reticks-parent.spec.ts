import { expect, test } from '@playwright/test';
import { add, clickEmpty, freshBoardEachTest } from './helpers';

// Owner request 2026-11-10 ("yes re-tick"): a ticked parent unticks when a blank sub-item is added under
// it; when that blank sub-item is removed with Backspace, the parent is ticked again, in one undo step.

freshBoardEachTest();

test('Backspace on a blank sub-item re-ticks the parent; one Ctrl+Z brings back both', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Checklist', { stayInTitle: true });
  const list = page.locator(`[data-card-id="${await page.locator('.card.selected').getAttribute('data-card-id')}"]`);
  await page.keyboard.type('Packing');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Trip');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Passport');
  await page.keyboard.press('Tab'); // Passport nests under Trip
  await page.keyboard.press('Control+Enter'); // the last sub-item ticks: Trip ticks too
  await expect(list.getByRole('checkbox', { name: 'Done: Trip' })).toBeChecked();
  await expect(list.getByRole('checkbox', { name: 'Done: Passport' })).toBeChecked();

  await page.keyboard.press('End');
  await page.keyboard.press('Enter'); // a blank sub-item: Trip unticks
  await expect(list.getByRole('checkbox', { name: 'Done: Trip' })).not.toBeChecked();

  await page.keyboard.press('Backspace'); // the blank item goes: Trip ticks again
  await expect(list.getByLabel('Item text')).toHaveCount(2);
  await expect(list.getByRole('checkbox', { name: 'Done: Trip' })).toBeChecked();
  await expect(list.getByRole('checkbox', { name: 'Done: Passport' })).toBeChecked();

  await page.keyboard.press('Control+z'); // one step: the blank item and the unticked parent are back
  await expect(list.getByLabel('Item text')).toHaveCount(3);
  await expect(list.getByRole('checkbox', { name: 'Done: Trip' })).not.toBeChecked();
  await expect(list.getByRole('checkbox', { name: 'Done: Passport' })).toBeChecked();
});

// Owner request 2026-11-22: Shift+Tab on that new sub-item (it moves out beside the parent) re-ticks the
// parent too, as deleting it would, in the same undo step as the move.
test('Shift+Tab on a new sub-item re-ticks the parent; one Ctrl+Z puts it back under', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Checklist', { stayInTitle: true });
  const list = page.locator(`[data-card-id="${await page.locator('.card.selected').getAttribute('data-card-id')}"]`);
  await page.keyboard.type('Packing');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Trip');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Passport');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Control+Enter'); // Passport and Trip tick
  await expect(list.getByRole('checkbox', { name: 'Done: Trip' })).toBeChecked();

  await page.keyboard.press('End');
  await page.keyboard.press('Enter'); // a new sub-item: Trip unticks
  await expect(list.getByRole('checkbox', { name: 'Done: Trip' })).not.toBeChecked();

  await page.keyboard.press('Shift+Tab'); // the new item moves out beside Trip: Trip ticks again
  await expect(list.getByLabel('Item text')).toHaveCount(3);
  await expect(list.getByRole('checkbox', { name: 'Done: Trip' })).toBeChecked();
  await expect(list.getByRole('checkbox', { name: 'Done: Passport' })).toBeChecked();
  await expect(list.getByLabel('Item text').nth(2)).toBeFocused();

  await page.keyboard.press('Control+z'); // one step: back under Trip, Trip open
  await expect(list.getByLabel('Item text')).toHaveCount(3);
  await expect(list.getByRole('checkbox', { name: 'Done: Trip' })).not.toBeChecked();
});
