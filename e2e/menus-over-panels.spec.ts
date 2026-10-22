import { expect, test, type Locator, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Impeccable review (job 182): the File, Appearance and Boards menus and the Share panel open under an
// open side panel (the toolbar's layer was below the panel's). They are drawn on top and can be pressed.

const toolbar = (page: Page) => page.locator('header.toolbar');

async function start(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?demo-user=Layer${Math.random().toString(36).slice(2, 8)}`);
  await fontsLoaded(page);
  await page.locator('.corner-controls').getByRole('button', { name: 'Focus timer', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Focus timer' })).toBeVisible();
  // A wide panel, so every menu reaches over it whatever the window width.
  await page.evaluate(() => document.querySelector<HTMLElement>('.app')!.style.setProperty('--side-width', '1000px'));
  return errors;
}

const cases: [string, (page: Page) => Locator][] = [
  ['File', page => page.getByRole('menu', { name: 'File' })],
  ['Appearance', page => page.getByRole('group', { name: 'Appearance' })],
  ['Boards', page => page.getByRole('menu', { name: 'Boards' })],
  ['Share', page => page.getByRole('dialog', { name: /^Share/ })],
];

for (const [button, menu] of cases) {
  test(`the ${button} ${button === 'Share' ? 'panel' : 'menu'} opens on top of an open side panel and can be pressed`, async ({ page }) => {
    const errors = await start(page);
    await toolbar(page).getByRole('button', { name: button, exact: true }).click();
    const open = menu(page);
    await expect(open).toBeVisible();
    // Whatever is drawn at the middle of the menu is the menu (or something in it), not the panel.
    const onTop = await open.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && el.contains(hit);
    });
    expect(onTop).toBe(true);
    await open.locator('button').first().click({ trial: true });
    expect(errors).toEqual([]);
  });
}
