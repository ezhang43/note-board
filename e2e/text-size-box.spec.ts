import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, clickEmpty, fontsLoaded, freshBoardEachTest } from './helpers';

// The size box on whole-box formatting (owner request 2026-11-19: "in journal there are many different font sizes
// that you can go up and down to, can you add that into the main checklist as well"). The small format bar's
// Small / Normal / Large became the Journal's number box: − and + step through 10 … 36, clicking the number opens
// the list, Ctrl+Shift+. / Ctrl+Shift+, step one size, and the size covers the whole box, on boards and in the
// Checklist panel.

freshBoardEachTest();

const css = (l: Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
const px = (l: Locator) => css(l, 'font-size');
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Text format' });
const sizeBox = (page: Page) => bar(page).getByTitle('Choose a size');
const panel = (page: Page) => page.getByRole('complementary', { name: 'Checklist', exact: true });
const items = (l: Locator) => l.getByLabel('Item text');

test('on a board note: the box shows 14, − / + step, the list picks a size, and it is saved', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.type('hello');
  const note = page.getByLabel('Note text');
  await note.selectText();
  await expect(bar(page)).toBeVisible();
  await expect(sizeBox(page)).toHaveText('14');
  expect(await px(note)).toBe('14px');

  await bar(page).getByRole('button', { name: 'Larger' }).click();
  await expect(sizeBox(page)).toHaveText('16');
  await expect.poll(() => px(note)).toBe('16px');
  for (let i = 0; i < 3; i++) await bar(page).getByRole('button', { name: 'Smaller' }).click();
  await expect(sizeBox(page)).toHaveText('10');
  await expect.poll(() => px(note)).toBe('10px');
  await expect(bar(page).getByRole('button', { name: 'Smaller' })).toHaveAttribute('aria-disabled', 'true'); // fades at 10
  await bar(page).getByRole('button', { name: 'Smaller' }).click({ force: true }); // nothing happens
  await expect(sizeBox(page)).toHaveText('10');

  // The list: the current size pressed; picking one closes it.
  await sizeBox(page).click();
  const list = bar(page).getByRole('group', { name: 'Sizes' });
  await expect(list.getByRole('button')).toHaveText(['10', '12', '14', '16', '18', '20', '24', '28', '32', '36']);
  await expect(list.getByRole('button', { name: '10', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await list.getByRole('button', { name: '36', exact: true }).click();
  await expect(list).toHaveCount(0);
  await expect(sizeBox(page)).toHaveText('36');
  await expect.poll(() => px(note)).toBe('36px');
  await expect(bar(page).getByRole('button', { name: 'Larger' })).toHaveAttribute('aria-disabled', 'true'); // fades at 36
  await expect(note).toBeFocused(); // the bar never takes the cursor away

  await page.waitForTimeout(400); // saving waits a moment
  await page.reload();
  await fontsLoaded(page);
  await expect.poll(() => px(page.getByLabel('Note text'))).toBe('36px');
});

test('in the Checklist panel: Ctrl+Shift+. / Ctrl+Shift+, step one size a press, items of different sizes step from their own, and it is saved', async ({ page }) => {
  await page.locator('.corner-controls').getByRole('button', { name: 'Checklist', exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.type('buy stamps');
  await page.keyboard.press('Enter');
  await page.keyboard.type('call the bank');
  const [first, second] = [items(panel(page)).first(), items(panel(page)).nth(1)];

  await first.click();
  await page.keyboard.press('Control+Shift+Period');
  await expect.poll(() => px(first)).toBe('16px');
  await page.keyboard.press('Control+Shift+Period');
  await expect.poll(() => px(first)).toBe('18px');
  await page.keyboard.press('Control+Shift+Comma');
  await expect.poll(() => px(first)).toBe('16px');
  expect(await px(second)).toBe('14px'); // only the item the cursor is in

  // Highlighting words in the item shows the bar with its size.
  await first.selectText();
  await expect(sizeBox(page)).toHaveText('16');

  // Both items selected (16 and 14): the box is empty, and + steps each from its own size.
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+a');
  await expect(panel(page).locator('.todo-item.picked')).toHaveCount(2);
  await expect(sizeBox(page)).toHaveText('');
  await expect(sizeBox(page)).toHaveAttribute('aria-label', 'Size: mixed');
  await bar(page).getByRole('button', { name: 'Larger' }).click();
  await expect.poll(() => px(first)).toBe('18px');
  await expect.poll(() => px(second)).toBe('16px');

  await page.waitForTimeout(400); // saving waits a moment
  await page.reload();
  await fontsLoaded(page);
  await page.locator('.corner-controls').getByRole('button', { name: 'Checklist', exact: true }).click();
  await expect.poll(() => px(items(panel(page)).first())).toBe('18px');
  await expect.poll(() => px(items(panel(page)).nth(1))).toBe('16px');
});

test('a checklist title starts at 15 and steps to 16; an item made Large before shows 18 and looks as it did', async ({ page }) => {
  await page.evaluate(() => {
    const base = { color: null, collapsed: false, h: null };
    const items = [{ id: 'a', text: 'old large', done: false, children: [], style: { size: 'large' } }];
    const board = { name: 'T', snap: true, cards: { t1: { ...base, id: 't1', kind: 'todo', title: 'Groceries', completedOpen: true, x: 100, y: 100, w: 400, items } }, columns: {}, order: ['t1'] };
    localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board }));
  });
  await page.reload();
  await fontsLoaded(page);
  const list = page.locator('[data-card-id="t1"]');
  const item = items(list).first();
  expect(parseFloat(await px(item))).toBeCloseTo(18.2, 1); // 1.3 × 14, as before
  await item.selectText();
  await expect(sizeBox(page)).toHaveText('18');
  await bar(page).getByRole('button', { name: 'Larger' }).click();
  await expect.poll(() => px(item)).toBe('20px');

  const title = list.getByLabel('List title');
  await title.selectText();
  await expect(sizeBox(page)).toHaveText('15');
  expect(await px(title)).toBe('15px');
  await bar(page).getByRole('button', { name: 'Larger' }).click();
  await expect.poll(() => px(title)).toBe('16px');
});

test('from the keyboard: Alt+F10, Enter on the number opens the list; picking a size or Escape keeps the keyboard in the bar', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  await page.keyboard.type('hello');
  await page.keyboard.press('Shift+Home');
  await expect(bar(page)).toBeVisible();
  const note = page.getByLabel('Note text');
  await page.keyboard.press('Alt+F10');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight'); // Bold → Italic → − → the number
  await expect(sizeBox(page)).toBeFocused();
  await page.keyboard.press('Enter');
  const list = bar(page).getByRole('group', { name: 'Sizes' });
  await expect(list).toBeVisible();
  // Left / Right walk the bar, not the list: + then Font.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(bar(page).getByRole('button', { name: 'Font' })).toBeFocused();
  await list.getByRole('button', { name: '20', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(list).toHaveCount(0);
  await expect.poll(() => px(note)).toBe('20px');
  await expect(sizeBox(page)).toBeFocused(); // still in the bar
  await page.keyboard.press('Enter');
  await list.getByRole('button', { name: '24', exact: true }).focus();
  await page.keyboard.press('Escape'); // closes just the list
  await expect(list).toHaveCount(0);
  await expect(sizeBox(page)).toBeFocused();
  await expect(bar(page)).toBeVisible();
  await page.keyboard.press('Escape'); // back to the text, highlight kept
  await expect(note).toBeFocused();
  expect(await px(note)).toBe('20px');
});
