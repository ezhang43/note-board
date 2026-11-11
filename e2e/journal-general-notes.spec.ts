import { expect, test, type Page } from '@playwright/test';
import { cards, freshBoardEachTest } from './helpers';

// Several general notes in the Journal panel, each with a name (owner request, 2026-11-10): a + in a
// note's header adds an "Untitled note" below it, clicking the name renames it, and a trash deletes it
// with Undo. Only the arrow folds a note.

freshBoardEachTest();

const panel = (page: Page) => page.getByRole('complementary', { name: 'Journal' });
const openJournal = (page: Page) => page.locator('.corner-controls').getByRole('button', { name: 'Journal', exact: true }).click();
const sections = (page: Page) => panel(page).locator('section.journal-notes');
const note = (page: Page, i: number) => sections(page).nth(i);
const fold = (page: Page, i: number) => note(page, i).locator('.jg-notes');
const nameBtn = (page: Page, i: number) => note(page, i).locator('.jn-name');
const add = (page: Page, i: number) => note(page, i).getByRole('button', { name: 'Add a general note' });
const trash = (page: Page, i: number) => note(page, i).locator('.jn-del');
const rename = (page: Page) => panel(page).locator('input.jn-rename');
const names = (page: Page) => sections(page).locator('.jn-name').allTextContents();
const savedNames = (page: Page) =>
  page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
    const board = Object.values(raw.boards).find((b) => (b as { name: string }).name === 'Journal') as { cards: Record<string, { text: string; general?: number }> };
    return Object.values(board.cards)
      .filter((c) => typeof c.general === 'number')
      .sort((a, b) => a.general! - b.general!)
      .map((c) => c.text.split('\n')[0]);
  });

test('+ adds an "Untitled note" right below, with the cursor in its name and the name selected', async ({ page }) => {
  await openJournal(page);
  await expect(sections(page)).toHaveCount(1);
  await expect(add(page, 0)).toHaveAttribute('title', 'Add a general note');
  await add(page, 0).click();
  await expect(sections(page)).toHaveCount(2);
  await expect(rename(page)).toBeFocused();
  await expect(rename(page)).toHaveValue('Untitled note');
  expect(await rename(page).evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 'Untitled note'.length]);
  await page.keyboard.type('Recipes');
  await page.keyboard.press('Enter');
  expect(await names(page)).toEqual(['General notes', 'Recipes']);
  // A + on the first again adds between them.
  await add(page, 0).click();
  await page.keyboard.press('Enter');
  expect(await names(page)).toEqual(['General notes', 'Untitled note', 'Recipes']);
  // The new note takes typing as its own.
  await note(page, 1).locator('.rich').click();
  await page.keyboard.type('flour');
  await page.waitForTimeout(400);
  expect(await savedNames(page)).toEqual(['General notes', 'Untitled note', 'Recipes']);
});

test('clicking a name renames it: Enter or leaving saves and is kept after a reload, Escape puts it back, empty is "Untitled note"', async ({ page }) => {
  await openJournal(page);
  await nameBtn(page, 0).click();
  await expect(rename(page)).toBeFocused();
  // Clicking the name does not fold the note.
  await expect(fold(page, 0)).toHaveAttribute('aria-expanded', 'true');
  await rename(page).fill('Ideas');
  await page.keyboard.press('Escape');
  await expect(rename(page)).toHaveCount(0);
  await expect(panel(page)).toBeVisible(); // Escape in the name does not close the panel
  expect(await names(page)).toEqual(['General notes']);
  await nameBtn(page, 0).click();
  await rename(page).fill('Ideas');
  await page.keyboard.press('Enter');
  expect(await names(page)).toEqual(['Ideas']);
  await nameBtn(page, 0).click();
  await rename(page).fill('Shopping');
  await note(page, 0).locator('.rich').click(); // leaving the field saves
  expect(await names(page)).toEqual(['Shopping']);
  await page.waitForTimeout(400);
  await page.reload();
  await openJournal(page);
  expect(await names(page)).toEqual(['Shopping']);
  await nameBtn(page, 0).click();
  await rename(page).fill('   ');
  await page.keyboard.press('Enter');
  expect(await names(page)).toEqual(['Untitled note']);
});

