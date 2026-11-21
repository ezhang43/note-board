import { expect, test, type Page } from '@playwright/test';
import { freshBoardEachTest } from './helpers';

// Typed lists in the Journal (owner request, 2026-11-21): "1. " or "1) " at the start of a plain line starts a
// numbered list, "- " or "* " a bulleted one, as in Google Docs; deeper numbered levels go 1. a. i.

freshBoardEachTest();

const panel = (page: Page) => page.getByRole('complementary', { name: 'Journal' });
const editor = (page: Page) => panel(page).getByRole('textbox', { name: /^Journal, / }).first();
const blocks = (page: Page) => editor(page).locator(':scope > div');
const openJournal = (page: Page) => page.locator('.corner-controls').getByRole('button', { name: 'Journal', exact: true }).click();
const savedNote = (page: Page) =>
  page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
    const board = Object.values(raw.boards).find((b) => (b as { name: string }).name === 'Journal') as { cards: Record<string, { text: string; rich?: unknown }> };
    return Object.values(board.cards)[0];
  });
const markers = (page: Page) => blocks(page).evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.marker ?? ''));

test('"1. " starts a numbered list; Tab goes to a. then i.; Shift+Tab back; Enter continues; kept after a reload', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('1. one');
  await expect(blocks(page).first()).toHaveAttribute('data-type', 'number');
  await expect(blocks(page).first()).toHaveText('one');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('sub');
  await page.keyboard.press('Enter');
  await page.keyboard.type('sub two');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('deep');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type('two');
  await expect.poll(() => markers(page)).toEqual(['1.', 'a.', 'b.', 'i.', '2.']);
  await page.waitForTimeout(400);
  expect((await savedNote(page)).text.split('\n').slice(2)).toEqual(['1. one', '  a. sub', '  b. sub two', '    i. deep', '2. two']);
  await page.reload();
  await openJournal(page);
  await expect.poll(() => markers(page)).toEqual(['1.', 'a.', 'b.', 'i.', '2.']);
});

test('"1) " starts the ) style, which nests as a) and i) and stays after a reload', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('1) one');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('sub');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('deep');
  await expect.poll(() => markers(page)).toEqual(['1)', 'a)', 'i)']);
  await page.waitForTimeout(400);
  const saved = await savedNote(page);
  expect(saved.text.split('\n').slice(2)).toEqual(['1) one', '  a) sub', '    i) deep']);
  await page.reload();
  await openJournal(page);
  await expect.poll(() => markers(page)).toEqual(['1)', 'a)', 'i)']);
});

test('"- " and "* " start a bulleted list', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('- milk');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('* eggs');
  await expect(blocks(page).nth(0)).toHaveAttribute('data-type', 'bullet');
  await expect(blocks(page).nth(1)).toHaveAttribute('data-type', 'bullet');
  await expect(editor(page)).toHaveText('milkeggs');
});

test('Ctrl+Z right after brings back "1. " as words, the cursor after them', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('1. ');
  await expect(blocks(page).first()).toHaveAttribute('data-type', 'number');
  await page.keyboard.press('Control+z');
  await expect(blocks(page).first()).toHaveAttribute('data-type', 'p');
  await expect(editor(page)).toHaveText('1. ');
  // The cursor is after the words it brought back, so typing goes on after them.
  await page.keyboard.type('x');
  await expect(editor(page)).toHaveText('1. x');
});

test('"1. " mid-line, on a heading or inside a list, and "2. ", stay words', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('see 1. here');
  await page.keyboard.press('Enter');
  await page.keyboard.type('2. two');
  await page.keyboard.press('Enter');
  await page.keyboard.type('10. ten');
  await expect(blocks(page)).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(blocks(page).nth(i)).toHaveAttribute('data-type', 'p');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- a');
  await page.keyboard.press('Enter');
  await page.keyboard.type('1. b');
  await expect(blocks(page).nth(4)).toHaveAttribute('data-type', 'bullet');
  await expect(blocks(page).nth(4)).toHaveText('1. b');
});

test('a long marker (viii.) grows to the left of its item, not over the words', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('1. top');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('mid');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  for (let i = 1; i <= 8; i++) {
    await page.keyboard.type(`w${i}`);
    if (i < 8) await page.keyboard.press('Enter');
  }
  const item = blocks(page).nth(9);
  await expect(item).toHaveAttribute('data-marker', 'viii.');
  // Its words start where the short markers' items' words start, and the marker ends before them.
  const lefts = await blocks(page).evaluateAll((els) => els.slice(2).map((el) => el.querySelector('span')!.getBoundingClientRect().left));
  expect(new Set(lefts).size).toBe(1);
  const style = await item.evaluate((el) => {
    const s = getComputedStyle(el, '::before');
    return `${s.display} ${s.justifyContent}`;
  });
  expect(style).toBe('inline-flex flex-end');
});

test('the Numbered list button nests with letters too, and Backspace outdents then ends the item', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.press('Control+Shift+7');
  await page.keyboard.type('one');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('sub');
  await expect.poll(() => markers(page)).toEqual(['1.', 'a.']);
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await expect.poll(() => markers(page)).toEqual(['1.', '2.']);
  await page.keyboard.press('Backspace');
  await expect(blocks(page).nth(1)).toHaveAttribute('data-type', 'p');
});

// Owner request (2026-11-21): "for all types of lists, it shouldn't become grey, it should stay white". Every
// marker is drawn in the note's text color (--ink), in light and dark.
test('every list marker is the text color, in light and dark', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('- dot');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('1. one');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('sub');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('deep');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('1) paren');
  await expect.poll(() => markers(page)).toEqual(['•', '1.', 'a.', 'i.', '2)']); // the ) item counts on from the 1. above it (no plain line between)
  const colors = () => blocks(page).evaluateAll((els) => els.map((el) => [getComputedStyle(el, '::before').color, getComputedStyle(el).color]));
  const ink = () =>
    page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--ink)';
      document.body.append(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    });
  const seen = new Set<string>();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    const want = await ink();
    seen.add(want);
    for (const [marker, text] of await colors()) {
      expect(marker).toBe(want);
      expect(text).toBe(want);
    }
  }
  expect(seen.size).toBe(2); // the two themes really were checked
});
