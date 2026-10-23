import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Phone lists (owner request, job 113): a new card fills the screen width, starting to edit one
// fills the screen width with it, and the collapse / trash buttons show only on the selected card.
// Everything runs on a 390x844 touch screen (under 600px wide: the phone layout).

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const MARGIN = 16;
const SCREEN = 390;
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Board actions' });
const addMenu = async (page: Page, item: 'Note' | 'Checklist' | 'Container') => {
  await bar(page).getByRole('button', { name: 'Add', exact: true }).tap();
  await page.getByRole('menuitem', { name: item }).tap();
};
const canvas = (page: Page) => page.getByTestId('canvas');
const zoom = async (page: Page) => Number(await canvas(page).getAttribute('data-zoom'));
const trash = (page: Page) => page.locator('button[aria-label="Delete card"]');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
});

test.describe('a new card fills the screen width', () => {
  for (const kind of ['Checklist', 'Note'] as const) {
    test(`a new ${kind.toLowerCase()} is as wide as the screen less a margin each side`, async ({ page }) => {
      await addMenu(page, kind);
      const card = page.locator('.card.selected');
      // Its width on the board (the desktop default is 240).
      expect(await card.evaluate((e) => (e as HTMLElement).offsetWidth)).toBe(SCREEN - 2 * MARGIN);
      const box = (await card.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(SCREEN + 0.5);
      expect(box.width).toBeGreaterThan(SCREEN - 4 * MARGIN);
    });
  }

  test('a card added into a selected container keeps following the container', async ({ page }) => {
    await addMenu(page, 'Container');
    await addMenu(page, 'Note');
    const card = page.locator('[data-col-id] .card.selected');
    const col = page.locator('[data-col-id]');
    const [c, k] = await Promise.all([col.evaluate((e) => (e as HTMLElement).offsetWidth), card.evaluate((e) => (e as HTMLElement).offsetWidth)]);
    expect(c).toBe(280); // not made screen-wide
    expect(k).toBeLessThan(c);
  });
});

test.describe('starting to edit fills the screen width', () => {
  test('after zooming in, tapping into the list brings it back to the screen width, its edge at the margin', async ({ page }) => {
    await addMenu(page, 'Checklist');
    // Tap the empty board (blurs the title) and double tap to zoom in one step. (A new card sits at the top, so the empty board is lower.)
    const empty = { x: 195, y: 230 };
    await page.touchscreen.tap(empty.x, empty.y);
    await page.waitForTimeout(400);
    await page.touchscreen.tap(empty.x, empty.y);
    await page.touchscreen.tap(empty.x, empty.y);
    await expect.poll(() => zoom(page)).toBeGreaterThan(1.1);
    const zoomedIn = await zoom(page);
    await page.getByLabel('Item text').tap();
    await expect.poll(() => zoom(page)).toBeLessThan(zoomedIn);
    const box = (await page.locator('.card.selected').boundingBox())!;
    expect(box.x).toBeCloseTo(MARGIN, 0);
    expect(box.width).toBeCloseTo(SCREEN - 2 * MARGIN, 0);
  });

  test('a list zoomed out far enough is zoomed in until it fills the width', async ({ page }) => {
    await addMenu(page, 'Note');
    await page.touchscreen.tap(195, 700); // empty board: a new card sits at the top
    await page.waitForTimeout(400);
    // A long tap zooms out one step (rest the finger about half a second).
    const cdp = await page.context().newCDPSession(page);
    for (let i = 0; i < 2; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 700, id: 1 }] });
      await page.waitForTimeout(700);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(100);
    }
    await expect.poll(() => zoom(page)).toBeLessThan(0.9);
    await page.getByLabel('Note text').tap();
    await expect.poll(async () => (await page.locator('.card.selected').boundingBox())!.width).toBeCloseTo(SCREEN - 2 * MARGIN, 0);
  });

  test('moving between the boxes of the same list does not move the board again', async ({ page }) => {
    await addMenu(page, 'Checklist');
    await page.keyboard.type('Milk');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Eggs');
    const before = await canvas(page).evaluate((e) => [e.getAttribute('data-zoom'), e.getAttribute('data-pan-x')]);
    await page.getByLabel('List title').tap();
    await page.getByLabel('Item text').first().tap();
    const after = await canvas(page).evaluate((e) => [e.getAttribute('data-zoom'), e.getAttribute('data-pan-x')]);
    expect(after).toEqual(before);
  });
});

