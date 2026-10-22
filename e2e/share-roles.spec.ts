import { expect, test, type Browser, type Page } from '@playwright/test';
import { add, box, fontsLoaded } from './helpers';

// Roles on shared boards (job 161, PR 2): the Share panel's three links (Can edit / Can comment /
// Can view), joining with the role of the link, roles in the People list, and the person who shared
// it changing roles. Locally `npm run dev` has a pretend sharing server with the same rules.

const tag = () => Math.random().toString(36).slice(2, 8);

async function person(browser: Browser, name: string, path = '/') {
  const context = await browser.newContext();
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
const linkRole = (page: Page) => panel(page).getByRole('button', { name: /^Link role:/ });

async function openShare(page: Page) {
  if (!(await panel(page).isVisible())) await page.locator('header.toolbar').getByRole('button', { name: 'Share' }).click();
  await expect(panel(page)).toBeVisible();
}

/** Alice makes "Trip" with a note "Tent" and shares it; resolves with its edit link. */
async function aliceSharesTrip(page: Page) {
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'New board' }).click();
  await boardName(page).fill('Trip');
  await add(page, 'Note');
  await page.keyboard.type('Tent');
  await openShare(page);
  await panel(page).getByRole('button', { name: 'Share this board' }).click();
  await expect(linkBox(page)).toHaveValue(/\?join=/);
  return linkBox(page).inputValue();
}

/** Alice picks `role` in the link's role menu. */
async function pickLinkRole(page: Page, role: 'Can edit' | 'Can comment' | 'Can view') {
  await linkRole(page).click();
  await panel(page).getByRole('menu', { name: /^Link role/ }).getByRole('menuitemradio', { name: new RegExp(`^${role}`) }).click();
  await expect(linkRole(page)).toHaveAccessibleName(`Link role: ${role}`);
}

const path = (link: string) => link.replace(/^https?:\/\/[^/]+/, '');

async function joins(browser: Browser, link: string, name: string) {
  const page = await person(browser, name, path(link));
  await expect(boardName(page)).toHaveValue('Trip');
  return page;
}

test('the person who shared it makes a comment link: the edit link changes once (D1), and each link has its own address', async ({ browser }) => {
  const alice = await person(browser, `Alice${tag()}`);
  const firstEdit = await aliceSharesTrip(alice);
  await expect(panel(alice).getByText('Anyone with this link')).toBeVisible();
  await expect(linkRole(alice)).toHaveAccessibleName('Link role: Can edit');

  await pickLinkRole(alice, 'Can comment');
  // Not made yet: the panel says what making it does, and makes it only on a click.
  await expect(linkBox(alice)).toHaveCount(0);
  await expect(panel(alice).getByText('also changes your edit link')).toBeVisible();
  await panel(alice).getByRole('button', { name: 'Make a comment link' }).click();
  await expect(linkBox(alice)).toHaveValue(/\?join=/);
  const comment = await linkBox(alice).inputValue();
  await expect(panel(alice).getByText('leave comments on cards')).toBeVisible();

  await pickLinkRole(alice, 'Can edit');
  const edit = await linkBox(alice).inputValue();
  expect(edit).not.toBe(firstEdit);
  expect(edit).not.toBe(comment);

  // The view link doesn't change the edit link again.
  await pickLinkRole(alice, 'Can view');
  await expect(panel(alice).getByText('also changes your edit link')).toHaveCount(0);
  await panel(alice).getByRole('button', { name: 'Make a view link' }).click();
  await expect(linkBox(alice)).toHaveValue(/\?join=/);
  await pickLinkRole(alice, 'Can edit');
  await expect(linkBox(alice)).toHaveValue(edit);
  expect(alice.errors).toEqual([]);
});

test('joining by a comment or view link gives that role, shown in everyone’s People list; the old edit link stops working', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  const oldEdit = await aliceSharesTrip(alice);
  await pickLinkRole(alice, 'Can comment');
  await panel(alice).getByRole('button', { name: 'Make a comment link' }).click();
  const comment = await linkBox(alice).inputValue();
  await pickLinkRole(alice, 'Can view');
  await panel(alice).getByRole('button', { name: 'Make a view link' }).click();
  const view = await linkBox(alice).inputValue();

  const bob = await joins(browser, comment, `Bob${t}`);
  const cat = await joins(browser, view, `Cat${t}`);
  const people = panel(alice).getByRole('list', { name: 'People' });
  await expect(people.getByRole('button', { name: `Bob${t}’s role: Can comment` })).toBeVisible({ timeout: 8000 });
  await expect(people.getByRole('button', { name: `Cat${t}’s role: Can view` })).toBeVisible({ timeout: 8000 });

  // Bob sees the roles, can't change them, and has no links to hand out.
  await openShare(bob);
  await expect(panel(bob).getByText('You can view this board and comment on its cards.')).toBeVisible();
  await expect(panel(bob).getByLabel('Share link')).toHaveCount(0);
  const bobPeople = panel(bob).getByRole('list', { name: 'People' });
  await expect(bobPeople.getByText('Can view')).toBeVisible({ timeout: 8000 });
  await expect(bobPeople.getByRole('button')).toHaveCount(0);

  // The edit link from before the comment link was made (D1) lets nobody in.
  const dan = await person(browser, `Dan${t}`, path(oldEdit));
  await expect(dan.getByRole('status').filter({ hasText: 'This share link doesn’t work' })).toBeVisible({ timeout: 8000 });
  expect([...alice.errors, ...bob.errors, ...cat.errors, ...dan.errors]).toEqual([]);
});

