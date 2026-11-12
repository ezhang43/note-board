import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, clickEmpty, fontsLoaded, freshBoardEachTest, toggleCompleted, toggleHistory } from './helpers';

// The main checklist (owner request, 2026-11-12): one checklist, the same on every board, in the only panel on
// the LEFT, opened from "Checklist" in the bottom pill (a tile in ⋯ on a phone). It can stay open beside the
// Journal, Habits, the calendar or any panel on the right. Its list is kept on a hidden board of its own, so it
// has every checklist feature and its own undo, and the open board is never touched by it.

freshBoardEachTest();

const dock = (page: Page) => page.locator('.corner-controls');
const button = (page: Page) => dock(page).getByRole('button', { name: 'Checklist', exact: true });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Checklist', exact: true });
const journal = (page: Page) => page.getByRole('complementary', { name: 'Journal' });
const handle = (page: Page) => page.getByRole('separator', { name: 'Resize checklist' });
const boardCards = (page: Page) => page.locator('.canvas [data-card-id]');
const items = (l: Locator) => l.getByLabel('Item text');
const texts = (l: Locator) => items(l).evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));
const box = async (l: Locator) => (await l.boundingBox())!;

/** Opens the panel and types its items (the cursor starts in its last item). */
async function openWith(page: Page, list: string[]) {
  await button(page).click();
  await expect(panel(page)).toBeVisible();
  for (const [i, t] of list.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
}

async function noteOnBoard(page: Page, text: string) {
  await add(page, 'Note');
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
}

test('Checklist opens on the left, 420px wide; its items are kept, on every board, and it is not in the Boards menu', async ({ page }) => {
  await noteOnBoard(page, 'on home');
  await button(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(button(page)).toHaveAttribute('aria-pressed', 'true');
  const r = await box(panel(page));
  expect(r.x).toBe(0);
  expect(r.width).toBe(420);
  // The cursor is in its (first, empty) item, ready to type.
  await expect(items(panel(page)).first()).toBeFocused();
  await page.keyboard.type('buy stamps');
  await page.keyboard.press('Enter');
  await page.keyboard.type('call the bank');
  expect(await texts(panel(page))).toEqual(['buy stamps', 'call the bank']);
  // The board you are on is as it was.
  await expect(boardCards(page)).toHaveCount(1);
  await expect(boardCards(page)).toContainText('on home');
  // The corner controls move clear of it.
  expect((await box(dock(page))).x).toBeGreaterThanOrEqual(420);
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Boards' });
  await expect(menu.getByRole('menuitem', { name: /Main checklist/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await panel(page).getByRole('button', { name: 'Close checklist' }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(button(page)).toHaveAttribute('aria-pressed', 'false');
  // Saved: after a reload it opens with the same items.
  await page.reload();
  await fontsLoaded(page);
  await button(page).click();
  expect(await texts(panel(page))).toEqual(['buy stamps', 'call the bank']);
  await expect(boardCards(page)).toHaveCount(1);
});

test('open beside the Journal: Checklist on the left, Journal on the right; Escape closes one panel at a time', async ({ page }) => {
  await openWith(page, ['one']);
  await dock(page).getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(journal(page)).toBeVisible();
  await expect(panel(page)).toBeVisible();
  const left = await box(panel(page));
  const right = await box(journal(page));
  expect(left.x).toBe(0);
  expect(Math.round(right.x + right.width)).toBe(1440);
  expect(left.x + left.width).toBeLessThanOrEqual(right.x);
  // Escape in the Journal closes the Journal only.
  await journal(page).getByRole('heading').first().click();
  await page.keyboard.press('Escape');
  await expect(journal(page)).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  // Escape in the Checklist (not while typing) closes it.
  await panel(page).getByRole('heading', { name: 'Checklist' }).click();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
});

test('open beside the calendar, on a signed-in account', async ({ page }) => {
  await page.goto(`/?demo-user=Chk${Math.random().toString(36).slice(2, 8)}`);
  await fontsLoaded(page);
  await openWith(page, ['synced item']);
  await dock(page).getByRole('button', { name: 'Google Calendar' }).click();
  const cal = page.getByRole('complementary', { name: 'Google Calendar' });
  await expect(cal).toBeVisible();
  await expect(panel(page)).toBeVisible();
  expect((await box(panel(page))).x).toBe(0);
  expect(await texts(panel(page))).toEqual(['synced item']);
});

test('the strip on its right edge resizes it, gives way to a panel on the right, and the width is remembered', async ({ page }) => {
  await openWith(page, ['a']);
  await expect(handle(page)).toBeVisible();
  const h = await box(handle(page));
  await page.mouse.move(h.x + h.width / 2, h.y + 200);
  await page.mouse.down();
  await page.mouse.move(600, h.y + 200, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await box(panel(page))).width).toBe(600);
  // The keyboard: Right widens it, Left narrows it, 20px a press.
  await handle(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await box(panel(page))).width).toBe(620);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await box(panel(page))).width).toBe(600);
  // With the Journal (420) open on the right, 300px of board stays between them.
  await dock(page).getByRole('button', { name: 'Journal', exact: true }).click();
  await handle(page).focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await box(panel(page))).width).toBe(1440 - 300 - 420);
  // The strip says the width it shows, and stops there: presses past the room change nothing unseen.
  await expect(handle(page)).toHaveAttribute('aria-valuenow', String(1440 - 300 - 420));
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await box(panel(page))).width).toBe(1440 - 300 - 420 - 20);
  await dock(page).getByRole('button', { name: 'Journal', exact: true }).click();
  await expect.poll(async () => (await box(panel(page))).width).toBe(700);
  await page.reload();
  await fontsLoaded(page);
  await button(page).click();
  await expect.poll(async () => (await box(panel(page))).width).toBe(700);
  await handle(page).dblclick();
  await expect.poll(async () => (await box(panel(page))).width).toBe(420);
});

