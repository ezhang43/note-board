import { expect, test, type Page } from '@playwright/test';
import { add, clickEmpty, columns, freshBoardEachTest, toggleDark } from './helpers';

// The rest of the interface review (job 144): keys and focus in the search box, Escape on menus and
// the search bar, recording a hotkey, and a few things the browser tests never looked at.

freshBoardEachTest();

const dock = (page: Page, name: string) => page.locator('.corner-controls').getByRole('button', { name, exact: true });
const zoomOf = (page: Page) => page.getByTestId('canvas').getAttribute('data-zoom').then(Number);

test('zoom keys typed in the search box zoom the board, not the browser page', async ({ page }) => {
  await page.keyboard.press('Control+f');
  const box = page.getByPlaceholder('Search the board');
  await expect(box).toBeFocused();
  const z0 = await zoomOf(page);
  await box.press('Control+=');
  await expect.poll(() => zoomOf(page)).toBeGreaterThan(z0);
  await box.press('Control+0');
  await expect.poll(() => zoomOf(page)).toBe(1);
  // Typing and the box's own keys are unchanged.
  await box.fill('abc');
  await box.press('Control+a');
  await expect(box).toHaveValue('abc');
});

test('the search box and other text fields draw no focus rectangle (rule 6)', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+f');
  const box = page.getByPlaceholder('Search the board');
  await box.press('a');
  expect(await box.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  for (const el of await page.locator('input:not([type=checkbox]), textarea').all()) {
    if (!(await el.isVisible())) continue;
    await el.focus();
    await page.keyboard.press('End');
    expect(await el.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe('none');
  }
});

test('recording a hotkey is not interrupted by Ctrl+F opening the search behind the list', async ({ page }) => {
  await page.keyboard.press('?');
  const list = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await list.locator('.key-button').first().click();
  await expect(list.locator('.key-button[aria-pressed="true"]')).toHaveCount(1);
  await page.keyboard.press('Control+f');
  await expect(page.getByRole('search')).toHaveCount(0);
});

test('Escape closes the Boards menu, and leaves a side panel open behind it', async ({ page }) => {
  const boards = page.locator('header.toolbar').getByRole('button', { name: 'Boards', exact: true });
  await boards.click();
  const menu = page.getByRole('menu', { name: 'Boards' });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(boards).toBeFocused();

  await dock(page, 'Focus timer').click();
  const timer = page.getByRole('complementary', { name: 'Focus timer' });
  await boards.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(timer).toBeVisible();
});

test('Escape with the keyboard on a search bar button closes the search, and leaves a side panel open', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.type('apple apple');
  await clickEmpty(page);
  await page.keyboard.press('Control+f');
  await page.keyboard.type('apple');
  const bar = page.getByRole('search');
  await bar.getByRole('button', { name: 'Next match' }).click();
  await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);

  await dock(page, 'Focus timer').click();
  await page.keyboard.press('Control+f');
  await page.keyboard.type('apple');
  await bar.getByRole('button', { name: 'Next match' }).click();
  await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Focus timer' })).toBeVisible();
});

test('a container with one card is read as "1 card", with none or two as "0 cards" and "2 cards"', async ({ page }) => {
  await add(page, 'New container');
  const count = columns(page).first().locator('.column-count');
  await expect(count).toHaveAttribute('aria-label', '0 cards');
  await add(page, 'Note');
  await expect(count).toHaveAttribute('aria-label', '1 card');
  await add(page, 'Note');
  await expect(count).toHaveAttribute('aria-label', '2 cards');
});

test('the side panels and the search bar keep the dark colors', async ({ page }) => {
  await toggleDark(page);
  for (const name of ['Journal', 'Habits', 'Completed', 'Focus timer', 'Version history']) {
    await dock(page, name).click();
    const panel = page.locator('aside.history-panel');
    await expect(panel).toBeVisible();
    expect(await panel.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(36, 34, 30)');
    await dock(page, name).click();
  }
  await page.keyboard.press('Control+f');
  expect(await page.locator('.find-bar').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(36, 34, 30)');
});

test('Tab reaches every button with a focus ring, and no text field shows one', async ({ page }) => {
  await page.locator('body').focus();
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const seen = await page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement;
      const s = getComputedStyle(el);
      return { tag: el.tagName, type: el.type, outline: s.outlineStyle, shadow: s.boxShadow };
    });
    if (seen.tag === 'BUTTON' || seen.tag === 'A') expect(seen.outline !== 'none' || seen.shadow !== 'none').toBe(true);
    else if (seen.tag === 'TEXTAREA' || (seen.tag === 'INPUT' && seen.type !== 'checkbox')) expect(seen.outline).toBe('none');
  }
});

test.describe('tablet', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 800, height: 900 } });

  test('on a touch screen wider than a phone the card header buttons always show', async ({ page }) => {
    await add(page, 'Note');
    await clickEmpty(page);
    for (const name of ['Collapse card', 'Delete card']) {
      const button = page.locator('.card').first().getByRole('button', { name });
      await expect(button).toBeVisible();
      expect(Number(await button.evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.9);
    }
  });
});

test('the Share panel says "Copied" only for the link that was copied', async ({ browser }) => {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  await page.goto(`/?demo-user=Copy${Math.random().toString(36).slice(2, 8)}`);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'New board' }).click();
  await page.locator('header.toolbar').getByRole('button', { name: 'Share' }).click();
  const share = page.getByRole('dialog', { name: /Share/ });
  await share.getByRole('button', { name: 'Share this board' }).click();
  await share.getByRole('button', { name: 'Copy link' }).click();
  await expect(share.getByRole('button', { name: 'Copied' })).toBeVisible();
  // A new link (turned off, then on again) has not been copied.
  await share.getByRole('button', { name: 'Turn links off' }).click();
  await share.getByRole('button', { name: 'Make an edit link' }).click();
  await expect(share.getByRole('button', { name: 'Copy link' })).toBeVisible();
  await expect(share.getByRole('button', { name: 'Copied' })).toHaveCount(0);
  await context.close();
});
