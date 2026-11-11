import { expect, test, type Page } from '@playwright/test';
import { cards, expectNoOverlaps, fontsLoaded, freshBoardEachTest } from './helpers';

// The Brain dump: one big text box, a live preview of the cards it will make, and "Add N cards", which
// drops them on the open board (packed, selected) as one undo step. It opens from the toolbar's Add group,
// from the folded ⋯ menu, and on a phone from the + sheet and the ⋯ sheet.

const text = ['Buy milk', '[ ] Pack bag 20m', 'Write report 1h30', '- Call mom', 'Book flights'].join('\n');

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Brain dump' });
const box = (page: Page) => dialog(page).getByLabel('Brain dump text');

async function paste(page: Page, value = text) {
  await expect(dialog(page)).toBeVisible();
  await box(page).fill(value);
}

test.describe('on a wide desktop', () => {
  freshBoardEachTest();

  test('the preview shows each card, then Add makes them selected, packed and as one undo step', async ({ page }) => {
    await page.locator('header.toolbar').getByRole('button', { name: 'Brain dump', exact: true }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: /^Add \d+ cards?$/ })).toBeDisabled();

    await paste(page);
    const preview = dialog(page).getByRole('list', { name: 'Cards to add' });
    await expect(preview.getByRole('listitem')).toHaveCount(5);
    await expect(preview.getByRole('listitem').nth(0)).toContainText('Buy milk');
    await expect(preview.getByRole('listitem').nth(1)).toContainText('Pack bag');
    await expect(preview.getByRole('listitem').nth(1)).toContainText('Checklist');
    await expect(preview.getByRole('listitem').nth(1)).toContainText('20 min');
    await expect(preview.getByRole('listitem').nth(2)).toContainText('1 h 30 min');

    await dialog(page).getByRole('button', { name: 'Add 5 cards' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(cards(page)).toHaveCount(5);
    await expect(page.locator('.card.selected')).toHaveCount(5);
    await expect(page.getByLabel('Note text').first()).toHaveValue('Buy milk');
    await expect(page.getByLabel('List title')).toHaveValue('Pack bag');
    await page.waitForTimeout(300);
    await expectNoOverlaps(page);

    // The estimate is not saved on the card, so it does not show up on the board.
    await expect(cards(page).filter({ hasText: /20 min|1 h 30/ })).toHaveCount(0);

    await page.keyboard.press('Control+z');
    await expect(cards(page)).toHaveCount(0);
    await page.keyboard.press('Control+y');
    await expect(cards(page)).toHaveCount(5);
  });

  test('says "1 card" for one, and cannot add an empty box', async ({ page }) => {
    await page.locator('header.toolbar').getByRole('button', { name: 'Brain dump', exact: true }).click();
    await paste(page, 'Just one thing');
    await expect(dialog(page).getByRole('button', { name: 'Add 1 card' })).toBeEnabled();
    await box(page).fill('   \n\n');
    await expect(dialog(page).getByRole('button', { name: /^Add/ })).toBeDisabled();
  });

  test('Escape closes it without adding anything, and what was typed is still there next time', async ({ page }) => {
    await page.locator('header.toolbar').getByRole('button', { name: 'Brain dump', exact: true }).click();
    await paste(page, 'Keep me');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(cards(page)).toHaveCount(0);
    await page.locator('header.toolbar').getByRole('button', { name: 'Brain dump', exact: true }).click();
    await expect(box(page)).toHaveValue('Keep me');
  });

  test('Ctrl+Z inside the box undoes the typing, not the board', async ({ page }) => {
    await page.locator('header.toolbar').getByRole('button', { name: 'Brain dump', exact: true }).click();
    await box(page).click();
    await page.keyboard.type('hello');
    await page.keyboard.press('Control+z');
    await expect(dialog(page)).toBeVisible();
    await expect(box(page)).not.toHaveValue('hello');
  });
});

test('in a medium window it is in the ⋯ menu', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/');
  await fontsLoaded(page);
  await page.locator('header.toolbar').getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Brain dump', exact: true }).click();
  await paste(page, 'a\nb\nc');
  await dialog(page).getByRole('button', { name: 'Add 3 cards' }).click();
  await expect(cards(page)).toHaveCount(3);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });
  const bar = (page: Page) => page.getByRole('toolbar', { name: 'Board actions' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await fontsLoaded(page);
  });

  test('opens from the + sheet, fits the screen, and adds the cards', async ({ page }) => {
    await bar(page).getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menu', { name: 'Add' }).getByRole('menuitem', { name: 'Brain dump' }).tap();
    await paste(page);
    const d = (await dialog(page).boundingBox())!;
    expect(d.x).toBeGreaterThanOrEqual(0);
    expect(d.x + d.width).toBeLessThanOrEqual(390);
    expect(d.y + d.height).toBeLessThanOrEqual(800 + 1);
    // 16px text so the phone does not zoom the page when the box takes the cursor.
    expect(await box(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    const add = dialog(page).getByRole('button', { name: 'Add 5 cards' });
    const b = (await add.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.y + b.height).toBeLessThanOrEqual(800);
    await add.tap();
    await expect(dialog(page)).toHaveCount(0);
    await expect(cards(page)).toHaveCount(5);
    await expect(page.locator('.card.selected')).toHaveCount(5);
  });

  test('opens from the ⋯ sheet, in the Board group, without a ninth tile', async ({ page }) => {
    await bar(page).getByRole('button', { name: 'More', exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: 'More' });
    expect(await sheet.locator('.phone-tiles button').count()).toBeLessThanOrEqual(8);
    await sheet.locator('.phone-arrange').getByRole('button', { name: 'Brain dump', exact: true }).tap();
    await expect(sheet).toHaveCount(0);
    await paste(page, 'one\ntwo');
    await dialog(page).getByRole('button', { name: 'Add 2 cards' }).tap();
    await expect(cards(page)).toHaveCount(2);
  });
});
