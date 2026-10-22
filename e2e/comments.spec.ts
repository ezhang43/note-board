import { expect, test, type Browser, type Page } from '@playwright/test';
import { box, fontsLoaded } from './helpers';

// Comments on cards (job 161, PR 4): a chip on a card's header opens its thread beside the card (a
// sheet on a phone). Editors and commenters write, viewers only read (D3); resolve and reopen; only
// the author or the person who shared it deletes; not undoable; a deleted card's comments are hidden
// and come back with it. Locally `npm run dev` has a pretend sharing server with the same rules.

const tag = () => Math.random().toString(36).slice(2, 8);

async function person(browser: Browser, name: string, path = '/', phone = false) {
  const context = await browser.newContext(phone ? { viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true } : {});
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const url = new URL(path, 'http://x');
  url.searchParams.set('demo-user', name);
  await page.goto(url.pathname + url.search);
  await fontsLoaded(page);
  return Object.assign(page, { errors });
}

const boardName = (page: Page) => page.getByLabel('Board name');
const panel = (page: Page) => page.getByRole('dialog', { name: /Share/ });
const linkBox = (page: Page) => panel(page).getByLabel('Share link');
const toolbar = (page: Page) => page.locator('header.toolbar');
const path = (link: string) => link.replace(/^https?:\/\/[^/]+/, '');
const tentCard = (page: Page) => page.locator('article[data-kind="note"]');
const thread = (page: Page) => page.getByRole('dialog', { name: /^Comments on/ });

/** Alice makes "Trip" with a note "Tent" and shares it. */
async function aliceSharesTrip(page: Page) {
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'New board' }).click();
  await boardName(page).fill('Trip');
  await toolbar(page).getByRole('button', { name: 'Note', exact: true }).click();
  await page.keyboard.type('Tent');
  await toolbar(page).getByRole('button', { name: 'Share' }).click();
  await panel(page).getByRole('button', { name: 'Share this board' }).click();
  await expect(linkBox(page)).toHaveValue(/\?join=/);
}

async function linkFor(page: Page, role: 'Can view' | 'Can comment') {
  if (!(await panel(page).isVisible())) await toolbar(page).getByRole('button', { name: 'Share' }).click();
  await panel(page).getByRole('button', { name: /^Link role:/ }).click();
  await panel(page).getByRole('menu', { name: /^Link role/ }).getByRole('menuitemradio', { name: new RegExp(`^${role}`) }).click();
  await panel(page).getByRole('button', { name: role === 'Can view' ? 'Make a view link' : 'Make a comment link' }).click();
  await expect(linkBox(page)).toHaveValue(/\?join=/);
  const link = await linkBox(page).inputValue();
  await page.keyboard.press('Escape');
  return link;
}

async function joins(browser: Browser, link: string, name: string, phone = false) {
  const page = await person(browser, name, path(link), phone);
  await expect(boardName(page)).toHaveValue('Trip');
  return page;
}

async function comment(page: Page, text: string) {
  const t = thread(page);
  await t.getByLabel('Add a comment').fill(text);
  await t.getByRole('button', { name: 'Comment', exact: true }).click();
}

test('a commenter comments; it reaches the others with a count and a “new” dot that goes once opened (also after a reload); plain text only', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  await aliceSharesTrip(alice);
  const bob = await joins(browser, await linkFor(alice, 'Can comment'), `Bob${t}`);

  // No chip yet; Add comment opens the thread beside the card, with the keyboard in its box.
  await tentCard(bob).hover();
  await tentCard(bob).getByRole('button', { name: 'Add comment' }).click();
  await expect(thread(bob)).toBeVisible();
  await expect(thread(bob).getByLabel('Add a comment')).toBeFocused();
  const [c, th] = [await box(tentCard(bob)), await box(thread(bob))];
  expect(th.x).toBeGreaterThan(c.x + c.width);
  // Ctrl+Enter sends; text that looks like a web page's markup stays text.
  await bob.keyboard.type('<b>Worth it</b> with suitcases? www.example.com');
  await bob.keyboard.press('Control+Enter');
  await expect(thread(bob).getByText('<b>Worth it</b> with suitcases?', { exact: false })).toBeVisible();
  await expect(thread(bob).locator('b')).toHaveCount(0);
  await expect(thread(bob).getByRole('link', { name: 'www.example.com' })).toHaveAttribute('href', 'https://www.example.com/');
  await expect(thread(bob).getByText(`Bob${t} (you)`)).toBeVisible();

  // Alice sees a chip with the count and a dot.
  const chip = tentCard(alice).getByRole('button', { name: '1 comment, new' });
  await expect(chip).toBeVisible({ timeout: 8000 });
  await expect(chip.locator('.comment-dot')).toHaveCount(1);
  // The chip sits clear of the header's 32px buttons.
  await tentCard(alice).hover();
  const [chipBox, collapse] = [await box(chip), await box(tentCard(alice).getByRole('button', { name: 'Collapse card' }))];
  expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(collapse.x - 4);
  await chip.click();
  await expect(thread(alice).getByText(`Bob${t}`, { exact: true })).toBeVisible();
  await expect(tentCard(alice).getByRole('button', { name: '1 comment' })).toBeVisible();
  await alice.keyboard.press('Escape');
  await expect(thread(alice)).toHaveCount(0);
  await expect(chip).toHaveCount(0);
  await alice.reload();
  await fontsLoaded(alice);
  await expect(tentCard(alice).getByRole('button', { name: '1 comment' })).toBeVisible({ timeout: 8000 });

  // Comments are not undoable: Ctrl+Z on Alice's board leaves it.
  await tentCard(alice).getByRole('button', { name: '1 comment' }).click();
  await comment(alice, 'Baixa is flatter.');
  // Bob still has the thread open: it arrives there, and so isn't new for him.
  await expect(thread(bob).getByText('Baixa is flatter.')).toBeVisible({ timeout: 8000 });
  await expect(tentCard(bob).getByRole('button', { name: '2 comments' })).toBeVisible();
  await alice.keyboard.press('Escape');
  await alice.keyboard.press('Control+z');
  await alice.waitForTimeout(500);
  await expect(tentCard(alice).getByRole('button', { name: '2 comments' })).toBeVisible();
  expect([...alice.errors, ...bob.errors]).toEqual([]);
});

