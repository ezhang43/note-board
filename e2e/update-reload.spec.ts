import { expect, test, type Page } from '@playwright/test';
import { add, cards, freshBoardEachTest } from './helpers';

// Interface review 181 C-L7: after the site is updated, a tab opened before it can't download the
// picture or PDF code any more (the old files are gone). The note says to reload, with a Reload button.

freshBoardEachTest();

const banner = (page: Page) => page.locator('.notice-banner');
const UPDATED = 'BusyAnts was updated. Reload the page to use this.';

async function pickFromFileMenu(page: Page, item: string) {
  await page.locator('header.toolbar').getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test('Download as picture, with its code gone, says BusyAnts was updated and Reload reloads the page', async ({ page }) => {
  await add(page, 'Note');
  await cards(page).first().getByLabel('Note text').fill('Keep me');
  await page.route(/html-to-image/, (route) => route.abort());
  await pickFromFileMenu(page, 'Download as picture (PNG)');
  await expect(banner(page)).toContainText(UPDATED);
  await page.unroute(/html-to-image/);
  await page.evaluate(() => ((window as unknown as { stillHere: boolean }).stillHere = true));
  await banner(page).getByRole('button', { name: 'Reload' }).click();
  await expect(banner(page)).toHaveCount(0);
  await expect(page.getByLabel('Note text')).toHaveValue('Keep me'); // the board comes back as it was saved
  expect(await page.evaluate(() => (window as unknown as { stillHere?: boolean }).stillHere)).toBeUndefined(); // the page really reloaded
});

test('importing a PDF, with the PDF reader’s code gone, says BusyAnts was updated, not that the file is broken', async ({ page }) => {
  await page.route(/pdfjs-dist|pdf\.worker/, (route) => route.abort());
  const chooser = page.waitForEvent('filechooser');
  await pickFromFileMenu(page, 'Import file…');
  await (await chooser).setFiles({ name: 'good.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 fine') });
  await expect(banner(page)).toContainText(UPDATED);
  await expect(banner(page)).not.toContainText('can’t read');
});
