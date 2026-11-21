import { expect, test, type Page } from '@playwright/test';
import { freshBoardEachTest } from './helpers';

// Folding all the general notes at once, and rearranging them (owner request, 2026-11-21: "for journal,
// please give the ability to collapse all the different notes, and also give the ability to re-arrange them").
// One quiet button left of the + folds or unfolds every general note (the days are unchanged); a grip on a
// note's header drags it to a new place, and Alt+Up / Alt+Down on its header moves it for the keyboard.
// The order is saved (each move is one Ctrl+Z step); folds are view state, as before.

freshBoardEachTest();

const panel = (page: Page) => page.getByRole('complementary', { name: 'Journal' });
const openJournal = (page: Page) => page.locator('.corner-controls').getByRole('button', { name: 'Journal', exact: true }).click();
const sections = (page: Page) => panel(page).locator('section.journal-notes');
const note = (page: Page, i: number) => sections(page).nth(i);
const fold = (page: Page, i: number) => note(page, i).locator('.jg-notes');
const nameBtn = (page: Page, i: number) => note(page, i).locator('.jn-name');
const grip = (page: Page, i: number) => note(page, i).locator('.jn-grip');
const add = (page: Page) => panel(page).locator('.history-head').getByRole('button', { name: 'Add a general note' });
const foldAll = (page: Page) => panel(page).locator('.history-head .jn-fold-all');
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

/** Three general notes, top to bottom: C, B, A (each with a word in it). */
async function threeNotes(page: Page) {
  await openJournal(page);
  await nameBtn(page, 0).click();
  await panel(page).locator('input.jn-rename').fill('A');
  await page.keyboard.press('Enter');
  for (const n of ['B', 'C']) {
    await add(page).click();
    await page.keyboard.type(n);
    await page.keyboard.press('Enter');
  }
  for (let i = 0; i < 3; i++) {
    await note(page, i).locator('.rich').click();
    await page.keyboard.type(`words ${i}`);
  }
  expect(await names(page)).toEqual(['C', 'B', 'A']);
}

