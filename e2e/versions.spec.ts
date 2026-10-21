import { expect, test, type Page } from '@playwright/test';
import { add, clickEmpty } from './helpers';

// Version history (owner request, like Google Docs): look back at earlier versions and restore one.

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.evaluate(() => (localStorage.clear(), localStorage.setItem('note-board:tour-done', '1')));
  await page.reload();
});

/** A note with `text`, then 11 minutes later the same note changed to `later` (a version is saved in between). */
async function twoDrafts(page: Page, text: string, later: string) {
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.type(text);
  await clickEmpty(page);
  await page.clock.fastForward('11:00');
  const note = page.getByLabel('Note text').first();
  await note.fill(later);
  await clickEmpty(page);
}

test('the history lists earlier versions by day; one can be looked at, then restored (and undone)', async ({ page }) => {
  await twoDrafts(page, 'First draft', 'Second draft');
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Version history' });
  await expect(panel.getByRole('button', { name: /Current version/ })).toBeVisible();
  await expect(panel.getByText('Today')).toBeVisible();
  const versions = panel.getByRole('button', { name: /card|Empty board/ });
  await expect(versions).toHaveCount(2); // the empty board before the note, and "First draft"

  // Look at the newest earlier version: the board shows it, read-only.
  await versions.first().click();
  await expect(page.getByLabel('Note text').first()).toHaveValue('First draft');
  const banner = page.getByRole('region', { name: 'Looking at an earlier version' });
  await expect(banner).toBeVisible();
  await page.getByLabel('Note text').first().click({ force: true });
  await page.keyboard.type('xyz');
  await expect(page.getByLabel('Note text').first()).toHaveValue('First draft');

  // Back to the current board.
  await banner.getByRole('button', { name: 'Back to current' }).click();
  await expect(page.getByLabel('Note text').first()).toHaveValue('Second draft');

  // Restore it: the board goes back; the current one is kept as a version; Ctrl+Z undoes.
  await versions.first().click();
  await banner.getByRole('button', { name: 'Restore this version' }).click();
  await expect(banner).toBeHidden();
  await expect(page.getByLabel('Note text').first()).toHaveValue('First draft');
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  await expect(panel.getByRole('button', { name: /card|Empty board/ })).toHaveCount(3);
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  await page.keyboard.press('Control+z');
  await expect(page.getByLabel('Note text').first()).toHaveValue('Second draft');
});

test('restoring a version brings back the Journal panel’s writing too (check of PR #94)', async ({ page }) => {
  const journal = page.getByRole('complementary', { name: 'Journal' });
  const journalButton = page.locator('.corner-controls').getByRole('button', { name: 'Journal', exact: true });
  await journalButton.click();
  await page.keyboard.type('First words');
  await journal.getByRole('button', { name: 'Close journal' }).click();
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.type('Home note');
  await clickEmpty(page);
  await page.clock.fastForward('11:00');
  await journalButton.click();
  await journal.getByRole('textbox').first().fill('Second words');
  await journal.getByRole('button', { name: 'Close journal' }).click();
  await page.getByLabel('Note text').first().fill('Home later');
  await clickEmpty(page);

  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  await page.getByRole('complementary', { name: 'Version history' }).getByRole('button', { name: /card/ }).first().click();
  await page.getByRole('region', { name: 'Looking at an earlier version' }).getByRole('button', { name: 'Restore this version' }).click();
  await expect(page.getByLabel('Note text').first()).toHaveValue('Home note');
  await journalButton.click();
  await expect(journal.getByRole('textbox').first()).toHaveText('First words');
});

test('versions are kept after the page is reloaded', async ({ page }) => {
  await twoDrafts(page, 'Keep me', 'Changed');
  await page.reload();
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  await page.getByRole('complementary', { name: 'Version history' }).getByRole('button', { name: /card/ }).first().click();
  await expect(page.getByLabel('Note text').first()).toHaveValue('Keep me');
});

test('a version that arrives while a card is being dragged does not crash the board', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await twoDrafts(page, 'First draft', 'Second draft');
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Version history' });
  const empty = panel.getByRole('button', { name: /Empty board/ });
  await expect(empty).toBeVisible();
  // Hold the note mid-drag, then the version from before the note existed arrives.
  const b = (await page.locator('[data-card-id]').first().boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + 18);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 60, b.y + 80, { steps: 5 });
  await expect(page.locator('.card.dragging')).toHaveCount(1);
  await empty.evaluate((el) => (el as HTMLElement).click());
  await expect(page.getByRole('region', { name: 'Looking at an earlier version' })).toBeVisible();
  await page.mouse.up();
  expect(errors).toEqual([]);
  await expect(page.getByTestId('canvas')).toBeVisible();
  await expect(page.locator('[data-card-id]')).toHaveCount(0);
  await page.getByRole('region', { name: 'Looking at an earlier version' }).getByRole('button', { name: 'Back to current' }).click();
  await expect(page.getByLabel('Note text').first()).toHaveValue('Second draft');
});

