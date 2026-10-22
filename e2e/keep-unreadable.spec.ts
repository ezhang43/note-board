import { expect, test, type Page } from '@playwright/test';
import { add, cards, freshBoardEachTest } from './helpers';

// Job #160: a save on this device that can't be read is never lost, and a note says what happened.
freshBoardEachTest();

/** Put `raw` in as the saved boards before the app starts (once: it saves its own as the page closes). */
async function seed(page: Page, raw: string) {
  await page.addInitScript((r) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('note-board:v1', r);
    }
  }, raw);
  await page.reload();
}

test('a damaged save is kept as a copy, with a note, and the board starts fresh', async ({ page }) => {
  const raw = '{"version":3,"home":"home","boards":{"home":{"na';
  await seed(page, raw);
  await expect(page.getByRole('status').filter({ hasText: 'Your saved boards couldn’t be read' })).toContainText('A copy was kept on this device');
  await expect(cards(page)).toHaveCount(0);

  await add(page, 'Note');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('note-board:v1') ?? '')).toContain('"version":3,"home"');
  expect(await page.evaluate(() => localStorage.getItem('note-board:v1:unreadable'))).toBe(raw);

  // Opened again, the new board loads as usual: no note.
  await page.reload();
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByText('Your saved boards couldn’t be read')).toHaveCount(0);
});

test('a save from a newer version of the app is left as it is', async ({ page }) => {
  const raw = JSON.stringify({ version: 99, home: 'home', boards: { home: { name: 'From the future' } } });
  await seed(page, raw);
  await expect(page.getByRole('status').filter({ hasText: 'saved by a newer version of the app' })).toContainText('Reload the page');
  await add(page, 'Note');
  await expect(cards(page)).toHaveCount(1);
  // Saves still waiting go out as the page is hidden: this one mustn't.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => localStorage.getItem('note-board:v1'))).toBe(raw);
});
