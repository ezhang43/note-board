import { expect, test, type Page } from '@playwright/test';
import { add, clickEmpty, fontsLoaded, freshBoardEachTest, looseCards } from './helpers';

// Design polish (owner request, 2026-10-19; Emil Kowalski's design and motion skills, CLAUDE.md rule 12):
// press feedback, things growing from where they were opened, no motion for keyboard actions,
// reduced motion respected, and phone-native feel. See docs/design-polish-review.md.

const toolbar = (page: Page) => page.locator('header.toolbar');
const fileButton = (page: Page) => toolbar(page).getByRole('button', { name: 'File', exact: true });
const style = (loc: ReturnType<Page['locator']>, prop: string) => loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test.describe('reduced motion', () => {
  freshBoardEachTest();

  test('turns the new motion off (menus, collapse arrow) but a pressed button still shrinks (owner, 2026-10-19)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fileButton(page).click();
    const menu = page.getByRole('menu', { name: 'File' });
    await expect(menu).toBeVisible();
    expect(await style(menu, 'transition-duration')).toBe('0s');
    await page.keyboard.press('Escape');
    // The press shrink is the one thing that plays with reduced motion too: it is a tiny scale in place.
    const noteButton = toolbar(page).getByRole('button', { name: 'Note', exact: true });
    const b = (await noteButton.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await expect.poll(() => style(noteButton, 'transform')).toBe('matrix(0.97, 0, 0, 0.97, 0, 0)');
    expect(await style(noteButton, 'transition-duration')).toBe('0.1s');
    await page.mouse.up();
    await expect.poll(() => style(noteButton, 'transform')).toBe('none');
    // A faded button stays still.
    const redo = toolbar(page).getByRole('button', { name: 'Redo' });
    const u = (await redo.boundingBox())!;
    await page.mouse.move(u.x + u.width / 2, u.y + u.height / 2);
    await page.mouse.down();
    expect(await style(redo, 'transform')).toBe('none');
    await page.mouse.up();
  });

  test('every :hover rule is limited to devices that can hover (no tint stuck after a tap)', async ({ page }) => {
    // (Rules inside @media are not counted: only ones that apply everywhere.) The checklist row buttons are
    // hidden outright on touch screens (decision 2026-10-04), so their hover rules may stay.
    expect((await allHoverRules(page)).filter((s) => !s.startsWith('.todo-item:hover .item-'))).toEqual([]);
  });
});

