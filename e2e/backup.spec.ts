import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { add, cards, freshBoardEachTest } from './helpers';

// Backup (owner request, 2026-10-05): File menu → download the board as a backup file or as
// readable text, and restore a backup.

freshBoardEachTest();

async function fileMenu(page: Page, item: string) {
  await page.locator('header.toolbar').getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

async function download(page: Page, item: string) {
  const waiting = page.waitForEvent('download');
  await fileMenu(page, item);
  const d = await waiting;
  return { name: d.suggestedFilename(), text: readFileSync((await d.path())!, 'utf8') };
}

test('Download backup saves the whole board as a file, which Restore from backup puts back (Ctrl+Z undoes it)', async ({ page }, info) => {
  await page.getByLabel('Board name').fill('Home');
  await add(page, 'Note');
  await cards(page).first().getByLabel('Note text').fill('Keep me');
  const backup = await download(page, 'Download backup');
  expect(backup.name).toMatch(/^BusyAnts - Home - \d{4}-\d\d-\d\d\.json$/);
  expect(JSON.parse(backup.text).boards.home.name).toBe('Home');

  // Change the board, then restore the backup.
  await cards(page).first().getByLabel('Note text').fill('Changed');
  await add(page, 'Note');
  const file = info.outputPath('backup.json');
  writeFileSync(file, backup.text);
  page.once('dialog', (d) => d.accept());
  const chooser = page.waitForEvent('filechooser');
  await fileMenu(page, 'Restore from backup…');
  await (await chooser).setFiles(file);
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first().getByLabel('Note text')).toHaveValue('Keep me');

  await page.mouse.click(5, 300); // leave any text box, so Ctrl+Z undoes the restore
  await page.keyboard.press('Control+z');
  await expect(cards(page)).toHaveCount(2);
});

test('a file that isn’t a BusyAnts backup changes nothing and says so', async ({ page }, info) => {
  await add(page, 'Note');
  const file = info.outputPath('not-a-backup.json');
  writeFileSync(file, '{"hello": 1}');
  const message = new Promise<string>((resolve) => page.once('dialog', (d) => (resolve(d.message()), d.dismiss())));
  const chooser = page.waitForEvent('filechooser');
  await fileMenu(page, 'Restore from backup…');
  await (await chooser).setFiles(file);
  expect(await message).toContain('isn’t a BusyAnts backup');
  await expect(cards(page)).toHaveCount(1);
});

test('Download as text saves the board as readable Markdown', async ({ page }) => {
  await add(page, 'To-do list');
  await cards(page).first().getByLabel('List title').fill('Groceries');
  await cards(page).first().getByLabel('Item text').first().fill('Milk');
  const text = await download(page, 'Download as text');
  expect(text.name).toMatch(/\.md$/);
  expect(text.text).toContain('# My first board');
  expect(text.text).toContain('### Groceries');
  expect(text.text).toContain('- [ ] Milk');
});
