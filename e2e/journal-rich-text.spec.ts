import { expect, test, type Page } from '@playwright/test';
import { cards, freshBoardEachTest } from './helpers';

// Rich text in Journal notes (owner request, 2026-10-19): lists, bold / italic / underline /
// strikethrough, headings, text size, fonts and a highlight colour, in the Journal panel only.
// The note's plain text stays what the rest of the app (the board card, search, export, copy) sees.

freshBoardEachTest();

const panel = (page: Page) => page.getByRole('complementary', { name: 'Journal' });
const editor = (page: Page) => panel(page).getByRole('textbox').first();
const tools = (page: Page) => panel(page).getByRole('toolbar', { name: 'Formatting' });
const tool = (page: Page, name: string) => tools(page).getByRole('button', { name, exact: true });
// Style, size, font and highlight are in one Aa menu (the page-and-timeline design, owner pick 2026-10-22).
const styleMenu = (page: Page) => tools(page).getByRole('group', { name: 'Text style' });
const choice = (page: Page, group: string, name: string) => styleMenu(page).getByRole('group', { name: group }).getByRole('button', { name, exact: true });
async function pick(page: Page, group: string, name: string) {
  if (!(await styleMenu(page).isVisible())) await tool(page, 'Text style').click();
  await choice(page, group, name).click();
}
const blocks = (page: Page) => editor(page).locator(':scope > div');
const openJournal = (page: Page) => page.locator('.corner-controls').getByRole('button', { name: 'Journal', exact: true }).click();
/** The saved Journal note, straight from the browser's storage. */
const savedNote = (page: Page) =>
  page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
    const board = Object.values(raw.boards).find((b) => (b as { name: string }).name === 'Journal') as { cards: Record<string, { text: string; rich?: unknown }> };
    return Object.values(board.cards)[0];
  });
/** Selects letters `from`..`to` of the line the caret is on. */
async function selectLetters(page: Page, from: number, to: number) {
  await page.keyboard.press('Home');
  for (let i = 0; i < from; i++) await page.keyboard.press('ArrowRight');
  for (let i = from; i < to; i++) await page.keyboard.press('Shift+ArrowRight');
}

test('bold, italic, underline and strikethrough on selected words, from the toolbar or the keyboard', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('hello big world');
  await selectLetters(page, 0, 5);
  await tool(page, 'Bold').click();
  await expect(tool(page, 'Bold')).toHaveAttribute('aria-pressed', 'true');
  await expect(editor(page)).toBeFocused();
  await expect(editor(page).locator('[data-b]')).toHaveText('hello');
  await selectLetters(page, 6, 9);
  await page.keyboard.press('Control+i');
  await page.keyboard.press('Control+u');
  await page.keyboard.press('Control+Shift+x');
  const big = editor(page).locator('[data-i][data-u][data-s]');
  await expect(big).toHaveText('big');
  await expect(big).toHaveCSS('font-style', 'italic');
  await expect(big).toHaveCSS('text-decoration-line', 'underline line-through');
  await expect(tool(page, 'Bold')).toHaveAttribute('aria-pressed', 'false');
  // Bold before typing: what is typed next is bold.
  await page.keyboard.press('End');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('!');
  await expect(editor(page).locator('[data-b]').last()).toHaveText('!');
  await expect(editor(page)).toHaveText('hello big world!');
  // Each format change is its own undo step; the words stay.
  await page.keyboard.press('Control+z');
  await expect(editor(page).locator('[data-b]')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(editor(page).locator('[data-s]')).toHaveCount(0);
  await expect(editor(page)).toHaveText('hello big world');
});

