import { expect, test } from '@playwright/test';
import { add, box, cards, clickEmpty, freshBoardEachTest } from './helpers';

// Ids come from saved boards and backups, so they can hold characters that mean something in a
// CSS selector (a quote, a bracket, a backslash). Looking cards and items up by id must not throw.

freshBoardEachTest();

test('cards and items whose saved ids hold odd characters still work with search, Shift+click, Alt+arrows and Colour', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.type('Buy eggs');
  await clickEmpty(page);
  await add(page, 'Checklist');
  await page.keyboard.type('one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('two');
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.type('More eggs');
  await clickEmpty(page);
  await cards(page).nth(2).getByRole('button', { name: /Collapse/ }).click();
  await clickEmpty(page);

  // Give every card and item an id like k_1234abcd"]\x (once the board has been saved).
  await expect.poll(() => page.evaluate(() => localStorage.getItem('note-board:v1') ?? '')).toContain('"collapsed":true');
  const saved = await page.evaluate(() =>
    localStorage.getItem('note-board:v1')!.replace(/"([ki]_[0-9a-f]{8})"/g, (_, id) => JSON.stringify(`${id}"]\\x`)),
  );
  expect(saved).toContain('\\"]\\\\x');
  // Put in before the app starts (it saves its own board as the page closes).
  await page.addInitScript((raw) => localStorage.setItem('note-board:v1', raw), saved);
  await page.reload();
  await expect(cards(page)).toHaveCount(3);
  const note = page.locator('.card').filter({ has: page.getByLabel('Note text') }).first();
  const list = page.locator('.card').filter({ has: page.getByLabel('Item text') });

  // Search: one match in an open note, one in a collapsed note.
  await page.keyboard.press('Control+f');
  await page.getByRole('searchbox', { name: 'Search the board' }).fill('eggs');
  const status = page.getByRole('search').getByRole('status');
  await expect(status).toHaveText(/^1 of 2/);
  await page.keyboard.press('Enter');
  await expect(status).toHaveText(/^2 of 2/);
  await page.keyboard.press('Escape');

  // Shift+click from the item being typed in.
  await list.getByLabel('Item text').nth(0).click();
  await list.getByLabel('Item text').nth(1).click({ modifiers: ['Shift'] });
  await expect(list.locator('.todo-item.picked')).toHaveCount(2);
  await page.keyboard.press('Escape');

  // Alt+arrow from a selected (not typed-in) card.
  await note.getByLabel('Note text').click();
  await page.keyboard.press('Escape');
  await expect(note).toHaveClass(/selected/);
  const n = await box(note);
  const l = await box(list);
  const dx = l.x - n.x;
  const dy = l.y - n.y;
  const key = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : dy > 0 ? 'ArrowDown' : 'ArrowUp';
  await page.keyboard.press(`Alt+${key}`);
  await expect(note).not.toHaveClass(/selected/);

  // The Colour menu looks up the selected card to keep it in view.
  await clickEmpty(page);
  await note.getByLabel('Note text').click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Colour of selected cards and columns' }).click();
  await expect(page.getByRole('button', { name: 'Default' })).toBeVisible();
  // freshBoardEachTest fails the test if the page threw along the way.
});
