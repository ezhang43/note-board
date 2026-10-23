import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Phone (owner request, job 199): when the cursor first comes into a block, the board zooms in until the
// block's text shows at least 16px on the screen, even when that pushes a wide card past the screen's
// edges. The line being typed in stays in view, sideways too. A narrow card still fills the width.

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const LONG = 'A long line of words that fills most of a wide card and then carries on to the end of it, and then some more.';

/** Start with one card `width` px wide (made on the phone, then saved wider) and the page loaded afresh. */
async function startWithCard(page: Page, kind: 'Note' | 'Checklist', width: number) {
  await page.goto('/');
  await fontsLoaded(page);
  await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'Add', exact: true }).tap();
  await page.getByRole('menuitem', { name: kind }).tap();
  if (kind === 'Note') await page.getByLabel('Note text').fill(LONG);
  else {
    await page.keyboard.press('Enter');
    await page.keyboard.type(LONG);
  }
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('note-board:v1') ?? '')).toContain('some more');
  const saved = await page.evaluate((w) => localStorage.getItem('note-board:v1')!.replace(/"w":\d+/, `"w":${w}`), width);
  expect(saved).toContain(`"w":${width}`);
  await page.addInitScript((raw) => localStorage.setItem('note-board:v1', raw), saved);
  await page.reload();
  await fontsLoaded(page);
  await expect(page.locator('[data-card-id]')).toHaveCount(1);
}

const zoom = async (page: Page) => Number(await page.getByTestId('canvas').getAttribute('data-zoom'));
/** The text's size as it shows on the screen: its CSS size times the board's zoom. */
const fontPx = (page: Page, label: string) =>
  page.getByLabel(label).first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize) * (e.getBoundingClientRect().width / (e as HTMLElement).offsetWidth));
const cardLeft = (page: Page) => page.locator('[data-card-id]').first().evaluate((e) => e.getBoundingClientRect().left);
/** Where the cursor is on the screen, from a copy of the box's text up to the cursor. */
const caretX = (page: Page, label: string) =>
  page.getByLabel(label).first().evaluate((e) => {
    const f = e as HTMLTextAreaElement | HTMLInputElement;
    const mirror = document.createElement('div');
    const style = getComputedStyle(f);
    for (const p of ['font', 'letterSpacing', 'padding', 'border', 'boxSizing', 'whiteSpace', 'overflowWrap', 'wordBreak', 'lineHeight', 'width', 'textIndent'] as const) mirror.style[p] = style[p];
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = f instanceof HTMLTextAreaElement ? 'pre-wrap' : 'pre';
    mirror.style.width = `${f.offsetWidth}px`;
    mirror.textContent = f.value.slice(0, f.selectionStart ?? 0);
    const tip = document.createElement('span');
    tip.textContent = '​';
    mirror.append(tip);
    f.parentElement!.append(mirror);
    const box = f.getBoundingClientRect();
    const scale = box.width / f.offsetWidth;
    const x = box.left + (tip.offsetLeft - f.scrollLeft) * scale;
    mirror.remove();
    return x;
  });

test('a wide note: the text shows at least 16px on screen and the card starts at the left margin', async ({ page }) => {
  await startWithCard(page, 'Note', 600);
  await page.getByLabel('Note text').tap();
  await expect.poll(() => zoom(page)).toBeGreaterThanOrEqual(1);
  expect(await fontPx(page, 'Note text')).toBeGreaterThanOrEqual(15.99);
  await expect.poll(() => cardLeft(page)).toBeCloseTo(16, 0);
});

test('a wide checklist: the item text shows at least 16px on screen', async ({ page }) => {
  await startWithCard(page, 'Checklist', 600);
  await page.getByLabel('Item text').first().tap();
  await expect.poll(() => zoom(page)).toBeGreaterThanOrEqual(1);
  expect(await fontPx(page, 'Item text')).toBeGreaterThanOrEqual(15.99);
});

test('the cursor line stays in view sideways, even at the far end of a wide line', async ({ page }) => {
  await startWithCard(page, 'Note', 600);
  await page.getByLabel('Note text').tap();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('End'); // the end of the first line: at the far side of the card
  await expect.poll(async () => {
    const x = await caretX(page, 'Note text');
    return x >= 0 && x <= 390;
  }).toBe(true);
  await page.keyboard.press('Control+Home'); // and back at the start, which is at the left again
  await expect.poll(async () => {
    const x = await caretX(page, 'Note text');
    return x >= 0 && x <= 390;
  }).toBe(true);
});

test('a narrow card still fills the width of the screen', async ({ page }) => {
  await startWithCard(page, 'Note', 240);
  await page.getByLabel('Note text').tap();
  await expect.poll(() => zoom(page)).toBeCloseTo((390 - 32) / 240, 1);
});

test('a bigger text step needs less zoom: at A+ 150% the wide card is zoomed less, and still reads 16px', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('note-board:font', 'huge'));
  await startWithCard(page, 'Note', 900);
  await page.getByLabel('Note text').tap();
  await expect.poll(async () => (await zoom(page)) < 1).toBe(true);
  expect(await fontPx(page, 'Note text')).toBeGreaterThanOrEqual(15.99);
});

test('a zoom that is already bigger is kept (the board is not zoomed out)', async ({ page }) => {
  await startWithCard(page, 'Note', 600);
  await page.getByLabel('Note text').tap();
  await expect.poll(() => zoom(page)).toBeGreaterThanOrEqual(1);
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.querySelector('[data-testid="canvas"]')!.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, ctrlKey: true, clientX: 200, clientY: 300, bubbles: true, cancelable: true })));
  const bigger = await zoom(page);
  expect(bigger).toBeGreaterThan(1.2);
  await page.getByLabel('Note text').focus(); // the cursor comes in from outside again
  await page.waitForTimeout(400);
  expect(await zoom(page)).toBeCloseTo(bigger, 2);
});
