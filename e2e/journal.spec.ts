import { expect, test, type Page } from '@playwright/test';
import { add, cards, freshBoardEachTest } from './helpers';

// Daily journal (owner request, 2026-10-18): the Journal button opens a side panel, like the focus
// timer, with today's note ready to type and earlier days below. The board you are on stays open.

freshBoardEachTest();

const dock = (page: Page) => page.locator('.corner-controls');
const boardName = (page: Page) => page.getByLabel('Board name');
const journalButton = (page: Page) => dock(page).getByRole('button', { name: 'Journal', exact: true });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Journal' });
const entries = (page: Page) => panel(page).getByRole('textbox');
const boardsMenu = (page: Page) => page.getByRole('menu', { name: 'Boards' });
const DATE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/;
/** Today's date line as the app writes it ("Sun 18 Oct 2026"), from the browser's clock. */
let today = '';
test.beforeEach(async ({ page }) => {
  today = await page.evaluate(() => {
    const d = new Date();
    const short = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-GB', o).slice(0, 3);
    return `${short({ weekday: 'short' })} ${d.getDate()} ${short({ month: 'short' })} ${d.getFullYear()}`;
  });
});

test('Journal opens a side panel with today’s note ready to type; the board you are on stays open, with nothing added', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.type('on home');
  await page.keyboard.press('Escape');
  await expect(journalButton(page)).toHaveText('Journal');
  await journalButton(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(journalButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page).getByRole('heading', { level: 3 }).first()).toHaveText(DATE);
  await expect(panel(page).getByRole('heading', { level: 3 }).first()).toHaveText(today);
  await expect(entries(page).first()).toBeFocused();
  await page.keyboard.type('Went for a walk');
  await expect(entries(page).first()).toHaveText('Went for a walk');
  // Still on Home, with only its own note: no Journal card.
  await expect(boardName(page)).not.toHaveValue('Journal');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page)).toContainText('on home');
  // The Journal board isn't in the Boards menu.
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(boardsMenu(page).getByRole('menuitem', { name: 'Journal' })).toHaveCount(0);
});

test('Escape, × or the button again close it; opening again adds no second note for today', async ({ page }) => {
  await journalButton(page).click();
  await page.keyboard.type('morning');
  // Escape leaves the text first, a second Escape closes the panel.
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await journalButton(page).click();
  await expect(entries(page)).toHaveCount(1);
  await expect(entries(page).first()).toBeFocused();
  await page.keyboard.type(' and evening');
  await expect(entries(page).first()).toHaveText('morning and evening');
  await panel(page).getByRole('button', { name: 'Close journal' }).click();
  await expect(panel(page)).toHaveCount(0);
  await journalButton(page).click();
  await expect(panel(page)).toBeVisible();
  await journalButton(page).click();
  await expect(panel(page)).toHaveCount(0);
});

test('it takes the place of the focus timer', async ({ page }) => {
  await dock(page).getByRole('button', { name: 'Focus timer' }).click();
  await expect(page.getByRole('complementary', { name: 'Focus timer' })).toBeVisible();
  await journalButton(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Focus timer' })).toHaveCount(0);
});

test('Ctrl+Z in the panel undoes the journal typing, never the board behind it', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.type('on home');
  await page.keyboard.press('Escape');
  await journalButton(page).click();
  await page.keyboard.type('hello');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Control+z');
  // The journal typing and today's note are undone; Home's note is still there.
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page)).toContainText('on home');
  await expect(entries(page)).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  // Redo brings the note and the typing back.
  await page.keyboard.press('Control+y');
  await page.keyboard.press('Control+y');
  await expect(entries(page).first()).toHaveText('hello');
  await expect(cards(page)).toHaveCount(1);
});

test('what is written is kept after a reload, and earlier days are listed below today', async ({ page }) => {
  await journalButton(page).click();
  await page.keyboard.type('kept');
  await page.waitForTimeout(400);
  // An earlier day, written into the saved Journal board.
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
    const [id] = Object.entries(raw.boards).find(([, b]) => (b as { name: string }).name === 'Journal')!;
    const board = raw.boards[id];
    const note = Object.values(board.cards)[0] as { id: string; y: number };
    board.cards.old = { ...note, id: 'old', text: 'Thu 1 Jan 2026\n\nnew year', y: note.y + 400 };
    board.order.push('old');
    // A day written ahead still comes after today, which keeps the cursor (review of job 99).
    board.cards.ahead = { ...note, id: 'ahead', text: 'Fri 1 Jan 2100\n\nplans', y: note.y + 800 };
    board.order.push('ahead');
    localStorage.setItem('note-board:v1', JSON.stringify(raw));
  });
  await page.reload();
  await journalButton(page).click();
  // Earlier days are in shut year / month / week groups (journal-groups.spec.ts): open them all.
  await expect(panel(page).getByRole('heading', { level: 3 })).toHaveText([today]);
  await expect(entries(page).first()).toBeFocused();
  const shut = panel(page).getByRole('button', { expanded: false });
  while (await shut.count()) await shut.first().click();
  // Newest group first, so the day written ahead is above today (today's note has the cursor, checked above).
  await expect(panel(page).getByRole('heading', { level: 3 })).toHaveText(['Fri 1 Jan 2100', today, 'Thu 1 Jan 2026']);
  await expect(entries(page)).toHaveCount(3);
  await expect(entries(page).nth(1)).toHaveText('kept');
  await expect(entries(page).nth(2)).toHaveText('new year');
  // Earlier days can be edited too.
  await entries(page).nth(2).click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect(entries(page).nth(2)).toHaveText('new year!');
});

