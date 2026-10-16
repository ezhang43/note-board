import { expect, test, type Page } from '@playwright/test';
import { cards, fontsLoaded } from './helpers';

// The welcome tour (owner request, 2026-10-16). Every other test starts with the tour already done
// (playwright.config.ts); these start like a new device.
test.use({ storageState: { cookies: [], origins: [] } });

const tour = (page: Page) => page.getByRole('dialog', { name: /Step \d of \d/ });
const done = (page: Page) => page.evaluate(() => localStorage.getItem('note-board:tour-done'));

async function open(page: Page, url = '/') {
  await page.goto(url);
  await fontsLoaded(page);
}

test('starts by itself on a new device, with a labelled card, focus on Next, and a lit-up control', async ({ page }) => {
  await open(page, '/?demo-user=Alice');
  await expect(tour(page)).toBeVisible();
  await expect(tour(page)).toContainText('Step 1 of 5');
  await expect(tour(page).getByRole('button', { name: 'Next' })).toBeFocused();
  const spot = await page.locator('.tour-spot').boundingBox();
  const note = await page.locator('header.toolbar').getByRole('button', { name: 'Note', exact: true }).boundingBox();
  expect(spot!.x).toBeLessThanOrEqual(note!.x);
  expect(spot!.y).toBeLessThanOrEqual(note!.y);
});

test('Next and Back walk the steps; Done on the last remembers it for good', async ({ page }) => {
  await open(page, '/?demo-user=Alice');
  await tour(page).getByRole('button', { name: 'Next' }).click();
  await expect(tour(page)).toContainText('Step 2 of 5');
  await tour(page).getByRole('button', { name: 'Back' }).click();
  await expect(tour(page)).toContainText('Step 1 of 5');
  await expect(tour(page).getByRole('button', { name: 'Back' })).toBeDisabled();
  for (const n of [2, 3, 4, 5]) {
    await tour(page).getByRole('button', { name: 'Next' }).click();
    await expect(tour(page)).toContainText(`Step ${n} of 5`);
  }
  await tour(page).getByRole('button', { name: 'Done' }).click();
  await expect(tour(page)).toHaveCount(0);
  expect(await done(page)).toBe('1');
  await page.reload();
  await expect(page.locator('header.toolbar')).toBeVisible();
  await expect(tour(page)).toHaveCount(0);
});

test('the steps come in the owner order, with the new wording', async ({ page }) => {
  await open(page, '/?demo-user=Alice');
  const steps = [
    ['Add a note or a checklist', 'Note gives you a blank card to jot down anything.'],
    ['Move cards, fill containers', 'A container holds your notes and checklists together.'],
    ['Share a board', 'Share lets other people'],
    ['Your boards', 'The Boards menu lists all your boards.'],
    ['Keyboard shortcuts', 'Press ? any time'],
  ];
  for (const [i, [title, text]] of steps.entries()) {
    await expect(tour(page)).toContainText(`Step ${i + 1} of 5`);
    await expect(tour(page)).toContainText(title);
    await expect(tour(page)).toContainText(text);
    if (i < 4) await tour(page).getByRole('button', { name: 'Next' }).click();
  }
  await expect(tour(page)).not.toContainText('New column makes one');
});

test('a step whose control is not there is skipped (no Share without an account)', async ({ page }) => {
  await open(page);
  await expect(tour(page)).toContainText('Step 1 of 4');
});

for (const [how, act] of [
  ['Skip tour', (p: Page) => p.getByRole('button', { name: 'Skip tour' }).click()],
  ['the close button', (p: Page) => p.getByRole('button', { name: 'Close tour' }).click()],
  ['Escape', (p: Page) => p.keyboard.press('Escape')],
] as const) {
  test(`${how} ends the tour and it never comes back`, async ({ page }) => {
    await open(page);
    await expect(tour(page)).toBeVisible();
    await act(page);
    await expect(tour(page)).toHaveCount(0);
    expect(await done(page)).toBe('1');
    await page.reload();
    await expect(page.locator('header.toolbar')).toBeVisible();
    await expect(tour(page)).toHaveCount(0);
  });
}

test('clicking the dimmed area does nothing to the board, and the tour changes no board data', async ({ page }) => {
  await open(page);
  await page.mouse.click(700, 500);
  await page.mouse.dblclick(700, 500);
  await expect(tour(page)).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
});

test('the shortcuts panel has no way to replay the tour', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Escape');
  await expect(tour(page)).toHaveCount(0);
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await expect(page.getByText('Show the tour again')).toHaveCount(0);
});

test('the card stays on screen and follows the control when the window is resized', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 3; i++) await tour(page).getByRole('button', { name: 'Next' }).click();
  await expect(tour(page)).toContainText('Step 4 of 4'); // the ? button, bottom right
  const inside = async () => {
    const b = (await tour(page).boundingBox())!;
    const v = page.viewportSize()!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(v.width);
    expect(b.y + b.height).toBeLessThanOrEqual(v.height);
  };
  await inside();
  await page.setViewportSize({ width: 900, height: 600 });
  const help = page.getByRole('button', { name: 'Keyboard shortcuts' });
  await expect
    .poll(async () => Math.round((await page.locator('.tour-spot').boundingBox())!.x - (await help.boundingBox())!.x))
    .toBe(-6);
  await inside();
});

test('it works in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page);
  await expect(tour(page)).toBeVisible();
  const bg = await tour(page).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe('rgb(43, 41, 38)');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });

  test('points at the phone bar, skips what has no phone equivalent, and the ⋯ menu has no replay', async ({ page }) => {
    await open(page);
    await expect(tour(page)).toContainText('Step 1 of 3');
    const spot = (await page.locator('.tour-spot').boundingBox())!;
    const plus = (await page.getByRole('button', { name: 'Add', exact: true }).boundingBox())!;
    expect(spot.y).toBeLessThanOrEqual(plus.y);
    await tour(page).getByRole('button', { name: 'Next' }).click();
    await expect(tour(page)).toContainText('Step 2 of 3');
    await expect(tour(page)).toContainText('Your boards');
    await tour(page).getByRole('button', { name: 'Next' }).click();
    await expect(tour(page)).toContainText('Step 3 of 3');
    await expect(tour(page)).toContainText('Tap ⋯');
    await expect(tour(page)).not.toContainText('tour again');
    await tour(page).getByRole('button', { name: 'Done' }).click();
    await expect(tour(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'More' }).click();
    await expect(page.getByRole('button', { name: 'Version history' })).toBeVisible();
    await expect(page.getByText('Show the tour again')).toHaveCount(0);
  });
});

test('a blocked localStorage never crashes the page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const block = () => {
      throw new Error('blocked');
    };
    Storage.prototype.getItem = block;
    Storage.prototype.setItem = block;
  });
  await open(page);
  await expect(page.locator('header.toolbar')).toBeVisible();
  await expect(tour(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});
