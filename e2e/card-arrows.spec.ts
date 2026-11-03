import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, box, cards, clickEmpty, dragBy, emptySpot, fontsLoaded, freshBoardEachTest, grabPoint, touch, lerp, type Pt } from './helpers';

// Arrows between cards and containers (owner request, 2026-11-03, job card-arrows): hovering a block
// shows a dot on each side; dragging a dot onto another block draws a thin gray arrow. A clicked
// arrow is selected and Delete removes it; Ctrl+Z undoes; arrows follow their blocks and are saved.

const arrows = (page: Page) => page.locator('[data-arrow-id]');
const dots = (page: Page) => page.locator('.arrow-dot');
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('note-board:v1') ?? '{}'));
const savedArrows = async (page: Page) => {
  const ws = await saved(page);
  return (ws.boards?.[ws.home]?.arrows ?? []) as { id: string; from: string; to: string }[];
};
const centre = async (l: Locator): Promise<Pt> => {
  const b = await box(l);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
/** The line drawn for an arrow, in screen pixels. */
const lineOf = (page: Page, id?: string) =>
  (id ? page.locator(`[data-arrow-id="${id}"] .arrow-line`) : page.locator('.arrow-line').first()).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });

/** The dot of `block` nearest to `to` (dots show while the pointer is over the block). */
async function nearestDot(page: Page, to: Pt): Promise<Pt> {
  await expect(dots(page).first()).toBeVisible();
  const all = await Promise.all((await dots(page).all()).map(centre));
  return all.reduce((best, p) => (Math.hypot(p.x - to.x, p.y - to.y) < Math.hypot(best.x - to.x, best.y - to.y) ? p : best));
}