test('lists: Enter continues one, Tab indents, Shift+Tab outdents, Enter on an empty item ends it', async ({ page }) => {
  await openJournal(page);
  await tool(page, 'Bulleted list').click();
  await expect(tool(page, 'Bulleted list')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.type('milk');
  await page.keyboard.press('Enter');
  await page.keyboard.type('oat');
  await page.keyboard.press('Tab');
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.type('eggs');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('done');
  await expect(blocks(page)).toHaveCount(4);
  await expect(blocks(page).nth(0)).toHaveAttribute('data-type', 'bullet');
  await expect(blocks(page).nth(1)).toHaveAttribute('data-indent', '1');
  await expect(blocks(page).nth(2)).not.toHaveAttribute('data-indent');
  await expect(blocks(page).nth(3)).toHaveAttribute('data-type', 'p');
  // Numbered list from the keyboard; its numbers count up.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+Shift+7');
  await page.keyboard.type('first');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second');
  await expect(blocks(page).nth(5)).toHaveAttribute('data-type', 'number');
  await expect(blocks(page).nth(5)).toHaveAttribute('data-marker', '2.');
  await page.waitForTimeout(400);
  expect((await savedNote(page)).text.split('\n').slice(2)).toEqual(['• milk', '  • oat', '• eggs', 'done', '1. first', '2. second']);
  // Outside a list, Tab leaves the text as usual (no keyboard trap).
  await page.keyboard.press('Control+Shift+7');
  await page.keyboard.press('Tab');
  await expect(editor(page)).not.toBeFocused();
});

test('headings, text size, font and highlight from the toolbar', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('Plans');
  await pick(page, 'Style', 'Heading 1');
  await expect(blocks(page).first()).toHaveAttribute('data-type', 'h1');
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('a quiet day');
  await expect(blocks(page).nth(1)).toHaveAttribute('data-type', 'p');
  await selectLetters(page, 2, 7);
  await pick(page, 'Text size', 'Large');
  await pick(page, 'Font', 'Typewriter');
  await pick(page, 'Highlight', 'Yellow');
  const quiet = editor(page).locator('[data-size="large"][data-font="mono"][data-hl="yellow"]');
  await expect(quiet).toHaveText('quiet');
  await expect(quiet).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(choice(page, 'Highlight', 'Yellow')).toHaveAttribute('aria-pressed', 'true');
  await expect(choice(page, 'Font', 'Typewriter')).toHaveAttribute('aria-pressed', 'true');
  await expect(choice(page, 'Text size', 'Large')).toHaveAttribute('aria-pressed', 'true');
  // None takes the highlight off again.
  await pick(page, 'Highlight', 'None');
  await expect(editor(page).locator('[data-hl]')).toHaveCount(0);
});

test('formatting is kept after a reload; the note’s saved text, and its card on the Journal board, stay plain', async ({ page }) => {
  await openJournal(page);
  await tool(page, 'Bulleted list').click();
  await page.keyboard.type('milk');
  await selectLetters(page, 0, 4);
  await page.keyboard.press('Control+b');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('eggs');
  await page.waitForTimeout(400);
  const saved = await savedNote(page);
  expect(saved.text.split('\n').slice(1)).toEqual(['', '• milk', '• eggs']);
  expect(saved.rich).toEqual([
    { type: 'bullet', runs: [{ text: 'milk', b: true }] },
    { type: 'bullet', runs: [{ text: 'eggs' }] },
  ]);
  await page.reload();
  await openJournal(page);
  await expect(blocks(page).nth(0)).toHaveAttribute('data-type', 'bullet');
  await expect(editor(page).locator('[data-b]')).toHaveText('milk');
  // Search (All boards) finds the words; its card on the Journal board shows them as plain text.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await page.keyboard.press('Control+f');
  await page.getByRole('searchbox', { name: 'Search the board' }).fill('milk');
  await page.getByRole('search').getByRole('button', { name: 'All boards', exact: true }).click();
  await expect(page.getByRole('search').getByRole('status')).toHaveText('1 of 1 · Journal');
  await page.getByRole('searchbox', { name: 'Search the board' }).press('Enter');
  await expect(page.getByLabel('Board name')).toHaveValue('Journal');
  const card = page.getByLabel('Note text');
  await expect(card).toHaveValue(saved.text);
  // Editing it there, as the plain card it is, drops its formatting (Ctrl+Z brings it back).
  await page.keyboard.press('Escape');
  await card.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('!');
  await page.waitForTimeout(400);
  expect(await savedNote(page)).not.toHaveProperty('rich');
  await expect(cards(page)).toHaveCount(1);
});