test('ticking and Clean up work as on a card; its Completed button shows only what was cleaned up from it', async ({ page }) => {
  // A list on the board with a cleaned-up item of its own.
  await clickEmpty(page);
  await add(page, 'Checklist');
  await page.keyboard.press('Tab');
  await page.keyboard.type('board item');
  const boardList = boardCards(page).first();
  await boardList.locator('[data-item-id]').first().getByLabel('Done').click();
  await boardList.getByRole('button', { name: 'Clean up' }).click();

  await openWith(page, ['bread', 'milk', 'eggs']);
  await expect(panel(page).getByLabel('2 of 3 done')).toHaveCount(0);
  await panel(page).locator('[data-item-id]').nth(1).getByLabel('Done').click();
  await expect(panel(page).getByLabel('1 of 3 done')).toBeVisible();
  await panel(page).getByRole('button', { name: 'Clean up' }).click();
  expect(await texts(panel(page))).toEqual(['bread', 'eggs']);
  await panel(page).getByRole('button', { name: 'Completed', exact: true }).click();
  const done = page.getByRole('complementary', { name: 'Completed: Checklist' });
  await expect(done).toContainText('milk');
  await expect(done).not.toContainText('board item');
  await expect(panel(page)).toBeVisible();
  // Unticking there sends it back to the end of the panel's list, as on a card.
  await done.getByRole('checkbox', { name: /Send "milk" back/ }).click();
  await expect.poll(() => texts(panel(page))).toEqual(['bread', 'eggs', 'milk']);
  // The board's own Completed shows the board's.
  await toggleCompleted(page);
  const boardDone = page.getByRole('complementary', { name: 'Completed', exact: true });
  await expect(boardDone).toContainText('board item');
  await expect(boardDone).not.toContainText('milk');
});