test.describe('card buttons show only on the selected card', () => {
  test('two cards: only the selected one has its collapse arrow and trash can', async ({ page }) => {
    await addMenu(page, 'Note');
    await addMenu(page, 'Note');
    await expect(page.locator('[data-card-id]')).toHaveCount(2);
    const [first, second] = [trash(page).nth(0), trash(page).nth(1)];
    await expect(second).toBeVisible();
    await expect(first).toBeHidden();
    await expect(page.locator('[data-card-id]').nth(0).locator('button[aria-label="Collapse card"]')).toBeHidden();
    await expect(page.locator('[data-card-id]').nth(1).locator('button[aria-label="Collapse card"]')).toBeVisible();
  });

  test('tapping where the other card’s trash can would be only selects that card', async ({ page }) => {
    await addMenu(page, 'Note');
    await addMenu(page, 'Note');
    // Each new card goes to the top of the screen (job 198), leaving the first above it: slide the board down to see both.
    await page.getByTestId('canvas').evaluate((el) => el.dispatchEvent(new WheelEvent('wheel', { deltaY: -600, bubbles: true, cancelable: true })));
    await page.waitForTimeout(300);
    const hidden = (await trash(page).nth(0).boundingBox())!;
    await page.touchscreen.tap(hidden.x + hidden.width / 2, hidden.y + hidden.height / 2);
    await expect(page.locator('[data-card-id]')).toHaveCount(2);
    await expect(page.locator('[data-card-id]').nth(0)).toHaveClass(/selected/);
    await expect(trash(page).nth(0)).toBeVisible();
    await expect(trash(page).nth(1)).toBeHidden();
  });

  test('a list’s Clean up shows only while it is selected; a tap there on another list only selects it (job 200)', async ({ page }) => {
    await addMenu(page, 'Checklist');
    await page.keyboard.press('Enter');
    await page.keyboard.type('milk');
    const first = page.locator('[data-card-id]').nth(0);
    await first.getByLabel('Done: milk').tap();
    await expect(first.locator('.list-clean-up')).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()); // the keyboard goes, the bottom bar is back
    await addMenu(page, 'Checklist');
    await expect(page.locator('[data-card-id]')).toHaveCount(2);
    await expect(first.locator('.list-clean-up')).toBeHidden();
    await page.getByTestId('canvas').evaluate((el) => el.dispatchEvent(new WheelEvent('wheel', { deltaY: -600, bubbles: true, cancelable: true })));
    await page.waitForTimeout(300);
    const at = (await first.locator('.list-clean-up').boundingBox())!;
    await page.touchscreen.tap(at.x + at.width / 2, at.y + at.height / 2);
    await expect(first).toHaveClass(/selected/);
    await expect(first.getByLabel('Done: milk')).toBeChecked(); // still in its list, not cleaned up
    await expect(first.locator('.list-clean-up')).toBeVisible();
  });

  test('the selected card’s trash can still deletes it, and its collapse arrow still folds it', async ({ page }) => {
    await addMenu(page, 'Note');
    await addMenu(page, 'Note');
    await page.locator('.card.selected button[aria-label="Collapse card"]').tap();
    await expect(page.locator('.card.selected')).toHaveClass(/collapsed/);
    await page.locator('.card.selected button[aria-label="Delete card"]').tap();
    await expect(page.locator('[data-card-id]')).toHaveCount(1);
  });

  test('a container shows its buttons only while selected', async ({ page }) => {
    await addMenu(page, 'Container');
    const colTrash = page.locator('button[aria-label="Delete container and its cards"]');
    await expect(colTrash).toBeVisible();
    await addMenu(page, 'Note'); // goes into the container and takes the selection
    await expect(colTrash).toBeHidden();
    await expect(trash(page)).toBeVisible();
  });
});
