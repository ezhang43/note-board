import { expect, test, type Page } from '@playwright/test';
import { add, clickEmpty, freshBoardEachTest } from './helpers';

// Browser guards for the look and feel (review pass, job 156). Every test passes today and pins
// something the spec promises that no other browser test checks: dark side panels, the focus ring on
// buttons and none on text fields (CLAUDE.md rule 6), the timer following another tab, the card
// buttons on a tablet, and a double-click on a board card.

freshBoardEachTest();

const dock = (page: Page) => page.locator('.corner-controls');

/** Rough brightness 0-255 of a computed rgb() color. */
function brightness(rgb: string) {
  const [r, g, b] = rgb.match(/\d+(\.\d+)?/g)!.map(Number);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

test.describe('side panels on a computer set to dark mode', () => {
  test.use({ colorScheme: 'dark' });

  for (const name of ['Journal', 'Habits', 'Completed', 'Focus timer', 'Version history']) {
    test(`${name}: dark background, nothing white or light-mode ink inside`, async ({ page }) => {
      await dock(page).getByRole('button', { name: new RegExp(`^${name}`) }).click();
      const panel = page.getByRole('complementary', { name, exact: true });
      await expect(panel).toBeVisible();
      expect(brightness(await panel.evaluate((el) => getComputedStyle(el).backgroundColor))).toBeLessThan(60);
      // No visible part of it is white or cream, and none of its text is the dark ink of light mode.
      const light = await panel.evaluate((el) => {
        const bad: string[] = [];
        for (const e of [el, ...el.querySelectorAll('*')]) {
          const r = e.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          const s = getComputedStyle(e);
          if (s.visibility === 'hidden' || s.display === 'none') continue;
          if (['rgb(255, 255, 255)', 'rgb(255, 253, 248)'].includes(s.backgroundColor)) bad.push(`${e.tagName}.${e.className} background ${s.backgroundColor}`);
          if (s.color === 'rgb(31, 29, 26)' && e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) bad.push(`${e.tagName}.${e.className} ink ${s.color}`);
        }
        return bad;
      });
      expect(light).toEqual([]);
    });
  }

  test('the Search bar is dark too', async ({ page }) => {
    await page.keyboard.press('Control+f');
    const bar = page.locator('.find-bar');
    await expect(bar).toBeVisible();
    expect(brightness(await bar.evaluate((el) => getComputedStyle(el).backgroundColor))).toBeLessThan(60);
  });

  test('a Journal day card is dark too', async ({ page }) => {
    await dock(page).getByRole('button', { name: 'Journal', exact: true }).click();
    const field = page.getByRole('complementary', { name: 'Journal' }).getByRole('textbox').first();
    await expect(field).toBeVisible();
    expect(brightness(await field.evaluate((el) => getComputedStyle(el.closest('.journal-day') ?? el).backgroundColor))).toBeLessThan(80);
  });
});

test('Tab reaches every button with a focus ring, and no text field draws a focus rectangle (rule 6)', async ({ page }) => {
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  const seen: string[] = [];
  const bad: string[] = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const state = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const type = (el as HTMLInputElement).type;
      return { tag: el.tagName, type, label: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || '', outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
    });
    if (!state) continue;
    seen.push(`${state.tag} ${state.label}`);
    if (state.tag === 'BUTTON' || state.tag === 'A') {
      if (state.outline === 'none' && state.shadow === 'none') bad.push(`no ring: ${state.tag} ${state.label}`);
    } else if ((state.tag === 'INPUT' && state.type !== 'checkbox') || state.tag === 'TEXTAREA') {
      if (state.outline !== 'none') bad.push(`rectangle on a text field: ${state.tag} ${state.label}`);
    }
  }
  expect(seen.length).toBeGreaterThan(15);
  expect(bad).toEqual([]);
});

test('the focus timer follows another tab: started in one, shown running in the other, and paused from there', async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto('/');
  const timerButton = (p: Page) => p.locator('.corner-controls').getByRole('button', { name: /^Focus timer/ });
  const panel = (p: Page) => p.getByRole('complementary', { name: 'Focus timer' });
  await timerButton(page).click();
  await panel(page).getByRole('button', { name: 'Start' }).click();
  await expect(timerButton(other)).toHaveAccessibleName(/Focus timer, \d+:\d\d left/);
  await timerButton(other).click();
  await panel(other).getByRole('button', { name: 'Pause' }).click();
  await expect(panel(page).getByRole('button', { name: 'Start' })).toBeVisible();
});

test.describe('on a touch screen wider than a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 800, height: 900 } });

  test('the card header buttons are always showing, without a hover or a selection', async ({ page }) => {
    await add(page, 'Note');
    await clickEmpty(page);
    const note = page.locator('.card.loose').first();
    for (const name of ['Collapse card', 'Delete card']) {
      const b = note.getByRole('button', { name });
      await expect(b).toBeVisible();
      expect(Number(await b.evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.9);
    }
  });
});

test('a double-click on a board card (its name and count) opens that board', async ({ page }) => {
  await page.getByLabel('Board name').fill('Home');
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'Add a sub-board here' }).click();
  const card = page.locator('[data-card-id]').first();
  await expect(card).toHaveAttribute('data-kind', 'board');
  await clickEmpty(page);
  await card.locator('.board-body').dblclick();
  await expect(page.getByRole('button', { name: 'Back to Home' })).toBeVisible();
  await expect(page.locator('[data-card-id]')).toHaveCount(0);
});
