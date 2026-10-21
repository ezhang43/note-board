import { expect, test, type Locator } from '@playwright/test';
import { add, freshBoardEachTest, looseCards } from './helpers';

// Hover rules were once written inside their own parent rule, which matches nothing, so buttons did not react
// on a computer. These tests point at a few real buttons and check that the look really changes.

freshBoardEachTest();

const style = (el: Locator, prop: 'filter' | 'backgroundColor') => el.evaluate((e, p) => getComputedStyle(e)[p as 'filter'], prop);

test('toolbar buttons dim slightly under the pointer', async ({ page }) => {
  const note = page.locator('header.toolbar').getByRole('button', { name: 'Note', exact: true });
  expect(await style(note, 'filter')).toBe('none');
  await note.hover();
  await expect.poll(() => style(note, 'filter')).toMatch(/brightness/);
});

test('zoom buttons and a card button get a tint under the pointer', async ({ page }) => {
  const zoomIn = page.getByRole('button', { name: 'Zoom in', exact: true });
  const before = await style(zoomIn, 'backgroundColor');
  await zoomIn.hover();
  await expect.poll(() => style(zoomIn, 'backgroundColor')).not.toBe(before);

  await add(page, 'Note');
  const collapse = looseCards(page).first().locator('.card-header > .icon-button').first();
  await page.mouse.move(0, 0);
  const idle = await style(collapse, 'backgroundColor');
  await collapse.hover();
  await expect.poll(() => style(collapse, 'backgroundColor')).not.toBe(idle);
});