test('copy gives plain text, and paste takes only plain text', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openJournal(page);
  await page.keyboard.type('bold words');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+b');
  await page.keyboard.press('Control+c');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('bold words');
  // Pasted markup is never read as markup.
  await page.keyboard.press('End');
  await editor(page).evaluate((el) => {
    const data = new DataTransfer();
    data.setData('text/html', '<img src=x onerror="window.pwned=1"><b>x</b>');
    data.setData('text/plain', ' and more');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(editor(page)).toHaveText('bold words and more');
  await expect(editor(page).locator('img, b')).toHaveCount(0);
});

test('saved formatting is checked when it loads: markup stays text, unknown looks are dropped', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('x');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
    const board = Object.values(raw.boards).find((b) => (b as { name: string }).name === 'Journal') as { cards: Record<string, { text: string; rich?: unknown }> };
    const note = Object.values(board.cards)[0];
    const evil = '<img src=x onerror="window.pwned=1">';
    note.text = `${note.text.split('\n')[0]}\n\n${evil}`;
    note.rich = [{ type: 'script', runs: [{ text: evil, hl: 'red;background:url(x)', font: 'url(evil)', b: true }] }];
    localStorage.setItem('note-board:v1', JSON.stringify(raw));
  });
  await page.reload();
  await openJournal(page);
  await expect(editor(page)).toHaveText('<img src=x onerror="window.pwned=1">');
  await expect(editor(page).locator('img')).toHaveCount(0);
  await expect(editor(page).locator('[data-b]')).toHaveCount(1);
  await expect(editor(page).locator('[data-hl], [data-font]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as { pwned?: number }).pwned)).toBeUndefined();
});

// Checks of the high code review (2026-10-19).
test('the menus show a mixed selection and a list line, so picking None or Normal still acts', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('ab');
  await selectLetters(page, 0, 1);
  await pick(page, 'Highlight', 'Yellow');
  await selectLetters(page, 0, 2);
  // Mixed: neither Yellow nor None is shown as the selection's, so either still acts.
  await expect(choice(page, 'Highlight', 'Yellow')).toHaveAttribute('aria-pressed', 'false');
  await expect(choice(page, 'Highlight', 'None')).toHaveAttribute('aria-pressed', 'false');
  await pick(page, 'Highlight', 'None');
  await expect(editor(page).locator('[data-hl]')).toHaveCount(0);
  await tool(page, 'Bulleted list').click();
  // A list line: none of Normal, Heading 1, Heading 2 is shown, so picking Normal still acts.
  for (const name of ['Normal', 'Heading 1', 'Heading 2']) await expect(choice(page, 'Style', name)).toHaveAttribute('aria-pressed', 'false');
  await pick(page, 'Style', 'Normal');
  await expect(blocks(page).first()).toHaveAttribute('data-type', 'p');
});

test('plain typing is left to the browser (spelling and phone keyboards keep working); words keep their look', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('bold');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+b');
  await page.keyboard.press('End');
  await page.evaluate(() => ((window as unknown as { kept: Node }).kept = document.querySelector('.rich [data-b]')!.firstChild!));
  await page.keyboard.type('er');
  await expect(editor(page).locator('[data-b]')).toHaveText('bolder');
  expect(await page.evaluate(() => (window as unknown as { kept: Node }).kept.isConnected)).toBe(true);
  await page.waitForTimeout(400);
  expect(((await savedNote(page)).rich as { runs: { b?: boolean }[] }[])[0].runs[0].b).toBe(true);
});

