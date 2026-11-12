import { expect, test, type Page } from '@playwright/test';
import { add, arrange, cards, clickEmpty, fontsLoaded, freshBoardEachTest } from './helpers';

// Owner request 2026-11-12: "put version history in the top right navigation in the three dots, and
// same with completed items". Version history and Completed are entries of the toolbar's ⋯ More menu
// and no longer buttons by the zoom control.

freshBoardEachTest();

const toolbar = (page: Page) => page.locator('header.toolbar');
const dock = (page: Page) => page.locator('.corner-controls');
const moreButton = (page: Page) => toolbar(page).getByRole('button', { name: 'More', exact: true });
const menu = (page: Page) => page.getByRole('dialog', { name: 'More' });
const history = (page: Page) => page.getByRole('complementary', { name: 'Version history' });
const completed = (page: Page) => page.getByRole('complementary', { name: 'Completed' });
const entry = (page: Page, name: 'Version history' | 'Completed') => menu(page).getByRole('button', { name, exact: true });

for (const width of [1440, 1000]) {
  test(`at ${width}px wide, ⋯ More holds Version history and Completed, and the old buttons are gone`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await fontsLoaded(page);
    await expect(dock(page).getByRole('button', { name: 'Version history' })).toHaveCount(0);
    await expect(dock(page).getByRole('button', { name: 'Completed' })).toHaveCount(0);
    await expect(moreButton(page)).toHaveAttribute('title', /Version history, Completed/);

    await moreButton(page).click();
    await expect(entry(page, 'Version history')).toBeVisible();
    await expect(entry(page, 'Completed')).toBeVisible();
  });
}

test('Version history opens from ⋯ More and closes the menu; the same entry closes the panel', async ({ page }) => {
  await moreButton(page).click();
  await entry(page, 'Version history').click();
  await expect(history(page)).toBeVisible();
  await expect(menu(page)).toHaveCount(0);

  await moreButton(page).click();
  await expect(entry(page, 'Version history')).toHaveAttribute('aria-pressed', 'true');
  await entry(page, 'Version history').click();
  await expect(history(page)).toHaveCount(0);
  await expect(menu(page)).toHaveCount(0);
});

test('Completed opens from ⋯ More and closes the menu; the entry shows when the panel is open', async ({ page }) => {
  await moreButton(page).click();
  await expect(entry(page, 'Completed')).toHaveAttribute('aria-pressed', 'false');
  await entry(page, 'Completed').click();
  await expect(completed(page)).toBeVisible();
  await expect(menu(page)).toHaveCount(0);

  await moreButton(page).click();
  await expect(entry(page, 'Completed')).toHaveAttribute('aria-pressed', 'true');
});

test('the two entries are reached with Tab from ⋯, and Escape closes the menu back onto ⋯', async ({ page }) => {
  await moreButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(entry(page, 'Version history')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(entry(page, 'Completed')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(completed(page)).toBeVisible();
  await expect(menu(page)).toHaveCount(0);

  await moreButton(page).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(moreButton(page)).toBeFocused();
});

test('Search rings ⋯ while a match sits in the shut Completed panel, and the Completed entry once ⋯ is open', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Checklist');
  await page.getByLabel('Item text').first().click();
  await page.keyboard.type('milk');
  await page.getByLabel('Done').first().click();
  await (await arrange(page)).getByRole('button', { name: 'Clean up', exact: true }).click();
  await expect(cards(page)).toHaveCount(1);
  await page.keyboard.press('Control+f');
  await page.getByRole('searchbox', { name: 'Search the board' }).fill('milk');
  const status = page.getByRole('search').getByRole('status');
  await expect(status).toHaveText('1 of 1 · in Completed');
  await expect(moreButton(page)).toHaveClass(/find-target/);

  await moreButton(page).click();
  await expect(entry(page, 'Completed')).toHaveClass(/find-target/);
  await entry(page, 'Completed').click();
  await expect(status).toHaveText('1 of 1');
  await expect(moreButton(page)).not.toHaveClass(/find-target/);
});

test('the toolbar still fits at 1180px wide with ⋯ always showing', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 900 });
  await page.goto('/');
  await fontsLoaded(page);
  const over = await toolbar(page).evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
  const right = (await moreButton(page).boundingBox())!;
  expect(right.x + right.width).toBeLessThanOrEqual(1180);
});