test('a version still loading when you go back, close, or press Escape does not switch the preview on', async ({ page }) => {
  await twoDrafts(page, 'First draft', 'Second draft');
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Version history' });
  const row = panel.getByRole('button', { name: /First draft|1 card/ }).first();
  await expect(row).toBeVisible();
  const banner = page.getByRole('region', { name: 'Looking at an earlier version' });
  // Each case clicks the version and, in the same instant (before it has loaded), leaves.
  const rowThen = (leave: string) =>
    page.evaluate((how) => {
      const rows = document.querySelectorAll('.history-panel .history-row');
      (rows[1] as HTMLElement).click();
      if (how === 'current') (rows[0] as HTMLElement).click();
      if (how === 'close') (document.querySelector('[aria-label="Close version history"]') as HTMLElement).click();
      if (how === 'escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }, leave);

  await rowThen('current');
  await page.clock.runFor(300);
  await expect(banner).toHaveCount(0);

  await rowThen('escape'); // closes the history, as nothing was being looked at yet
  await page.clock.runFor(300);
  await expect(banner).toHaveCount(0);
  await expect(panel).toHaveCount(0);

  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  await expect(row).toBeVisible();
  await rowThen('close');
  await page.clock.runFor(300);
  await expect(banner).toHaveCount(0);
  await expect(panel).toHaveCount(0);
  await expect(page.getByLabel('Note text').first()).toHaveValue('Second draft');
});

test('Escape goes back to the current board, then closes the history; one meant for something else leaves it open', async ({ page }) => {
  await twoDrafts(page, 'First draft', 'Second draft');
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Version history' });
  const banner = page.getByRole('region', { name: 'Looking at an earlier version' });
  await panel.getByRole('button', { name: /card|Empty board/ }).first().click();
  await expect(banner).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(banner).toHaveCount(0);
  await expect(panel).toBeVisible();
  // Also with the cursor in a box of the old version: Escape still goes back to the current board.
  await panel.getByRole('button', { name: /card/ }).first().click();
  await page.getByLabel('Note text').first().click({ force: true });
  await page.keyboard.press('Escape');
  await expect(banner).toHaveCount(0);
  await expect(panel).toBeVisible();
  // Leaving a text box.
  await page.getByLabel('Note text').first().click();
  await page.keyboard.press('Escape');
  await expect(panel).toBeVisible();
  // The shortcuts list.
  await clickEmpty(page);
  await page.keyboard.press('?');
  const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(shortcuts).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(shortcuts).toHaveCount(0);
  await expect(panel).toBeVisible();
  // A toolbar menu.
  await page.locator('header.toolbar').getByRole('button', { name: 'File' }).click();
  const menu = page.getByRole('menu', { name: 'File' });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(panel).toBeVisible();
  // Nothing else wants it: it closes.
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

// Job #147: changes from another device (only on the published site) keep the boards from just
// before them as a version; here one is put in place as that would have saved it.
test('a version kept from just before changes from another device says so, and shows that work', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.type('Work done here');
  await clickEmpty(page);
  await page.clock.fastForward('00:02');
  await page.evaluate(() => {
    localStorage.setItem('note-board:version:x1', localStorage.getItem('note-board:v1')!);
    localStorage.setItem('note-board:versions:v1', JSON.stringify([{ id: 'x1', savedAt: Date.now(), cards: 1, columns: 0, kind: 'outside' }]));
  });
  await page.reload();
  await page.getByLabel('Note text').first().fill('Old copy from the phone');
  await clickEmpty(page);
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  const row = page.getByRole('complementary', { name: 'Version history' }).getByRole('button', { name: /Before changes from another device · 1 card/ });
  await row.click();
  await expect(page.getByLabel('Note text').first()).toHaveValue('Work done here');
  await expect(page.getByRole('region', { name: 'Looking at an earlier version' })).toContainText('Before changes from another device');
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('version history is in ⋯; picking a version shows it full screen with Restore', async ({ page }) => {
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    await bar.getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'Note' }).tap();
    await page.keyboard.type('Phone draft');
    await page.mouse.click(200, 70);
    await page.clock.fastForward('11:00');
    await page.getByLabel('Note text').first().fill('Phone later');
    await page.mouse.click(200, 70);

    await bar.getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Version history', exact: true }).tap();
    const panel = page.getByRole('complementary', { name: 'Version history' });
    const p = (await panel.boundingBox())!;
    expect(p.width).toBeGreaterThan(380); // the whole width
    await panel.getByRole('button', { name: /card/ }).first().tap();
    await expect(panel).toBeHidden(); // out of the way of the board
    await expect(page.getByLabel('Note text').first()).toHaveValue('Phone draft');
    await page.getByRole('region', { name: 'Looking at an earlier version' }).getByRole('button', { name: 'Restore this version' }).tap();
    await expect(page.getByLabel('Note text').first()).toHaveValue('Phone draft');
  });
});
