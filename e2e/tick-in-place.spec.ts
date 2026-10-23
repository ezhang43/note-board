import { expect, test, type Page } from '@playwright/test';
import { freshBoardEachTest } from './helpers';

// Ticked items stay in place (owner request, 2026-10-23, job 200): a ticked item is struck through and
// faded where it is, with no Completed section in the list and no Uncheck all. The list's Clean up sits
// in the card's title row while something in it is ticked, and sends the ticked items to the Completed panel.

freshBoardEachTest();

/** One list with these items (true = ticked), saved the way an older version saved it. */
async function seed(page: Page, items: [string, boolean][], completedOpen = true) {
  await page.evaluate(
    ({ items, completedOpen }) => {
      const board = {
        name: 'T',
        snap: true,
        cards: {
          t1: {
            id: 't1', kind: 'todo', color: null, collapsed: false, h: null, x: 100, y: 100, w: 260, title: 'Groceries', completedOpen,
            items: items.map(([text, done], i) => ({ id: `i${i}`, text, done, children: [] })),
          },
        },
        columns: {},
        order: ['t1'],
      };
      localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board }));
    },
    { items, completedOpen },
  );
  await page.reload();
}

const list = (page: Page) => page.locator('[data-card-id="t1"]');
const texts = (page: Page) => list(page).getByLabel('Item text').evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));
const row = (page: Page, text: string) => list(page).locator('[data-item-id]').filter({ has: page.locator(`textarea:text-is("${text}")`) });
const cleanUp = (page: Page) => list(page).locator('.card-header').getByRole('button', { name: 'Clean up', exact: true });

test('ticking an item in the middle leaves it where it is, struck through and faded', async ({ page }) => {
  await seed(page, [['Milk', false], ['Bread', false], ['Eggs', false]]);
  await row(page, 'Bread').getByLabel('Done').click();
  await expect(row(page, 'Bread').getByLabel('Done')).toBeChecked();
  expect(await texts(page)).toEqual(['Milk', 'Bread', 'Eggs']);
  const bread = row(page, 'Bread').getByLabel('Item text');
  await expect(bread).toHaveCSS('text-decoration-line', 'line-through');
  const milkColor = await row(page, 'Milk').getByLabel('Item text').evaluate((el) => getComputedStyle(el).color);
  expect(await bread.evaluate((el) => getComputedStyle(el).color)).not.toBe(milkColor);
  await expect(list(page).locator('.completed')).toHaveCount(0);
  await expect(list(page).getByRole('button', { name: 'Uncheck all' })).toHaveCount(0);
  // Unticking leaves it in place too.
  await row(page, 'Bread').getByLabel('Done').click();
  expect(await texts(page)).toEqual(['Milk', 'Bread', 'Eggs']);
});

test('the title row shows Clean up only while something is ticked; it sends the ticked items to the Completed panel', async ({ page }) => {
  await seed(page, [['Milk', false], ['Bread', false], ['Eggs', false]]);
  await expect(cleanUp(page)).toHaveCount(0);
  await row(page, 'Bread').getByLabel('Done').click();
  await expect(cleanUp(page)).toBeVisible();
  // Left of the collapse arrow and the trash can.
  const cu = (await cleanUp(page).boundingBox())!;
  const collapse = (await list(page).getByRole('button', { name: 'Collapse card' }).boundingBox())!;
  expect(cu.x + cu.width).toBeLessThanOrEqual(collapse.x + 0.5);
  await cleanUp(page).click();
  expect(await texts(page)).toEqual(['Milk', 'Eggs']);
  await expect(cleanUp(page)).toHaveCount(0);
  await page.locator('.corner-controls').getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Completed' }).getByText('Bread')).toBeVisible();
  // One undo step brings it back, ticked, where it was.
  await page.keyboard.press('Control+z');
  expect(await texts(page)).toEqual(['Milk', 'Bread', 'Eggs']);
  await expect(row(page, 'Bread').getByLabel('Done')).toBeChecked();
});

test('a board saved with a closed Completed section still loads, its ticked items shown in place', async ({ page }) => {
  await seed(page, [['Milk', false], ['Eggs', true], ['Tea', true]], false);
  expect(await texts(page)).toEqual(['Milk', 'Eggs', 'Tea']);
  await expect(row(page, 'Eggs').getByLabel('Done')).toBeChecked();
  await expect(cleanUp(page)).toBeVisible();
});