test('the trash deletes a note with "Deleted 1 note"; Ctrl+Z brings it back; the last note has no trash', async ({ page }) => {
  await openJournal(page);
  await expect(trash(page, 0)).toHaveCount(0);
  await note(page, 0).locator('.rich').click();
  await page.keyboard.type('keep');
  await add(page, 0).click();
  await page.keyboard.type('Second');
  await page.keyboard.press('Enter');
  await note(page, 1).locator('.rich').click();
  await page.keyboard.type('words in it');
  await expect(trash(page, 0)).toHaveAttribute('aria-label', 'Delete “General notes”');
  await trash(page, 1).click();
  await expect(sections(page)).toHaveCount(1);
  await expect(page.locator('.undo-toast')).toContainText('Deleted 1 note');
  await expect(trash(page, 0)).toHaveCount(0);
  await panel(page).focus();
  await page.keyboard.press('Control+z');
  await expect(sections(page)).toHaveCount(2);
  expect(await names(page)).toEqual(['General notes', 'Second']);
  await expect(note(page, 1).locator('.rich')).toHaveText('words in it');
  await expect(note(page, 0).locator('.rich')).toHaveText('keep');
  // The Undo button does the same.
  await trash(page, 0).click();
  await page.locator('.undo-toast').getByRole('button', { name: 'Undo' }).click();
  expect(await names(page)).toEqual(['General notes', 'Second']);
});

test('each note folds by its arrow only, showing its first line', async ({ page }) => {
  await openJournal(page);
  await add(page, 0).click();
  await page.keyboard.press('Enter');
  await note(page, 1).locator('.rich').click();
  await page.keyboard.type('Buy stamps\nmore');
  await fold(page, 1).click();
  await expect(fold(page, 1)).toHaveAttribute('aria-expanded', 'false');
  await expect(note(page, 1).locator('.rich')).toHaveCount(0);
  await expect(note(page, 1).locator('.jg-peek')).toHaveText('Buy stamps');
  await expect(fold(page, 0)).toHaveAttribute('aria-expanded', 'true');
  await fold(page, 1).press('Enter');
  await expect(note(page, 1).locator('.rich')).toHaveText(/Buy stamps/);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('the arrow, name, + and trash are each at least 44px to press', async ({ page }) => {
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).locator('.phone-tiles').getByRole('button', { name: 'Journal', exact: true }).tap();
    await add(page, 0).tap();
    await expect(rename(page)).toBeFocused();
    await page.keyboard.press('Enter');
    for (const el of [fold(page, 0), nameBtn(page, 0), add(page, 0), trash(page, 0)]) {
      const box = (await el.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    // Everything fits across the phone, even with a long name (cut with …).
    await nameBtn(page, 0).tap();
    await rename(page).fill('A very long name for a general note that goes on and on');
    await page.keyboard.press('Enter');
    const sheet = (await note(page, 0).boundingBox())!;
    const bin = (await trash(page, 0).boundingBox())!;
    expect(bin.x + bin.width).toBeLessThanOrEqual(sheet.x + sheet.width);
    await trash(page, 1).tap();
    await expect(sections(page)).toHaveCount(1);
  });
});

// Follow-up review of #246 (2026-11-10).

test('Enter that picks a character in an input method (IME) does not save the name', async ({ page }) => {
  await openJournal(page);
  await nameBtn(page, 0).click();
  await rename(page).fill('日本');
  await rename(page).dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229, bubbles: true });
  await expect(rename(page)).toBeFocused();
  await expect(rename(page)).toHaveValue('日本');
  expect(await names(page)).toEqual([]); // still typing: no name button yet
  await page.keyboard.press('Enter');
  expect(await names(page)).toEqual(['日本']);
});

test('two tabs agree: the general notes another tab remembers show here at once (storage event)', async ({ page, context }) => {
  await openJournal(page);
  await add(page, 0).click();
  await page.keyboard.type('Recipes');
  await page.keyboard.press('Enter');
  await add(page, 1).click();
  await page.keyboard.type('Trips');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  // An older app drops the places; this tab lists them from what it remembers.
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
    for (const b of Object.values(raw.boards) as { cards: Record<string, { general?: number }> }[]) for (const c of Object.values(b.cards)) delete c.general;
    localStorage.setItem('note-board:v1', JSON.stringify(raw));
  });
  await page.reload();
  await openJournal(page);
  expect(await names(page)).toEqual(['General notes', 'Recipes', 'Trips']);
  // Another tab remembers them in another order: this tab follows without a reload.
  const ids = await page.evaluate(() => JSON.parse(localStorage.getItem('note-board:journal-notes')!) as string[]);
  const other = await context.newPage();
  // A plain file of the same site, not the app, so nothing else in that tab writes to storage.
  await other.goto(new URL('/busyants-icon.svg', page.url()).href);
  await other.evaluate((ids) => localStorage.setItem('note-board:journal-notes', JSON.stringify([ids[0], ids[2], ids[1]])), ids);
  await other.close();
  await expect.poll(() => names(page)).toEqual(['General notes', 'Trips', 'Recipes']);
});

