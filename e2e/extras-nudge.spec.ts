import { expect, test } from '@playwright/test';
import { add, box, cards, columns, freshBoardEachTest, looseCards } from './helpers';

// Owner's additions: arrow keys move the selected blocks; collapsed loose cards show their title in the middle.

freshBoardEachTest();

const cardHeader = { position: { x: 30, y: 15 } };

test('arrow keys move a selected card one grid step, Shift + arrow five', async ({ page }) => {
  await add(page, 'Note');
  const card = looseCards(page).first();
  await card.click(cardHeader);
  const start = await box(card);

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await box(card)).x - start.x).toBeCloseTo(20, 0);
  expect((await box(card)).y - start.y).toBeCloseTo(20, 0);

  await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(async () => (await box(card)).x - start.x).toBeCloseTo(-80, 0);

  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await box(card)).x).toBeCloseTo(start.x, 0);
});

test('typing in a card, arrows stay in the text; Escape leaves the text and arrows move the card', async ({ page }) => {
  await add(page, 'Note');
  const card = looseCards(page).first();
  const text = card.getByLabel('Note text');
  await text.fill('hello');
  await text.click();
  const start = await box(card);
  await page.keyboard.press('ArrowLeft');
  expect((await box(card)).x).toBeCloseTo(start.x, 0);

  await page.keyboard.press('Escape');
  await expect(text).not.toBeFocused();
  await expect(card).toHaveClass(/selected/);
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await box(card)).x - start.x).toBeCloseTo(20, 0);
});

test('several selected blocks move together; a card in a column moves up and down its column', async ({ page }) => {
  await add(page, 'New column');
  const col = columns(page).first();
  await add(page, 'Note');
  await col.click({ position: { x: 20, y: 20 } });
  await add(page, 'To-do list');
  const inCol = col.locator('[data-card-id]');
  await expect(inCol).toHaveCount(2);
  const second = await inCol.nth(1).getAttribute('data-card-id');

  await page.keyboard.press('Escape'); // out of the new list's first item, the list stays selected
  await page.keyboard.press('ArrowUp');
  await expect(inCol.first()).toHaveAttribute('data-card-id', second!);

  await page.keyboard.press('Control+a');
  const before = await box(col);
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await box(col)).y - before.y).toBeCloseTo(20, 0);
  await expect(cards(page)).toHaveCount(2);
});

test('a collapsed loose card shows its title in the middle', async ({ page }) => {
  await add(page, 'To-do list');
  const card = looseCards(page).first();
  await card.getByLabel('List title').fill('Shopping');
  await card.getByRole('button', { name: 'Collapse card' }).click();
  const meta = card.locator('.card-meta');
  await expect(meta).toHaveText('Shopping');

  const range = await meta.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const t = r.getBoundingClientRect();
    return { left: t.left, right: t.right };
  });
  const c = await box(card);
  const textMid = (range.left + range.right) / 2;
  expect(Math.abs(textMid - (c.x + c.width / 2))).toBeLessThan(4);
});