test('undo in the panel steps its own list only; undo on the board leaves the panel as it is', async ({ page }) => {
  await noteOnBoard(page, 'keep me');
  await openWith(page, ['first']);
  await page.keyboard.press('Enter');
  await page.keyboard.type('second');
  await page.keyboard.press('Control+z');
  await expect.poll(() => texts(panel(page))).not.toContain('second');
  await expect(boardCards(page)).toHaveCount(1);
  await expect(boardCards(page)).toContainText('keep me');
  await page.keyboard.press('Control+y');
  await expect.poll(() => texts(panel(page))).toContain('second');
  // On the board, Ctrl+Z undoes the board: the note goes, the panel keeps its items.
  // Empty board, clear of the panel (the usual empty spot, bottom left, is under it).
  await page.mouse.click(1000, 820);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(boardCards(page)).toHaveCount(0);
  await expect.poll(() => texts(panel(page))).toEqual(['first', 'second']);
});

test('no key or drag in the panel changes the board: Backspace with a board block selected, items dragged out', async ({ page }) => {
  await noteOnBoard(page, 'precious');
  await boardCards(page).first().click({ position: { x: 8, y: 8 } });
  await openWith(page, ['a', 'b']);
  // Focus on the panel itself, not typing: Backspace and Delete never reach the selected note.
  await panel(page).getByRole('heading', { name: 'Checklist' }).click();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  await expect(boardCards(page)).toHaveCount(1);
  await expect(boardCards(page)).toContainText('precious');
  // An item dragged out of the panel onto the board stays in the panel; the board gets nothing.
  const row = panel(page).locator('[data-item-id]').first();
  await row.hover();
  const r = await box(row.getByRole('button', { name: 'Drag item' }));
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + 60, r.y + 40, { steps: 4 });
  await expect(page.getByTestId('item-ghost')).toHaveCount(1);
  await page.mouse.move(900, 500, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => texts(panel(page))).toEqual(['a', 'b']);
  await expect(boardCards(page)).toHaveCount(1);
  // Items selected in the panel and deleted come back with the panel's undo.
  await items(panel(page)).first().click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await texts(panel(page))).join('')).toBe('');
  await expect(boardCards(page)).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect.poll(() => texts(panel(page))).toEqual(['a', 'b']);
});

test('an item dragged from a list on the board and let go over the panel stays in its list', async ({ page }) => {
  await page.mouse.click(1000, 820);
  await add(page, 'Checklist');
  await page.keyboard.press('Tab');
  await page.keyboard.type('stay here');
  await openWith(page, ['panel item']);
  const boardList = boardCards(page).first();
  const r = await box(boardList.locator('[data-item-id]').first());
  await page.mouse.move(r.x + 4, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x - 40, r.y + 30, { steps: 4 });
  await page.mouse.move(200, 300, { steps: 8 });
  await page.mouse.up();
  expect(await texts(boardList)).toEqual(['stay here']);
  expect(await texts(panel(page))).toEqual(['panel item']);
});

test('“Completed: Checklist” closes with one press of its ×, and with one Escape', async ({ page }) => {
  await openWith(page, ['a']);
  const done = page.getByRole('complementary', { name: /^Completed/ });
  await panel(page).getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(done).toHaveAccessibleName('Completed: Checklist');
  await done.getByRole('button', { name: /Close/ }).click();
  await expect(done).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Completed', exact: true }).click();
  await done.getByRole('heading').first().click();
  await page.keyboard.press('Escape');
  await expect(done).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
});

test('Escape with items selected in the panel drops the selection first; a board note’s Ctrl+Z is the board’s', async ({ page }) => {
  await noteOnBoard(page, 'note');
  await openWith(page, ['a', 'b']);
  const picked = panel(page).locator('.todo-item.picked');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+a');
  await expect(picked).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(picked).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  // Items still selected in the panel, typing in a note on the board: Ctrl+Z there undoes the note's typing.
  await items(panel(page)).first().click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+a');
  await expect(picked).toHaveCount(2);
  const text = boardCards(page).first().getByRole('textbox').first();
  await text.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' more');
  await expect(text).toHaveValue('note more');
  await page.keyboard.press('Control+z');
  await expect(text).not.toHaveValue('note more');
  expect(await texts(panel(page))).toEqual(['a', 'b']);
});

