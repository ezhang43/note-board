import { expect, test, type Page } from '@playwright/test';

// Each day's note in the Journal panel folds like the groups above it (owner request, 2026-10-21):
// its date is a header button; folded, it shows the date and the note's first line in gray.

// The browser's clock is fixed to Wed 14 Oct 2026; Tue 13 Oct is an earlier day in the same week.
const NOW = new Date(2026, 9, 14, 10, 0, 0);
const TODAY = 'Wed 14 Oct 2026';
const TUESDAY = 'Tue 13 Oct 2026';
const EMPTY = 'Mon 12 Oct 2026';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Journal' });
const day = (page: Page, date: string) => panel(page).getByRole('button', { name: new RegExp(`^${date}`) });
const boxes = (page: Page) => panel(page).getByRole('textbox');
const openJournal = async (page: Page) => {
  const button = page.locator('.corner-controls').getByRole('button', { name: 'Journal', exact: true });
  if (await button.isVisible()) return button.click();
  // On a phone the Journal tile is in the More panel.
  await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
  await page.getByRole('dialog', { name: 'More' }).locator('.phone-tiles').getByRole('button', { name: 'Journal', exact: true }).tap();
};
const savedNotes = (page: Page) =>
  page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
    const board = Object.values(raw.boards).find((b) => (b as { name: string }).name === 'Journal') as { cards: Record<string, { text: string }> };
    return Object.values(board.cards).map((c) => c.text).sort();
  });

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(NOW);
  await page.goto('/');
  await openJournal(page);
  await page.waitForTimeout(400);
  await page.evaluate(([tuesday, empty]) => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
    const [id] = Object.entries(raw.boards).find(([, b]) => (b as { name: string }).name === 'Journal')!;
    const board = raw.boards[id];
    const note = Object.values(board.cards)[0] as { y: number };
    board.cards.e1 = { ...note, id: 'e1', text: `${tuesday}\n\nWent for a long walk by the river and then had lunch with everyone\nsecond line`, y: note.y + 400 };
    board.cards.e2 = { ...note, id: 'e2', text: `${empty}\n\n`, y: note.y + 800 };
    board.order.push('e1', 'e2');
    localStorage.setItem('note-board:v1', JSON.stringify(raw));
  }, [TUESDAY, EMPTY]);
  await page.reload();
  await openJournal(page);
  (page as Page & { errors: string[] }).errors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { errors: string[] }).errors).toEqual([]);
});

test('every day starts open, its date is a header button that folds it, and unfolding shows the note again', async ({ page }) => {
  for (const d of [TODAY, TUESDAY, EMPTY]) await expect(day(page, d)).toHaveAttribute('aria-expanded', 'true');
  await expect(boxes(page)).toHaveCount(3);
  await day(page, TUESDAY).click();
  await expect(day(page, TUESDAY)).toHaveAttribute('aria-expanded', 'false');
  await expect(boxes(page)).toHaveCount(2);
  // The date stays, and the note's first line follows it, in gray.
  await expect(day(page, TUESDAY)).toContainText('Went for a long walk by the river and then had lunch with everyone');
  await expect(day(page, TUESDAY)).not.toContainText('second line');
  // Gray: softer than the year header's ink.
  const ink = await panel(page).getByRole('button', { name: '2026', exact: true }).evaluate((el) => getComputedStyle(el).color);
  await expect(day(page, TUESDAY).locator('.jg-peek')).not.toHaveCSS('color', ink);
  await day(page, TUESDAY).click();
  await expect(day(page, TUESDAY)).toHaveAttribute('aria-expanded', 'true');
  await expect(boxes(page)).toHaveCount(3);
  await expect(boxes(page).nth(1)).toContainText('second line');
  await expect(day(page, TUESDAY).locator('.jg-peek')).toHaveCount(0);
});

test('a long first line is cut with an ellipsis, and an empty note shows only its date', async ({ page }) => {
  await day(page, TUESDAY).click();
  const peek = day(page, TUESDAY).locator('.jg-peek');
  await expect(peek).toHaveCSS('text-overflow', 'ellipsis');
  expect(await peek.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await day(page, EMPTY).click();
  await expect(day(page, EMPTY)).toHaveAttribute('aria-expanded', 'false');
  await expect(day(page, EMPTY)).toHaveText(EMPTY);
  await expect(day(page, EMPTY).locator('.jg-peek')).toHaveCount(0);
});

test('Enter and Space fold a day, and the header shows a keyboard focus ring', async ({ page }) => {
  await page.keyboard.press('Shift');
  await day(page, TUESDAY).focus();
  await expect(day(page, TUESDAY)).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(day(page, TUESDAY)).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Space');
  await expect(day(page, TUESDAY)).toHaveAttribute('aria-expanded', 'true');
  await expect(day(page, TUESDAY)).toBeFocused();
});

test("today's note can be folded; folding never changes the text, and it is not remembered", async ({ page }) => {
  await page.keyboard.type('hello today');
  await page.waitForTimeout(500);
  const before = await savedNotes(page);
  expect(before.some((t) => t.includes('hello today'))).toBe(true);
  await day(page, TODAY).click();
  await expect(day(page, TODAY)).toHaveAttribute('aria-expanded', 'false');
  await expect(day(page, TODAY)).toContainText('hello today');
  await day(page, TUESDAY).click();
  await page.waitForTimeout(500);
  expect(await savedNotes(page)).toEqual(before);
  // Folds are view state: nothing is saved for them, and the panel opens with every day open again.
  const keys = await page.evaluate(() => Object.keys(localStorage));
  for (const k of keys) expect(await page.evaluate((key) => localStorage.getItem(key), k)).not.toContain('"folded"');
  await page.reload();
  await openJournal(page);
  for (const d of [TODAY, TUESDAY, EMPTY]) await expect(day(page, d)).toHaveAttribute('aria-expanded', 'true');
  await expect(boxes(page).first()).toContainText('hello today');
});

test('folding the day that holds the cursor moves the cursor to its header', async ({ page }) => {
  await expect(boxes(page).first()).toBeFocused();
  await day(page, TODAY).click();
  await expect(day(page, TODAY)).toBeFocused();
  await expect(boxes(page)).toHaveCount(2);
  // The keyboard still works from there: a key meant for the journal never reaches the board behind it.
  await page.keyboard.press('Space');
  await expect(day(page, TODAY)).toHaveAttribute('aria-expanded', 'true');
});

test('folding a day does not touch the groups above it', async ({ page }) => {
  await day(page, TUESDAY).click();
  for (const name of ['2026', 'October', '12–18 Oct']) await expect(panel(page).getByRole('button', { name, exact: true })).toHaveAttribute('aria-expanded', 'true');
  // A day folded and its week shut then opened again stays folded for this visit.
  await panel(page).getByRole('button', { name: '12–18 Oct', exact: true }).click();
  await panel(page).getByRole('button', { name: '12–18 Oct', exact: true }).click();
  await expect(day(page, TUESDAY)).toHaveAttribute('aria-expanded', 'false');
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('the day header is at least 44px tall and folds with a tap', async ({ page }) => {
    const header = day(page, TUESDAY);
    expect((await header.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await header.tap();
    await expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
