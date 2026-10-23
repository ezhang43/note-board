import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Phone (owner request, job 198): tapping into a card, a checklist or a container to edit brings the
// top of that block to just under the top bar, so it shows above the keyboard. Moving between the
// boxes of the same card leaves the board alone. A stand-in visual viewport plays the keyboard.

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const TOP_BAR = 52;
const WANTED = TOP_BAR + 12; // just under the top bar, with the usual 12px to spare
type Keyboard = { setViewport: (keyboard: number) => void };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const fake = Object.assign(new EventTarget(), { height: window.innerHeight, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true });
    (window as unknown as Keyboard).setViewport = (keyboard) => {
      fake.height = window.innerHeight - keyboard;
      fake.dispatchEvent(new Event('resize'));
    };
  });
  await page.goto('/');
  await fontsLoaded(page);
});

const keyboard = (page: Page, height: number) => page.evaluate((h) => (window as unknown as Keyboard).setViewport(h), height);
const add = async (page: Page, item: 'Note' | 'Checklist' | 'Container') => {
  await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'Add', exact: true }).tap();
  await page.getByRole('menuitem', { name: item }).tap();
};
/** Move the board by `dy` screen pixels (down is positive), as a swipe would: a wheel step moves it half its delta, the other way. */
const slide = (page: Page, dy: number) =>
  page.evaluate((d) => document.querySelector('[data-testid="canvas"]')!.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: -2 * d, bubbles: true, cancelable: true })), dy);
const topOf = (page: Page, selector: string) => page.locator(selector).first().evaluate((e) => e.getBoundingClientRect().top);

/** A checklist with `n` items, then the cursor put away. */
async function list(page: Page, n: number) {
  await add(page, 'Checklist');
  await page.keyboard.press('Enter');
  for (let i = 1; i <= n; i++) {
    await page.keyboard.type(`item ${i}`);
    if (i < n) await page.keyboard.press('Enter');
  }
  await page.keyboard.press('Escape');
}

/** Slide the board so the first card sits about `y` px down the screen (a swipe in real life). */
async function placeCardAt(page: Page, y: number) {
  await page.waitForTimeout(400); // let any slide from the card being made or put away finish
  const now = await topOf(page, '[data-card-id]');
  await slide(page, y - now);
  await expect.poll(() => topOf(page, '[data-card-id]')).toBeCloseTo(y, -1);
}

test('tapping an item in a card in the middle of the screen brings the card to the top', async ({ page }) => {
  await list(page, 3);
  await placeCardAt(page, 420);
  await page.getByLabel('Item text').nth(1).tap();
  await expect.poll(() => topOf(page, '[data-card-id]')).toBeCloseTo(WANTED, 0);
  await keyboard(page, 336); // then the keyboard comes up: the card is already clear of it, and stays put
  await page.waitForTimeout(300);
  expect(await topOf(page, '[data-card-id]')).toBeCloseTo(WANTED, 0);
});

test('a note does the same', async ({ page }) => {
  await add(page, 'Note');
  await page.getByLabel('Note text').fill('hello');
  await page.keyboard.press('Escape');
  await placeCardAt(page, 500);
  await page.getByLabel('Note text').tap();
  await expect.poll(() => topOf(page, '[data-card-id]')).toBeCloseTo(WANTED, 0);
});

test('a card made with + goes to the top too', async ({ page }) => {
  await add(page, 'Checklist');
  await expect.poll(() => topOf(page, '[data-card-id]')).toBeCloseTo(WANTED, 0);
});

test('a container title: the container goes to the top; a card in it: that card does', async ({ page }) => {
  await add(page, 'Container');
  await add(page, 'Note');
  await page.getByLabel('Note text').fill('inside');
  await page.keyboard.press('Escape');
  await placeCardAt(page, 400);
  await page.getByLabel('Container title').tap();
  await expect.poll(() => topOf(page, '[data-col-id]')).toBeCloseTo(WANTED, 0);
  await page.keyboard.press('Escape');
  await slide(page, 150);
  await page.waitForTimeout(400);
  await page.getByLabel('Note text').tap();
  await expect.poll(() => topOf(page, '[data-col-id] [data-card-id]')).toBeCloseTo(WANTED, 0);
});

test('moving to another item in the same card leaves the board where it is', async ({ page }) => {
  await list(page, 3);
  await placeCardAt(page, 420);
  await page.getByLabel('Item text').nth(0).tap();
  await expect.poll(() => topOf(page, '[data-card-id]')).toBeCloseTo(WANTED, 0);
  await slide(page, 20); // the person slid the board a little by hand
  const before = await topOf(page, '[data-card-id]');
  await page.getByLabel('Item text').nth(2).tap();
  await page.waitForTimeout(400);
  expect(await topOf(page, '[data-card-id]')).toBeCloseTo(before, 0);
});

test('a card taller than the space above the keyboard: the line being typed in still wins', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' }); // the board glides, and the keyboard rule waits for it
  await list(page, 24);
  await placeCardAt(page, 300);
  await keyboard(page, 336);
  const last = page.getByLabel('Item text').last();
  await last.tap();
  await expect
    .poll(async () => {
      const r = await last.evaluate((e) => {
        const b = e.getBoundingClientRect();
        const bar = document.querySelector('.item-bar')?.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, limit: bar ? bar.top : window.innerHeight - 336 };
      });
      return r.top >= TOP_BAR && r.bottom <= r.limit;
    })
    .toBe(true);
});

test('with motion on the board glides there and then lets go of the slide', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' }); // the browser tests turn motion off by default
  await list(page, 3);
  await placeCardAt(page, 420);
  await page.getByLabel('Item text').nth(1).tap();
  await expect(page.locator('html')).toHaveAttribute('data-glide', '');
  await expect.poll(() => topOf(page, '[data-card-id]')).toBeCloseTo(WANTED, 0);
  await expect(page.locator('html')).not.toHaveAttribute('data-glide', '');
  await expect(page.locator('.world')).toHaveCSS('transition-duration', '0s'); // a swipe by hand is never held back
});

test.describe('a tablet', () => {
  test.use({ viewport: { width: 700, height: 900 } });
  test('keeps the computer layout: tapping into a card does not move the board', async ({ page }) => {
    await page.locator('header.toolbar').getByRole('button', { name: /^Note$/ }).tap();
    await page.getByLabel('Note text').fill('hello');
    await page.keyboard.press('Escape');
    const before = await topOf(page, '[data-card-id]');
    await page.getByLabel('Note text').tap();
    await page.waitForTimeout(400);
    expect(await topOf(page, '[data-card-id]')).toBeCloseTo(before, 0);
  });
});
