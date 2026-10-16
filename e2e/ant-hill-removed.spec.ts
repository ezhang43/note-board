import { expect, test, type Page } from '@playwright/test';
import { add, arrange, clickEmpty, freshBoardEachTest } from './helpers';

freshBoardEachTest();

// Owner request (2026-10-06): the ant hill is gone. No hill on the board, before or after Clean up,
// and Clean up still moves ticked items into Completed as before (now a panel, Job #51).

// The toolbar's Clean up, in the Arrange menu (opened first).
const cleanUpButton = async (page: Page) => (await arrange(page)).getByRole('button', { name: 'Clean up', exact: true });
const anyHill = (page: Page) => page.locator('.ant-hill, .hill-ant, .hill-caption');

test('there is no ant hill on the board, and Clean up still fills the Completed panel', async ({ page }) => {
  await expect(page.getByTestId('canvas')).toBeVisible();
  await expect(anyHill(page)).toHaveCount(0);
  await expect(page.getByText(/Hill 1 · /)).toHaveCount(0);

  await clickEmpty(page);
  await add(page, 'Checklist');
  const id = await page.locator('.card.selected').getAttribute('data-card-id');
  const list = page.locator(`[data-card-id="${id}"]`);
  await list.getByLabel('Item text').first().click();
  await page.keyboard.type('milk');
  await list.getByLabel('Done').first().click();
  await (await cleanUpButton(page)).click();

  await page.locator('.corner-controls').getByRole('button', { name: 'Completed', exact: true }).click();
  const done = page.getByRole('complementary', { name: 'Completed' });
  await expect(done.locator('.completed-text')).toHaveText(['milk']);
  await expect(anyHill(page)).toHaveCount(0);
  await expect(page.getByRole('img', { name: /hill/i })).toHaveCount(0);
});
