import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, clickEmpty, freshBoardEachTest } from './helpers';

// The format bar stays out of the way (owner, 2026-11-02): nothing while a highlight is being dragged,
// it fades in a moment after the mouse is released, never covers the highlighted words, and goes at once
// when the person types, deletes, cuts or copies.

freshBoardEachTest();

const bar = (page: Page) => page.getByRole('toolbar', { name: 'Text format' });

/** A note saying "hello world" with the cursor still in it. */
async function note(page: Page) {
  await add(page, 'Note');
  await page.keyboard.type('hello world');
  return page.getByLabel('Note text');
}

/** Press at the left of the text and drag to the right; the button stays down. */
async function startDrag(page: Page, field: Locator) {
  const r = (await field.boundingBox())!;
  await page.mouse.move(r.x + 8, r.y + 12);
  await page.mouse.down();
  await page.mouse.move(r.x + 60, r.y + 12, { steps: 6 });
  await page.mouse.move(r.x + 90, r.y + 12, { steps: 6 });
}

test('no bar while a highlight is being dragged; it appears a moment after the mouse is released', async ({ page }) => {
  const field = await note(page);
  await page.keyboard.press('Escape');
  // Note the time of the release and of the bar appearing, inside the page (no test-runner lag in it).
  await page.evaluate(() => {
    const w = window as unknown as { t0?: number; t1?: number };
    document.addEventListener('pointerup', () => (w.t0 = performance.now()), true);
    new MutationObserver(() => {
      if (!w.t1 && document.querySelector('.format-bar')) w.t1 = performance.now();
    }).observe(document.body, { childList: true, subtree: true });
  });
  await startDrag(page, field);
  expect(await field.evaluate((el: HTMLTextAreaElement) => el.selectionEnd - el.selectionStart)).toBeGreaterThan(0); // really highlighting
  await page.waitForTimeout(700);
  await expect(bar(page)).toHaveCount(0);
  await page.mouse.up();
  await expect(bar(page)).toBeVisible();
  const gap = await page.evaluate(() => {
    const w = window as unknown as { t0: number; t1: number };
    return w.t1 - w.t0;
  });
  expect(gap).toBeGreaterThanOrEqual(150); // a short pause, not at once
  expect(gap).toBeLessThan(1000);
});

test('the bar never covers the highlighted text (box or checklist items)', async ({ page }) => {
  const field = await note(page);
  await page.keyboard.press('Shift+Home');
  await expect(bar(page)).toBeVisible();
  const b = (await bar(page).boundingBox())!;
  const n = (await field.boundingBox())!;
  const apart = b.y + b.height <= n.y || b.y >= n.y + n.height || b.x + b.width <= n.x || b.x >= n.x + n.width;
  expect(apart).toBe(true);

  // Checklist items selected: above or below the picked rows.
  await clickEmpty(page);
  await add(page, 'Checklist', { stayInTitle: true });
  await page.keyboard.type('Groceries');
  await page.keyboard.press('Enter');
  await page.keyboard.type('milk');
  await page.keyboard.press('Enter');
  await page.keyboard.type('eggs');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+a');
  const rows = page.locator('.todo-item.picked');
  await expect(rows).toHaveCount(2);
  await expect(bar(page)).toBeVisible();
  const bb = (await bar(page).boundingBox())!;
  for (const i of [0, 1]) {
    const r = (await rows.nth(i).boundingBox())!;
    expect(bb.y + bb.height <= r.y || bb.y >= r.y + r.height).toBe(true);
  }
});

test('the bar goes at once when you type, delete, cut or copy, and stays away until the highlight changes', async ({ page }) => {
  const field = await note(page);
  await page.keyboard.press('Shift+Home');
  await expect(bar(page)).toBeVisible();
  await page.keyboard.press('Control+c'); // the highlight stays, the bar goes
  await expect(bar(page)).toHaveCount(0);
  await page.waitForTimeout(600);
  await expect(bar(page)).toHaveCount(0); // and does not come back by itself
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+Home'); // a new highlight: the bar returns after the pause
  await expect(bar(page)).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(bar(page)).toHaveCount(0);
  await expect(field).toHaveValue('');
  await page.keyboard.type('again');
  await page.keyboard.press('Shift+Home');
  await expect(bar(page)).toBeVisible();
  await page.keyboard.type('x'); // typing over the highlight
  await expect(bar(page)).toHaveCount(0);
  await page.keyboard.press('Shift+Home');
  await expect(bar(page)).toBeVisible();
  await page.keyboard.press('Control+x');
  await expect(bar(page)).toHaveCount(0);
});

test('Alt+F10 shows the bar at once and moves into it, without waiting for the pause', async ({ page }) => {
  await note(page);
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Alt+F10');
  await expect(bar(page).getByRole('button', { name: 'Bold' })).toBeFocused();
  await expect(bar(page)).toBeVisible();
});

