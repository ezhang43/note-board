import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, box, clickEmpty, columns, dragTo, freshBoardEachTest, importLinkCard, looseCards } from './helpers';

// The card title shares its line with the card's buttons (owner pick, 2026-10-22, Impeccable review job 180,
// M2): no empty band above the title, so each card is about 30px shorter. Notes have no title, and containers
// already had their title beside their buttons.

freshBoardEachTest();

const buttons = (card: Locator) => card.locator('.card-header > .icon-button');
const center = (b: { y: number; height: number }) => b.y + b.height / 2;

const largest = async (page: Page) => {
  const larger = page.getByRole('button', { name: 'Larger text' });
  for (let i = 0; i < 12 && (await larger.getAttribute('aria-disabled')) !== 'true'; i++) await larger.click();
};

/** The title sits on the buttons' line, clear of them, and the content starts right under that line. */
async function expectTitleOnButtonRow(card: Locator, title: Locator, firstContent: Locator) {
  await card.hover();
  const c = await box(card);
  const t = await box(title);
  const h = await box(card.locator('.card-header'));
  const [collapse] = await Promise.all((await buttons(card).all()).map(box));
  expect(Math.abs(center(t) - center(collapse)), 'title and buttons share a line').toBeLessThanOrEqual(1.5);
  expect(h.y - c.y, 'the button row starts at the card top').toBeLessThan(3);
  expect(t.y, 'the title is in the button row, not in a band under it').toBeGreaterThanOrEqual(h.y);
  expect(t.y + t.height).toBeLessThanOrEqual(h.y + h.height);
  expect(t.x + t.width).toBeLessThanOrEqual(collapse.x);
  const content = await box(firstContent);
  expect(content.y - (h.y + h.height), 'content starts right under the button row').toBeLessThan(16);
  expect(content.y).toBeGreaterThanOrEqual(t.y + t.height);
}

test('a checklist title is on the same line as the card buttons, and the card is shorter', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Checklist', { stayInTitle: true });
  await page.keyboard.type('To book');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Book the flights');
  await clickEmpty(page);
  const card = looseCards(page).first();
  await expectTitleOnButtonRow(card, card.getByLabel('List title'), card.getByLabel('Item text').first());
  // A title and one item: 1px edge + the 36px button row + the item + 12px padding, not 70px of band and title before the item.
  expect((await box(card)).height).toBeLessThan(110);
});

test('a link card title is on the buttons line too', async ({ page }) => {
  const link = await importLinkCard(page);
  await clickEmpty(page);
  await expectTitleOnButtonRow(link, link.getByLabel('Link title'), link.getByLabel('Link address'));
});

test('a board card shows its name on the buttons line, with the count and Open board below', async ({ page }) => {
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add a sub-board here' }).click();
  const card = page.locator('[data-kind="board"]');
  await expect(card).toContainText('Untitled board');
  await clickEmpty(page);
  await expectTitleOnButtonRow(card, card.locator('.card-title'), card.locator('.board-card-count'));
  await expect(card.getByRole('button', { name: 'Open board' })).toBeVisible();
  // The name is shown once: on the buttons line.
  await expect(card.getByText('Untitled board')).toHaveCount(1);
});

test('a long title stops before the buttons instead of running under them', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Checklist', { stayInTitle: true });
  await page.keyboard.type('A very long list title that cannot possibly fit on one line of this card');
  await clickEmpty(page);
  const card = looseCards(page).first();
  await card.hover();
  const t = await box(card.getByLabel('List title'));
  const [collapse] = await Promise.all((await buttons(card).all()).map(box));
  expect(t.x + t.width).toBeLessThanOrEqual(collapse.x);
});

test('at the biggest text the title stays on the buttons line and clear of them', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Checklist', { stayInTitle: true });
  await page.keyboard.type('To book');
  await page.keyboard.press('Enter');
  await page.keyboard.type('One');
  await clickEmpty(page);
  await largest(page);
  const card = looseCards(page).first();
  await expectTitleOnButtonRow(card, card.getByLabel('List title'), card.getByLabel('Item text').first());
});

test('inside a container a card has the same title row', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Checklist', { stayInTitle: true });
  await page.keyboard.type('Packing');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Socks');
  await clickEmpty(page);
  await add(page, 'New container');
  const col = columns(page).first();
  await clickEmpty(page);
  const colBox = await box(col);
  await dragTo(page, looseCards(page).first(), { x: colBox.x + 100, y: colBox.y + 20 });
  const inside = col.locator('.card.in-column');
  await expect(inside).toHaveCount(1);
  await expectTitleOnButtonRow(inside, inside.getByLabel('List title'), inside.getByLabel('Item text').first());
});

test('a colored list is tinted across its title row, into the corners, and no further', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Checklist', { stayInTitle: true });
  await page.keyboard.type('Trip');
  await page.getByRole('button', { name: 'Color of selected cards and containers' }).click();
  await page.getByRole('group', { name: 'Colors' }).getByRole('button', { name: 'Tomato' }).click();
  const card = page.locator('.card.selected');
  const header = card.locator('.card-header');
  await expect(header).toHaveCSS('background-color', 'color(srgb 1 0.729412 0.682353)');
  const c = await box(card);
  const h = await box(header);
  // Edge to edge (inside the 1px border), from the top, and only as tall as the button row.
  expect(h.x).toBeLessThanOrEqual(c.x + 1.5);
  expect(h.x + h.width).toBeGreaterThanOrEqual(c.x + c.width - 1.5);
  expect(h.y).toBeLessThanOrEqual(c.y + 1.5);
  expect(h.height).toBeLessThan(42);
  const t = await box(card.getByLabel('List title'));
  expect(t.y).toBeGreaterThanOrEqual(h.y);
  expect(t.y + t.height).toBeLessThanOrEqual(h.y + h.height);
  await expect(header).toHaveCSS('border-top-left-radius', '9px');
});

test('a note has no title, so it keeps its button row', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Note');
  const note = looseCards(page).first();
  const c = await box(note);
  const text = await box(note.getByLabel('Note text'));
  expect(text.y - c.y).toBeGreaterThanOrEqual(36);
});

test('a card is still dragged by its title row, away from the title text', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Checklist', { stayInTitle: true });
  await page.keyboard.type('Trip');
  await clickEmpty(page);
  const card = looseCards(page).first();
  const before = await box(card);
  await dragTo(page, card, { x: before.x + 160, y: before.y + 100 });
  const after = await box(card);
  expect(after.x).toBeGreaterThan(before.x + 100);
});

test.describe('touch screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('a long title keeps its last characters pressable: the collapse button\'s bigger press area stays off it', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'Checklist' }).tap();
    await page.keyboard.type('A very long list title that cannot possibly fit on one line of this card');
    const card = page.locator('[data-card-id]').first();
    const title = await box(card.getByLabel('List title'));
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('aria-label'), { x: title.x + title.width - 1, y: title.y + title.height / 2 });
    expect(hit).toBe('List title');
  });
});
