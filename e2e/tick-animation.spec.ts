import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, clickEmpty, freshBoardEachTest } from './helpers';

// Tick animation (owner request, 2026-11-13): a small press-and-settle on the box and an eased strike and
// fade, only when the person ticks an item themselves. It plays whether or not the device asks for reduced
// motion (owner request, 2026-11-13). Display only; the board data is unchanged.

freshBoardEachTest();

async function checklist(page: Page, items: string[]) {
  await clickEmpty(page);
  await add(page, 'Checklist', { stayInTitle: true });
  const list = page.locator(`[data-card-id="${await page.locator('.card.selected').getAttribute('data-card-id')}"]`);
  await page.keyboard.type('Today');
  await page.keyboard.press('Enter');
  for (const [i, t] of items.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  return list;
}

const row = (list: Locator, text: string) => list.locator('.todo-item', { has: list.page().getByLabel(`Done: ${text}`) });
const box = (list: Locator, text: string) => list.getByRole('checkbox', { name: `Done: ${text}` });
/** Starts watching a row's class; the result says whether `tick-pop` was ever on it (it lasts about a quarter second). */
async function watchPop(row: Locator) {
  await row.evaluate((el) => {
    (el as HTMLElement & { __pop?: boolean }).__pop = el.classList.contains('tick-pop');
    new MutationObserver(() => {
      if (el.classList.contains('tick-pop')) (el as HTMLElement & { __pop?: boolean }).__pop = true;
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  });
  return () => row.evaluate((el) => !!(el as HTMLElement & { __pop?: boolean }).__pop);
}
const animationOf = (el: Locator) => el.evaluate((e) => getComputedStyle(e).animationName);

for (const motion of ['no-preference', 'reduce'] as const) {
  test.describe(`with reducedMotion: ${motion}`, () => {
    test.use({ contextOptions: { reducedMotion: motion } });

    test('a click on the box animates that item only, and the class goes away again', async ({ page }) => {
      const list = await checklist(page, ['bread', 'milk']);
      const breadPopped = await watchPop(row(list, 'bread'));
      const milkPopped = await watchPop(row(list, 'milk'));
      await box(list, 'bread').click();
      await expect(row(list, 'bread')).toHaveClass(/done/);
      await expect(row(list, 'bread')).not.toHaveClass(/tick-pop/); // gone after the animation
      expect(await breadPopped()).toBe(true);
      expect(await milkPopped()).toBe(false);
    });

    test('while it plays, the box presses and the strike and fade ease in', async ({ page }) => {
      const list = await checklist(page, ['bread']);
      await row(list, 'bread').evaluate((el) => el.classList.add('tick-pop'));
      expect(await animationOf(box(list, 'bread'))).toBe('tick-press');
      expect(await animationOf(row(list, 'bread').locator('.item-text'))).toBe('tick-fade');
      expect(await animationOf(row(list, 'bread').locator('textarea.item-text, .item-text > textarea').first())).toBe('tick-strike');
    });

    test('Ctrl+Enter animates too, but unticking does not', async ({ page }) => {
      const list = await checklist(page, ['bread']);
      const popped = await watchPop(row(list, 'bread'));
      await page.keyboard.press('Control+Enter');
      await expect(row(list, 'bread')).toHaveClass(/done/);
      await expect(row(list, 'bread')).not.toHaveClass(/tick-pop/);
      expect(await popped()).toBe(true);
      const again = await watchPop(row(list, 'bread'));
      await page.keyboard.press('Control+Enter'); // untick
      await expect(box(list, 'bread')).not.toBeChecked();
      await page.waitForTimeout(400);
      expect(await again()).toBe(false);
    });

    test('undo and redo do not animate', async ({ page }) => {
      const list = await checklist(page, ['bread', 'milk']);
      await box(list, 'bread').click();
      await expect(row(list, 'bread')).toHaveClass(/done/);
      await expect(row(list, 'bread')).not.toHaveClass(/tick-pop/);
      const popped = await watchPop(row(list, 'bread'));
      await page.keyboard.press('Control+z');
      await expect(box(list, 'bread')).not.toBeChecked();
      await page.keyboard.press('Control+y');
      await expect(box(list, 'bread')).toBeChecked();
      await page.waitForTimeout(400);
      expect(await popped()).toBe(false);
    });

    test('a parent ticked because its last sub-item was ticked does not animate; the clicked one does', async ({ page }) => {
      const list = await checklist(page, ['parent', 'child']);
      await page.keyboard.press('Tab'); // child becomes a sub-item
      const childPopped = await watchPop(row(list, 'child'));
      const parentPopped = await watchPop(row(list, 'parent'));
      await box(list, 'child').click();
      await expect(box(list, 'parent')).toBeChecked();
      await page.waitForTimeout(400);
      expect(await childPopped()).toBe(true);
      expect(await parentPopped()).toBe(false);
    });
  });
}
