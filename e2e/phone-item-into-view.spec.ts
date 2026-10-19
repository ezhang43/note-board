import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// The line being typed in always slides into view above the phone keyboard (owner OK, "audit job B",
// 2026-10-19): a note, a title or a checklist item, after Enter adds an item, and after the item
// buttons (Tick, Delete, Undo, Move) move the cursor. A real keyboard can't be tested here, so a
// stand-in visual viewport is shrunk (the keyboard) and moved down (iPhone Safari scrolling the page).

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const TOP_BAR = 52;
type Keyboard = { setViewport: (keyboard: number, scrolled?: number, zoom?: number) => void };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const fake = Object.assign(new EventTarget(), { height: window.innerHeight, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true });
    (window as unknown as Keyboard).setViewport = (keyboard, scrolled = 0, zoom = 1) => {
      fake.scale = zoom;
      fake.height = window.innerHeight - keyboard - scrolled;
      fake.offsetTop = scrolled;
      fake.dispatchEvent(new Event('resize'));
    };
  });
  await page.goto('/');
  await fontsLoaded(page);
});

const keyboard = (page: Page, height: number, scrolled = 0, zoom = 1) =>
  page.evaluate(([h, s, z]) => (window as unknown as Keyboard).setViewport(h, s, z), [height, scrolled, zoom]);
const add = async (page: Page, item: 'Note' | 'Checklist') => {
  await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'Add', exact: true }).tap();
  await page.getByRole('menuitem', { name: item }).tap();
};
const items = (page: Page) => page.getByRole('toolbar', { name: 'Item actions' });

/** Where the text box with the cursor is, and the part of the screen the person can actually see. */
const where = (page: Page) =>
  page.evaluate((topBar) => {
    const f = document.activeElement!.getBoundingClientRect();
    const v = window.visualViewport!;
    const bar = document.querySelector('.item-bar')?.getBoundingClientRect();
    return { top: f.top, bottom: f.bottom, seesFrom: Math.max(topBar, v.offsetTop), seesTo: bar ? bar.top : v.offsetTop + v.height };
  }, TOP_BAR);

/**
 * The text box with the cursor is in view: below the top bar and above the keyboard / item buttons.
 * A note is a tall box with the cursor on its first line, so for it only that line (24px) has to show.
 */
async function inView(page: Page, firstLineOnly = false) {
  await expect
    .poll(async () => {
      const w = await where(page);
      return w.top >= w.seesFrom && (firstLineOnly ? w.top + 24 : w.bottom) <= w.seesTo;
    })
    .toBe(true);
}

/** A checklist with `n` items, the cursor in the last one. */
async function list(page: Page, n: number) {
  await add(page, 'Checklist');
  await page.keyboard.press('Enter');
  for (let i = 1; i <= n; i++) {
    await page.keyboard.type(`item ${i}`);
    if (i < n) await page.keyboard.press('Enter');
  }
}

for (const size of [{ width: 390, height: 844, keyboard: 336 }, { width: 320, height: 568, keyboard: 260 }]) {
  test.describe(`${size.width}px phone`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('a note and a list title slide up above a tall keyboard', async ({ page }) => {
      await add(page, 'Note');
      await keyboard(page, size.height - 200);
      await inView(page, true);
      await page.keyboard.press('Escape');
      await add(page, 'Checklist'); // the cursor starts in the title
      await inView(page);
    });

    test('Enter adds an item and it stays in view, all the way down a long list', async ({ page }) => {
      await list(page, 3);
      await keyboard(page, size.keyboard);
      for (let i = 4; i <= 24; i++) {
        await page.keyboard.press('Enter');
        await page.keyboard.type(`item ${i}`);
      }
      await page.keyboard.press('Enter'); // a blank new item
      await inView(page);
      await expect(items(page)).toBeVisible();
    });

    test('Tick, Delete, Undo and Move keep the cursor item in view', async ({ page }) => {
      await list(page, 24);
      await keyboard(page, size.keyboard);
      await inView(page);
      const button = (name: string) => items(page).getByRole('button', { name });
      await button('Delete item').tap(); // the cursor goes up to item 23
      await inView(page);
      await button('Undo').tap(); // the item comes back below it, at the very edge
      await inView(page);
      await button('Tick').tap();
      await inView(page);
      await button('Move up').tap();
      await inView(page);
      await button('Move down').tap();
      await inView(page);
    });

    test('an item scrolled off the top (the page moved under a notch or the address bar) is brought back', async ({ page }) => {
      await list(page, 6);
      await page.getByLabel('Item text').first().tap();
      await keyboard(page, 100);
      await inView(page);
      // iPhone Safari scrolls the page up so the focused box shows: it ends up just above what can be seen.
      const scrolled = (await where(page)).top + 30;
      await keyboard(page, 100, scrolled);
      await inView(page);
      expect((await where(page)).top).toBeGreaterThanOrEqual(scrolled);
    });
  });
}

test('a page the person has pinched in is left alone', async ({ page }) => {
  await list(page, 4);
  await keyboard(page, 100);
  await inView(page);
  const before = (await where(page)).top;
  // Pinched in and looking elsewhere on the page: the cursor's box is out of what can be seen, and stays put.
  await keyboard(page, 100, before + 60, 2);
  await page.waitForTimeout(300);
  expect((await where(page)).top).toBe(before);
  await keyboard(page, 100, before + 60, 1);
  await inView(page);
});

test('an item far off to the side is brought back too', async ({ page }) => {
  await list(page, 2);
  await keyboard(page, 336);
  // The board is slid sideways (a wheel event stands in for a swipe), so the box with the cursor is off the screen.
  await page.evaluate(() => document.querySelector('[data-testid="canvas"]')!.dispatchEvent(new WheelEvent('wheel', { deltaX: 1200, deltaY: 0, bubbles: true, cancelable: true })));
  await expect.poll(() => page.evaluate(() => document.activeElement!.getBoundingClientRect().right < 0)).toBe(true);
  await page.keyboard.type('x');
  // The cursor, not the whole row (cards can be wider than the screen), is back on screen: it is near the box's left end.
  await expect.poll(() => page.evaluate(() => document.activeElement!.getBoundingClientRect().right)).toBeGreaterThan(100);
});

test.describe('a computer', () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 720 } });
  test('the desktop layout does not pan for the keyboard', async ({ page }) => {
    await page.locator('header.toolbar').getByRole('button', { name: 'Note', exact: true }).click();
    const before = await page.getByLabel('Note text').boundingBox();
    await page.keyboard.type('hello');
    expect(await page.getByLabel('Note text').boundingBox()).toEqual(before);
  });
});
