import { expect, test, type Page } from '@playwright/test';
import { add, freshBoardEachTest } from './helpers';

// Job 58 (owner request 2026-10-16): everything people read is American English ("color", not
// "colour"), in the app and on the website pages.

const BRITISH = /colour|centre|neighbour|honour|favourite|behaviour|organis|authoris|\bgrey\b|labelled|cancelled|licence|catalogue/i;

/** All the words on the page that a person can read or hear: text, plus titles, labels and placeholders. */
async function readableWords(page: Page): Promise<string> {
  return page.evaluate(() => {
    const out: string[] = [document.title, document.body.innerText];
    for (const el of Array.from(document.querySelectorAll('[title], [aria-label], [placeholder], meta[name="description"]')))
      out.push(el.getAttribute('title') ?? '', el.getAttribute('aria-label') ?? '', el.getAttribute('placeholder') ?? '', el.getAttribute('content') ?? '');
    return out.join('\n');
  });
}

test.describe('the app', () => {
  freshBoardEachTest();

  test('says color, Auto-color and the rest in American English, even in the Color menu and the shortcuts list', async ({ page }) => {
    await add(page, 'New column');
    await add(page, 'Checklist');
    await page.getByRole('button', { name: 'Color of selected cards and columns' }).click();
    await page.locator('.swatch').first().hover(); // the swatch name appears under the grid
    expect(await readableWords(page)).not.toMatch(BRITISH);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await readableWords(page)).not.toMatch(BRITISH);
  });
});

for (const path of ['/about/', '/faq/', '/terms/', '/privacy/']) {
  test(`${path} is in American English`, async ({ page }) => {
    await page.goto(path);
    expect(await readableWords(page)).not.toMatch(BRITISH);
  });
}
