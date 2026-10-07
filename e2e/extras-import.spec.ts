import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { add, box, cards, expectNoOverlaps, freshBoardEachTest, looseCards } from './helpers';

freshBoardEachTest();

const sample = fileURLToPath(new URL('./fixtures/milanote-sample.md', import.meta.url));

async function importSample(page: import('@playwright/test').Page) {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('header.toolbar').getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Import file…' }).click();
  await (await chooser).setFiles(sample);
}

test('importing a Milanote export adds its cards to the board, selected and not overlapping', async ({ page }) => {
  await add(page, 'Note');
  await cards(page).first().getByLabel('Note text').fill('Already here');
  await importSample(page);

  await expect(cards(page)).toHaveCount(8);
  await expect(page.getByLabel('Note text').first()).toHaveValue('Already here');
  await expect(page.locator('.card.selected')).toHaveCount(7);

  // Titles, items, nesting, ticks, notes and links come across.
  const titles = page.getByLabel('List title');
  await expect(titles).toHaveCount(5);
  await expect(titles.nth(0)).toHaveValue('Follow Up');
  await expect(titles.nth(1)).toHaveValue('Groceries');
  const groceries = cards(page).filter({ has: page.locator('input[value="Groceries"]') });
  await expect(groceries.getByRole('button', { name: 'Completed', exact: true })).toBeVisible();
  await expect(groceries.locator('textarea')).toHaveCount(5);
  await expect(page.getByLabel('Note text').nth(1)).toHaveValue(/^Dear \[Name\],\n\nThis is important/);
  await expect(page.getByLabel('Link title')).toHaveValue('Reading');

  await page.waitForTimeout(300);
  await expectNoOverlaps(page);

  // Imported cards sit in lanes, left to right from the top.
  const first = await box(looseCards(page).nth(1));
  const second = await box(looseCards(page).nth(2));
  expect(Math.abs(first.y - second.y)).toBeLessThan(2);
  expect(second.x).toBeGreaterThan(first.x + first.width);
});

test('one undo removes the whole import, and it is saved', async ({ page }) => {
  await importSample(page);
  await expect(cards(page)).toHaveCount(7);
  await page.reload();
  await expect(cards(page)).toHaveCount(7);
  await page.keyboard.press('Control+z');
  await expect(cards(page)).toHaveCount(7); // undo history doesn't survive a reload
  await importSample(page);
  await expect(cards(page)).toHaveCount(14);
  await page.keyboard.press('Control+z');
  await expect(cards(page)).toHaveCount(7);
});

/** Picks a file through File → Import file… */
async function importFile(page: import('@playwright/test').Page, name: string, text: string | Buffer) {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('header.toolbar').getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Import file…' }).click();
  await (await chooser).setFiles({ name, mimeType: 'text/plain', buffer: Buffer.isBuffer(text) ? text : Buffer.from(text) });
}

test('imports an Obsidian-style Markdown file: titled lists from headings and bullets, selected, one undo', async ({ page }) => {
  await importFile(page, 'Errands.md', '## Errands\n- [ ] Post office\n    - [x] Stamps\n\n## Packing\n- Socks\n- Hat\n\nCall Sam.\n');
  await expect(cards(page)).toHaveCount(3);
  await expect(page.locator('.card.selected')).toHaveCount(3);
  await expect(page.getByLabel('List title').nth(0)).toHaveValue('Errands');
  await expect(page.getByLabel('List title').nth(1)).toHaveValue('Packing');
  const packing = cards(page).filter({ has: page.locator('input[value="Packing"]') });
  await expect(packing.locator('textarea')).toHaveCount(2);
  await expect(page.getByLabel('Note text')).toHaveValue('Call Sam.');
  await page.keyboard.press('Control+z');
  await expect(cards(page)).toHaveCount(0);
});

