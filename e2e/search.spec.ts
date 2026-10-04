import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, clickEmpty, freshBoardEachTest } from './helpers';

// Search (owner request): find text anywhere on the board; the board moves to each match, marked.

freshBoardEachTest();

async function note(page: Page, text: string) {
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.type(text);
  await clickEmpty(page);
}

async function scrollAway(page: Page) {
  const c = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(900, 700);
}

/** Whether `l` is on screen, near the middle of the board area. */
async function nearMiddle(page: Page, l: Locator) {
  const c = (await page.getByTestId('canvas').boundingBox())!;
  const b = await l.boundingBox();
  if (!b) return false;
  return Math.abs(b.x + b.width / 2 - (c.x + c.width / 2)) < 60 && Math.abs(b.y + b.height / 2 - (c.y + c.height / 2)) < 60;
}

test('Ctrl+F searches the board: every match marked, the board moves to each in turn', async ({ page }) => {
  await note(page, 'Buy eggs');
  await note(page, 'Bake a cake');
  await note(page, 'Eggs for the cake');
  await scrollAway(page);
  await page.keyboard.press('Control+f');
  const box = page.getByRole('searchbox', { name: 'Search the board' });
  await expect(box).toBeFocused();
  await box.fill('eggs');
  const bar = page.getByRole('search', { name: 'Search the board' });
  await expect(bar.getByRole('status')).toHaveText('1 of 2');
  await expect(page.locator('mark.find-mark')).toHaveCount(2);
  const current = page.locator('mark.find-mark.current');
  await expect(current).toHaveCount(1);
  await expect.poll(() => nearMiddle(page, current)).toBe(true);
  const first = await current.evaluate((m) => m.closest('[data-find]')!.getAttribute('data-find'));

  await box.press('Enter');
  await expect(bar.getByRole('status')).toHaveText('2 of 2');
  await expect.poll(() => current.evaluate((m) => m.closest('[data-find]')!.getAttribute('data-find'))).not.toBe(first);
  await expect.poll(() => nearMiddle(page, current)).toBe(true);
  await box.press('Enter'); // wraps round
  await expect(bar.getByRole('status')).toHaveText('1 of 2');
  await box.press('Shift+Enter');
  await expect(bar.getByRole('status')).toHaveText('2 of 2');

  await box.fill('nothing like this');
  await expect(bar.getByRole('status')).toHaveText('No matches');
  await box.press('Escape');
  await expect(bar).toBeHidden();
  await expect(page.locator('mark.find-mark')).toHaveCount(0);
});

test('Ctrl+F while typing in a card opens the board search too', async ({ page }) => {
  await note(page, 'Hello');
  await page.getByLabel('Note text').first().click();
  await page.keyboard.press('Control+f');
  await expect(page.getByRole('searchbox', { name: 'Search the board' })).toBeFocused();
});

test('a match inside a collapsed card marks the card instead', async ({ page }) => {
  await note(page, 'Secret plan');
  const card = page.locator('[data-card-id]').first();
  await card.getByRole('button', { name: /Collapse/ }).click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search the board' }).fill('plan');
  await expect(page.getByRole('search').getByRole('status')).toHaveText('1 of 1 · in a closed card');
  await expect(card).toHaveClass(/find-target/);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('search is in ⋯ and brings the match into view', async ({ page }) => {
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    for (const text of ['Milk', 'Call the plumber']) {
      await bar.getByRole('button', { name: 'Add', exact: true }).tap();
      await page.getByRole('menuitem', { name: 'Note' }).tap();
      await page.keyboard.type(text);
      await page.mouse.click(200, 70);
    }
    await scrollAway(page);
    await bar.getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Search' }).tap();
    await page.getByRole('searchbox', { name: 'Search the board' }).fill('plumber');
    const current = page.locator('mark.find-mark.current');
    await expect(current).toHaveCount(1);
    await expect.poll(async () => {
      const b = await current.boundingBox();
      return !!b && b.x >= 0 && b.x + b.width <= 390 && b.y > 100 && b.y < 700;
    }).toBe(true);
  });
});