/** Hover `from`, then drag its dot nearest `to` onto `to`. */
async function drawArrow(page: Page, from: Locator, to: Pt) {
  const c = await centre(from);
  await page.mouse.move(c.x, c.y);
  const dot = await nearestDot(page, to);
  await page.mouse.move(dot.x, dot.y, { steps: 4 });
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

test.describe('on a computer', () => {
  freshBoardEachTest();

  /** Two notes side by side, "first" and "second", nothing selected. */
  async function twoNotes(page: Page) {
    await add(page, 'Note');
    await page.keyboard.type('first');
    await clickEmpty(page);
    await add(page, 'Note');
    await page.keyboard.type('second');
    await clickEmpty(page);
    await expect(cards(page)).toHaveCount(2);
    const [a, b] = [cards(page).nth(0), cards(page).nth(1)];
    // Well apart, so the line between them is long enough to click.
    await dragBy(page, b, 360, 160);
    await clickEmpty(page);
    return { a, b };
  }

  test('hovering a card shows a dot on each side; dragging one onto another card draws an arrow', async ({ page }) => {
    const { a, b } = await twoNotes(page);
    await expect(dots(page)).toHaveCount(0);
    const c = await centre(a);
    await page.mouse.move(c.x, c.y);
    await expect(dots(page)).toHaveCount(4);
    await drawArrow(page, a, await centre(b));
    await expect(arrows(page)).toHaveCount(1);
    await expect(page.locator('.arrow-line')).toHaveCSS('stroke-width', '1.5px');
    await expect.poll(() => savedArrows(page)).toHaveLength(1);
    const [id1, id2] = await cards(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.cardId));
    expect((await savedArrows(page))[0]).toMatchObject({ from: id1, to: id2 });
  });

  test('with a mouse, a selected card shows no dots once the pointer leaves it (only hovering shows them)', async ({ page }) => {
    const { a } = await twoNotes(page);
    const g = await grabPoint(a);
    await page.mouse.click(g.x, g.y);
    await expect(page.locator('.card.selected')).toHaveCount(1);
    const away = await emptySpot(page);
    await page.mouse.move(away.x, away.y, { steps: 4 });
    await expect(page.locator('.card.selected')).toHaveCount(1);
    await expect(dots(page)).toHaveCount(0);
  });

  test('dropping on empty board or back on the same card draws nothing; the same two cards are joined once', async ({ page }) => {
    const { a, b } = await twoNotes(page);
    await drawArrow(page, a, await emptySpot(page));
    await expect(arrows(page)).toHaveCount(0);
    await drawArrow(page, a, await centre(a));
    await expect(arrows(page)).toHaveCount(0);
    await drawArrow(page, a, await centre(b));
    await drawArrow(page, b, await centre(a));
    await expect(arrows(page)).toHaveCount(1);
  });

  test('an arrow follows its card when the card is moved', async ({ page }) => {
    const { a, b } = await twoNotes(page);
    await drawArrow(page, a, await centre(b));
    const before = await lineOf(page);
    await dragBy(page, b, 0, 200);
    await expect.poll(async () => (await lineOf(page)).h).toBeGreaterThan(before.h + 30);
  });

  test('clicking an arrow selects it; Delete removes it; Ctrl+Z brings it back', async ({ page }) => {
    const { a, b } = await twoNotes(page);
    await drawArrow(page, a, await centre(b));
    await clickEmpty(page);
    const hit = page.locator('.arrow-hit').first();
    const mid = await hit.evaluate((el) => {
      const p = el as SVGGeometryElement;
      const at = p.getPointAtLength(p.getTotalLength() / 2);
      const m = p.getScreenCTM()!;
      return { x: at.x * m.a + m.e, y: at.y * m.d + m.f };
    });
    await page.mouse.click(mid.x, mid.y);
    await expect(page.locator('[data-arrow-id].selected')).toHaveCount(1);
    await expect(page.locator('.card.selected')).toHaveCount(0);
    await page.keyboard.press('Delete');
    await expect(arrows(page)).toHaveCount(0);
    await expect(cards(page)).toHaveCount(2);
    await page.keyboard.press('Control+z');
    await expect(arrows(page)).toHaveCount(1);
    await page.keyboard.press('Control+z');
    await expect(arrows(page)).toHaveCount(0);
  });

  test('deleting a card deletes its arrows; one Ctrl+Z brings both back', async ({ page }) => {
    const { a, b } = await twoNotes(page);
    await drawArrow(page, a, await centre(b));
    const g = await grabPoint(b);
    await page.mouse.click(g.x, g.y);
    await expect(page.locator('.card.selected')).toHaveCount(1);
    await page.keyboard.press('Delete');
    await expect(cards(page)).toHaveCount(1);
    await expect(arrows(page)).toHaveCount(0);
    await expect.poll(() => savedArrows(page)).toHaveLength(0);
    await page.keyboard.press('Control+z');
    await expect(cards(page)).toHaveCount(2);
    await expect(arrows(page)).toHaveCount(1);
  });

  test('an arrow to a container: drawn to the container, kept after a reload (saved as version 5)', async ({ page }) => {
    const { a } = await twoNotes(page);
    await clickEmpty(page);
    await add(page, 'New container');
    await clickEmpty(page);
    const col = page.locator('[data-col-id]');
    await dragBy(page, col, -350, -150);
    await clickEmpty(page);
    await drawArrow(page, a, await centre(col));
    await expect(arrows(page)).toHaveCount(1);
    await expect.poll(() => savedArrows(page)).toHaveLength(1);
    expect((await saved(page)).version).toBe(5);
    await page.reload();
    await fontsLoaded(page);
    await expect(arrows(page)).toHaveCount(1);
    const l = await lineOf(page);
    expect(Math.max(l.w, l.h)).toBeGreaterThan(20);
  });
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await fontsLoaded(page);
  });

  test('select a card, then drag one of its dots onto another card', async ({ page }) => {
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    for (const text of ['first', 'second']) {
      await bar.getByRole('button', { name: 'Add', exact: true }).tap();
      await page.getByRole('menuitem', { name: 'Note' }).tap();
      await page.keyboard.type(text);
    }
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await expect(cards(page)).toHaveCount(2);
    // Scroll the board down a little so both cards are on the screen.
    await page.mouse.move(200, 500);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(150);
    // The new card is selected, so it shows its dots (a finger has no hover).
    await expect(page.locator('.card.selected')).toHaveCount(1);
    await expect(dots(page).first()).toBeVisible();
    const selected = page.locator('.card.selected');
    const other = cards(page).and(page.locator(':not(.selected)'));
    const o = await box(other);
    const to = { x: o.x + o.width / 2, y: o.y + o.height - 30 };
    const inView = (await Promise.all((await dots(page).all()).map(centre))).filter((p) => p.x > 4 && p.x < 386 && p.y > 4 && p.y < 840);
    const from = inView.reduce((best, p) => (Math.hypot(p.x - to.x, p.y - to.y) < Math.hypot(best.x - to.x, best.y - to.y) ? p : best));
    await touch(page, [
      { type: 'touchStart', p: from },
      ...Array.from({ length: 12 }, (_, i) => ({ type: 'touchMove' as const, p: lerp(from, to, (i + 1) / 12) })),
      { type: 'touchEnd' },
    ]);
    await expect(arrows(page)).toHaveCount(1);
    await expect(selected).toHaveCount(1);
  });
});