/** Drags note `from` by its grip so it lands over note `over`, with the mouse in small steps. */
async function drag(page: Page, from: number, over: number) {
  const g = (await grip(page, from).boundingBox())!;
  const target = (await note(page, over).boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  const down = target.y > g.y;
  await page.mouse.move(g.x + g.width / 2, down ? target.y + target.height - 4 : target.y + 4, { steps: 12 });
  await page.mouse.up();
}

test('one button left of the + folds every general note, then unfolds them; the days are left as they are', async ({ page }) => {
  await threeNotes(page);
  await expect(foldAll(page)).toHaveAttribute('aria-label', 'Fold all general notes');
  await expect(foldAll(page)).toHaveAttribute('title', 'Fold all general notes');
  // Directly left of the +, on the same row.
  const f = (await foldAll(page).boundingBox())!;
  const p = (await add(page).boundingBox())!;
  expect(f.x + f.width).toBeLessThanOrEqual(p.x + 1);
  expect(p.x - (f.x + f.width)).toBeLessThanOrEqual(8);
  expect(Math.abs(f.y - p.y)).toBeLessThanOrEqual(1);
  const today = panel(page).locator('.journal-page .jg-day');
  const todayOpen = await today.getAttribute('aria-expanded');
  await foldAll(page).click();
  for (let i = 0; i < 3; i++) await expect(fold(page, i)).toHaveAttribute('aria-expanded', 'false');
  await expect(today).toHaveAttribute('aria-expanded', todayOpen!);
  await expect(foldAll(page)).toHaveAttribute('aria-label', 'Unfold all general notes');
  await expect(foldAll(page)).toBeFocused();
  // Opening one: not every note is folded, so the button folds all again.
  await fold(page, 1).click();
  await expect(foldAll(page)).toHaveAttribute('aria-label', 'Fold all general notes');
  await foldAll(page).click();
  await expect(foldAll(page)).toHaveAttribute('aria-label', 'Unfold all general notes');
  await foldAll(page).click();
  for (let i = 0; i < 3; i++) await expect(fold(page, i)).toHaveAttribute('aria-expanded', 'true');
  // Folds are not saved: closing and opening the panel opens them all.
  await foldAll(page).click();
  await page.keyboard.press('Escape');
  await openJournal(page);
  for (let i = 0; i < 3; i++) await expect(fold(page, i)).toHaveAttribute('aria-expanded', 'true');
  // Folding is not an undo step: Ctrl+Z in the panel takes back the last typing, not a fold.
  await note(page, 2).locator('.rich').click();
  await page.keyboard.type('x');
  await foldAll(page).click();
  await expect(foldAll(page)).toBeFocused();
  await page.keyboard.press('Control+z');
  for (let i = 0; i < 3; i++) await expect(fold(page, i)).toHaveAttribute('aria-expanded', 'false');
  await foldAll(page).click();
  await expect(note(page, 2).locator('.rich')).not.toHaveText(/x$/);
  expect(await savedNames(page)).toEqual(['C', 'B', 'A']);
});

test('Alt+arrows on the trash do nothing (only the arrow and the name move a note)', async ({ page }) => {
  await threeNotes(page);
  await note(page, 0).locator('.jn-del').focus();
  await page.keyboard.press('Alt+ArrowDown');
  expect(await names(page)).toEqual(['C', 'B', 'A']);
  await expect(note(page, 0).locator('.jn-del')).toBeFocused();
});

test('a drag cut off when its note goes (Ctrl+Z took it away) leaves no note shifted, and the next drag works', async ({ page }) => {
  await threeNotes(page);
  // Add a fourth with nothing in it: Ctrl+Z takes it away.
  await add(page).click();
  await page.keyboard.press('Enter');
  expect(await names(page)).toEqual(['Untitled note', 'C', 'B', 'A']);
  const g = (await grip(page, 0).boundingBox())!;
  await page.mouse.move(g.x + 4, g.y + 4);
  await page.mouse.down();
  await page.mouse.move(g.x + 4, g.y + 80, { steps: 4 });
  await expect(note(page, 0)).toHaveClass(/lifted/);
  await page.keyboard.press('Control+z');
  await page.mouse.up();
  expect(await names(page)).toEqual(['C', 'B', 'A']);
  for (let i = 0; i < 3; i++) await expect(note(page, i)).not.toHaveClass(/lifted|sorting/);
  await drag(page, 0, 2);
  expect(await names(page)).toEqual(['B', 'A', 'C']);
});

test('dragging a note by its grip moves it; Ctrl+Z puts it back and Ctrl+Y moves it again; a reload keeps the order', async ({ page }) => {
  await threeNotes(page);
  await drag(page, 0, 2);
  expect(await names(page)).toEqual(['B', 'A', 'C']);
  await expect(note(page, 2).locator('.rich')).toHaveText('words 0');
  await page.waitForTimeout(400);
  expect(await savedNames(page)).toEqual(['B', 'A', 'C']);
  await note(page, 0).locator('.rich').click();
  await page.keyboard.press('Control+z');
  expect(await names(page)).toEqual(['C', 'B', 'A']);
  await page.keyboard.press('Control+y');
  expect(await names(page)).toEqual(['B', 'A', 'C']);
  // Up too.
  await drag(page, 2, 0);
  expect(await names(page)).toEqual(['C', 'B', 'A']);
  await drag(page, 1, 0);
  expect(await names(page)).toEqual(['B', 'C', 'A']);
  await page.waitForTimeout(400);
  await page.reload();
  await openJournal(page);
  expect(await names(page)).toEqual(['B', 'C', 'A']);
  await expect(note(page, 0).locator('.rich')).toHaveText('words 1');
});

test('a press on the grip without moving, or a drag back to where it was, moves nothing', async ({ page }) => {
  await threeNotes(page);
  await grip(page, 1).click();
  expect(await names(page)).toEqual(['C', 'B', 'A']);
  const g = (await grip(page, 1).boundingBox())!;
  await page.mouse.move(g.x + 4, g.y + 4);
  await page.mouse.down();
  await page.mouse.move(g.x + 4, g.y + 60, { steps: 5 });
  await page.mouse.move(g.x + 4, g.y + 4, { steps: 5 });
  await page.mouse.up();
  expect(await names(page)).toEqual(['C', 'B', 'A']);
  // Nothing to undo from it: Ctrl+Z takes back the last typing instead.
  await note(page, 2).locator('.rich').click();
  await page.keyboard.press('Control+z');
  expect(await names(page)).toEqual(['C', 'B', 'A']);
});

test('Alt+Down and Alt+Up on a note header move it, keep the keyboard on it, and are heard', async ({ page }) => {
  await threeNotes(page);
  await fold(page, 0).focus();
  await page.keyboard.press('Alt+ArrowDown');
  expect(await names(page)).toEqual(['B', 'C', 'A']);
  await expect(fold(page, 1)).toBeFocused();
  await expect(page.getByTestId('announcer')).toHaveText(/Moved “C” to place 2 of 3/);
  await page.keyboard.press('Alt+ArrowDown');
  expect(await names(page)).toEqual(['B', 'A', 'C']);
  await expect(fold(page, 2)).toBeFocused();
  // At the end: nothing moves.
  await page.keyboard.press('Alt+ArrowDown');
  expect(await names(page)).toEqual(['B', 'A', 'C']);
  // From the name button too.
  await nameBtn(page, 1).focus();
  await page.keyboard.press('Alt+ArrowUp');
  expect(await names(page)).toEqual(['A', 'B', 'C']);
  await expect(nameBtn(page, 0)).toBeFocused();
  await page.keyboard.press('Alt+ArrowUp');
  expect(await names(page)).toEqual(['A', 'B', 'C']);
  // Each move is one undo step.
  await page.keyboard.press('Control+z');
  expect(await names(page)).toEqual(['B', 'A', 'C']);
  await page.keyboard.press('Control+z');
  expect(await names(page)).toEqual(['B', 'C', 'A']);
  await page.keyboard.press('Control+y');
  expect(await names(page)).toEqual(['B', 'A', 'C']);
  // The board behind the panel is not touched (no card selected or moved).
  await expect(page.locator('[data-testid="canvas"] .card.selected')).toHaveCount(0);
});

test('a single note has no grip, and Alt+arrows do nothing', async ({ page }) => {
  await openJournal(page);
  await expect(sections(page)).toHaveCount(1);
  await expect(grip(page, 0)).toHaveCount(0);
  await fold(page, 0).focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(fold(page, 0)).toBeFocused();
  // Adding a second one shows a grip on each.
  await add(page).click();
  await page.keyboard.press('Enter');
  await expect(sections(page).locator('.jn-grip')).toHaveCount(2);
});

test('a move while typing keeps the words being typed', async ({ page }) => {
  await threeNotes(page);
  await note(page, 0).locator('.rich').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' more');
  await drag(page, 0, 2);
  expect(await names(page)).toEqual(['B', 'A', 'C']);
  await expect(note(page, 2).locator('.rich')).toHaveText('words 0 more');
  // The cursor is still in the moved note, where it was: typing goes on there, and Ctrl+Z undoes the move.
  await page.keyboard.type('!');
  await expect(note(page, 2).locator('.rich')).toHaveText('words 0 more!');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect(await names(page)).toEqual(['C', 'B', 'A']);
  await page.keyboard.press('Control+y');
  await page.keyboard.press('Control+y');
  expect(await names(page)).toEqual(['B', 'A', 'C']);
  await expect(note(page, 2).locator('.rich')).toHaveText('words 0 more!');
  await page.waitForTimeout(400);
  await page.reload();
  await openJournal(page);
  await expect(note(page, 2).locator('.rich')).toHaveText('words 0 more!');
});

