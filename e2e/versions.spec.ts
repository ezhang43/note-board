import { expect, test, type Page } from '@playwright/test';
import { add, clickEmpty } from './helpers';

// Version history (owner request, like Google Docs): look back at earlier versions and restore one.

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
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

test('versions are kept after the page is reloaded', async ({ page }) => {
  await twoDrafts(page, 'Keep me', 'Changed');
  await page.reload();
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  await page.getByRole('complementary', { name: 'Version history' }).getByRole('button', { name: /card/ }).first().click();
  await expect(page.getByLabel('Note text').first()).toHaveValue('Keep me');
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
