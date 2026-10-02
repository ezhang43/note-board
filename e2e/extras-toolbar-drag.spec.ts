import { expect, test, type Page } from '@playwright/test';
import { add, box, cards, clickEmpty, columns, expectNoOverlaps, freshBoardEachTest, looseCards } from './helpers';

// Owner's additions after v1: drag a new Note / To-do list / Link from the toolbar onto the board.

freshBoardEachTest();

const addButton = (page: Page, name: 'Note' | 'To-do list' | 'Link') =>
  page.locator('header.toolbar').getByRole('button', { name, exact: true });

/** Press an Add button and drag to a point, optionally checking things before letting go. */
async function dragFromToolbar(page: Page, name: 'Note' | 'To-do list' | 'Link', to: { x: number; y: number }, during?: () => Promise<void>) {
  const b = await box(addButton(page, name));
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 15 });
  if (during) await during();
  await page.mouse.up();
}

test('dragging Note from the toolbar places a new note where it is let go', async ({ page }) => {
  const canvas = await box(page.getByTestId('canvas'));
  const to = { x: canvas.x + 300, y: canvas.y + 200 };
  await dragFromToolbar(page, 'Note', to, async () => {
    await expect(page.getByTestId('new-card-ghost')).toHaveText('New note');
    await expect(page.getByTestId('landing-spot')).toBeVisible();
  });
  await expect(page.getByTestId('landing-spot')).toHaveCount(0);
  await expect(looseCards(page)).toHaveCount(1);
  const note = looseCards(page).first();
  await expect(note).toHaveAttribute('data-kind', 'note');
  await expect(note).toHaveClass(/selected/);
  // The note's top edge is just above the pointer and it is centred on it.
  const r = await box(note);
  expect(Math.abs(r.x + r.width / 2 - to.x)).toBeLessThan(25);
  expect(to.y - r.y).toBeGreaterThan(0);
  expect(to.y - r.y).toBeLessThan(45);
});

test('a plain click on an Add button still adds one card, and a drag adds only one', async ({ page }) => {
  await addButton(page, 'Link').click();
  await expect(cards(page)).toHaveCount(1);
  const canvas = await box(page.getByTestId('canvas'));
  await dragFromToolbar(page, 'Link', { x: canvas.x + 200, y: canvas.y + 500 });
  await expect(cards(page)).toHaveCount(2);
});

test('dragging a to-do list onto another card lands it at the nearest free spot, cursor in its title', async ({ page }) => {
  await add(page, 'Note');
  await clickEmpty(page);
  const note = await box(looseCards(page).first());
  await dragFromToolbar(page, 'To-do list', { x: note.x + note.width / 2, y: note.y + 30 });
  await expect(looseCards(page)).toHaveCount(2);
  await expectNoOverlaps(page);
  const list = page.locator('.card.selected');
  await expect(list).toHaveAttribute('data-kind', 'todo');
  await expect(list.getByLabel('List title')).toBeFocused();
});

test('dragging onto a column puts the card into it at the pointer', async ({ page }) => {
  await add(page, 'New column');
  const col = columns(page).first();
  await add(page, 'Note');
  await col.click({ position: { x: 240, y: 26 } });
  await add(page, 'Note');
  await clickEmpty(page);
  const first = await box(col.locator('[data-card-id]').first());
  await dragFromToolbar(page, 'Link', { x: first.x + 60, y: first.y + first.height + 3 }, async () => {
    await expect(col).toHaveClass(/drop-target/);
  });
  await expect(col.locator('[data-card-id]')).toHaveCount(3);
  await expect(col.locator('[data-card-id]').nth(1)).toHaveAttribute('data-kind', 'link');
  await expect(looseCards(page)).toHaveCount(0);
});

test('New column can be dragged from the toolbar too; over another column it lands beside it', async ({ page }) => {
  const canvas = await box(page.getByTestId('canvas'));
  const button = await box(page.locator('header.toolbar').getByRole('button', { name: 'New column' }));
  const drag = async (to: { x: number; y: number }, during?: () => Promise<void>) => {
    await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 15 });
    if (during) await during();
    await page.mouse.up();
  };
  await drag({ x: canvas.x + 300, y: canvas.y + 150 }, async () => {
    await expect(page.getByTestId('new-card-ghost')).toHaveText('New column');
  });
  await expect(columns(page)).toHaveCount(1);
  const r = await box(columns(page).first());
  expect(Math.abs(r.x + r.width / 2 - (canvas.x + 300))).toBeLessThan(25);

  await drag({ x: r.x + r.width / 2, y: r.y + 60 }, async () => {
    await expect(columns(page).first()).not.toHaveClass(/drop-target/);
  });
  await expect(columns(page)).toHaveCount(2);
  await expectNoOverlaps(page);
});

test('letting go off the board adds nothing, and the whole drag is one undo step', async ({ page }) => {
  const tb = await box(page.locator('header.toolbar'));
  await dragFromToolbar(page, 'Note', { x: tb.x + 300, y: tb.y + 30 });
  await expect(cards(page)).toHaveCount(0);

  const canvas = await box(page.getByTestId('canvas'));
  await dragFromToolbar(page, 'Note', { x: canvas.x + 400, y: canvas.y + 300 });
  await expect(cards(page)).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(cards(page)).toHaveCount(0);
});