test('with the Main checklist board itself open, items still reorder by dragging in the panel', async ({ page }) => {
  await openWith(page, ['zebra first', 'yak second']);
  // Open its board from a search on every board.
  await page.mouse.click(1000, 820);
  await page.keyboard.press('Control+f');
  await page.getByRole('searchbox', { name: 'Search the board' }).fill('zebra');
  await page.getByRole('search').getByRole('button', { name: 'All boards', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search the board' }).press('Enter');
  await expect(page.getByLabel('Board name')).toHaveValue('Main checklist');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeVisible();
  const rows = panel(page).locator('[data-item-id]');
  await rows.first().hover();
  const grip = await box(rows.first().getByRole('button', { name: 'Drag item' }));
  const second = await box(rows.nth(1));
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x, grip.y + 20, { steps: 4 });
  await page.mouse.move(grip.x, second.y + second.height - 3, { steps: 6 });
  await expect(page.getByTestId('item-ghost')).toHaveCount(1);
  await page.mouse.up();
  await expect.poll(() => texts(panel(page))).toEqual(['yak second', 'zebra first']);
});

const saved = (page: Page) => page.evaluate(() => localStorage.getItem('note-board:v1') ?? '');

test('opening the panel saves nothing: it shows an empty list, and the first typing makes the list', async ({ page }) => {
  await noteOnBoard(page, 'on home');
  await expect.poll(() => saved(page)).toContain('on home');
  const before = await saved(page);
  await button(page).click();
  await expect(panel(page)).toBeVisible();
  const empty = items(panel(page));
  await expect(empty).toHaveCount(1);
  await expect(empty).toHaveAttribute('placeholder', 'Add an item');
  await expect(empty).toBeFocused();
  // Nothing is written by opening (so a device with an old offline copy has nothing to upload), nor by closing.
  await page.waitForTimeout(800);
  expect(await saved(page)).toBe(before);
  await panel(page).getByRole('button', { name: 'Close checklist' }).click();
  await button(page).click();
  await page.waitForTimeout(800);
  expect(await saved(page)).toBe(before);
  // Typing makes it, and the typing carries on in the new list's item.
  await page.keyboard.type('pay rent');
  await expect.poll(() => saved(page)).toContain('Main checklist');
  expect(await texts(panel(page))).toEqual(['pay rent']);
  await expect(items(panel(page))).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.type('water plants');
  expect(await texts(panel(page))).toEqual(['pay rent', 'water plants']);
  await expect(boardCards(page)).toHaveCount(1);
  await expect(boardCards(page)).toContainText('on home');
});

test('while Version history shows an old version, the panel is read-only, with a note saying so', async ({ page }) => {
  await openWith(page, ['keep me']);
  await noteOnBoard(page, 'later note');
  await toggleHistory(page);
  const history = page.getByRole('complementary', { name: 'Version history' });
  await history.getByRole('region').getByRole('button').first().click();
  const banner = page.getByRole('region', { name: 'Looking at an earlier version' });
  await expect(banner).toBeVisible();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByText('Viewing an old version')).toBeVisible();
  const item = items(panel(page)).first();
  await expect(item).toHaveAttribute('readonly', '');
  await expect(panel(page).getByLabel('Done: keep me')).toBeDisabled();
  await item.click();
  await page.keyboard.type('xyz');
  expect(await texts(panel(page))).toEqual(['keep me']);
  // Back to the current version: it can be changed again.
  await banner.getByRole('button', { name: 'Back to current' }).click();
  await expect(panel(page).getByText('Viewing an old version')).toHaveCount(0);
  await expect(items(panel(page)).first()).not.toHaveAttribute('readonly', '');
});