test('a viewer reads comments but can’t write or resolve; resolve, reopen and delete (asking first)', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  await aliceSharesTrip(alice);
  const viewLink = await linkFor(alice, 'Can view');
  const commentLink = await linkFor(alice, 'Can comment');
  const bob = await joins(browser, commentLink, `Bob${t}`);
  const erin = await joins(browser, viewLink, `Erin${t}`);

  await tentCard(bob).hover();
  await tentCard(bob).getByRole('button', { name: 'Add comment' }).click();
  await comment(bob, 'Is the tent waterproof?');

  // The viewer: the chip opens the thread; no box, no Resolve, no trash.
  await expect(tentCard(erin).getByRole('button', { name: /^1 comment/ })).toBeVisible({ timeout: 8000 });
  await tentCard(erin).getByRole('button', { name: /^1 comment/ }).click();
  await expect(thread(erin).getByText('Is the tent waterproof?')).toBeVisible();
  await expect(thread(erin).getByLabel('Add a comment')).toHaveCount(0);
  await expect(thread(erin).getByRole('button', { name: 'Resolve' })).toHaveCount(0);
  await expect(thread(erin).getByRole('button', { name: 'Delete comment' })).toHaveCount(0);
  await thread(erin).getByRole('button', { name: 'Close' }).click();

  // Bob resolves his own thread: the chip goes everywhere.
  await thread(bob).getByRole('button', { name: 'Resolve' }).click();
  await expect(tentCard(alice).getByRole('button', { name: /^1 comment/ })).toHaveCount(0, { timeout: 8000 });
  await expect(tentCard(erin).getByRole('button', { name: /comment/ })).toHaveCount(0);
  // Alice finds it behind "Show resolved" and reopens it.
  await tentCard(alice).hover();
  await tentCard(alice).getByRole('button', { name: 'Comments (resolved)' }).click();
  await thread(alice).getByRole('button', { name: 'Show resolved (1)' }).click();
  await expect(thread(alice).getByText('Is the tent waterproof?')).toBeVisible();
  await thread(alice).getByRole('button', { name: 'Reopen' }).click();
  await expect(tentCard(erin).getByRole('button', { name: /^1 comment/ })).toBeVisible({ timeout: 8000 });

  // Alice (who shared it) deletes Bob's comment, after a question; it goes for everyone.
  await thread(alice).getByRole('button', { name: 'Delete comment' }).click();
  const q = alice.getByRole('alertdialog', { name: 'Delete this comment?' });
  await q.getByRole('button', { name: 'Delete' }).click();
  await expect(thread(alice).getByText('Is the tent waterproof?')).toHaveCount(0);
  await expect(thread(alice)).toBeVisible();
  await expect(tentCard(erin).getByRole('button', { name: /comment/ })).toHaveCount(0, { timeout: 8000 });
  expect([...alice.errors, ...bob.errors, ...erin.errors]).toEqual([]);
});

test('a deleted card’s comments are hidden, and come back with the card', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  await aliceSharesTrip(alice);
  const bob = await joins(browser, await linkFor(alice, 'Can comment'), `Bob${t}`);
  await tentCard(bob).hover();
  await tentCard(bob).getByRole('button', { name: 'Add comment' }).click();
  await comment(bob, 'Keep me');
  await expect(tentCard(alice).getByRole('button', { name: /^1 comment/ })).toBeVisible({ timeout: 8000 });
  await tentCard(alice).hover();
  await tentCard(alice).getByRole('button', { name: 'Delete card' }).click();
  await expect(tentCard(bob)).toHaveCount(0, { timeout: 8000 });
  await expect(thread(bob)).toHaveCount(0);
  await alice.keyboard.press('Control+z');
  await expect(tentCard(bob).getByRole('button', { name: /^1 comment/ })).toBeVisible({ timeout: 8000 });
  expect([...alice.errors, ...bob.errors]).toEqual([]);
});

test('on a phone the thread is a sheet from the bottom, with 44px buttons and a 16px box', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  await aliceSharesTrip(alice);
  const bob = await joins(browser, await linkFor(alice, 'Can comment'), `Bob${t}`, true);
  await tentCard(bob).locator('.card-header').tap();
  await tentCard(bob).getByRole('button', { name: 'Add comment' }).tap();
  const sheet = thread(bob);
  await expect(sheet).toBeVisible();
  const b = await box(sheet);
  expect(Math.round(b.y + b.height)).toBe(800);
  expect(Math.round(b.width)).toBe(390);
  await sheet.getByLabel('Add a comment').fill('From my phone');
  expect((await box(sheet.getByRole('button', { name: 'Comment', exact: true }))).height).toBeGreaterThanOrEqual(44);
  expect(await sheet.getByLabel('Add a comment').evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
  await sheet.getByRole('button', { name: 'Comment', exact: true }).tap();
  await expect(sheet.getByText('From my phone')).toBeVisible();
  // A tap above the sheet closes it.
  await bob.mouse.click(200, 100);
  await expect(sheet).toHaveCount(0);
  expect(await bob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect([...alice.errors, ...bob.errors]).toEqual([]);
});
