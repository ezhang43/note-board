import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, boardPos, fontsLoaded, holdAndDrag, holdAndMoveSteps, touch, type Pt } from './helpers';

// Phone: press and hold a checklist item to lift it (owner request, audit job D, job 114). A shadow
// shows under the lifted item, the other rows slide aside to make room, and its label follows the
// finger. Everything runs on a touch screen under 600px wide, with real touch events.

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const bar = (page: Page) => page.getByRole('toolbar', { name: 'Board actions' });

/** A checklist "Groceries" with Milk, Eggs, Bread and Tea, and the keyboard put away. */
async function makeList(page: Page) {
  if (page.viewportSize()!.width < 600) {
    await bar(page).getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'Checklist' }).tap();
  } else await add(page, 'Checklist', { stayInTitle: true });
  await page.keyboard.type('Groceries');
  for (const text of ['Milk', 'Eggs', 'Bread', 'Tea']) {
    await page.keyboard.press('Enter');
    await page.keyboard.type(text);
  }
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  return page.locator('[data-card-id]').first();
}
const texts = (card: Locator) => card.getByLabel('Item text').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
const row = (card: Locator, i: number) => card.locator('[data-item-id]').nth(i);
const mid = async (l: Locator, frac = 0.5): Promise<Pt> => {
  const b = (await l.boundingBox())!;
  return { x: b.x + 40, y: b.y + b.height * frac };
};
const ghost = (page: Page) => page.getByTestId('item-ghost');
const style = (l: Locator, prop: string) => l.evaluate((e, p) => getComputedStyle(e).getPropertyValue(p), prop);
const slideY = async (l: Locator) => {
  const t = await style(l, 'transform');
  return t === 'none' ? 0 : Number(t.match(/matrix\(([^)]*)\)/)![1].split(',')[5]);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
});

for (const [name, size] of [['390px', { width: 390, height: 844 }], ['320px', { width: 320, height: 640 }]] as const) {
  test.describe(`on a ${name} wide phone`, () => {
    test.use({ viewport: size });

    test('holding an item, then moving, lifts it and drops it where the finger lets go', async ({ page }) => {
      const card = await makeList(page);
      const pos = await boardPos(card);
      await holdAndDrag(page, await mid(row(card, 0)), await mid(row(card, 2), 0.75));
      await expect.poll(() => texts(card)).toEqual(['Eggs', 'Bread', 'Milk', 'Tea']);
      expect(await boardPos(card)).toEqual(pos); // the item moved, not the card
      await expect(ghost(page)).toHaveCount(0);
    });

    test('while lifted: a shadow under it, its label by the finger, the rows between slide aside', async ({ page }) => {
      const card = await makeList(page);
      const eggsBefore = (await row(card, 1).boundingBox())!;
      const to = await mid(row(card, 2), 0.75);
      await touch(page, holdAndMoveSteps(await mid(row(card, 0)), to));
      await expect(ghost(page)).toContainText('Milk');
      expect(await style(ghost(page), 'box-shadow')).not.toBe('none');
      // It follows the finger: on its line, on the screen, and moved by transform, not by left / top.
      const g = (await ghost(page).boundingBox())!;
      expect(g.y).toBeLessThan(to.y);
      expect(g.y + g.height).toBeLessThan(to.y + 30);
      expect(g.x).toBeGreaterThanOrEqual(0);
      expect(g.x + g.width).toBeLessThanOrEqual(size.width + 0.5);
      expect(await style(ghost(page), 'left')).toBe('0px');
      // The lifted row's place is left empty; Eggs and Bread slide up by its height to close it, Tea stays.
      await expect(row(card, 0)).toHaveCSS('visibility', 'hidden');
      const milkH = (await row(card, 0).boundingBox())!.height;
      await expect.poll(() => slideY(row(card, 1))).toBeCloseTo(-milkH, 0);
      expect(await slideY(row(card, 2))).toBeCloseTo(-milkH, 0);
      expect(await slideY(row(card, 3))).toBe(0);
      expect((await row(card, 1).boundingBox())!.y).toBeLessThan(eggsBefore.y - milkH / 2);
      await touch(page, [{ type: 'touchEnd' }]);
      await expect.poll(() => texts(card)).toEqual(['Eggs', 'Bread', 'Milk', 'Tea']);
      // Let go: nothing is left shifted.
      for (let i = 0; i < 4; i++) await expect(row(card, i)).toHaveCSS('transform', 'none');
    });

    test('moving back over its own place closes the gap again', async ({ page }) => {
      const card = await makeList(page);
      const start = await mid(row(card, 0));
      await touch(page, [...holdAndMoveSteps(start, await mid(row(card, 3), 0.75)), { type: 'touchMove', p: await mid(row(card, 1), 0.2) }]);
      await expect.poll(() => slideY(row(card, 3))).toBe(0);
      await touch(page, [{ type: 'touchEnd' }]);
      await expect.poll(() => texts(card)).toEqual(['Milk', 'Eggs', 'Bread', 'Tea']);
    });

    test('holding the list title still moves the whole card', async ({ page }) => {
      const card = await makeList(page);
      const pos = await boardPos(card);
      const title = await mid(card.getByLabel('List title'));
      await holdAndDrag(page, title, { x: title.x, y: title.y + 120 });
      await expect.poll(async () => (await boardPos(card)).y).toBeGreaterThan(pos.y + 60);
      expect(await texts(card)).toEqual(['Milk', 'Eggs', 'Bread', 'Tea']);
    });

    test('a quick tap on an item still types, and a short rest changes nothing', async ({ page }) => {
      const card = await makeList(page);
      const eggs = await mid(row(card, 1));
      await touch(page, [{ type: 'touchStart', p: eggs }, { type: 'touchEnd', wait: 150 }]);
      await expect(card.getByLabel('Item text').nth(1)).toBeFocused();
      await expect(ghost(page)).toHaveCount(0);
      expect(await texts(card)).toEqual(['Milk', 'Eggs', 'Bread', 'Tea']);
    });

    test('a quick swipe over an item moves the board, not the item', async ({ page }) => {
      const card = await makeList(page);
      const canvas = page.getByTestId('canvas');
      const pan0 = Number(await canvas.getAttribute('data-pan-y'));
      await holdAndDrag(page, await mid(row(card, 1)), { ...(await mid(row(card, 1))), y: (await mid(row(card, 1))).y + 80 }, 0);
      await expect.poll(async () => Number(await canvas.getAttribute('data-pan-y'))).toBeGreaterThan(pan0 + 50);
      expect(await texts(card)).toEqual(['Milk', 'Eggs', 'Bread', 'Tea']);
    });
  });
}

