import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, clickEmpty, freshBoardEachTest } from './helpers';

// Formatting whole text boxes: size, bold, italic, typeface (owner request, 2026-10-04).

freshBoardEachTest();

const css = (l: Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Text format' });

async function list(page: Page, title: string, items: string[]) {
  await clickEmpty(page);
  await add(page, 'Checklist', { stayInTitle: true });
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
  for (const [i, t] of items.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  const id = await page.locator('.card.selected').getAttribute('data-card-id');
  return page.locator(`[data-card-id="${id}"]`);
}

test('Ctrl+B / Ctrl+I while typing format the whole item; Ctrl+Z undoes, and it is saved', async ({ page }) => {
  const l = await list(page, 'Groceries', ['milk', 'eggs']);
  const milk = l.getByLabel('Item text').first();
  await milk.click();
  await page.keyboard.press('Control+b');
  await page.keyboard.press('Control+i');
  await expect.poll(() => css(milk, 'font-weight')).toBe('600');
  expect(await css(milk, 'font-style')).toBe('italic');
  expect(await css(l.getByLabel('Item text').nth(1), 'font-weight')).toBe('400');
  await page.keyboard.press('Control+z'); // italic off again
  await expect.poll(() => css(milk, 'font-style')).toBe('normal');
  await page.waitForTimeout(400); // saving waits a moment
  await page.reload();
  await expect.poll(() => css(page.getByLabel('Item text').first(), 'font-weight')).toBe('600');
});

test('Ctrl+Shift+> / < make the box larger / smaller; Enter keeps the format on the new item', async ({ page }) => {
  const l = await list(page, 'Groceries', ['milk']);
  const milk = l.getByLabel('Item text').first();
  const normal = parseFloat(await css(milk, 'font-size'));
  await page.keyboard.press('Control+Shift+Period');
  await expect.poll(async () => parseFloat(await css(milk, 'font-size'))).toBeGreaterThan(normal);
  await page.keyboard.press('Control+Shift+Comma');
  await page.keyboard.press('Control+Shift+Comma');
  await expect.poll(async () => parseFloat(await css(milk, 'font-size'))).toBeLessThan(normal);
  await page.keyboard.press('Control+b');
  await page.keyboard.press('Enter');
  await page.keyboard.type('eggs');
  await expect.poll(() => css(l.getByLabel('Item text').nth(1), 'font-weight')).toBe('600');
});

test('highlighting text shows the bar; it formats the whole box, and the Font menu changes the typeface', async ({ page }) => {
  const l = await list(page, 'Groceries', ['milk']);
  const title = l.getByLabel('List title');
  await title.click();
  await expect(bar(page)).toHaveCount(0); // just a cursor: no bar
  await title.selectText();
  await expect(bar(page)).toBeVisible();
  const before = parseFloat(await css(title, 'font-size'));
  await bar(page).getByRole('button', { name: 'Large' }).click();
  await expect.poll(async () => parseFloat(await css(title, 'font-size'))).toBeGreaterThan(before);
  await expect(title).toBeFocused(); // the bar never takes the cursor away
  await bar(page).getByRole('button', { name: 'Font' }).click();
  await page.getByRole('menuitemradio', { name: 'Typewriter' }).click();
  await expect.poll(() => css(title, 'font-family')).toContain('Plex Mono');
  await bar(page).getByRole('button', { name: 'Bold' }).click();
  await expect(bar(page).getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('End'); // cursor only again: the bar goes
  await expect(bar(page)).toHaveCount(0);
});

test('with checklist items selected, the bar formats all of them', async ({ page }) => {
  const l = await list(page, 'Groceries', ['milk', 'eggs']);
  await l.getByLabel('Item text').first().click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+a'); // the whole list
  await expect(l.locator('.todo-item.picked')).toHaveCount(2);
  await expect(bar(page)).toBeVisible();
  await bar(page).getByRole('button', { name: 'Italic' }).click();
  for (const i of [0, 1]) await expect.poll(() => css(l.getByLabel('Item text').nth(i), 'font-style')).toBe('italic');
  await expect(l.locator('.todo-item.picked')).toHaveCount(2); // still selected
});

test('with whole cards selected, Ctrl+B formats every text box in them', async ({ page }) => {
  const l = await list(page, 'Groceries', ['milk']);
  await page.keyboard.press('Escape');
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.type('hello');
  await page.keyboard.press('Escape');
  await l.click({ position: { x: 30, y: 10 }, modifiers: ['Control'] });
  await page.keyboard.press('Control+b');
  for (const f of [l.getByLabel('List title'), l.getByLabel('Item text').first(), page.getByLabel('Note text')])
    await expect.poll(() => css(f, 'font-weight')).toBe('600');
});
