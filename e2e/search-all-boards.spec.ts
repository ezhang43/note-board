import { expect, test, type Page } from '@playwright/test';
import { add, clickEmpty, freshBoardEachTest } from './helpers';

// Search across all boards (owner request, 2026-10-19, job 102): the bar opens on "This board" and
// has a switch to look on every board.

freshBoardEachTest();

const scopeRadio = (page: Page, name: 'This board' | 'All boards') => page.getByRole('search').getByRole('button', { name, exact: true });
const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Search the board' });
const status = (page: Page) => page.getByRole('search').getByRole('status');
const boardName = (page: Page) => page.getByLabel('Board name');

async function note(page: Page, text: string) {
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.type(text);
  await clickEmpty(page);
}

async function pickBoard(page: Page, item: string) {
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: item }).click();
}

/** Home holds "Milk"; a second board, Garage, holds "Call the plumber"; Home is open again. */
async function twoBoards(page: Page) {
  await boardName(page).fill('Home');
  await note(page, 'Milk');
  await pickBoard(page, 'New board');
  await boardName(page).fill('Garage');
  await note(page, 'Call the plumber');
  await pickBoard(page, 'Home');
  await expect(boardName(page)).toHaveValue('Home');
}

test('the search bar opens on This board, where a word from another board is not found', async ({ page }) => {
  await twoBoards(page);
  await page.keyboard.press('Control+f');
  await expect(scopeRadio(page, 'This board')).toHaveAttribute('aria-pressed', 'true');
  await expect(scopeRadio(page, 'All boards')).toHaveAttribute('aria-pressed', 'false');
  await searchBox(page).fill('plumber');
  await expect(status(page)).toHaveText('No matches');
});

test('All boards finds a word on a second board; Enter opens that board with the match marked', async ({ page }) => {
  await twoBoards(page);
  await page.keyboard.press('Control+f');
  await searchBox(page).fill('plumber');
  await scopeRadio(page, 'All boards').click();
  await expect(status(page)).toHaveText('1 of 1 · Garage');
  await expect(boardName(page)).toHaveValue('Home'); // finding it does not move you
  await searchBox(page).press('Enter');
  await expect(boardName(page)).toHaveValue('Garage');
  await expect(status(page)).toHaveText('1 of 1');
  const current = page.locator('mark.find-mark.current');
  await expect(current).toHaveText('plumber');
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  await expect
    .poll(async () => {
      const b = await current.boundingBox();
      return !!b && Math.abs(b.x + b.width / 2 - (canvas.x + canvas.width / 2)) < 60 && Math.abs(b.y + b.height / 2 - (canvas.y + canvas.height / 2)) < 60;
    })
    .toBe(true);

  // Back to This board: only the open board counts again.
  await scopeRadio(page, 'This board').click();
  await searchBox(page).fill('milk');
  await expect(status(page)).toHaveText('No matches');
  await scopeRadio(page, 'All boards').click();
  await expect(status(page)).toHaveText('1 of 1 · Home');
});

test('All boards counts the open board first, then the others, and leaves the boards as they were', async ({ page }) => {
  await twoBoards(page);
  await pickBoard(page, 'Garage');
  await note(page, 'Milk run');
  await page.keyboard.press('Control+f');
  await searchBox(page).fill('milk');
  await scopeRadio(page, 'All boards').click();
  await expect(status(page)).toHaveText('1 of 2'); // Garage, the open board, comes first
  await searchBox(page).press('Enter'); // the next match is on Home: that board opens
  await expect(boardName(page)).toHaveValue('Home');
  await expect(status(page)).toHaveText('2 of 2');
  await expect(page.locator('mark.find-mark.current')).toHaveText('Milk');
  await searchBox(page).press('Enter'); // wraps round to Garage's, opening it
  await expect(boardName(page)).toHaveValue('Garage');
  await expect(status(page)).toHaveText('1 of 2');
  await expect(page.locator('mark.find-mark.current')).toHaveText('Milk');
  await searchBox(page).press('Escape');
  await expect(page.getByLabel('Note text')).toHaveCount(2);
});

test('Escape and × close the bar, and the next search starts on This board again', async ({ page }) => {
  await twoBoards(page);
  await page.keyboard.press('Control+f');
  await scopeRadio(page, 'All boards').click();
  await expect(scopeRadio(page, 'All boards')).toHaveAttribute('aria-pressed', 'true');
  await searchBox(page).press('Escape');
  await expect(page.getByRole('search')).toBeHidden();
  await page.keyboard.press('Control+f');
  await expect(scopeRadio(page, 'This board')).toHaveAttribute('aria-pressed', 'true');
  await scopeRadio(page, 'All boards').click();
  await page.getByRole('button', { name: 'Close search' }).click();
  await page.keyboard.press('Control+f');
  await expect(scopeRadio(page, 'This board')).toHaveAttribute('aria-pressed', 'true');
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('the switch has 44px buttons inside the bar, and All boards opens the other board', async ({ page }) => {
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    const addNote = async (text: string) => {
      await bar.getByRole('button', { name: 'Add', exact: true }).tap();
      await page.getByRole('menuitem', { name: 'Note' }).tap();
      await page.keyboard.type(text);
      await page.mouse.click(200, 70);
    };
    await addNote('Milk');
    await page.locator('.boards-menu-wrap > button').tap();
    await page.getByRole('menuitem', { name: 'New board' }).tap();
    await addNote('Call the plumber');
    await page.locator('.boards-menu-wrap > button').tap();
    await page.locator('.boards-menu button[role=menuitem]').first().tap(); // Home, the first in the list
    await expect(page.getByText('Milk')).toBeVisible();

    await bar.getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Search' }).tap();
    await expect(scopeRadio(page, 'This board')).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['This board', 'All boards'] as const) {
      const b = (await scopeRadio(page, name).boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.width).toBeGreaterThanOrEqual(44);
    }
    const find = (await page.getByRole('search').boundingBox())!;
    expect(find.x).toBeGreaterThanOrEqual(0);
    expect(find.x + find.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await searchBox(page).fill('plumber');
    await scopeRadio(page, 'All boards').tap();
    await expect(status(page)).toContainText('1 of 1 · ');
    await page.getByRole('button', { name: 'Next match' }).tap();
    const current = page.locator('mark.find-mark.current');
    await expect(current).toHaveText('plumber');
    await expect(status(page)).toHaveText('1 of 1');
    await expect
      .poll(async () => {
        const m = await current.boundingBox();
        return !!m && m.x >= 0 && m.x + m.width <= 390 && m.y > 100 && m.y < 700;
      })
      .toBe(true);
  });
});
