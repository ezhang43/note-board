import { expect, test, type Page } from '@playwright/test';
import { add, cards, fontsLoaded } from './helpers';

// Owner request, 2026-11-12: "when logging out, there should be a confirmation". Sign out on a working
// board (the toolbar button, the folded ⋯ menu, the phone's ⋯ panel) asks first, with the app's own
// question card, and only signs out once it is confirmed. (`?signed-in` shows Sign out locally; it
// then only says that Sign out works on the published site, which is how these tests see "signed out".)

const tag = () => Math.random().toString(36).slice(2, 8);
const toolbar = (page: Page) => page.locator('header.toolbar');
const question = (page: Page) => page.getByRole('alertdialog', { name: 'Sign out?' });
const confirm = (page: Page) => question(page).getByRole('button', { name: 'Sign out', exact: true });
const cancel = (page: Page) => question(page).getByRole('button', { name: 'Cancel', exact: true });

/** Remembers the browser pop-ups that open: that is how the local Sign out says it was done. */
function watchSignOuts(page: Page) {
  const said: string[] = [];
  page.on('dialog', (d) => {
    said.push(d.message());
    void d.dismiss();
  });
  return said;
}

async function start(page: Page, width: number, height = 800) {
  await page.setViewportSize({ width, height });
  await page.goto(`/?signed-in&demo-user=Out${tag()}`);
  await fontsLoaded(page);
}

test.describe('desktop toolbar button', () => {
  test('asks first; Cancel keeps you signed in and puts focus back on the button', async ({ page }) => {
    const said = watchSignOuts(page);
    await start(page, 1280);
    const button = toolbar(page).getByRole('button', { name: 'Sign out', exact: true });
    await button.click();
    await expect(question(page)).toBeVisible();
    await expect(question(page)).toContainText('haven’t been saved online yet') // the demo page has no online saving, so no reassurance (the "Saved" wording is in src/components/signOutConfirm.test.ts);
    expect(said).toEqual([]);
    await cancel(page).click();
    await expect(question(page)).toHaveCount(0);
    await expect(button).toBeFocused();
    expect(said).toEqual([]);
  });

  test('the Sign out button in the question signs out', async ({ page }) => {
    const said = watchSignOuts(page);
    await start(page, 1280);
    await toolbar(page).getByRole('button', { name: 'Sign out', exact: true }).click();
    await confirm(page).click();
    await expect.poll(() => said.join()).toContain('Sign out');
    await expect(question(page)).toHaveCount(0);
  });

  test('Escape closes it without signing out, focus back on the button', async ({ page }) => {
    const said = watchSignOuts(page);
    await start(page, 1280);
    const button = toolbar(page).getByRole('button', { name: 'Sign out', exact: true });
    await button.click();
    await expect(question(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(question(page)).toHaveCount(0);
    await expect(button).toBeFocused();
    expect(said).toEqual([]);
  });

  test('from the keyboard: Enter opens it, Tab to its Sign out, Enter signs out', async ({ page }) => {
    const said = watchSignOuts(page);
    await start(page, 1280);
    await toolbar(page).getByRole('button', { name: 'Sign out', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(question(page)).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(confirm(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => said.join()).toContain('Sign out');
  });

  test('the question’s buttons keep a keyboard focus ring', async ({ page }) => {
    await start(page, 1280);
    await toolbar(page).getByRole('button', { name: 'Sign out', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(confirm(page)).toBeFocused();
    expect(await confirm(page).evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  });

  test('board keys don’t act behind it', async ({ page }) => {
    await start(page, 1280);
    await add(page, 'Note');
    await expect(cards(page)).toHaveCount(1);
    await toolbar(page).getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(question(page)).toBeVisible();
    await page.keyboard.press('Delete');
    await page.keyboard.press('Control+z');
    await expect(cards(page)).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(cards(page)).toHaveCount(1);
  });
});

test.describe('folded ⋯ menu', () => {
  const more = (page: Page) => toolbar(page).getByRole('button', { name: 'More', exact: true });
  const row = (page: Page) => page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Sign out', exact: true });

  test('the Sign out row asks first; Cancel keeps you signed in, confirming signs out', async ({ page }) => {
    const said = watchSignOuts(page);
    await start(page, 768);
    await more(page).click();
    await row(page).click();
    await expect(question(page)).toBeVisible();
    expect(said).toEqual([]);
    await cancel(page).click();
    await expect(question(page)).toHaveCount(0);
    await expect(more(page)).toBeFocused();
    expect(said).toEqual([]);

    await more(page).click();
    await row(page).click();
    await confirm(page).click();
    await expect.poll(() => said.join()).toContain('Sign out');
  });

  test('Escape closes the question without signing out, focus back on ⋯', async ({ page }) => {
    const said = watchSignOuts(page);
    await start(page, 768);
    await more(page).click();
    await row(page).click();
    await expect(question(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(question(page)).toHaveCount(0);
    await expect(more(page)).toBeFocused();
    expect(said).toEqual([]);
  });
});

test.describe('phone ⋯ panel', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });
  const more = (page: Page) => page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true });
  const row = (page: Page) => page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Sign out', exact: true });

  test('Cancel keeps you signed in, confirming signs out', async ({ page }) => {
    const said = watchSignOuts(page);
    await page.goto(`/?signed-in&demo-user=Out${tag()}`);
    await fontsLoaded(page);
    await more(page).tap();
    await row(page).tap();
    await expect(question(page)).toBeVisible();
    expect(said).toEqual([]);
    await cancel(page).tap();
    await expect(question(page)).toHaveCount(0);
    expect(said).toEqual([]);
    await expect(row(page)).toBeFocused();

    await row(page).tap();
    await confirm(page).tap();
    await expect.poll(() => said.join()).toContain('Sign out');
  });
});
