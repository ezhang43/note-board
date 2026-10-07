import { expect, test, type Page } from '@playwright/test';
import { add, box, cards, clickEmpty, freshBoardEachTest, grabPoint } from './helpers';

// Fixes from the 2026-10-02 code review.

freshBoardEachTest();

async function makeList(page: Page, texts: string[]) {
  await clickEmpty(page);
  await add(page, 'Checklist');
  const id = await page.locator('.card.selected').getAttribute('data-card-id');
  for (const [i, t] of texts.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  return page.locator(`[data-card-id="${id}"]`);
}

test('Ctrl+A with some checklist items selected steps up the ladder; after Escape it selects the blocks', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  const list = await makeList(page, ['one', 'two', 'three']);
  await clickEmpty(page);
  const rows = list.locator('[data-item-id]');
  const from = await box(rows.nth(0).getByLabel('Item text'));
  const to = await box(rows.nth(1).getByLabel('Item text'));
  await page.mouse.move(from.x + 20, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 20, to.y + to.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(list.locator('.todo-item.picked')).toHaveCount(2);
  await page.keyboard.press('Control+a'); // the whole list
  await expect(list.locator('.todo-item.picked')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(list.locator('.todo-item.picked')).toHaveCount(0);
  await clickEmpty(page);
  await page.keyboard.press('Control+a'); // no items selected: the blocks
  await page.keyboard.press('Delete');
  await expect(cards(page)).toHaveCount(0);
});

test('pressing Delete while dragging a card does nothing, and the drop still works', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  const card = cards(page).first();
  const start = await box(card);
  const g = await grabPoint(card);
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  await page.mouse.move(g.x + 200, g.y, { steps: 6 });
  await page.keyboard.press('Delete');
  await page.mouse.move(g.x + 300, g.y, { steps: 6 });
  await page.mouse.up();
  await expect(cards(page)).toHaveCount(1);
  expect((await box(card)).x).toBeGreaterThan(start.x + 200);
});

test.describe('with motion allowed', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('Clean up straight after ticking still takes the ticked item', async ({ page }) => {
    const list = await makeList(page, ['first', 'second']);
    // The clock stands still, so the tick is surely still on its way when Clean up is clicked.
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 60_000);
    await list.locator('[data-item-id]').first().getByLabel('Done').click();
    await expect(list.locator('.todo-item.leaving')).toHaveCount(1);
    await page.locator('header.toolbar').getByRole('button', { name: 'Clean up' }).click();
    await expect(list.getByLabel('Item text')).toHaveCount(1);
    await expect(page.locator('.card', { hasText: 'Completed' }).getByText('first')).toBeVisible();
  });
});

test('Ctrl+Z undoes on a non-Latin keyboard layout (Russian: the Z key types я)', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  await expect(cards(page)).toHaveCount(1);
  await clickEmpty(page);
  await page.evaluate(() =>
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'я', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true })),
  );
  await expect(cards(page)).toHaveCount(0);
});
