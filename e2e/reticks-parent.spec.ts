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