test('imports a plain text file as one note per paragraph', async ({ page }) => {
  await importFile(page, 'notes.txt', 'Buy milk\n\nRing the bank\nabout the card\n\nhttps://example.com/recipe\n');
  await expect(cards(page)).toHaveCount(3);
  await expect(page.locator('.card.selected')).toHaveCount(3);
  await expect(page.getByLabel('Note text').nth(1)).toHaveValue('Ring the bank\nabout the card');
  await expect(page.locator('[data-kind="link"]')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(cards(page)).toHaveCount(0);
});

test('imports an HTML file without running its scripts: headings, nested lists with ticks, paragraphs', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', (d) => void (dialogs.push(d.message()), d.dismiss()));
  await importFile(
    page,
    'keep.html',
    `<html><head><title>T</title><script>alert('ran')</script></head><body>
     <h2>Trip</h2><ul><li><input type="checkbox" checked>Passport</li><li>Clothes<ul><li>Socks</li></ul></li></ul>
     <p>Hotel by the sea</p><img src="https://example.invalid/x.png" onerror="alert('img')"><script>alert('ran')</script></body></html>`,
  );
  await expect(cards(page)).toHaveCount(2);
  await expect(page.locator('.card.selected')).toHaveCount(2);
  const trip = cards(page).filter({ has: page.locator('input[value="Trip"]') });
  await expect(trip.getByRole('button', { name: 'Completed', exact: true })).toBeVisible(); // Passport was ticked
  await expect(page.getByLabel('Note text')).toHaveValue('Hotel by the sea');
  await page.waitForTimeout(200);
  expect(dialogs).toEqual([]);
  await page.keyboard.press('Control+z');
  await expect(cards(page)).toHaveCount(0);
});

test('a file it can’t read, or one over 5 MB, adds nothing and says so', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', (d) => void (dialogs.push(d.message()), d.dismiss()));
  await importFile(page, 'scan.pdf', '%PDF-1.7');
  await expect.poll(() => dialogs).toEqual(['BusyAnts can’t read that file yet.']);
  await importFile(page, 'huge.txt', Buffer.alloc(5 * 1024 * 1024 + 1, 'a'));
  await expect.poll(() => dialogs.length).toBe(2);
  expect(dialogs[1]).toMatch(/too big/);
  await expect(cards(page)).toHaveCount(0);
});

test('imports a Trello board export and a Google Keep note; other JSON adds nothing and says so', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', (d) => void (dialogs.push(d.message()), d.dismiss()));
  const trello = {
    name: 'Home jobs',
    lists: [{ id: 'L1', name: 'To do', closed: false, pos: 1 }, { id: 'L2', name: 'Old', closed: true, pos: 2 }],
    cards: [
      { id: 'c1', name: 'Paint fence', desc: 'White <img src=x onerror="alert(1)">', closed: false, idList: 'L1', pos: 1 },
      { id: 'c2', name: 'Gone', desc: '', closed: true, idList: 'L1', pos: 2 },
    ],
    checklists: [{ id: 'k1', idCard: 'c1', name: 'Steps', pos: 1, checkItems: [{ id: 'i1', name: 'Sand', state: 'complete', pos: 1 }] }],
  };
  await importFile(page, 'trello.json', JSON.stringify(trello));
  await expect(cards(page)).toHaveCount(2);
  await expect(page.locator('.card.selected')).toHaveCount(2);
  await expect(page.getByLabel('List title')).toHaveValue('To do');
  const list = cards(page).filter({ has: page.locator('input[value="To do"]') });
  await expect(list.locator('textarea').first()).toHaveValue('Paint fence');
  await expect(page.getByLabel('Note text')).toHaveValue('Paint fence\nWhite <img src=x onerror="alert(1)">');
  await page.keyboard.press('Control+z');
  await expect(cards(page)).toHaveCount(0);

  await importFile(page, 'Groceries.json', JSON.stringify({ isTrashed: false, title: 'Groceries', listContent: [{ text: 'Milk', isChecked: false }, { text: 'Eggs', isChecked: true }] }));
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByLabel('List title')).toHaveValue('Groceries');
  await expect(cards(page).getByRole('button', { name: 'Completed', exact: true })).toBeVisible(); // Eggs was ticked

  await importFile(page, 'other.json', '{"hello": "world"}');
  await expect.poll(() => dialogs).toEqual(['BusyAnts can only import JSON files from Trello or Google Keep.']);
  await expect(cards(page)).toHaveCount(1);
});
