import { expect, test, type Page } from '@playwright/test';
import { add, cards, clickEmpty, freshBoardEachTest } from './helpers';

// Quick wins from the competitor research (owner request, 2026-10-05).

freshBoardEachTest();

async function allInView(page: Page) {
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  for (const c of await cards(page).all()) {
    const b = (await c.boundingBox())!;
    if (b.x < canvas.x || b.y < canvas.y || b.x + b.width > canvas.x + canvas.width || b.y + b.height > canvas.y + canvas.height) return false;
  }
  return true;
}

test('Fit to screen (button, or Shift+1) brings every card into view', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  // Pan far away, then add a second note there.
  await clickEmpty(page);
  for (let i = 0; i < 2; i++) await page.mouse.wheel(1200, 900);
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  expect(await allInView(page)).toBe(false);

  await page.getByRole('button', { name: 'Fit to screen' }).click();
  await expect.poll(() => allInView(page)).toBe(true);

  await page.mouse.wheel(3000, 0);
  await clickEmpty(page);
  await page.keyboard.press('Shift+Digit1');
  await expect.poll(() => allInView(page)).toBe(true);
});

test('web addresses in a note show as links under it, opening in a new tab', async ({ page }) => {
  await add(page, 'Note');
  const note = cards(page).first();
  await note.getByLabel('Note text').fill('Read https://example.com/article today, and www.test.org.');
  const links = note.getByRole('link');
  await expect(links).toHaveCount(2);
  await expect(links.first()).toHaveAttribute('href', 'https://example.com/article');
  await expect(links.first()).toHaveAttribute('target', '_blank');
  await expect(links.first()).toHaveText('example.com/article');
  await expect(links.nth(1)).toHaveAttribute('href', 'https://www.test.org/');
  await note.getByLabel('Note text').fill('No address now');
  await expect(note.getByRole('link')).toHaveCount(0);
});

test('Ctrl+click on a web address in a checklist item opens it', async ({ page }) => {
  await add(page, 'To-do list');
  const item = cards(page).first().getByLabel('Item text').first();
  await item.fill('Book at https://example.com/tickets');
  const box = (await item.boundingBox())!;
  const popup = page.waitForEvent('popup');
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);
  await page.keyboard.up('Control');
  expect((await popup).url()).toContain('example.com/tickets');
});
