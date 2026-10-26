import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, box, clickEmpty, fontsLoaded, freshBoardEachTest } from './helpers';

// Owner requests, 2026-10-05 (second batch): Sign out no longer cut off, "Checklist" instead of
// "To-do list", and Clean up on each list (in its title row since job 200). (Its Miro-style arrows were removed, owner 2026-10-16.)

freshBoardEachTest();

const toolbar = (page: Page) => page.locator('header.toolbar');

/** Every toolbar button fits in the window, Sign out included (`?signed-in` shows it locally). */
async function expectToolbarFits(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  expect(await toolbar(page).evaluate((el) => el.scrollWidth <= el.clientWidth), `toolbar fits at ${width}px`).toBe(true);
  const out = await box(toolbar(page).getByRole('button', { name: 'Sign out' }));
  expect(out.x + out.width, `Sign out fits at ${width}px`).toBeLessThanOrEqual(width);
}

test('Sign out is never cut off at the right of the toolbar, also inside a sub-board', async ({ page }) => {
  // A demo person too, so Feedback and Share show as they do for the owner.
  await page.goto(`/?signed-in&demo-user=Fit${Math.random().toString(36).slice(2, 8)}`);
  await fontsLoaded(page);
  await expect(toolbar(page).getByRole('button', { name: 'Feedback', exact: true })).toBeVisible();
  for (const width of [1280, 1366, 1440, 1536, 1920]) await expectToolbarFits(page, width);

  // Inside a sub-board the path to it shows too.
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'Add a sub-board here' }).click();
  await page.locator('[data-kind="board"]').getByRole('button', { name: /open/i }).click();
  await expect(page.getByRole('navigation', { name: 'Boards above this one' })).toBeVisible();
  for (const width of [1280, 1440]) await expectToolbarFits(page, width);
});

test('lists are called Checklist: the toolbar button, the card name and the empty-board hint', async ({ page }) => {
  await expect(page.getByText('Add a note, a checklist or a container from the toolbar, or drag one onto the board. Press ? for keyboard shortcuts.')).toBeVisible();
  await expect(toolbar(page).getByRole('button', { name: 'To-do list' })).toHaveCount(0);
  await add(page, 'Checklist', { stayInTitle: true });
  await page.keyboard.type('Groceries');
  await expect(page.getByRole('article', { name: 'Checklist: Groceries' })).toHaveCount(1);
});

/** A checklist with the given items, the first `ticked` of them ticked. */
async function checklist(page: Page, title: string, items: string[], ticked: number) {
  await clickEmpty(page);
  await add(page, 'Checklist', { stayInTitle: true });
  const list = page.locator(`[data-card-id="${await page.locator('.card.selected').getAttribute('data-card-id')}"]`);
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
  for (const [i, t] of items.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  for (let i = 0; i < ticked; i++) await list.getByRole('checkbox', { name: 'Done', checked: false }).first().click();
  return list;
}

const texts = (list: Locator) => list.getByLabel('Item text').evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));

test('Clean up in a list’s title row moves only that list’s ticked items into the Completed panel', async ({ page }) => {
  const groceries = await checklist(page, 'Food', ['bread', 'milk', 'eggs'], 2);
  const chores = await checklist(page, 'Chores', ['sweep', 'dust'], 1);
  const cleanUp = groceries.getByRole('button', { name: 'Clean up', exact: true });
  await expect(cleanUp).toBeVisible();
  // In the title row (job 200), on the same line as the collapse arrow, just left of it.
  await groceries.hover();
  const c = await box(cleanUp);
  const u = await box(groceries.getByRole('button', { name: 'Collapse card' }));
  expect(Math.abs(c.y + c.height / 2 - (u.y + u.height / 2))).toBeLessThan(2);
  expect(c.x + c.width).toBeLessThanOrEqual(u.x + 1);

  await cleanUp.click();
  expect(await texts(groceries)).toEqual(['eggs']);
  await expect(groceries.getByRole('button', { name: 'Clean up', exact: true })).toHaveCount(0);
  expect(await texts(chores)).toEqual(['sweep', 'dust']);
  await page.locator('.corner-controls').getByRole('button', { name: 'Completed', exact: true }).click();
  const done = page.getByRole('complementary', { name: 'Completed' });
  await expect(done.locator('.completed-text')).toHaveText(['bread', 'milk']);

  // One Ctrl+Z puts it back.
  await clickEmpty(page);
  await page.keyboard.press('Control+z');
  expect(await texts(groceries)).toEqual(['bread', 'milk', 'eggs']);
});
