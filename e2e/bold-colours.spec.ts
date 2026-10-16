import { expect, test } from '@playwright/test';
import { add, box, clickEmpty, columns, dragTo, freshBoardEachTest } from './helpers';

// Owner request (2026-10-15): a third row of 8 bold, clearly different colors.

freshBoardEachTest();

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

test('the Color menu has three rows of 8, the third bold; Tomato colors a column', async ({ page }) => {
  await add(page, 'New container');
  await page.getByRole('button', { name: 'Color of selected cards and containers' }).click();
  const menu = page.getByRole('group', { name: 'Colors' });
  const swatches = menu.locator('.swatch');
  await expect(swatches).toHaveCount(24);
  const tops = await swatches.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(3);
  expect(tops.filter((t) => t === tops[16]).length).toBe(8); // the third row is the 8 bold colors
  const names = await swatches.evaluateAll((els) => els.slice(16).map((el) => el.getAttribute('aria-label')));
  expect(names).toEqual(['Tomato', 'Tangerine', 'Sunflower', 'Grass', 'Emerald', 'Ocean', 'Violet', 'Magenta']);
  const m = (await menu.boundingBox())!;
  expect(m.y + m.height).toBeLessThanOrEqual(page.viewportSize()!.height);

  await menu.getByRole('button', { name: 'Tomato' }).hover();
  await expect(menu.locator('.swatch-name')).toHaveText('Tomato');
  await menu.getByRole('button', { name: 'Tomato' }).click();
  const col = columns(page).first();
  await expect(col).toHaveCSS('background-color', rgb('#FF8C78'));
  // The count and placeholder on a bold column use its own dark text color, so they stay readable.
  await expect(col.locator('.column-count')).toHaveCSS('color', rgb('#400A03'));
  // The empty column's dashed outline is drawn in the color's dark tone too, not the faint dot color.
  await expect(col.locator('.column-empty')).not.toHaveCSS('border-top-color', rgb('#D6CBB0'));
});

test('Auto-color starts with the bold colors', async ({ page }) => {
  for (let i = 0; i < 2; i++) {
    await add(page, 'New container');
    await clickEmpty(page);
  }
  await page.getByRole('button', { name: 'Color of selected cards and containers' }).click();
  await page.getByRole('button', { name: 'Auto-color' }).click();
  const bgs = await columns(page).evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  expect(bgs.sort()).toEqual([rgb('#6BB8F5'), rgb('#FF8C78')].sort()); // Ocean and Tomato (the order is unit-tested)
});

test('on a bold header tint the icons and the title placeholder use the color’s own dark text', async ({ page }) => {
  const placeholder = (l: import('@playwright/test').Locator) => l.evaluate((el) => getComputedStyle(el, '::placeholder').color);
  const color = page.getByRole('button', { name: 'Color of selected cards and containers' });
  const menu = page.getByRole('group', { name: 'Colors' });

  // A list colored Tomato: its trash icon and empty title's placeholder are dark red, not grey.
  await add(page, 'Checklist', { stayInTitle: true });
  const list = page.locator('.card.selected');
  await color.click();
  await menu.getByRole('button', { name: 'Tomato' }).click();
  await expect(list.locator('.block-trash')).toHaveCSS('color', rgb('#400A03'));
  expect(await placeholder(list.getByLabel('List title'))).toBe(rgb('#400A03'));
  // A pastel tint keeps the usual soft grey.
  await menu.getByRole('button', { name: 'Sky' }).click();
  await expect(list.locator('.block-trash')).toHaveCSS('color', rgb('#6B655C'));
  await clickEmpty(page);

  // Cards no longer take a band from their container (Honey Workshop, 2026-10-16): with Default, a list in an Ocean container is plain white with the usual grey icons.
  await add(page, 'New container');
  const col = columns(page).first();
  await color.click();
  await menu.getByRole('button', { name: 'Ocean' }).click();
  await clickEmpty(page);
  const colBox = await box(col);
  await dragTo(page, page.locator('.card.loose').first(), { x: colBox.x + 100, y: colBox.y + 20 });
  await expect(col.locator('[data-card-id]')).toHaveCount(1);
  await col.locator('[data-card-id]').click({ position: { x: 60, y: 60 } });
  await color.click();
  await menu.getByRole('button', { name: 'Default' }).click();
  await expect(col.locator('[data-card-id] .block-trash')).toHaveCSS('color', rgb('#6B655C'));
  await expect(col.locator('[data-card-id] .card-header')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

test.describe('on a phone-sized screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('all 24 colors fit the ⋯ panel', async ({ page }) => {
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    await bar.getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'Container', exact: true }).tap();
    await bar.getByRole('button', { name: 'More', exact: true }).tap();
    const panel = page.getByRole('dialog', { name: 'More' });
    await panel.getByRole('button', { name: 'Color of selected cards and containers' }).tap();
    const swatches = panel.locator('.swatch');
    await expect(swatches).toHaveCount(24);
    const p = (await panel.boundingBox())!;
    for (const s of await swatches.all()) {
      const b = (await s.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(p.x);
      expect(b.x + b.width).toBeLessThanOrEqual(p.x + p.width);
      expect(b.y + b.height).toBeLessThanOrEqual(800);
    }
    await panel.getByRole('button', { name: 'Magenta' }).tap();
    await expect(columns(page).first()).toHaveCSS('background-color', rgb('#F58BD6'));
  });
});
