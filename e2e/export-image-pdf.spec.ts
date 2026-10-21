import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { add, cards, freshBoardEachTest } from './helpers';

// Download as picture (PNG) and Download as PDF (job 163): the File menu saves the whole open board
// as a picture or a one-page PDF, to send or print. No test needs the internet.

freshBoardEachTest();

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function download(page: Page, item: string) {
  const waiting = page.waitForEvent('download');
  await page.locator('header.toolbar').getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
  const d = await waiting;
  return { name: d.suggestedFilename(), bytes: readFileSync((await d.path())!) };
}

/** A PNG's width and height, read from its header. */
const pngSize = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

/** How many different colors the picture has: a blank board-colored picture has one or two. */
const colorsIn = (page: Page, png: Buffer) =>
  page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < px.length; i += 4) seen.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
    return seen.size;
  }, png.toString('base64'));

async function fillBoard(page: Page) {
  await page.getByLabel('Board name').fill('Home');
  await add(page, 'Note');
  await cards(page).first().getByLabel('Note text').fill('Keep me');
  await add(page, 'Checklist');
  await cards(page).last().getByLabel('List title').fill('Groceries');
}

test('Download as picture (PNG) saves the board as a picture twice as wide as the board', async ({ page }) => {
  await fillBoard(page);
  const boxes = await Promise.all([cards(page).nth(0).boundingBox(), cards(page).nth(1).boundingBox()]);
  const png = await download(page, 'Download as picture (PNG)');
  expect(png.name).toMatch(/^BusyAnts - Home - \d{4}-\d\d-\d\d\.png$/);
  expect(png.bytes.subarray(1, 4).toString()).toBe('PNG');
  const { w, h } = pngSize(png.bytes);
  const left = Math.min(...boxes.map((b) => b!.x));
  const right = Math.max(...boxes.map((b) => b!.x + b!.width));
  expect(w).toBeGreaterThanOrEqual(2 * (right - left)); // both cards, a margin, at 2x
  expect(w).toBeLessThan(2 * (right - left) + 400);
  expect(h).toBeGreaterThan(200);
  expect(png.bytes.length).toBeGreaterThan(5000);
  expect(await colorsIn(page, png.bytes)).toBeGreaterThan(8); // the cards and their text are drawn, not just the background
});

test('the picture is the whole board, whatever part of it is on the screen', async ({ page }) => {
  await fillBoard(page);
  const before = pngSize((await download(page, 'Download as picture (PNG)')).bytes);
  for (let i = 0; i < 4; i++) await page.keyboard.press('Control+='); // zoom in so some of the board is off screen
  const zoomed = pngSize((await download(page, 'Download as picture (PNG)')).bytes);
  expect(zoomed).toEqual(before);
});

test('Download as PDF saves a one-page PDF sized to the board', async ({ page }) => {
  await fillBoard(page);
  const pdf = await download(page, 'Download as PDF');
  expect(pdf.name).toMatch(/^BusyAnts - Home - \d{4}-\d\d-\d\d\.pdf$/);
  const text = pdf.bytes.toString('latin1');
  expect(text.startsWith('%PDF-')).toBe(true);
  expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  expect(text).toContain('/Count 1');
  const [, w, h] = /\/MediaBox \[0 0 (\d+) (\d+)\]/.exec(text)!.map(Number);
  expect(w).toBeGreaterThan(200);
  expect(h).toBeGreaterThan(150);
  expect(pdf.bytes.length).toBeGreaterThan(2000);
});

test('a picture from another site that the browser won’t let us copy is left blank, not an error', async ({ page }) => {
  // The page may show this picture, but (no CORS header) can't read it back to draw it into the export.
  await page.route('https://pics.example.test/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'https://pics.example.test/cat.png');
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('[data-kind="link"] img')).toHaveCount(1);
  const png = await download(page, 'Download as picture (PNG)');
  expect(png.bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(pngSize(png.bytes).w).toBeGreaterThan(200);
});

test('an empty board has nothing to save, and the menu says so', async ({ page }) => {
  await page.locator('header.toolbar').getByRole('button', { name: 'File', exact: true }).click();
  const message = new Promise<string>((resolve) => page.once('dialog', (d) => (resolve(d.message()), d.dismiss())));
  await page.getByRole('menuitem', { name: 'Download as PDF' }).click();
  expect(await message).toContain('Nothing on this board to save yet');
});

test('the export leaves the board as it was: selection, toolbar and view untouched', async ({ page }) => {
  await fillBoard(page);
  const view = () => page.getByTestId('canvas').evaluate((el) => [el.getAttribute('data-pan-x'), el.getAttribute('data-pan-y'), el.getAttribute('data-zoom')]);
  const was = await view();
  await download(page, 'Download as picture (PNG)');
  expect(await view()).toEqual(was);
  await expect(page.locator('.export-clone')).toHaveCount(0); // the hidden copy used for drawing is gone
  await expect(cards(page)).toHaveCount(2);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('the File menu under ⋯ has both rows, and Download as PDF saves a PDF', async ({ page }) => {
    const bar = page.getByRole('toolbar', { name: 'Board actions' });
    await bar.getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'Checklist' }).tap();
    await expect(cards(page)).toHaveCount(1);
    await bar.getByRole('button', { name: 'More', exact: true }).tap();
    const more = page.getByRole('dialog', { name: 'More' });
    await more.getByRole('button', { name: 'File' }).tap();
    const menu = more.getByRole('menu', { name: 'File' });
    await expect(menu.getByRole('menuitem', { name: 'Download as picture (PNG)' })).toBeVisible();
    const waiting = page.waitForEvent('download');
    await menu.getByRole('menuitem', { name: 'Download as PDF' }).tap();
    const d = await waiting;
    expect(d.suggestedFilename()).toMatch(/\.pdf$/);
    expect(readFileSync((await d.path())!).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