test('while dragging, the note follows the pointer and the others make room (no movement with reduced motion)', async ({ page }) => {
  await threeNotes(page);
  const g = (await grip(page, 0).boundingBox())!;
  await page.mouse.move(g.x + 4, g.y + 4);
  await page.mouse.down();
  await page.mouse.move(g.x + 4, g.y + 40, { steps: 4 });
  await expect(note(page, 0)).toHaveClass(/lifted/);
  const moved = await note(page, 0).evaluate((el) => getComputedStyle(el).transform);
  expect(moved).not.toBe('none');
  // The suite runs with reduced motion: no transition on the others.
  expect(await note(page, 1).evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/^0s/);
  await page.mouse.up();
  await expect(note(page, 0)).not.toHaveClass(/lifted/);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('fold all and the grip are at least 44px; the title, buttons and X fit on one line; the grip drags by touch', async ({ page }) => {
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).locator('.phone-tiles').getByRole('button', { name: 'Journal', exact: true }).tap();
    await add(page).tap();
    await page.keyboard.type('Top');
    await page.keyboard.press('Enter');
    expect(await names(page)).toEqual(['Top', 'General notes']);
    const view = page.viewportSize()!;
    const close = (await panel(page).locator('.history-head').getByRole('button', { name: 'Close journal' }).boundingBox())!;
    const plus = (await add(page).boundingBox())!;
    const all = (await foldAll(page).boundingBox())!;
    const title = (await panel(page).locator('.history-head h2').boundingBox())!;
    expect(close.x + close.width).toBeLessThanOrEqual(view.width);
    expect(all.x + all.width).toBeLessThanOrEqual(plus.x + 1);
    expect(Math.abs(all.y - plus.y)).toBeLessThanOrEqual(1);
    expect(title.x + title.width).toBeLessThanOrEqual(all.x + 1);
    expect(title.height).toBeLessThan(30);
    for (const box of [all, (await grip(page, 0).boundingBox())!]) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    // Everything in the header still fits inside the sheet.
    const sheet = (await note(page, 0).boundingBox())!;
    const bin = (await note(page, 0).locator('.jn-del').boundingBox())!;
    expect(bin.x + bin.width).toBeLessThanOrEqual(sheet.x + sheet.width);
    // A touch drag on the grip moves the note.
    const g = (await grip(page, 0).boundingBox())!;
    const target = (await note(page, 1).boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const point = (y: number) => [{ x: g.x + g.width / 2, y }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(g.y + g.height / 2) });
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(g.y + g.height / 2 + ((target.y + target.height - 4 - g.y - g.height / 2) * i) / 10) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => names(page)).toEqual(['General notes', 'Top']);
  });
});