test('the empty list acts as a list: Enter adds no line break, copied items paste in as items', async ({ page }) => {
  // Two items copied from a list on the board.
  await clickEmpty(page);
  await add(page, 'Checklist');
  await page.keyboard.press('Tab');
  await page.keyboard.type('alpha');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('beta');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+a');
  await expect(boardCards(page).locator('.todo-item.picked')).toHaveCount(2);
  await page.keyboard.press('Control+c');
  await button(page).click();
  await expect(items(panel(page))).toBeFocused();
  // Enter in the empty item does nothing (as in a list), so the first item gets no line break.
  await page.keyboard.press('Enter');
  await page.keyboard.type('x');
  expect(await texts(panel(page))).toEqual(['x']);
  await page.keyboard.press('Control+z');
  await expect(items(panel(page))).toHaveAttribute('placeholder', 'Add an item');
  await expect.poll(() => texts(panel(page))).toEqual(['']);
  // Ctrl+V: the items, with their level, not their text in one item.
  await items(panel(page)).click();
  await page.keyboard.press('Control+v');
  await expect.poll(() => texts(panel(page))).toEqual(['alpha', 'beta']);
  await expect(panel(page).locator('.todo-item').nth(1)).toHaveAttribute('style', /--indent: [1-9]/);
});

test('with the Main checklist board open, an old version of it leaves the panel showing the current list, read-only', async ({ page }) => {
  await openWith(page, ['zebra now']);
  await page.mouse.click(1000, 820);
  await page.keyboard.press('Control+f');
  await page.getByRole('searchbox', { name: 'Search the board' }).fill('zebra');
  await page.getByRole('search').getByRole('button', { name: 'All boards', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search the board' }).press('Enter');
  await expect(page.getByLabel('Board name')).toHaveValue('Main checklist');
  await page.keyboard.press('Escape');
  await toggleHistory(page);
  // The oldest version, from before the list was made.
  await page.getByRole('complementary', { name: 'Version history' }).getByRole('region').getByRole('button').last().click();
  await expect(page.getByRole('region', { name: 'Looking at an earlier version' })).toBeVisible();
  await expect(panel(page).getByText('Viewing an old version')).toBeVisible();
  expect(await texts(panel(page))).toEqual(['zebra now']);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  const tile = (page: Page, name: string) => page.getByRole('dialog', { name: 'More' }).locator('.phone-tiles').getByRole('button', { name, exact: true });
  const moreButton = (page: Page) => page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true });

  test('⋯ → Checklist fills the screen; opening the Journal shows one panel at a time', async ({ page }) => {
    await moreButton(page).tap();
    await tile(page, 'Checklist').tap();
    await expect(page.getByRole('dialog', { name: 'More' })).toHaveCount(0);
    await expect(panel(page)).toBeVisible();
    expect((await box(panel(page))).width).toBeGreaterThanOrEqual(389);
    await expect(handle(page)).toHaveCount(0);
    // Like the Journal there, it covers the bottom bar: its × closes it.
    await panel(page).getByRole('button', { name: 'Close checklist' }).tap();
    await expect(panel(page)).toHaveCount(0);
    await moreButton(page).tap();
    await tile(page, 'Journal').tap();
    await expect(journal(page)).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
  });

  test('typing in its empty list makes the list, without the keyboard being lost', async ({ page }) => {
    await moreButton(page).tap();
    await tile(page, 'Checklist').tap();
    const empty = items(panel(page));
    await expect(empty).not.toBeFocused(); // the keyboard doesn't cover the list before it has been seen
    await empty.tap();
    await page.keyboard.type('milk');
    expect(await texts(panel(page))).toEqual(['milk']);
    await expect(items(panel(page))).toBeFocused();
  });
});