test('keys pressed in the panel never act on the board behind it (review of job 99)', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.type('on home');
  await page.keyboard.press('Escape'); // the note stays selected
  await journalButton(page).click();
  await page.keyboard.press('Escape'); // out of the text, still in the panel
  await expect(panel(page)).toBeVisible();
  for (const key of ['Backspace', 'Delete', 'ArrowDown', 'Control+d']) await page.keyboard.press(key);
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page)).toContainText('on home');
});

test('a click on the panel’s heading or blank space keeps board keys away from the board (check of PR #94)', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.type('on home');
  await page.keyboard.press('Escape'); // the note stays selected
  await journalButton(page).click();
  const box = (await panel(page).boundingBox())!;
  for (const spot of [panel(page).getByRole('heading', { name: 'Journal', level: 2 }), null]) {
    if (spot) await spot.click();
    else await page.mouse.click(box.x + 20, box.y + box.height - 20); // blank space at the bottom
    for (const key of ['Delete', 'Backspace', 'Control+z', 'Control+x', 'Control+d', 'ArrowDown']) await page.keyboard.press(key);
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page)).toContainText('on home');
  }
  // Opening the panel cleared the selection, so Delete after closing it removes nothing either.
  await panel(page).getByRole('button', { name: 'Close journal' }).click();
  await page.keyboard.press('Delete');
  await expect(cards(page)).toHaveCount(1);
});

test('an existing Journal board and its Home card are left as they are, and the panel writes into that board', async ({ page }) => {
  await boardName(page).fill('Home');
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await boardsMenu(page).getByRole('menuitem', { name: 'Add a sub-board here' }).click();
  await cards(page).first().getByRole('button', { name: 'Open board' }).click();
  await boardName(page).fill('Journal');
  await add(page, 'Checklist');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Back to Home' }).click();
  await expect(cards(page)).toHaveCount(1);

  await journalButton(page).click();
  await page.keyboard.type('into the old board');
  await expect(boardName(page)).toHaveValue('Home');
  await expect(cards(page)).toHaveCount(1); // still just its Journal card
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // It is still listed and opens as a normal board, now with today's note beside the checklist.
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await boardsMenu(page).getByRole('menuitem', { name: 'Journal' }).click();
  await expect(boardName(page)).toHaveValue('Journal');
  await expect(cards(page)).toHaveCount(2);
  await expect(page.getByLabel('Note text')).toHaveValue(`${today}\n\ninto the old board`);
});

test('the panel buttons still fit beside the other controls at 1280px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const right = await dock(page).evaluate((el) => {
    const parts = [...el.children].map((c) => c.getBoundingClientRect());
    return { left: Math.min(...parts.map((r) => r.left)), right: Math.max(...parts.map((r) => r.right)), width: window.innerWidth };
  });
  expect(right.left).toBeGreaterThanOrEqual(0);
  expect(right.right).toBeLessThanOrEqual(right.width);
  const wrapped = await dock(page).locator('.dock-tools > *').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
  expect(wrapped).toBe(1);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('⋯ → Journal opens the panel over the whole screen, with today’s note', async ({ page }) => {
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).locator('.phone-tiles').getByRole('button', { name: 'Journal', exact: true }).tap();
    await expect(page.getByRole('dialog', { name: 'More' })).toHaveCount(0);
    await expect(panel(page)).toBeVisible();
    const r = await panel(page).boundingBox();
    expect(r!.width).toBeGreaterThanOrEqual(389);
    await expect(entries(page)).toHaveCount(1);
    await expect(panel(page).getByRole('heading', { level: 3 })).toHaveText(today);
    await expect(cards(page)).toHaveCount(0);
    await panel(page).getByRole('button', { name: 'Close journal' }).tap();
    await expect(panel(page)).toHaveCount(0);
  });
});
