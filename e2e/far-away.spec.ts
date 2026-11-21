import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { EXPORT_MARGIN } from '../src/model/exportImage';
import { WHEEL_PAN_SPEED } from '../src/model/constants';
import { clickEmpty, expectNoOverlaps, fontsLoaded } from './helpers';

// Speed on a big board (job perf-offscreen): a loose card or container more than a screen outside
// the visible board isn't drawn (it is marked data-far and keeps the size it had). Nothing about the
// board changes because of it: positions and sizes stay, the search, Alt+arrows and the picture of
// the board still reach far cards, and a far card that changes is measured again.

type Item = { id: string; text: string; done: boolean; children: Item[] };
const base = { color: null, collapsed: false, h: null, w: null };
const items = (n: number, p: string): Item[] => Array.from({ length: n }, (_, k) => ({ id: `${p}${k}`, text: `${p} item ${k}`, done: false, children: [] }));

/** A few blocks at the top left and some far to the right (12,000px away: off the screen even at 50%). */
function board() {
  const cards: Record<string, unknown> = {
    a: { ...base, id: 'a', kind: 'note', text: 'Alpha near', x: 40, y: 40 },
    b: { ...base, id: 'b', kind: 'note', text: 'Beta near', x: 340, y: 40 },
    l: { ...base, id: 'l', kind: 'todo', title: 'Near list', x: 640, y: 40, items: items(8, 'near') },
    in1: { ...base, id: 'in1', kind: 'note', text: 'Inside the far container', x: 0, y: 0 },
    f: { ...base, id: 'f', kind: 'note', text: 'Zebra crossing\nfar away\nthree lines', x: 12000, y: 40 },
    fl: { ...base, id: 'fl', kind: 'todo', title: 'Far list', x: 12000, y: 400, items: items(12, 'far') },
  };
  const columns = { c: { id: 'c', title: 'Far container', x: 12400, y: 40, w: 280, h: null, color: null, collapsed: false, cardIds: ['in1'] } };
  return { name: 'Far', snap: true, cards, columns, order: ['a', 'b', 'l', 'f', 'fl', 'c'] };
}

async function seed(page: Page) {
  await page.evaluate((b) => localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board: b })), board());
  await page.reload();
  await fontsLoaded(page);
  await expect(page.locator('[data-card-id="f"]')).toHaveAttribute('data-far', '');
}

const block = (page: Page, id: string) => page.locator(`[data-card-id="${id}"], [data-col-id="${id}"]`);
/** The saved board's blocks: where each is and how big. */
const saved = (page: Page) =>
  page.evaluate(() => {
    const b = JSON.parse(localStorage.getItem('note-board:v1')!).board;
    return { cards: b.cards, columns: b.columns, order: b.order };
  });
/** Moves the board sideways by `dx` screen pixels with the mouse wheel (the board goes the other way). */
async function panX(page: Page, dx: number) {
  await page.mouse.move(700, 500);
  for (let left = Math.round(dx / WHEEL_PAN_SPEED); left !== 0; ) {
    const step = Math.sign(left) * Math.min(Math.abs(left), 800);
    await page.mouse.wheel(step, 0);
    left -= step;
  }
}
const zoom = async (page: Page) => Number(await page.getByTestId('canvas').getAttribute('data-zoom'));
const height = (l: Locator) => l.evaluate((el) => (el as HTMLElement).offsetHeight);
const onScreen = async (page: Page, l: Locator) => {
  const r = (await l.boundingBox())!;
  const c = (await page.getByTestId('canvas').boundingBox())!;
  return r.x >= c.x && r.y >= c.y && r.x + r.width <= c.x + c.width && r.y + r.height <= c.y + c.height;
};

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await fontsLoaded(page);
  await seed(page);
  (page as Page & { errors: string[] }).errors = errors;
});
test.afterEach(async ({ page }) => expect((page as Page & { errors: string[] }).errors).toEqual([]));

test('far blocks are not drawn, near ones are; the saved board is the same after going there and back', async ({ page }) => {
  for (const id of ['f', 'fl', 'c']) await expect(block(page, id)).toHaveAttribute('data-far', '');
  for (const id of ['a', 'b', 'l']) await expect(block(page, id)).not.toHaveAttribute('data-far');
  // A card inside a far container isn't marked itself: the container is.
  await expect(block(page, 'in1')).not.toHaveAttribute('data-far');
  const before = await saved(page);
  const farHeights = { f: await height(block(page, 'f')), fl: await height(block(page, 'fl')), c: await height(block(page, 'c')) };
  expect(farHeights.f).toBeGreaterThan(60); // three lines of text, not a placeholder or 0
  expect(farHeights.fl).toBeGreaterThan(300); // twelve items

  // Go there: they are drawn, at the same size they were kept at.
  const z = await zoom(page);
  await panX(page, Math.round(11800 * z));
  for (const id of ['f', 'fl', 'c']) await expect(block(page, id)).not.toHaveAttribute('data-far');
  await expect(block(page, 'a')).toHaveAttribute('data-far', '');
  expect({ f: await height(block(page, 'f')), fl: await height(block(page, 'fl')), c: await height(block(page, 'c')) }).toEqual(farHeights);
  await expect(block(page, 'f').getByLabel('Note text')).toBeVisible();

  // And back.
  await panX(page, -Math.round(11800 * z));
  await expect(block(page, 'f')).toHaveAttribute('data-far', '');
  await expect(block(page, 'a')).not.toHaveAttribute('data-far');
  await page.waitForTimeout(400); // any tidy-up would be saved by now
  expect(await saved(page)).toEqual(before);
  await expectNoOverlaps(page);
});