test.describe('with motion allowed', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });
  freshBoardEachTest();

  test('a button shrinks a little while pressed, but not a faded one', async ({ page }) => {
    const noteButton = toolbar(page).getByRole('button', { name: 'Note', exact: true });
    const b = (await noteButton.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await expect.poll(() => style(noteButton, 'transform')).toBe('matrix(0.97, 0, 0, 0.97, 0, 0)');
    await page.mouse.up();
    await expect.poll(() => style(noteButton, 'transform')).toBe('none');
    const redo = toolbar(page).getByRole('button', { name: 'Redo' });
    const u = (await redo.boundingBox())!;
    await page.mouse.move(u.x + u.width / 2, u.y + u.height / 2);
    await page.mouse.down();
    expect(await style(redo, 'transform')).toBe('none');
    await page.mouse.up();
  });

  test('a menu opened by a click grows from its button; opened with the keyboard it just appears', async ({ page }) => {
    await fileButton(page).click();
    const menu = page.getByRole('menu', { name: 'File' });
    await expect(menu).toBeVisible();
    expect(await style(menu, 'transition-duration')).toMatch(/^0\.15s/);
    expect(await style(menu, 'transform-origin')).toBe('0px 0px'); // top left, next to its button
    await expect.poll(() => style(menu, 'opacity')).toBe('1');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    await fileButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    expect(await style(menu, 'transition-duration')).toBe('0s');
  });

  test('the Share panel grows from the right, where its button is', async ({ page }) => {
    await page.goto(`/?signed-in&demo-user=Polish${Math.random().toString(36).slice(2, 8)}`);
    await fontsLoaded(page);
    await toolbar(page).getByRole('button', { name: 'Share' }).click();
    const panel = page.locator('.share-panel');
    await expect(panel).toBeVisible();
    const [x, y] = (await style(panel, 'transform-origin')).split(' ').map(parseFloat);
    expect(x).toBe(await panel.evaluate((el) => (el as HTMLElement).offsetWidth));
    expect(y).toBe(0);
  });

  test('a dropped block glides, but a block moved with the arrow keys does not', async ({ page }) => {
    await add(page, 'Note');
    const note = looseCards(page).first();
    await page.keyboard.press('Escape');
    await note.locator('.card-header').click();
    await page.keyboard.press('ArrowRight');
    expect(await style(note, 'transition-duration')).toBe('0s');
    // Any use of the pointer brings the glide back.
    await clickEmpty(page);
    expect(await style(note, 'transition-duration')).toMatch(/^0\.16s/);
  });

  test('Ctrl+Enter and the Done box both tick at once, in place, with no fade-out (job 200)', async ({ page }) => {
    await clickEmpty(page);
    await add(page, 'Checklist');
    await page.keyboard.type('first');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second');
    const list = page.locator('.card.selected');
    await list.getByLabel('Item text').first().click();
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 60_000);
    await page.keyboard.press('Control+Enter');
    await expect(list.getByLabel('Done: first')).toBeChecked();
    await list.getByLabel('Done: second').click();
    await expect(list.getByLabel('Done: second')).toBeChecked(); // with the clock paused: nothing waits on a timer
    await expect(list.locator('.todo-item.done')).toHaveCount(2);
  });

  test('the collapse arrow turns smoothly, but not when the keyboard did it', async ({ page }) => {
    await add(page, 'Note');
    const arrow = looseCards(page).first().locator('.collapse-arrow');
    await expect(arrow).toHaveCount(1);
    expect(await style(arrow, 'transition-duration')).toMatch(/^0\.15s/);
    await page.keyboard.press('Escape');
    expect(await style(arrow, 'transition-duration')).toBe('0s');
  });
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await fontsLoaded(page);
  });
  const more = (page: Page) => page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true });

  test('no grey flash on a tap, no 300ms tap wait, and button labels cannot be selected', async ({ page }) => {
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('-webkit-tap-highlight-color'))).toBe('rgba(0, 0, 0, 0)');
    expect(await style(more(page), 'touch-action')).toBe('manipulation');
    expect(await style(more(page), 'user-select')).toBe('none');
  });

  test('a pressed bottom-bar button shows it at once, even with reduced motion', async ({ page }) => {
    const b = (await more(page).boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    expect(await style(more(page), 'background-color')).toBe('rgba(31, 29, 26, 0.07)');
    await page.mouse.up();
  });

  test('tall panels follow the visible height of the screen (dvh), not the one with the address bar hidden', async ({ page }) => {
    const heights = await page.evaluate(() => {
      const out: Record<string, string> = {};
      for (const sheet of document.styleSheets) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const r of rules) if (r instanceof CSSStyleRule && ['.phone-sheet', '.shortcuts-panel', '.boards-list'].includes(r.selectorText)) out[r.selectorText] = (out[r.selectorText] ?? '') + r.cssText;
      }
      return out;
    });
    for (const sel of ['.phone-sheet', '.shortcuts-panel', '.boards-list']) expect(heights[sel], sel).toContain('dvh');
  });

  test.describe('with motion allowed', () => {
    test.use({ contextOptions: { reducedMotion: 'no-preference' } });

    test('the ⋯ sheet grows up from the bar it opened from', async ({ page }) => {
      await more(page).tap();
      const sheet = page.getByRole('dialog', { name: 'More' });
      await expect(sheet).toBeVisible();
      expect(await style(sheet, 'transition-duration')).toMatch(/^0\.15s/);
      const [x, y] = (await style(sheet, 'transform-origin')).split(' ').map(parseFloat);
      expect(y).toBe(await sheet.evaluate((el) => (el as HTMLElement).offsetHeight)); // bottom edge
      expect(x).toBeGreaterThan(0);
    });

    test('a pressed bottom-bar button shrinks a little', async ({ page }) => {
      const b = (await more(page).boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await expect.poll(() => style(more(page), 'transform')).toBe('matrix(0.97, 0, 0, 0.97, 0, 0)');
      await page.mouse.up();
    });
  });
});

const allHoverRules = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const r of rules) if (r instanceof CSSStyleRule && r.selectorText.includes(':hover')) out.push(r.selectorText);
    }
    return out;
  });

test.describe('the website pages', () => {
  test.describe('with motion allowed', () => {
    test.use({ contextOptions: { reducedMotion: 'no-preference' } });

    test('the big button shrinks a little when pressed, and a fold arrow turns over as it opens', async ({ page }) => {
      await page.goto('/faq/');
      const start = page.locator('.site-header a').last();
      const b = (await start.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await expect.poll(() => style(start, 'transform')).toBe('matrix(0.97, 0, 0, 0.97, 0, 0)');
      await page.mouse.move(0, 0); // let go elsewhere: letting go on the link would follow it
      await page.mouse.up();
      const fold = page.locator('details').last();
      expect(await fold.evaluate((el) => getComputedStyle(el.querySelector('summary')!, '::after').transitionDuration)).toBe('0.2s');
      // An open fold (the first one starts open) has its arrow turned over and sunk 4.5px, by transform alone.
      const open = await page.locator('details[open] > summary').first().evaluate((el) => {
        const after = getComputedStyle(el, '::after');
        return [after.transform, after.marginBottom];
      });
      expect(open).toEqual(['matrix(-0.707107, -0.707107, 0.707107, -0.707107, 0, 4.5)', '5px']);
    });
  });

  test('with reduced motion the big button still shrinks, the fold arrow does not turn, and no hover rule sticks after a tap', async ({ page }) => {
    await page.goto('/faq/');
    const start = page.locator('.site-header a').last();
    const b = (await start.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await expect.poll(() => style(start, 'transform')).toBe('matrix(0.97, 0, 0, 0.97, 0, 0)');
    expect(await page.locator('summary').first().evaluate((el) => getComputedStyle(el, '::after').transitionDuration)).toBe('0s');
    await page.mouse.move(0, 0);
    await page.mouse.up();
    expect(await allHoverRules(page)).toEqual([]);
    // Phone feel on the website too: no grey flash on a tap, no wait for a double-tap.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('-webkit-tap-highlight-color'))).toBe('rgba(0, 0, 0, 0)');
    expect(await style(page.locator('summary').first(), 'touch-action')).toBe('manipulation');
  });
});