test('the person who shared it changes a role in People; lowering an editor asks first, as the edit link changes', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  const edit = await aliceSharesTrip(alice);
  const bob = await joins(browser, edit, `Bob${t}`);
  const people = panel(alice).getByRole('list', { name: 'People' });
  const bobRole = people.getByRole('button', { name: `Bob${t}’s role: Can edit` });
  await expect(bobRole).toBeVisible({ timeout: 8000 });

  await bobRole.click();
  await people.getByRole('menuitemradio', { name: /^Can view/ }).click();
  const ask = alice.getByRole('alertdialog', { name: `Change Bob${t} to Can view?` });
  await expect(ask).toContainText('edit link changes');
  await ask.getByRole('button', { name: 'Change role' }).click();
  await expect(people.getByRole('button', { name: `Bob${t}’s role: Can view` })).toBeVisible({ timeout: 8000 });
  await expect(linkBox(alice)).not.toHaveValue(edit);

  // Bob's own panel shows it at once (from the server).
  await openShare(bob);
  await expect(panel(bob).getByText('You can view this board.')).toBeVisible({ timeout: 8000 });

  // Raising him again asks nothing.
  await people.getByRole('button', { name: `Bob${t}’s role: Can view` }).click();
  await people.getByRole('menuitemradio', { name: /^Can edit/ }).click();
  await expect(people.getByRole('button', { name: `Bob${t}’s role: Can edit` })).toBeVisible({ timeout: 8000 });
  await expect(panel(bob).getByLabel('Share link')).toBeVisible({ timeout: 8000 });
});

test('Remove is in the person’s role menu, and every link that is on changes', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  const edit = await aliceSharesTrip(alice);
  const bob = await joins(browser, edit, `Bob${t}`);
  const people = panel(alice).getByRole('list', { name: 'People' });
  await people.getByRole('button', { name: `Bob${t}’s role: Can edit` }).click();
  await people.getByRole('menuitem', { name: `Remove Bob${t}` }).click();
  await alice.getByRole('alertdialog', { name: `Remove Bob${t}?` }).getByRole('button', { name: `Remove Bob${t}` }).click();
  await expect(people.getByText(`Bob${t}`)).toHaveCount(0);
  await expect(linkBox(alice)).not.toHaveValue(edit);
  await expect(bob.getByRole('status').filter({ hasText: '“Trip” is no longer shared with you.' })).toBeVisible({ timeout: 8000 });
});

test('Turn links off turns all three off; Make a link turns the picked one on again', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  await aliceSharesTrip(alice);
  await pickLinkRole(alice, 'Can view');
  await panel(alice).getByRole('button', { name: 'Make a view link' }).click();
  const view = await linkBox(alice).inputValue();
  await panel(alice).getByRole('button', { name: 'Turn links off' }).click();
  await expect(panel(alice).getByText('The links are turned off, so no one new can join.')).toBeVisible();
  await pickLinkRole(alice, 'Can edit');
  await expect(panel(alice).getByText('The links are turned off, so no one new can join.')).toBeVisible();
  await expect(panel(alice).getByRole('button', { name: 'Turn links off' })).toHaveCount(0);

  const bob = await person(browser, `Bob${t}`, path(view));
  await expect(bob.getByRole('status').filter({ hasText: 'This share link doesn’t work' })).toBeVisible({ timeout: 8000 });

  await panel(alice).getByRole('button', { name: 'Make an edit link' }).click();
  await expect(linkBox(alice)).toHaveValue(/\?join=/);
  await pickLinkRole(alice, 'Can view');
  await expect(panel(alice).getByText('There’s no view link yet.')).toBeVisible();
});

test('the role menus work from the keyboard: arrows move, Escape closes only the menu', async ({ browser }) => {
  const alice = await person(browser, `Alice${tag()}`);
  await aliceSharesTrip(alice);
  await linkRole(alice).focus();
  await alice.keyboard.press('Enter');
  const menu = panel(alice).getByRole('menu', { name: /^Link role/ });
  await expect(menu).toBeVisible();
  await alice.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitemradio', { name: /^Can edit/ })).toBeFocused();
  await alice.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitemradio', { name: /^Can comment/ })).toBeFocused();
  await alice.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(panel(alice)).toBeVisible();
  await expect(linkRole(alice)).toBeFocused();
  await alice.keyboard.press('Escape');
  await expect(panel(alice)).toHaveCount(0);
});

test('on a phone, the role buttons and menu items are at least 44px tall, and the panel doesn’t scroll sideways', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  const edit = await aliceSharesTrip(alice);
  await joins(browser, edit, `Bob${t}`);
  await alice.keyboard.press('Escape');
  await alice.setViewportSize({ width: 390, height: 800 });
  await alice.getByRole('button', { name: 'More' }).click();
  await alice.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(panel(alice)).toBeVisible();
  expect((await box(linkRole(alice))).height).toBeGreaterThanOrEqual(44);
  const bobRole = panel(alice).getByRole('button', { name: `Bob${t}’s role: Can edit` });
  await expect(bobRole).toBeVisible({ timeout: 8000 });
  expect((await box(bobRole)).height).toBeGreaterThanOrEqual(44);
  await linkRole(alice).click();
  for (const item of await panel(alice).getByRole('menuitemradio').all()) expect((await box(item)).height).toBeGreaterThanOrEqual(44);
  expect(await panel(alice).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});
