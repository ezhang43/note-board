import { expect, test, type Page } from '@playwright/test';

// Typed lists work in every day's entry, not only in the general notes (owner report, 2026-11-21: "it should
// work for journal entries for days as well"): today's page and an earlier day opened in place, on a fresh
// line and on the first line under the date.

// The browser's clock is fixed to Wed 14 Oct 2026; Tue 13 Oct (with words) and Mon 12 Oct (empty) are earlier days.
const NOW = new Date(2026, 9, 14, 10, 0, 0);
const TODAY = 'Wed 14 Oct 2026';
const TUESDAY = 'Tue 13 Oct 2026';
const MONDAY = 'Mon 12 Oct 2026';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Journal' });
const day = (page: Page, date: string) => panel(page).getByRole('button', { name: new RegExp(`^${date}`) });
const box = (page: Page, date: string) => panel(page).getByRole('textbox', { name: `Journal, ${date}` });
const lines = (page: Page, date: string) => box(page, date).locator(':scope > div');
const types = (page: Page, date: string) => lines(page, date).evaluateAll((els) => els.map((el) => `${(el as HTMLElement).dataset.type}:${el.textContent}`));
const openJournal = (page: Page) => page.locator('.corner-controls').getByRole('button', { name: 'Journal', exact: true }).click();

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/');
  await openJournal(page);
  await page.waitForTimeout(400);
  await page.evaluate(
    ([today, tuesday, monday]) => {
      const raw = JSON.parse(localStorage.getItem('note-board:v1')!);
      const [id] = Object.entries(raw.boards).find(([, b]) => (b as { name: string }).name === 'Journal')!;
      const board = raw.boards[id];
      const note = Object.values(board.cards)[0] as { id: string; y: number; text: string };
      note.text = `${today}\n\nmorning`;
      board.cards.e1 = { ...note, id: 'e1', text: `${tuesday}\n\nwalk`, y: note.y + 400 };
      board.cards.e2 = { ...note, id: 'e2', text: `${monday}\n\n`, y: note.y + 800 };
      board.order.push('e1', 'e2');
      localStorage.setItem('note-board:v1', JSON.stringify(raw));
    },
    [TODAY, TUESDAY, MONDAY],
  );
  await page.reload();
  await openJournal(page);
});

test("today's page: a fresh line and the first line under the date both start lists", async ({ page }) => {
  await box(page, TODAY).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('1. one');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('1) two');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- three');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('* four');
  await expect.poll(() => types(page, TODAY)).toEqual(['p:morning', 'number:one', 'number:two', 'bullet:three', 'bullet:four']);
  // The first line under the date.
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('1. ');
  await expect.poll(() => types(page, TODAY)).toEqual(['number:morning', 'number:one', 'number:two', 'bullet:three', 'bullet:four']);
});

test('an earlier day opened in place: a fresh line and the first line under the date both start lists', async ({ page }) => {
  await day(page, TUESDAY).click();
  await box(page, TUESDAY).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('1. one');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- two');
  await expect.poll(() => types(page, TUESDAY)).toEqual(['p:walk', 'number:one', 'bullet:two']);
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('1) ');
  await expect.poll(() => types(page, TUESDAY)).toEqual(['number:walk', 'number:one', 'bullet:two']);
  await expect(lines(page, TUESDAY).first()).toHaveAttribute('data-marker', '1)');
});

test('an empty earlier day: "1. " on its first line starts a list', async ({ page }) => {
  await day(page, MONDAY).click();
  await box(page, MONDAY).click();
  await page.keyboard.type('1. first');
  await expect.poll(() => types(page, MONDAY)).toEqual(['number:first']);
});
