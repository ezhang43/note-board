import { expect, test } from '@playwright/test';
import { add, box, clickEmpty, columns, freshBoardEachTest } from './helpers';

// A container's "+" button (owner request, 2026-11-10): "in a container, can you add a + button so that it
// will automatically add in a new checklist".

freshBoardEachTest();

async function containerWithNotes(page: import('@playwright/test').Page) {
  await add(page, 'New container');
  await add(page, 'Note'); // into the selected container
  await add(page, 'Note');
  await clickEmpty(page);
  const col = columns(page).first();
  await expect(col.locator('[data-card-id]')).toHaveCount(2);
  return col;
}

test('the + in a container adds a checklist as its last card, with the cursor in the title; one undo removes it', async ({ page }) => {
  const col = await containerWithNotes(page);
  await col.hover();
  const plus = col.getByRole('button', { name: 'Add a checklist' });
  await expect(plus).toHaveAttribute('title', 'Add a checklist');
  const b = await box(plus);
  expect(b.width).toBeCloseTo(32, 0);
  expect(b.height).toBeCloseTo(32, 0);
  await plus.click();
  const inside = col.locator('[data-card-id]');
  await expect(inside).toHaveCount(3);
  const last = inside.last();
  await expect(last).toHaveAttribute('data-kind', 'todo');
  await expect(last).toHaveClass(/selected/);
  await expect(last.getByLabel('List title')).toBeFocused();
  await page.keyboard.type('Groceries');
  await expect(last.getByLabel('List title')).toHaveValue('Groceries');
  await clickEmpty(page);
  // Undo takes back the typing and then the checklist itself (the adding is one step).
  for (let i = 0; i < 6 && (await inside.count()) > 2; i++) await page.keyboard.press('Control+z');
  await expect(inside).toHaveCount(2);
});

test('the + sits next to the collapse arrow and the trash can, 4px apart, and a press does not move the container', async ({ page }) => {
  const col = await containerWithNotes(page);
  await col.hover();
  const [p, c, d] = [
    await box(col.getByRole('button', { name: 'Add a checklist' })),
    await box(col.getByRole('button', { name: 'Collapse container' })),
    await box(col.getByRole('button', { name: 'Delete container and its cards' })),
  ];
  expect(c.x - (p.x + p.width)).toBeCloseTo(4, 0);
  expect(d.x - (c.x + c.width)).toBeCloseTo(4, 0);
  expect(p.y).toBeCloseTo(c.y, 0);
  const before = await box(col);
  // Press, wiggle a little, release on the button: the container stays put.
  const target = col.getByRole('button', { name: 'Add a checklist' });
  const t = await box(target);
  await page.mouse.move(t.x + 10, t.y + 10);
  await page.mouse.down();
  await page.mouse.move(t.x + 14, t.y + 12, { steps: 3 });
  await page.mouse.up();
  const after = await box(col);
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
});

test('on a collapsed container the + opens it so the new checklist shows; one undo closes it again', async ({ page }) => {
  const col = await containerWithNotes(page);
  await col.hover();
  await col.getByRole('button', { name: 'Collapse container' }).click();
  await expect(col).toHaveClass(/collapsed/);
  await col.hover();
  await col.getByRole('button', { name: 'Add a checklist' }).click();
  await expect(col).not.toHaveClass(/collapsed/);
  const last = col.locator('[data-card-id]').last();
  await expect(col.locator('[data-card-id]')).toHaveCount(3);
  await expect(last.getByLabel('List title')).toBeFocused();
  await clickEmpty(page);
  await page.keyboard.press('Control+z');
  await expect(col).toHaveClass(/collapsed/);
  await col.hover();
  await col.getByRole('button', { name: 'Expand container' }).click();
  await expect(col.locator('[data-card-id]')).toHaveCount(2);
});

test('the + has the usual keyboard focus ring and works with Enter', async ({ page }) => {
  const col = await containerWithNotes(page);
  const plus = col.getByRole('button', { name: 'Add a checklist' });
  await plus.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(plus).toBeFocused();
  await expect(plus).toHaveCSS('outline-style', 'solid');
  await expect(plus).toHaveCSS('opacity', '1'); // keyboard focus shows it, like the other header buttons
  await page.keyboard.press('Enter');
  await expect(col.locator('[data-card-id]')).toHaveCount(3);
  await expect(col.locator('[data-card-id]').last().getByLabel('List title')).toBeFocused();
});

test('at the biggest text a container keeps room for its title: its three buttons stop at (width - 84) / 96 times 32px', async ({ page }) => {
  const col = await containerWithNotes(page);
  const larger = page.getByRole('button', { name: 'Larger text' });
  for (let i = 0; i < 12 && (await larger.getAttribute('aria-disabled')) !== 'true'; i++) await larger.click();
  await col.hover();
  const zoom = (await box(col)).width / 280; // the container is the usual 280px wide; the board may be zoomed
  const want = ((32 * (280 - 84)) / 96) * zoom; // about 65px
  for (const name of ['Add a checklist', 'Collapse container', 'Delete container and its cards']) {
    expect((await box(col.getByRole('button', { name }))).width).toBeCloseTo(want, 0);
  }
  // The title still has room before the first button.
  const title = await box(col.locator('.column-title'));
  const plus = await box(col.getByRole('button', { name: 'Add a checklist' }));
  expect(title.x + title.width).toBeLessThanOrEqual(plus.x + 0.5);
});
