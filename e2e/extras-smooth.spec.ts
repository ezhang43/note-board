import { expect, test } from '@playwright/test';
import { add, box, boardPos, freshBoardEachTest, grabPoint, looseCards } from './helpers';

// Owner's request: snapping should feel smooth. Blocks follow the pointer, then glide onto the grid.

test.describe('with motion on', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });
  freshBoardEachTest();

  test('a dropped block glides into its grid spot instead of jumping', async ({ page }) => {
    await add(page, 'Note');
    const note = looseCards(page).first();
    const start = await boardPos(note);
    const g = await grabPoint(note);
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    await page.mouse.move(g.x + 309, g.y + 191, { steps: 8 });
    const before = await box(note);
    await page.mouse.up();
    // Where it ends up: the nearest grid spot.
    expect(await boardPos(note)).toEqual({ x: start.x + 300, y: start.y + 200 });
    // It gets there with a short animation, not instantly.
    const duration = await note.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration).toMatch(/0\.16s/);
    await expect.poll(async () => Math.round((await box(note)).x - before.x)).toBe(-9);
  });

  test('a resized card follows the pointer, then eases to the grid size', async ({ page }) => {
    await add(page, 'Note');
    const note = looseCards(page).first();
    const h = await box(note.getByRole('button', { name: 'Resize card' }));
    await page.mouse.move(h.x + 9, h.y + 9);
    await page.mouse.down();
    await page.mouse.move(h.x + 9 + 53, h.y + 9, { steps: 6 });
    expect(await note.evaluate((el) => (el as HTMLElement).offsetWidth)).toBe(240 + 53); // follows the pointer
    await expect(page.getByTestId('size-label')).toHaveText(/^300 × /); // but says where it will land
    await page.mouse.up();
    await expect.poll(() => note.evaluate((el) => (el as HTMLElement).offsetWidth)).toBe(300);
  });
});
