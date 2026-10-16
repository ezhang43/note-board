import { expect, test, type Page } from '@playwright/test';
import { add, clickEmpty, columns, freshBoardEachTest } from './helpers';

// Owner decision 2026-10-16: a person reads "container", never "column". Only the words on screen
// change; the code names and the saved board format keep "column".

/** Everything a person or a screen reader gets: visible text plus titles, labels and placeholders. */
async function readable(page: Page): Promise<string> {
  return page.evaluate(() => {
    const attrs = Array.from(document.querySelectorAll('[title], [aria-label], [placeholder]')).flatMap((el) =>
      ['title', 'aria-label', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
    );
    return [document.body.innerText, ...attrs].join('\n');
  });
}

test.describe('desktop', () => {
  freshBoardEachTest();

  test('no "column" on the empty board, the toolbar, a container, its delete question or the shortcuts panel', async ({ page }) => {
    expect(await readable(page)).not.toMatch(/column/i);
    expect(await readable(page)).toContain('New container');

    await add(page, 'New container');
    await add(page, 'Note');
    expect(await readable(page)).not.toMatch(/column/i);

    await columns(page).first().getByRole('button', { name: 'Delete container and its cards' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Delete container?' })).toBeVisible();
    expect(await readable(page)).not.toMatch(/column/i);
    await page.getByRole('button', { name: 'Keep container' }).click();

    await page.keyboard.press('Escape');
    await page.keyboard.press('?');
    await expect(page.getByText('Cards and containers')).toBeVisible();
    expect(await readable(page)).not.toMatch(/column/i);
  });

  test('deleting several containers asks in the same words', async ({ page }) => {
    await add(page, 'New container');
    await add(page, 'New container');
    await clickEmpty(page); // out of the title box, so Ctrl+A selects blocks
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await expect(page.getByRole('alertdialog')).toContainText('Delete 2 containers?');
    await expect(page.getByRole('button', { name: 'Delete containers' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep containers' })).toBeVisible();
  });
});

test.describe('phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });
  freshBoardEachTest();

  test('the + menu says Container', async ({ page }) => {
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'Add', exact: true }).tap();
    await expect(page.getByRole('menuitem', { name: 'Container' })).toBeVisible();
    expect(await readable(page)).not.toMatch(/column/i);
  });
});