test('an edit the browser won’t let the app block is read back, not done twice; marks in wrapped words stay', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('one');
  // A keyboard (Android) whose Enter can't be cancelled: the app leaves it to the browser.
  const prevented = await page.evaluate(() => {
    const e = new InputEvent('beforeinput', { inputType: 'insertParagraph', cancelable: false, bubbles: true });
    document.querySelector('.rich')!.dispatchEvent(e);
    return document.querySelectorAll('.rich > div').length;
  });
  expect(prevented).toBe(1);
  // Something the browser wraps around a bold word still reads as bold.
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+b');
  await page.evaluate(() => {
    const span = document.querySelector('.rich [data-b]')!;
    const wrap = document.createElement('font');
    wrap.append(...span.childNodes);
    span.append(wrap);
    document.querySelector('.rich')!.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  await expect(editor(page).locator('[data-b]')).toHaveText('one');
  await expect(editor(page).locator('font')).toHaveCount(0);
  // Dragging words inside a note can't start (it would copy them, not move them).
  const dragBlocked = await page.evaluate(() => {
    const e = new DragEvent('dragstart', { bubbles: true, cancelable: true });
    document.querySelector('.rich [data-b]')!.firstChild!.parentElement!.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(dragBlocked).toBe(true);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('the toolbar fits the screen with finger-sized buttons, and lists work', async ({ page }) => {
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).locator('.phone-tiles').getByRole('button', { name: 'Journal', exact: true }).tap();
    await expect(tools(page)).toBeVisible();
    for (const name of ['Bold', 'Italic', 'Underline', 'Strikethrough', 'Bulleted list', 'Numbered list']) {
      const r = (await tool(page, name).boundingBox())!;
      expect(r.height).toBeGreaterThanOrEqual(44);
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.x + r.width).toBeLessThanOrEqual(390);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(editor(page)).toHaveCSS('font-size', '16px');
    await editor(page).tap();
    await tool(page, 'Numbered list').tap();
    await page.keyboard.type('one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    await expect(blocks(page)).toHaveCount(2);
    await expect(blocks(page).nth(1)).toHaveAttribute('data-marker', '2.');
    await expect(editor(page)).toBeFocused();
  });
});

// The Aa menu (page-and-timeline design, owner pick 2026-10-22): one popover with labeled groups; the highlighter button; Escape.
test('the Aa menu holds Style, Size, Font and Highlight, shows the selection’s choices, and Escape shuts it without leaving the note', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('hello');
  await expect(styleMenu(page)).toHaveCount(0);
  await tool(page, 'Text style').click();
  await expect(tool(page, 'Text style')).toHaveAttribute('aria-expanded', 'true');
  for (const group of ['Style', 'Text size', 'Font', 'Highlight']) await expect(styleMenu(page).getByRole('group', { name: group })).toBeVisible();
  await expect(choice(page, 'Style', 'Normal')).toHaveAttribute('aria-pressed', 'true');
  await expect(choice(page, 'Text size', 'Normal')).toHaveAttribute('aria-pressed', 'true');
  await expect(choice(page, 'Font', 'Plex Sans')).toHaveAttribute('aria-pressed', 'true');
  await expect(styleMenu(page).getByRole('group', { name: 'Font' }).getByRole('button')).toHaveText(['Plex Sans', 'Serif', 'Rounded', 'Handwritten', 'Typewriter']);
  await expect(styleMenu(page).getByRole('group', { name: 'Highlight' }).getByRole('button')).toHaveCount(5); // four colors and None
  await expect(editor(page)).toBeFocused(); // using the menu never takes the cursor away
  // Escape shuts the menu first: the panel stays and the cursor stays in the note.
  await page.keyboard.press('Escape');
  await expect(styleMenu(page)).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  await expect(editor(page)).toBeFocused();
  // A press outside shuts it too.
  await tool(page, 'Text style').click();
  await panel(page).getByRole('heading', { name: 'Journal', level: 2 }).click();
  await expect(styleMenu(page)).toHaveCount(0);
});

test('the highlighter button puts the yellow highlight on the selected words and takes it off again', async ({ page }) => {
  await openJournal(page);
  await page.keyboard.type('mark this');
  await selectLetters(page, 0, 4);
  await tool(page, 'Highlight yellow').click();
  await expect(editor(page).locator('[data-hl="yellow"]')).toHaveText('mark');
  await expect(tool(page, 'Highlight yellow')).toHaveAttribute('aria-pressed', 'true');
  await tool(page, 'Highlight yellow').click();
  await expect(editor(page).locator('[data-hl]')).toHaveCount(0);
  await expect(editor(page)).toBeFocused();
});

test('an empty note for today shows the placeholder, which goes as soon as anything is typed', async ({ page }) => {
  await openJournal(page);
  await expect(editor(page)).toHaveAttribute('data-placeholder', 'Write about today…');
  await expect(editor(page)).toHaveCSS('position', 'relative');
  const shown = () => editor(page).evaluate((el) => getComputedStyle(el, '::before').content);
  expect(await shown()).toBe('"Write about today…"');
  await page.keyboard.type('x');
  await expect(editor(page)).not.toHaveAttribute('data-placeholder', /./);
  expect(await shown()).toBe('none');
});