test('dropping a lifted item on empty board makes a new list', async ({ page }) => {
  const card = await makeList(page);
  // Drop Tea on empty board, below the list.
  const b = (await card.boundingBox())!;
  await holdAndDrag(page, await mid(row(card, 3)), { x: 200, y: Math.min(800, b.y + b.height + 90) });
  await expect.poll(() => page.locator('[data-card-id]').count()).toBe(2);
  expect(await texts(card)).toEqual(['Milk', 'Eggs', 'Bread']);
});

test.describe('motion', () => {
  test('with motion allowed the rows glide (a transform transition)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const card = await makeList(page);
    await touch(page, holdAndMoveSteps(await mid(row(card, 0)), await mid(row(card, 2), 0.75)));
    await expect(ghost(page)).toBeVisible();
    expect(await style(row(card, 1), 'transition-property')).toContain('transform');
    expect(await style(row(card, 1), 'transition-duration')).not.toBe('0s');
    await touch(page, [{ type: 'touchEnd' }]);
  });

  test('with reduced motion the rows jump and the label does not grow in', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const card = await makeList(page);
    await touch(page, holdAndMoveSteps(await mid(row(card, 0)), await mid(row(card, 2), 0.75)));
    await expect(ghost(page)).toBeVisible();
    expect(await style(row(card, 1), 'transition-duration')).toBe('0s');
    expect(await style(ghost(page), 'animation-name')).toBe('none');
    await touch(page, [{ type: 'touchEnd' }]);
  });
});

test.describe('computers and wide screens do not change', () => {
  test.use({ viewport: { width: 800, height: 900 } });

  test('holding an item on a screen 600px or wider still moves the card, not the item', async ({ page }) => {
    const card = await makeList(page);
    const pos = await boardPos(card);
    await holdAndDrag(page, await mid(row(card, 1)), { ...(await mid(row(card, 1))), y: (await mid(row(card, 1))).y + 120 });
    await expect.poll(async () => (await boardPos(card)).y).toBeGreaterThan(pos.y + 60);
    expect(await texts(card)).toEqual(['Milk', 'Eggs', 'Bread', 'Tea']);
  });
});
