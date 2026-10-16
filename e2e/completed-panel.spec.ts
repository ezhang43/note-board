import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, cards, clickEmpty, columns, freshBoardEachTest } from './helpers';

// Completed panel (Job #51, owner OK 2026-10-15): the board's Completed card is no longer drawn on
// the board. Its contents show in a Completed panel, opened by a round button next to Due (a line in
// the ⋯ sheet on a phone), in the right-hand side panel spot.

freshBoardEachTest();

const cleanUpButton = (page: Page) => page.locator('header.toolbar').getByRole('button', { name: 'Clean up', exact: true });
const completedButton = (page: Page) => page.locator('.corner-controls').getByRole('button', { name: 'Completed', exact: true });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Completed' });
const texts = (list: Locator) => list.getByLabel('Item text').evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));

async function makeList(page: Page, title: string, items: string[]) {
  await clickEmpty(page);
  await add(page, 'Checklist');
  const id = await page.locator('.card.selected').getAttribute('data-card-id');
  const list = page.locator(`[data-card-id="${id}"]`);
  await list.getByLabel('List title').fill(title);
  await list.getByLabel('Item text').first().click();
  for (const [i, t] of items.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  return list;
}

const tick = (list: Locator, text: string) =>
  list.locator('[data-item-id]').filter({ has: list.page().locator(`textarea:text-is("${text}")`) }).first().getByLabel('Done').click();

test('Clean up fills the Completed panel, not the board; unticking there sends an item back, one undo step', async ({ page }) => {
  const groceries = await makeList(page, 'Groceries', ['bread', 'milk', 'eggs']);
  await tick(groceries, 'milk');
  await cleanUpButton(page).click();
  expect(await texts(groceries)).toEqual(['bread', 'eggs']);

  // Nothing new on the board, and the panel stays shut until asked for.
  await expect(cards(page)).toHaveCount(1);
  await expect(page.locator('.completed-card-body')).toHaveCount(0);
  await expect(panel(page)).toHaveCount(0);

  // The round button next to Due opens it; it shares the side panel spot.
  const due = page.locator('.corner-controls .due-button');
  await expect(due.locator('xpath=following-sibling::button[1]')).toHaveAccessibleName('Completed');
  await completedButton(page).click();
  await expect(completedButton(page)).toHaveAttribute('aria-pressed', 'true');
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  await expect(panel(page).locator('.completed-date')).toHaveText([today]);
  await expect(panel(page).locator('.completed-text')).toHaveText(['milk']);
  await expect(panel(page).locator('.completed-from')).toHaveText(['Groceries']);

  // Untick: back to Groceries.
  await panel(page).getByLabel('Send "milk" back to Groceries').click();
  expect(await texts(groceries)).toEqual(['bread', 'eggs', 'milk']);
  await expect(panel(page).getByText('Nothing cleaned up yet')).toBeVisible();

  // One undo step brings it back into the panel.
  await page.keyboard.press('Control+z');
  expect(await texts(groceries)).toEqual(['bread', 'eggs']);
  await expect(panel(page).locator('.completed-text')).toHaveText(['milk']);

  // Survives a reload.
  await page.reload();
  await completedButton(page).click();
  await expect(panel(page).locator('.completed-text')).toHaveText(['milk']);
  await expect(cards(page)).toHaveCount(1);

  // Opening another panel closes it; × closes it.
  await page.locator('.corner-controls').getByRole('button', { name: 'Focus timer' }).click();
  await expect(panel(page)).toHaveCount(0);
  await completedButton(page).click();
  await panel(page).getByRole('button', { name: 'Close completed' }).click();
  await expect(panel(page)).toHaveCount(0);
});

test('sub-items show under their item, and the newest day comes first', async ({ page }) => {
  const list = await makeList(page, 'Trip', ['pack']);
  await page.keyboard.press('Enter');
  await page.keyboard.type('socks');
  await page.keyboard.press('Tab');
  await tick(list, 'pack');
  await cleanUpButton(page).click();
  await completedButton(page).click();
  await expect(panel(page).locator('.completed-text')).toHaveText(['pack', 'socks']);
  await expect(panel(page).locator('.completed-from')).toHaveText(['Trip']);
});

test('Find points at the Completed button while the panel is shut, and marks the text when it is open', async ({ page }) => {
  const list = await makeList(page, 'Shop', ['milk', 'bread']);
  await tick(list, 'milk');
  await cleanUpButton(page).click();
  await page.keyboard.press('Control+f');
  await page.getByRole('searchbox', { name: 'Search the board' }).fill('milk');
  const status = page.getByRole('search').getByRole('status');
  await expect(status).toHaveText('1 of 1 · in Completed');
  await expect(completedButton(page)).toHaveClass(/find-target/);

  await completedButton(page).click();
  await expect(status).toHaveText('1 of 1');
  await expect(panel(page).locator('mark[data-current]')).toHaveText('milk');
});

test('a Completed card saved in a column (an older board) is not drawn and not counted', async ({ page }) => {
  const list = await makeList(page, 'Shop', ['milk', 'bread']);
  await tick(list, 'milk');
  await cleanUpButton(page).click();
  await clickEmpty(page);
  await add(page, 'New column');
  await page.keyboard.type('Later');
  await clickEmpty(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('note-board:v1') ?? '')).toContain('"Later"');

  // Move the saved Completed card into the column, as an older board could have it.
  const saved = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('note-board:v1')!);
    const walk = (o: unknown): void => {
      if (!o || typeof o !== 'object') return;
      const b = o as { cards?: Record<string, { kind: string }>; columns?: Record<string, { cardIds: string[] }>; order?: string[] };
      if (b.cards && b.columns && Array.isArray(b.order)) {
        const done = Object.keys(b.cards).find((id) => b.cards![id].kind === 'completed')!;
        const col = Object.keys(b.columns)[0];
        b.order = b.order.filter((id) => id !== done);
        b.columns[col].cardIds.push(done);
        return;
      }
      Object.values(o).forEach(walk);
    };
    walk(data);
    return JSON.stringify(data);
  });
  await page.addInitScript((raw) => localStorage.setItem('note-board:v1', raw), saved);
  await page.reload();

  const col = columns(page).first();
  await expect(col.locator('[data-card-id]')).toHaveCount(0);
  await expect(col.getByText('Drop cards here')).toBeVisible();
  await completedButton(page).click();
  await expect(panel(page).locator('.completed-text')).toHaveText(['milk']);

  // A card dropped into the column still lands there.
  await clickEmpty(page);
  await add(page, 'Note');
  const note = page.locator('.card.selected');
  await page.keyboard.press('Escape');
  const target = await col.boundingBox();
  const from = await note.boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + 8);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + 60, { steps: 8 });
  await page.mouse.up();
  await expect(col.locator('[data-card-id]')).toHaveCount(1);
});

test.describe('on a phone-sized screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('Completed is a line in the ⋯ sheet and the panel fills the screen', async ({ page }) => {
    const more = () => page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true });
    await more().tap();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Completed', exact: true }).tap();
    await expect(panel(page)).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'More' })).toHaveCount(0);
    const box = await panel(page).boundingBox();
    expect(box!.width).toBeGreaterThan(380);
    await expect(panel(page).getByText('Nothing cleaned up yet')).toBeVisible();
  });
});
