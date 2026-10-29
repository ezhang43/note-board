import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Phone item bar (owner request, 2026-10-19): the keyboard stays up through ticking and deleting,
// the bar has Undo and Done, clearer indent icons, and there is no trash can on each row.

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const items = (page: Page) => page.getByRole('toolbar', { name: 'Item actions' });
const texts = (page: Page) => page.locator('[data-card-id]').first().getByLabel('Item text').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));

async function list(page: Page, names: string[]) {
  await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'Add', exact: true }).tap();
  await page.getByRole('menuitem', { name: 'Checklist' }).tap();
  await page.keyboard.press('Enter'); // from the title to the first item
  for (const [i, t] of names.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  return page.locator('[data-card-id]').first();
}

/** Which item text has the cursor (empty when none is in a text box). */
const typingIn = (page: Page) => page.evaluate(() => (document.activeElement instanceof HTMLTextAreaElement ? document.activeElement.value : ''));

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
});

test('Tick moves the cursor to the next open item and the bar stays', async ({ page }) => {
  const card = await list(page, ['one', 'two', 'three']);
  await card.getByLabel('Item text').nth(1).tap();
  await items(page).getByRole('button', { name: 'Tick' }).tap();
  await expect(items(page)).toBeVisible();
  await expect.poll(() => typingIn(page)).toBe('three');
  // Ticking the last open item sends the cursor up, to "one".
  await items(page).getByRole('button', { name: 'Tick' }).tap();
  await expect.poll(() => typingIn(page)).toBe('one');
  await expect(items(page)).toBeVisible();
  // Nothing open is left after this one: the cursor lets go and the bar goes.
  await items(page).getByRole('button', { name: 'Tick' }).tap();
  await expect(items(page)).toBeHidden();
});

test('Delete moves the cursor to the item above; deleting the last item leaves a blank one', async ({ page }) => {
  const card = await list(page, ['one', 'two', 'three']);
  await card.getByLabel('Item text').nth(2).tap();
  await items(page).getByRole('button', { name: 'Delete item' }).tap();
  expect(await texts(page)).toEqual(['one', 'two']);
  await expect.poll(() => typingIn(page)).toBe('two');
  await items(page).getByRole('button', { name: 'Delete item' }).tap();
  await items(page).getByRole('button', { name: 'Delete item' }).tap();
  // The list is never left empty: a blank item takes the cursor.
  expect(await texts(page)).toEqual(['']);
  await expect(items(page)).toBeVisible();
  await expect(card.getByLabel('Item text')).toBeFocused();
});

test('Undo undoes one action at a time and keeps the cursor in the item', async ({ page }) => {
  const card = await list(page, ['one', 'two']);
  const undo = items(page).getByRole('button', { name: 'Undo' });
  await card.getByLabel('Item text').nth(1).tap();
  await items(page).getByRole('button', { name: 'Delete item' }).tap();
  expect(await texts(page)).toEqual(['one']);
  await undo.tap();
  expect(await texts(page)).toEqual(['one', 'two']);
  await expect(items(page)).toBeVisible();
  expect(await typingIn(page)).not.toBe('');
  // An indent that moves the item to another place in the list is undone with the cursor still in it.
  await card.getByLabel('Item text').nth(1).tap();
  await items(page).getByRole('button', { name: 'Indent' }).tap();
  const depth = () => card.locator('[data-item-id]').nth(1).evaluate((el) => parseFloat(getComputedStyle(el as HTMLElement).paddingLeft) || 0);
  expect(await depth()).toBeGreaterThan(0);
  await undo.tap();
  expect(await depth()).toBe(0);
  await expect(card.getByLabel('Item text').nth(1)).toBeFocused();
});

test('Done puts the cursor away and the bar goes', async ({ page }) => {
  const card = await list(page, ['one']);
  await card.getByLabel('Item text').tap();
  await expect(items(page)).toBeVisible();
  await items(page).getByRole('button', { name: 'Done typing' }).tap();
  await expect(items(page)).toBeHidden();
  expect(await typingIn(page)).toBe('');
  // The row's own Done tick box is a different control.
  await expect(card.getByRole('checkbox', { name: 'Done' })).toBeVisible();
});

test('all eight buttons fit the phone, each at least 38px wide and 44px tall', async ({ page }) => {
  const card = await list(page, ['one']);
  await card.getByLabel('Item text').tap();
  const buttons = items(page).getByRole('button');
  await expect(buttons).toHaveCount(8);
  for (const b of await buttons.all()) {
    const r = (await b.boundingBox())!;
    expect(r.width).toBeGreaterThanOrEqual(38);
    expect(r.height).toBeGreaterThanOrEqual(44);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(390);
  }
});

test('a row has no trash can on a phone, only its drag grip', async ({ page }) => {
  const card = await list(page, ['one', 'two']);
  const row = card.locator('[data-item-id]').first();
  await row.getByLabel('Item text').tap();
  await expect(row.getByRole('button', { name: 'Drag item' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Delete item' })).toBeHidden();
  await expect(items(page).getByRole('button', { name: 'Delete item' })).toBeVisible();
});

test('the indent and outdent icons are a lines-and-arrowhead pair, pointing opposite ways', async ({ page }) => {
  const card = await list(page, ['one']);
  await card.getByLabel('Item text').tap();
  const head = (name: string) => items(page).getByRole('button', { name }).locator('svg path[fill="currentColor"]').getAttribute('d');
  expect(await head('Indent')).not.toBe(await head('Outdent'));
  expect(await head('Indent')).toBeTruthy();
});

test.describe('a small phone', () => {
  test.use({ viewport: { width: 320, height: 568 } });
  test('the Done label fits its button and no button runs off the screen', async ({ page }) => {
    const card = await list(page, ['one']);
    await card.getByLabel('Item text').tap();
    const done = items(page).getByRole('button', { name: 'Done typing' });
    expect(await done.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    for (const b of await items(page).getByRole('button').all()) {
      const r = (await b.boundingBox())!;
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(320);
      expect(r.width).toBeGreaterThanOrEqual(36);
    }
  });
});
