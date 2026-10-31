import { expect, test, type Page } from '@playwright/test';
import { freshBoardEachTest } from './helpers';

// The Journal's divider (owner decision 2026-10-31, "Button + type ---"): a thin line across the
// note, from the Divider button or by typing --- and Enter on an empty line. Its plain text is ---.

freshBoardEachTest();

const panel = (page: Page) => page.getByRole('complementary', { name: 'Journal' });
const editor = (page: Page) => panel(page).getByRole('textbox', { name: /^Journal, / }).first();
const tools = (page: Page) => panel(page).getByRole('toolbar', { name: 'Formatting' });
const divider = (page: Page) => tools(page).getByRole('button', { name: 'Divider', exact: true });
const blocks = (page: Page) => editor(page).locator(':scope > div');
const lines = (page: Page) => editor(page).getByRole('separator');
const openJournal = (page: Page) => page.locator('.corner-controls').getByRole('button', { name: 'Journal', exact: true }).click();
const styleMenu = (page: Page) => tools(page).getByRole('group', { name: 'Text style' });
async function pick(page: Page, group: string, name: string) {
  if (!(await styleMenu(page).isVisible())) await tools(page).getByRole('button', { name: 'Text style', exact: true }).click();
  await styleMenu(page).getByRole('group', { name: group }).getByRole('button', { name, exact: true }).click();
}
const types = (page: Page) => blocks(page).evaluateAll((els) => els.map((el) => `${(el as HTMLElement).dataset.type}:${el.getAttribute('data-type') === 'hr' ? '' : el.textContent}`));
/** The saved Journal note, straight from the browser's storage. */
const savedNote = (page: Page) =>
  page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
    const board = Object.values(raw.boards).find((b) => (b as { name: string }).name === 'Journal') as { cards: Record<string, { text: string; rich?: unknown }> };
    return Object.values(board.cards)[0];
  });

test('the Divider button puts a line under the current line and the cursor on a new line below it; it is kept after a reload', async ({ page }) => {
  await openJournal(page);
  await expect(divider(page)).toHaveAttribute('title', 'Divider');
  await page.keyboard.type('hello');
  await divider(page).click();
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('after');
  expect(await types(page)).toEqual(['p:hello', 'hr:', 'p:after']);
  // A thin line across the note's full width, in the border color.
  const line = lines(page);
  await expect(line).toHaveCount(1);
  const box = (await line.boundingBox())!;
  const note = (await editor(page).boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(2);
  expect(Math.round(box.width)).toBe(Math.round(note.width));
  // Saved: the note's text shows it as ---, its formatting as a divider.
  await page.waitForTimeout(400);
  const saved = await savedNote(page);
  expect(saved.text.split('\n').slice(1)).toEqual(['', 'hello', '---', 'after']);
  expect(saved.rich).toEqual([{ type: 'p', runs: [{ text: 'hello' }] }, { type: 'hr', runs: [{ text: '---' }] }, { type: 'p', runs: [{ text: 'after' }] }]);
  await page.reload();
  await openJournal(page);
  expect(await types(page)).toEqual(['p:hello', 'hr:', 'p:after']);
  await expect(lines(page)).toHaveCount(1);
});

test('the Divider button is its own undo step', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('hello');
  await divider(page).click();
  await expect(lines(page)).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(lines(page)).toHaveCount(0);
  await expect(editor(page)).toHaveText('hello');
  await page.keyboard.press('Control+y');
  await expect(lines(page)).toHaveCount(1);
});

test('typing --- on an empty line and pressing Enter makes a divider; --- anywhere else stays words', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('a ---');
  await page.keyboard.press('Enter');
  await page.keyboard.type('---');
  await page.keyboard.press('Enter');
  await page.keyboard.type('b');
  expect(await types(page)).toEqual(['p:a ---', 'hr:', 'p:b']);
  await page.waitForTimeout(400);
  expect((await savedNote(page)).text.split('\n').slice(2)).toEqual(['a ---', '---', 'b']);
});

test('Backspace at the start of the line after a divider, or Delete just before it, removes it; Ctrl+Z brings it back', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('top');
  await divider(page).click();
  await page.keyboard.type('below');
  await page.keyboard.press('Home');
  await page.waitForTimeout(1300); // a pause, so the typing above is an undo step of its own
  await page.keyboard.press('Backspace');
  expect(await types(page)).toEqual(['p:top', 'p:below']);
  await expect(editor(page)).toBeFocused();
  // The cursor stays at the start of "below": typing goes there.
  await page.keyboard.type('X');
  expect(await types(page)).toEqual(['p:top', 'p:Xbelow']);
  // Like any typing, the removal and the X are one undo step.
  await page.keyboard.press('Control+z');
  await expect(lines(page)).toHaveCount(1);
  expect(await types(page)).toEqual(['p:top', 'hr:', 'p:below']);
  // Delete at the end of the line above.
  await editor(page).locator(':scope > div').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Delete');
  expect(await types(page)).toEqual(['p:top', 'p:below']);
});

test('the Divider button has a keyboard focus ring', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.press('Escape'); // the keyboard leaves the note for the panel
  await divider(page).focus();
  await expect(divider(page)).toHaveCSS('outline-style', 'solid');
});