test('the search goes to a match in a far card and shows it', async ({ page }) => {
  await page.keyboard.press('Control+f');
  await page.getByLabel('Search the board', { exact: true }).last().fill('Zebra');
  await page.keyboard.press('Enter');
  await expect(block(page, 'f')).not.toHaveAttribute('data-far');
  const mark = block(page, 'f').locator('mark.find-mark.current');
  await expect(mark).toBeVisible();
  expect(await onScreen(page, mark)).toBe(true);
});

test('Alt+arrow jumps to a far card, puts the cursor in it and brings it on screen', async ({ page }) => {
  await block(page, 'l').getByLabel('List title').click();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(block(page, 'f').getByLabel('Note text')).toBeFocused();
  await expect(block(page, 'f')).not.toHaveAttribute('data-far');
  expect(await onScreen(page, block(page, 'f'))).toBe(true);
});

test('a far card that changes is measured again: undo there makes the blocks below make room', async ({ page }) => {
  // Make the far note taller over there, then come back: it is far again, at its new height.
  const z = await zoom(page);
  await panX(page, Math.round(11800 * z));
  const note = block(page, 'f').getByLabel('Note text');
  await note.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nfour\nfive\nsix\nseven');
  await page.keyboard.press('Escape');
  const tall = await height(block(page, 'f'));
  await panX(page, -Math.round(11800 * z));
  await expect(block(page, 'f')).toHaveAttribute('data-far', '');
  expect(await height(block(page, 'f'))).toBe(tall);
  // Undo while it is far away takes the lines back out: it is drawn again to measure it, so it shrinks.
  await clickEmpty(page);
  await page.keyboard.press('Control+z');
  await expect.poll(() => height(block(page, 'f'))).toBeLessThan(tall);
  // Measured right: with it shown, it is the height a fresh drawing gives.
  const kept = await height(block(page, 'f'));
  const real = await block(page, 'f').evaluate((el) => {
    el.removeAttribute('data-far');
    return (el as HTMLElement).offsetHeight;
  });
  expect(kept).toBe(real);
});

test('dragging a card still pushes its neighbor out of the way while far blocks are not drawn', async ({ page }) => {
  const a = block(page, 'a');
  const b = block(page, 'b');
  const bBefore = (await b.boundingBox())!;
  // Hold the first note over the second one: the second moves aside while it is dragged.
  // The header's blank left edge (grabPoint's spot, at this zoom).
  const aBox = (await a.boundingBox())!;
  const z = await zoom(page);
  const g = { x: aBox.x + 8 * z, y: aBox.y + 18 * z };
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(g.x + ((bBefore.x - aBox.x) * k) / 10, g.y + 10 * (k / 10));
  await expect.poll(async () => (await b.boundingBox())!.x !== bBefore.x || (await b.boundingBox())!.y !== bBefore.y).toBe(true);
  await page.mouse.up();
  await expectNoOverlaps(page);
  await expect(block(page, 'f')).toHaveAttribute('data-far', '');
});

test('Download as picture draws far cards too, with their text', async ({ page }) => {
  const waiting = page.waitForEvent('download');
  await page.locator('header.toolbar').getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download as picture (PNG)' }).click();
  const png = readFileSync((await (await waiting).path())!);
  // The picture covers the board from the first block's left (40) to the container's right (12,400 + 280), with a margin.
  const areaW = 12400 + 280 + EXPORT_MARGIN - (40 - EXPORT_MARGIN);
  const scale = png.readUInt32BE(16) / areaW;
  const fH = await height(block(page, 'f'));
  // How many colors the picture has inside a block: its text makes many, an empty white box one or two.
  const colors = (x: number, y: number, w: number, h: number) =>
    page.evaluate(
      async ({ b64, x, y, w, h }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const px = ctx.getImageData(Math.round(x), Math.round(y), Math.round(w), Math.round(h)).data;
        const seen = new Set<number>();
        for (let i = 0; i < px.length; i += 4) seen.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
        return seen.size;
      },
      { b64: png.toString('base64'), x, y, w, h },
    );
  const at = (bx: number, by: number) => [(bx - (40 - EXPORT_MARGIN)) * scale, (by - (40 - EXPORT_MARGIN)) * scale] as const;
  const [fx, fy] = at(12000 + 12, 40 + 8);
  expect(await colors(fx, fy, 200 * scale, (fH - 16) * scale)).toBeGreaterThan(10);
  // The card still isn't drawn on the board itself afterwards.
  await expect(block(page, 'f')).toHaveAttribute('data-far', '');
});
