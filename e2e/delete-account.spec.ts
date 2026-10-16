import { expect, test, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { add, fontsLoaded } from './helpers';

// Delete your account and data (job #63, required by Google Play). On the published site it works
// on the Google account; here it is tried with the demo people (?demo-user=) and the pretend
// sharing server, which stand in for a signed-in account. Running locally without a demo person
// there is no account, so it isn't offered.

/** Names unique to each test, since the pretend server is shared by tests running at once. */
const tag = () => Math.random().toString(36).slice(2, 8);

async function person(browser: Browser, name: string, opts: { phone?: boolean } = {}) {
  const context = await browser.newContext(opts.phone ? { viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true } : {});
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?demo-user=${name}`);
  await fontsLoaded(page);
  return Object.assign(page, { errors, who: name });
}

const boardName = (page: Page) => page.getByLabel('Board name');
const sharePanel = (page: Page) => page.getByRole('dialog', { name: /Share/ });
const panel = (page: Page) => page.getByRole('dialog', { name: 'Delete your account' });
const fileMenu = (page: Page) => page.getByRole('menu', { name: 'File' });

/** Makes a board `name` with a note and shares it; returns the share link (path and query). */
async function shareNewBoard(page: Page, name: string) {
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'New board' }).click();
  await boardName(page).fill(name);
  await add(page, 'Note');
  await page.keyboard.type(`${name} note`);
  await page.locator('header.toolbar').getByRole('button', { name: 'Share' }).click();
  await sharePanel(page).getByRole('button', { name: 'Share this board' }).click();
  const link = sharePanel(page).getByLabel('Share link');
  await expect(link).toHaveValue(/\?join=/);
  const path = (await link.inputValue()).replace(/^https?:\/\/[^/]+/, '');
  await page.keyboard.press('Escape');
  return path;
}

/** `page`'s demo person opens a share link. */
async function opens(page: Page & { who: string }, link: string, name: string) {
  await page.goto(`${link}&demo-user=${page.who}`);
  await expect(boardName(page)).toHaveValue(name, { timeout: 8000 });
}

async function openPanel(page: Page) {
  await page.locator('header.toolbar').getByRole('button', { name: 'File' }).click();
  await fileMenu(page).getByRole('menuitem', { name: 'Delete account…' }).click();
  await expect(panel(page)).toBeVisible();
}

test('running locally without an account, Delete account isn’t offered', async ({ page }) => {
  await page.goto('/');
  await page.locator('header.toolbar').getByRole('button', { name: 'File' }).click();
  await expect(fileMenu(page)).toBeVisible();
  await expect(fileMenu(page).getByRole('menuitem', { name: 'Delete account…' })).toHaveCount(0);
});

test('the panel says what goes, offers a backup, and only deletes once DELETE is typed; Cancel changes nothing', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  const bob = await person(browser, `Bob${t}`);
  const trip = await shareNewBoard(alice, 'Trip');
  await opens(bob, trip, 'Trip');
  const work = await shareNewBoard(bob, 'Work');
  await opens(alice, work, 'Work');

  await openPanel(alice);
  // Alice has her home board and Trip (Work is Bob's); she shared one board and has one from Bob.
  await expect(panel(alice)).toContainText('All your boards (2 boards)');
  await expect(panel(alice)).toContainText('1 board you shared is deleted for everyone you shared it with');
  await expect(panel(alice)).toContainText('You leave 1 board someone shared with you; they keep it');
  await expect(panel(alice)).toContainText('Version history');
  await expect(panel(alice)).toContainText('can’t be undone');

  // Download a backup first: the usual full backup file.
  const waiting = alice.waitForEvent('download');
  await panel(alice).getByRole('button', { name: 'Download a backup first' }).click();
  const file = await waiting;
  expect(file.suggestedFilename()).toMatch(/^BusyAnts - All boards - \d{4}-\d{2}-\d{2}\.json$/);
  expect(readFileSync((await file.path())!, 'utf8')).toContain('Trip note');

  const remove = panel(alice).getByRole('button', { name: 'Delete my account' });
  await expect(remove).toBeDisabled();
  await panel(alice).getByLabel('Type DELETE to confirm').fill('delete');
  await expect(remove).toBeDisabled();
  await panel(alice).getByLabel('Type DELETE to confirm').fill('DELETE');
  await expect(remove).toBeEnabled();

  await panel(alice).getByRole('button', { name: 'Cancel' }).click();
  await expect(panel(alice)).toHaveCount(0);
  await expect(boardName(alice)).toHaveValue('Work');
  // Escape closes it too, and it opens again empty.
  await openPanel(alice);
  await expect(panel(alice).getByLabel('Type DELETE to confirm')).toHaveValue('');
  await alice.keyboard.press('Escape');
  await expect(panel(alice)).toHaveCount(0);
  expect([...alice.errors, ...bob.errors]).toEqual([]);
});

test('deleting signs the person out with a note, deletes the board they shared for everyone and takes them off the one shared with them', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  const bob = await person(browser, `Bob${t}`);
  const trip = await shareNewBoard(alice, 'Trip');
  await opens(bob, trip, 'Trip');
  const work = await shareNewBoard(bob, 'Work');
  await opens(alice, work, 'Work');

  await openPanel(alice);
  await panel(alice).getByLabel('Type DELETE to confirm').fill('DELETE');
  await panel(alice).getByRole('button', { name: 'Delete my account' }).click();

  // Alice: signed out, with the note, and nothing of hers left on this device.
  await expect(alice.getByRole('button', { name: 'Sign in with Google' })).toBeVisible({ timeout: 8000 });
  await expect(alice.getByText('Your account and data were deleted.')).toBeVisible();
  await expect(alice.locator('header.toolbar')).toHaveCount(0);
  const uid = `demo-alice${t}`;
  // (Where the empty board was last looked at may be written again as the page closes: pan and zoom only.)
  const left = await alice.evaluate((prefix) => Object.keys(localStorage).filter((k) => k.startsWith(prefix) && k !== `${prefix}note-board:view:v1`), `${uid}:`);
  expect(left).toEqual([]);

  // Bob: Trip was deleted for everyone; Work stays his, without Alice.
  await bob.goto(`/?demo-user=${bob.who}`);
  await bob.getByRole('button', { name: 'Boards', exact: true }).click();
  const menu = bob.getByRole('menu', { name: 'Boards' });
  await expect(menu.getByRole('menuitem', { name: /Work/ })).toBeVisible({ timeout: 8000 });
  await expect(menu.getByRole('menuitem', { name: /Trip/ })).toHaveCount(0, { timeout: 8000 });
  await menu.getByRole('menuitem', { name: /Work/ }).click();
  await bob.locator('header.toolbar').getByRole('button', { name: 'Share' }).click();
  await expect(sharePanel(bob).getByText(`Bob${t}`)).toBeVisible();
  await expect(sharePanel(bob).getByText(`Alice${t}`)).toHaveCount(0, { timeout: 8000 });

  // Signing in again starts afresh.
  await alice.getByRole('button', { name: 'Sign in with Google' }).click();
  await expect(boardName(alice)).toBeVisible({ timeout: 8000 });
  await alice.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(alice.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: /Trip|Work/ })).toHaveCount(0);
  expect([...alice.errors, ...bob.errors]).toEqual([]);
});

test('if deleting fails, nothing is deleted on the device and the panel says to try again', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  await shareNewBoard(alice, 'Trip');
  await alice.route('**/__collab/call', (route) => route.abort());

  await openPanel(alice);
  await panel(alice).getByLabel('Type DELETE to confirm').fill('DELETE');
  await panel(alice).getByRole('button', { name: 'Delete my account' }).click();
  await expect(panel(alice).getByRole('alert')).toHaveText('That didn’t work. Check your connection and try again.');
  await alice.getByRole('button', { name: 'Cancel' }).click();
  await expect(boardName(alice)).toHaveValue('Trip');
  await expect(alice.getByLabel('Note text')).toHaveValue('Trip note');
  const kept = await alice.evaluate((prefix) => Object.keys(localStorage).filter((k) => k.startsWith(prefix)).length, `demo-alice${t}:`);
  expect(kept).toBeGreaterThan(0);
});

test('offline, the Delete button is off with a note', async ({ browser }) => {
  const alice = await person(browser, `Alice${tag()}`);
  await openPanel(alice);
  await panel(alice).getByLabel('Type DELETE to confirm').fill('DELETE');
  await alice.context().setOffline(true);
  await expect(panel(alice).getByRole('button', { name: 'Delete my account' })).toBeDisabled();
  await expect(panel(alice)).toContainText('You’re offline. Connect to the internet to delete your account.');
  await alice.context().setOffline(false);
  await expect(panel(alice).getByRole('button', { name: 'Delete my account' })).toBeEnabled();
});

test('on a phone it is in ⋯ → File, and the panel fits the screen', async ({ browser }) => {
  const alice = await person(browser, `Alice${tag()}`, { phone: true });
  await alice.getByRole('button', { name: 'More' }).click();
  await alice.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'File' }).click();
  await fileMenu(alice).getByRole('menuitem', { name: 'Delete account…' }).click();
  await expect(panel(alice)).toBeVisible();
  const box = (await panel(alice).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await panel(alice).getByLabel('Type DELETE to confirm').fill('DELETE');
  await expect(panel(alice).getByRole('button', { name: 'Delete my account' })).toBeEnabled();
});

test.describe('the Delete your account web page', () => {
  test('explains how to delete in the app, the email for when you can’t sign in, and what goes', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/delete-account/');
    await expect(page).toHaveTitle('BusyAnts: delete your account');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{40,}/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Delete your account');
    const main = page.locator('main');
    for (const text of ['File', '⋯', 'Delete account…', 'DELETE', 'can\'t be undone', 'deleted for everyone you shared them with']) await expect(main).toContainText(text);
    await expect(main.getByRole('link', { name: 'ezhang43@gmail.com' })).toHaveAttribute('href', 'mailto:ezhang43@gmail.com');
    // Headings never skip a level; the nav is the site's usual one.
    const levels = await page.locator('h1, h2, h3').evaluateAll((hs) => hs.map((h) => Number(h.tagName[1])));
    levels.forEach((l, i) => i > 0 && expect(l - levels[i - 1]).toBeLessThanOrEqual(1));
    await expect(page.getByRole('navigation', { name: 'Site' }).getByRole('link')).toHaveCount(6);
    expect(errors).toEqual([]);
  });

  test('is linked from the Privacy policy and every page’s footer', async ({ page }) => {
    await page.goto('/privacy/');
    await page.locator('main').getByRole('link', { name: 'How to delete your account' }).click();
    await expect(page).toHaveURL('/delete-account/');
    for (const path of ['/about/', '/faq/', '/terms/', '/privacy/', '/delete-account/']) {
      await page.goto(path);
      await expect(page.getByRole('navigation', { name: 'More links' }).getByRole('link', { name: 'Delete your account' }), path).toHaveAttribute('href', '../delete-account/');
    }
    // The Privacy policy and the FAQ say how, in the app.
    await page.goto('/privacy/');
    await expect(page.locator('main')).toContainText('File, then Delete account…');
    await expect(page.locator('main')).not.toContainText('there is no button for this yet');
    await page.goto('/faq/');
    await expect(page.locator('#delete + p')).toContainText('File, then Delete account…');
  });

  test('fits a phone screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/delete-account/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