test('keyboard highlights show the bar a moment after the last key', async ({ page }) => {
  await note(page);
  await page.evaluate(() => {
    const w = window as unknown as { t0?: number; t1?: number };
    document.addEventListener('keydown', () => (w.t0 = performance.now()), true);
    new MutationObserver(() => {
      if (!w.t1 && document.querySelector('.format-bar')) w.t1 = performance.now();
    }).observe(document.body, { childList: true, subtree: true });
  });
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
  await expect(bar(page)).toBeVisible();
  const gap = await page.evaluate(() => {
    const w = window as unknown as { t0: number; t1: number };
    return w.t1 - w.t0;
  });
  expect(gap).toBeGreaterThanOrEqual(150); // measured from the last key: it waited for the keys to stop
});

test('hovering the bar still outlines what it will change; its buttons still format', async ({ page }) => {
  const field = await note(page);
  await page.keyboard.press('Shift+Home');
  await expect(bar(page)).toBeVisible();
  await bar(page).getByRole('button', { name: 'Bold' }).hover();
  await expect(page.locator('.format-target')).toHaveCount(1);
  await bar(page).getByRole('button', { name: 'Bold' }).click();
  await expect.poll(() => field.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('600');
  await expect(bar(page)).toBeVisible(); // formatting doesn't hide it
  await page.mouse.move(5, 300);
  await expect(page.locator('.format-target')).toHaveCount(0);
});

test('the bar fades in with a short movement, and not at all with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await note(page);
  await page.keyboard.press('Shift+Home');
  await expect(bar(page)).toBeVisible();
  expect(await bar(page).evaluate((el) => getComputedStyle(el).animationName)).not.toBe('none');
  await page.keyboard.press('ArrowRight');
  await expect(bar(page)).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('Shift+Home');
  await expect(bar(page)).toBeVisible();
  expect(await bar(page).evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
});

/** A checklist "Groceries" with milk and eggs, both items picked (Ctrl+A twice); the bar is showing. */
async function twoPicked(page: Page) {
  await clickEmpty(page);
  await add(page, 'Checklist', { stayInTitle: true });
  await page.keyboard.type('Groceries');
  await page.keyboard.press('Enter');
  await page.keyboard.type('milk');
  await page.keyboard.press('Enter');
  await page.keyboard.type('eggs');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+a');
  await expect(page.locator('.todo-item.picked')).toHaveCount(2);
  await expect(bar(page)).toBeVisible();
}

test('clicking a bar button does not hide the bar: Bold then Italic right away', async ({ page }) => {
  await twoPicked(page);
  await bar(page).getByRole('button', { name: 'Bold' }).click();
  await page.waitForTimeout(50);
  expect(await bar(page).count()).toBe(1); // no auto-wait: it must not blink out
  await bar(page).getByRole('button', { name: 'Italic' }).click();
  for (const i of [0, 1]) {
    const item = page.getByLabel('Item text').nth(i);
    await expect.poll(() => item.evaluate((el) => getComputedStyle(el).fontStyle)).toBe('italic');
    expect(await item.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('600');
  }
});

test('a key that is only a board shortcut ("q") does not hide the bar over picked items', async ({ page }) => {
  await twoPicked(page);
  await page.keyboard.press('q');
  await page.waitForTimeout(500);
  await expect(page.locator('.todo-item.picked')).toHaveCount(2);
  expect(await bar(page).count()).toBe(1);
});

test('a letter typed over a word highlight across items hides the bar', async ({ page }) => {
  await clickEmpty(page);
  await add(page, 'Checklist', { stayInTitle: true });
  await page.keyboard.type('Groceries');
  await page.keyboard.press('Enter');
  await page.keyboard.type('alpha beta');
  await page.keyboard.press('Enter');
  await page.keyboard.type('gamma delta');
  await clickEmpty(page);
  const a = (await page.getByLabel('Item text').nth(0).boundingBox())!;
  const b = (await page.getByLabel('Item text').nth(1).boundingBox())!;
  await page.mouse.move(a.x + 40, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 40, b.y + b.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.word-mark').first()).toBeVisible();
  await expect(bar(page)).toBeVisible();
  await page.keyboard.press('x');
  await expect(bar(page)).toHaveCount(0);
});

test('in a very short window the bar never sits over the toolbar', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 180 });
  const field = await note(page);
  await page.keyboard.press('Shift+Home');
  await expect(bar(page)).toBeVisible();
  const b = (await bar(page).boundingBox())!;
  const toolbarBottom = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.toolbar')].map((el) => el.getBoundingClientRect().bottom), 64));
  expect(b.y).toBeGreaterThanOrEqual(toolbarBottom);
  expect(b.y + b.height).toBeLessThanOrEqual(180);
  void field;
});
