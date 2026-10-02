import { expect, test } from '@playwright/test';
import { add, cards, clickEmpty, columns, freshBoardEachTest } from './helpers';

// Design fixes from the 2026-10-02 Impeccable review.

freshBoardEachTest();

test('typing straight after adding a note, link or column goes into it', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'To-do list');
  await page.keyboard.type('first item');

  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.type('Water the plants');
  await expect(page.getByLabel('Note text')).toHaveValue('Water the plants');
  await expect(page.getByLabel('Item text').first()).toHaveValue('first item');

  await clickEmpty(page);
  await add(page, 'Link');
  await page.keyboard.type('Recipes');
  await expect(page.getByLabel('Link title')).toHaveValue('Recipes');

  await clickEmpty(page);
  await add(page, 'New column');
  await page.keyboard.type('Ideas');
  await expect(page.getByLabel('Column title')).toHaveValue('Ideas');
  await expect(cards(page)).toHaveCount(3);
  await expect(columns(page)).toHaveCount(1);
});

const toolbarButton = (page: import('@playwright/test').Page, name: string) => page.locator('header.toolbar').getByRole('button', { name, exact: true });
const style = (l: import('@playwright/test').Locator, prop: string, pseudo?: string) =>
  l.evaluate((el, [p, ps]) => getComputedStyle(el, ps ?? null).getPropertyValue(p as string), [prop, pseudo] as const);

test('the dark-mode button looks pressed while dark mode is on, like Snap to grid', async ({ page }) => {
  const moon = toolbarButton(page, 'Dark mode');
  const snap = toolbarButton(page, 'Snap to grid');
  await expect(snap).toHaveAttribute('aria-pressed', 'true');
  const off = await style(moon, 'background-color');
  await moon.click();
  await page.mouse.move(0, 400); // not hovering
  const on = await style(moon, 'background-color');
  expect(on).not.toBe(off);
  expect(on).toBe(await style(snap, 'background-color'));
});

test('placeholder text is dark enough to read (light and dark mode)', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  const note = page.getByLabel('Note text');
  expect(await style(note, 'color', '::placeholder')).toBe('rgb(115, 108, 98)');
  await toolbarButton(page, 'Dark mode').click();
  expect(await style(note, 'color', '::placeholder')).toBe('rgb(163, 157, 147)');
});

test('faded toolbar buttons are a little stronger in dark mode', async ({ page }) => {
  const colour = page.getByRole('button', { name: 'Colour of selected block' });
  expect(await style(colour, 'opacity')).toBe('0.45');
  await toolbarButton(page, 'Dark mode').click();
  expect(await style(colour, 'opacity')).toBe('0.55');
});

test('cards in an uncoloured column use the usual teal title band', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'To-do list');
  const loose = page.locator('.card.loose').first();
  const looseBand = await style(loose, '--band');
  await clickEmpty(page);
  await add(page, 'New column');
  await add(page, 'To-do list');
  const inColumn = columns(page).first().locator('.card').first();
  expect(await style(inColumn, '--band')).toBe(looseBand);
});
