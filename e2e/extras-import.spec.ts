import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { add, box, cards, expectNoOverlaps, freshBoardEachTest, looseCards } from './helpers';

freshBoardEachTest();

const sample = fileURLToPath(new URL('./fixtures/milanote-sample.md', import.meta.url));

async function importSample(page: import('@playwright/test').Page) {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('header.toolbar').getByRole('button', { name: 'Import', exact: true }).click();
  await (await chooser).setFiles(sample);
}

test('importing a Milanote export adds its cards to the board, selected and not overlapping', async ({ page }) => {
  await add(page, 'Note');
  await cards(page).first().getByLabel('Note text').fill('Already here');
  await importSample(page);

  await expect(cards(page)).toHaveCount(8);
  await expect(page.getByLabel('Note text').first()).toHaveValue('Already here');
  await expect(page.locator('.card.selected')).toHaveCount(7);

  // Titles, items, nesting, ticks, notes and links come across.
  const titles = page.getByLabel('List title');
  await expect(titles).toHaveCount(5);
  await expect(titles.nth(0)).toHaveValue('Follow Up');
  await expect(titles.nth(1)).toHaveValue('Groceries');
  const groceries = cards(page).filter({ has: page.locator('input[value="Groceries"]') });
  await expect(groceries.getByText('Completed · 1')).toBeVisible();
  await expect(groceries.locator('textarea')).toHaveCount(5);
  await expect(page.getByLabel('Note text').nth(1)).toHaveValue(/^Dear \[Name\],\n\nThis is important/);
  await expect(page.getByLabel('Link title')).toHaveValue('Reading');

  await page.waitForTimeout(300);
  await expectNoOverlaps(page);

  // Imported cards sit in lanes, left to right from the top.
  const first = await box(looseCards(page).nth(1));
  const second = await box(looseCards(page).nth(2));
  expect(Math.abs(first.y - second.y)).toBeLessThan(2);
  expect(second.x).toBeGreaterThan(first.x + first.width);
});

test('one undo removes the whole import, and it is saved', async ({ page }) => {
  await importSample(page);
  await expect(cards(page)).toHaveCount(7);
  await page.reload();
  await expect(cards(page)).toHaveCount(7);
  await page.keyboard.press('Control+z');
  await expect(cards(page)).toHaveCount(7); // undo history doesn't survive a reload
  await importSample(page);
  await expect(cards(page)).toHaveCount(14);
  await page.keyboard.press('Control+z');
  await expect(cards(page)).toHaveCount(7);
});