test('an older note with a --- line opens unchanged, as words', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('x');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
    const board = Object.values(raw.boards).find((b) => (b as { name: string }).name === 'Journal') as { cards: Record<string, { text: string; rich?: unknown }> };
    const note = Object.values(board.cards)[0];
    note.text = `${note.text.split('\n')[0]}\n\none\n---\ntwo`;
    delete note.rich;
    localStorage.setItem('note-board:v1', JSON.stringify(raw));
  });
  await page.reload();
  await openJournal(page);
  expect(await types(page)).toEqual(['p:one', 'p:---', 'p:two']);
  await expect(lines(page)).toHaveCount(0);
});

/** Gives today's note this formatting and plain text, then reopens the Journal. */
async function seed(page: Page, rich: unknown[], body: string) {
  await openJournal(page);
  await page.keyboard.type('x');
  await page.waitForTimeout(400);
  await page.evaluate(
    ([rich, body]) => {
      const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
      const board = Object.values(raw.boards).find((b) => (b as { name: string }).name === 'Journal') as { cards: Record<string, { text: string; rich?: unknown }> };
      const note = Object.values(board.cards)[0];
      note.text = `${note.text.split('\n')[0]}\n\n${body}`;
      note.rich = rich;
      localStorage.setItem('note-board:v1', JSON.stringify(raw));
    },
    [rich, body] as const,
  );
  await page.reload();
  await openJournal(page);
}
const HR = { type: 'hr', runs: [{ text: '---' }] };
test('clicking a divider puts the cursor beside it, so typing and the Divider button work there (check of #226)', async ({ page }) => {
  await seed(page, [HR, { type: 'p', runs: [{ text: 'ab' }] }, HR], '---\nab\n---');
  // The first line: there is no line above it, so the cursor goes to the start of the line below.
  await blocks(page).first().click();
  await page.keyboard.type('Z');
  expect(await types(page)).toEqual(['hr:', 'p:Zab', 'hr:']);
  // The last line: the end of the line above.
  await blocks(page).last().click();
  await page.keyboard.type('Y');
  expect(await types(page)).toEqual(['hr:', 'p:ZabY', 'hr:']);
  // The Divider button there adds its line after that line, not on top of the first divider.
  await blocks(page).first().click();
  await divider(page).click();
  expect(await types(page)).toEqual(['hr:', 'p:ZabY', 'hr:', 'p:', 'hr:']);
});

test('the Divider button on an empty heading line makes that line the divider (check of #226)', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('a');
  await page.keyboard.press('Enter');
  await pick(page, 'Style', 'Heading 1');
  await divider(page).click();
  await page.keyboard.type('b');
  expect(await types(page)).toEqual(['p:a', 'hr:', 'p:b']);
});

test('Select All and typing over a note that starts with a divider gives a plain line (check of #226)', async ({ page }) => {
  await seed(page, [HR, { type: 'p', runs: [{ text: 'a' }] }, { type: 'bullet', runs: [{ text: 'b' }] }], '---\na\n• b');
  await blocks(page).nth(1).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('new');
  expect(await types(page)).toEqual(['p:new']);
});

test('after Ctrl+Z brings a divider back, typing still goes into the note (check of #226)', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('top');
  await divider(page).click();
  await page.keyboard.type('below');
  await page.keyboard.press('Home');
  await page.waitForTimeout(1300); // its own undo step
  await page.keyboard.press('Backspace');
  expect(await types(page)).toEqual(['p:top', 'p:below']);
  await page.waitForTimeout(1300);
  await page.keyboard.press('Control+z');
  expect(await types(page)).toEqual(['p:top', 'hr:', 'p:below']);
  await page.keyboard.type('Y');
  expect(await types(page)).toEqual(['p:topY', 'hr:', 'p:below']);
});

test('the arrow keys move the cursor past a divider both ways (review of the #226 fixes)', async ({ page }) => {
  await seed(page, [{ type: 'p', runs: [{ text: 'a' }] }, HR, { type: 'p', runs: [{ text: 'b' }] }], 'a\n---\nb');
  await blocks(page).first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('X');
  expect(await types(page)).toEqual(['p:a', 'hr:', 'p:Xb']);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('Y');
  expect(await types(page)).toEqual(['p:aY', 'hr:', 'p:Xb']);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('Z');
  expect((await types(page))[2]).toContain('Z');
});

test('a note of nothing but dividers does not keep moving the cursor (review of the #226 fixes)', async ({ page }) => {
  await seed(page, [HR, HR], '---\n---');
  await editor(page).evaluate(() => {
    (window as unknown as { moves: number }).moves = 0;
    document.addEventListener('selectionchange', () => (window as unknown as { moves: number }).moves++);
  });
  await blocks(page).first().click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { moves: number }).moves)).toBeLessThan(10);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('the Divider button is finger-sized and works', async ({ page }) => {
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).locator('.phone-tiles').getByRole('button', { name: 'Journal', exact: true }).tap();
    const r = (await divider(page).boundingBox())!;
    expect(r.height).toBeGreaterThanOrEqual(44);
    expect(r.width).toBeGreaterThanOrEqual(44);
    expect(r.x + r.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await editor(page).tap();
    await page.keyboard.type('hi');
    await divider(page).tap();
    await expect(lines(page)).toHaveCount(1);
  });
});