test('Escape during an input method (IME) does not throw the name away', async ({ page }) => {
  await openJournal(page);
  await nameBtn(page, 0).click();
  await rename(page).fill('日本');
  await rename(page).dispatchEvent('keydown', { key: 'Escape', isComposing: true, keyCode: 229, bubbles: true });
  await expect(rename(page)).toBeFocused();
  await expect(rename(page)).toHaveValue('日本');
  await page.keyboard.press('Enter');
  expect(await names(page)).toEqual(['日本']);
});

test('a name field that comes back does not take the cursor from a field outside the panel', async ({ page }) => {
  await openJournal(page);
  await add(page, 0).click();
  await page.keyboard.type('Rec');
  const key = (k: string) => panel(page).dispatchEvent('keydown', { key: k, ctrlKey: true, bubbles: true });
  await key('z');
  await expect(sections(page)).toHaveCount(1);
  const boardName = page.getByLabel('Board name');
  await boardName.evaluate((el: HTMLElement) => el.focus());
  await key('y');
  await expect(sections(page)).toHaveCount(2);
  await expect(rename(page)).toHaveValue('Rec');
  await expect(boardName).toBeFocused();
});

test('a name being typed comes back, with the cursor, when its note goes and comes back (undo, redo)', async ({ page }) => {
  await openJournal(page);
  await add(page, 0).click();
  await expect(rename(page)).toBeFocused();
  await page.keyboard.type('Rec');
  // Undo and redo from outside the field (as another device or the toolbar would), so the field never loses focus first.
  const key = (k: string) => panel(page).dispatchEvent('keydown', { key: k, ctrlKey: true, bubbles: true });
  await key('z');
  await expect(sections(page)).toHaveCount(1);
  await key('y');
  await expect(sections(page)).toHaveCount(2);
  await expect(rename(page)).toBeFocused();
  await expect(rename(page)).toHaveValue('Rec');
  await page.keyboard.press('Enter');
  expect(await names(page)).toEqual(['General notes', 'Rec']);
});

test('+ on the note not yet written, with the Journal board open behind the panel, puts the two notes clear of each other', async ({ page }) => {
  await page.getByLabel('Board name').fill('Journal');
  await page.keyboard.press('Enter');
  await openJournal(page);
  await add(page, 0).click();
  await page.keyboard.press('Enter');
  await expect(cards(page)).toHaveCount(3); // today's note and the two general notes
  await page.waitForTimeout(500); // drawn and tidied
  const boxes = await cards(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      expect(overlap, `cards ${i} and ${j} overlap`).toBe(false);
    }
});

test('after an older copy of the app drops their places, the panel still lists every general note, and the next rename writes them back', async ({ page }) => {
  await openJournal(page);
  await add(page, 0).click();
  await page.keyboard.type('Recipes');
  await page.keyboard.press('Enter');
  await add(page, 1).click();
  await page.keyboard.type('Trips');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  expect(await savedNames(page)).toEqual(['General notes', 'Recipes', 'Trips']);
  // What an older app saves: the same notes and words, without their places.
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
    for (const b of Object.values(raw.boards) as { cards: Record<string, { general?: number }> }[]) for (const c of Object.values(b.cards)) delete c.general;
    localStorage.setItem('note-board:v1', JSON.stringify(raw));
  });
  await page.reload();
  expect(await savedNames(page)).toEqual([]);
  await openJournal(page);
  await expect(sections(page)).toHaveCount(3);
  expect(await names(page)).toEqual(['General notes', 'Recipes', 'Trips']);
  await nameBtn(page, 2).click();
  await page.keyboard.type('Trips 2026');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  expect(await savedNames(page)).toEqual(['General notes', 'Recipes', 'Trips 2026']);
});
