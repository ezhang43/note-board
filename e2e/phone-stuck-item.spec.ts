import { expect, test, type Locator, type Page } from '@playwright/test';
import { fontsLoaded, holdAndMoveSteps, touch, type Pt } from './helpers';

// Phone (job 197): the owner typed a new item on an iPhone and it ended up floating over the board,
// gone from its list. Holding the text being typed in started a lift, and the finger's lift-off never
// reached the page, so the lift never ended. Typing must never start a lift, and a lift whose
// finger is lost ends by itself, with the item back where it was.

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const bar = (page: Page) => page.getByRole('toolbar', { name: 'Board actions' });
const ghost = (page: Page) => page.getByTestId('item-ghost');
const texts = (card: Locator) => card.getByLabel('Item text').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
const row = (card: Locator, i: number) => card.locator('[data-item-id]').nth(i);
const mid = async (l: Locator, frac = 0.5): Promise<Pt> => {
  const b = (await l.boundingBox())!;
  return { x: b.x + 40, y: b.y + b.height * frac };
};

/** A checklist "Thursday" with Milk, Eggs and "Unload dish washer", still typing in the last one. */
async function typeList(page: Page) {
  await bar(page).getByRole('button', { name: 'Add', exact: true }).tap();
  await page.getByRole('menuitem', { name: 'Checklist' }).tap();
  await page.keyboard.type('Thursday');
  for (const text of ['Milk', 'Eggs', 'Unload dish washer']) {
    await page.keyboard.press('Enter');
    await page.keyboard.type(text);
  }
  return page.locator('[data-card-id]').first();
}

/**
 * The next finger lift-off never reaches the page, as when iPhone's own text handling takes the touch over
 * (the listeners are put in before the app loads, so none of the app's own see it either).
 */
const swallowNextLiftOff = (page: Page) => page.evaluate(() => ((window as unknown as { swallow: boolean }).swallow = true));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { swallow: boolean };
    const swallow = (e: Event) => {
      if (!w.swallow) return;
      e.stopImmediatePropagation();
      if (e.type === 'touchend') w.swallow = false;
    };
    window.addEventListener('pointerup', swallow, true);
    window.addEventListener('touchend', swallow, true);
  });
  await page.goto('/');
  await fontsLoaded(page);
});

test('resting a finger on the item being typed does not lift it', async ({ page }) => {
  const card = await typeList(page);
  const field = card.getByLabel('Item text').nth(2);
  await expect(field).toBeFocused();
  await touch(page, [{ type: 'touchStart', p: await mid(row(card, 2)) }, { type: 'touchMove', p: await mid(row(card, 2)), wait: 800 }]);
  await expect(ghost(page)).toHaveCount(0);
  await touch(page, [{ type: 'touchEnd' }]);
  await expect(ghost(page)).toHaveCount(0);
  expect(await texts(card)).toEqual(['Milk', 'Eggs', 'Unload dish washer']);
  await expect(row(card, 2)).toBeVisible();
});

test('a lift whose lift-off never arrives ends at the next touch, with the item back in its place', async ({ page }) => {
  const card = await typeList(page);
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await touch(page, holdAndMoveSteps(await mid(row(card, 2)), await mid(row(card, 0), 0.25)));
  await expect(ghost(page)).toContainText('Unload dish washer');
  await swallowNextLiftOff(page);
  await touch(page, [{ type: 'touchEnd' }]);
  await expect(ghost(page)).toBeVisible(); // stuck, as on the owner's iPhone
  // The next touch anywhere (here on empty board) ends it; nothing moves.
  await touch(page, [{ type: 'touchStart', p: { x: 200, y: 650 } }, { type: 'touchEnd', wait: 50 }]);
  await expect(ghost(page)).toHaveCount(0);
  expect(await texts(card)).toEqual(['Milk', 'Eggs', 'Unload dish washer']);
  await expect(row(card, 2)).toBeVisible();
  await expect(row(card, 2)).toHaveCSS('visibility', 'visible');
});

test('a lift ends, with the item back in its place, when the page is hidden (another app or tab)', async ({ page }) => {
  const card = await typeList(page);
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await touch(page, holdAndMoveSteps(await mid(row(card, 2)), await mid(row(card, 0), 0.25)));
  await expect(ghost(page)).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(ghost(page)).toHaveCount(0);
  await touch(page, [{ type: 'touchEnd' }]);
  expect(await texts(card)).toEqual(['Milk', 'Eggs', 'Unload dish washer']);
  await expect(row(card, 2)).toHaveCSS('visibility', 'visible');
});

test('the owner’s flow: type a new item, rest on it, the lift-off is lost, tap away: it stays in its list', async ({ page }) => {
  const card = await typeList(page);
  await swallowNextLiftOff(page);
  await touch(page, [{ type: 'touchStart', p: await mid(row(card, 2)) }, { type: 'touchEnd', wait: 800 }]);
  await expect(ghost(page)).toHaveCount(0);
  await expect(row(card, 2)).toHaveCSS('visibility', 'visible');
  await page.getByTestId('canvas').tap({ position: { x: 200, y: 650 } });
  await expect(ghost(page)).toHaveCount(0);
  expect(await texts(card)).toEqual(['Milk', 'Eggs', 'Unload dish washer']);
  await page.reload();
  await fontsLoaded(page);
  expect(await texts(page.locator('[data-card-id]').first())).toEqual(['Milk', 'Eggs', 'Unload dish washer']);
});
