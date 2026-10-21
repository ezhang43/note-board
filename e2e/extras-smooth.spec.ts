import { expect, test } from '@playwright/test';
import { add, box, boardPos, columns, freshBoardEachTest, grabPoint, looseCards } from './helpers';

// Owner's request: snapping should feel smooth. Blocks follow the pointer, then glide onto the grid.

test.describe('with motion on', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });
  freshBoardEachTest();

  test('a dropped block glides into its grid spot instead of jumping', async ({ page }) => {
    await add(page, 'Note');
    await add(page, 'Note'); // a block after it: dropping brings the dragged one to the front of the order
    const first = await looseCards(page).first().getAttribute('data-card-id');
    const note = page.locator(`[data-card-id="${first}"]`);
    const start = await boardPos(note);
    const g = await grabPoint(note);
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    await page.mouse.move(g.x + 309, g.y + 191, { steps: 8 });
    const before = await box(note);
    // The block stays the same element while it is dragged and dropped, so its left / top can transition.
    await note.evaluate((el) => {
      const w = window as unknown as { glides: string[] };
      w.glides = [];
      (el as unknown as { mark: boolean }).mark = true;
      el.addEventListener('transitionrun', (e) => w.glides.push((e as TransitionEvent).propertyName));
    });
    await page.mouse.up();
    // Where it ends up: the nearest grid spot.
    expect(await boardPos(note)).toEqual({ x: start.x + 300, y: start.y + 200 });
    // It gets there with a short animation, not instantly.
    const duration = await note.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration).toMatch(/0\.16s/);
    await expect.poll(async () => Math.round((await box(note)).x - before.x)).toBe(-9);
    // It really glided (a transition ran on left and top) and was not rebuilt at the drop.
    expect(await page.evaluate(() => (window as unknown as { glides: string[] }).glides)).toEqual(expect.arrayContaining(['left', 'top']));
    expect(await note.evaluate((el) => (el as unknown as { mark?: boolean }).mark)).toBe(true);
  });

  test('a dragged container and a card dragged out of one are not rebuilt when dropped', async ({ page }) => {
    await page.evaluate(() => {
      const card = { id: 'n1', kind: 'note', text: 'inside', color: null, collapsed: false, x: 0, y: 0, w: 240, h: 160 };
      const column = { id: 'c1', title: 'Box', x: 100, y: 100, w: 280, h: null, color: null, collapsed: false, cardIds: ['n1'] };
      localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board: { name: 'T', snap: true, cards: { n1: card }, columns: { c1: column }, order: ['c1'] } }));
    });
    await page.reload();
    const sameElementAfterDrop = async (block: ReturnType<typeof page.locator>, dx: number, dy: number) => {
      const g = await grabPoint(block);
      await page.mouse.move(g.x, g.y);
      await page.mouse.down();
      await page.mouse.move(g.x + dx, g.y + dy, { steps: 8 });
      await block.evaluate((el) => ((el as unknown as { mark: boolean }).mark = true));
      await page.mouse.up();
      return block.evaluate((el) => (el as unknown as { mark?: boolean }).mark === true);
    };
    expect(await sameElementAfterDrop(page.locator('[data-card-id="n1"]'), 500, 300)).toBe(true);
    await expect(looseCards(page)).toHaveCount(1);
    expect(await sameElementAfterDrop(columns(page).first(), 200, 0)).toBe(true);
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
