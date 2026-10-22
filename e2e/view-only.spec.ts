import { expect, test, type Browser, type Page } from '@playwright/test';
import { box, fontsLoaded } from './helpers';

// Read-only boards (job 161, PR 3): someone a board is shared with as Can view or Can comment sees
// a badge beside its name and a one-time note, no editing buttons, and can't change anything on it
// (keys, paste, dragging, typing); their own boards stay as they were. A change of role takes
// effect at once. Locally `npm run dev` has a pretend sharing server with the same rules.

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
const linkRole = (page: Page) => panel(page).getByRole('button', { name: /^Link role:/ });
const noteTexts = (page: Page) => page.getByLabel('Note text');
const toolbar = (page: Page) => page.locator('header.toolbar');
const badge = (page: Page) => toolbar(page).getByText(/^(View only|Can comment)$/);
const path = (link: string) => link.replace(/^https?:\/\/[^/]+/, '');

async function openShare(page: Page) {
  if (!(await panel(page).isVisible())) await toolbar(page).getByRole('button', { name: 'Share' }).click();
  await expect(panel(page)).toBeVisible();
}

/** Alice makes "Trip" with a note "Tent" and a checklist with "Stove", and shares it. */
async function aliceSharesTrip(page: Page) {
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'New board' }).click();
  await boardName(page).fill('Trip');
  await toolbar(page).getByRole('button', { name: 'Note', exact: true }).click();
  await page.keyboard.type('Tent');
  await toolbar(page).getByRole('button', { name: 'Checklist', exact: true }).click();
  await page.keyboard.type('Gear');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Stove');
  await openShare(page);
  await panel(page).getByRole('button', { name: 'Share this board' }).click();
  await expect(linkBox(page)).toHaveValue(/\?join=/);
}

/** Alice's link for `role` (made first). */
async function linkFor(page: Page, role: 'Can view' | 'Can comment') {
  await linkRole(page).click();
  await panel(page).getByRole('menu', { name: /^Link role/ }).getByRole('menuitemradio', { name: new RegExp(`^${role}`) }).click();
  await panel(page).getByRole('button', { name: role === 'Can view' ? 'Make a view link' : 'Make a comment link' }).click();
  await expect(linkBox(page)).toHaveValue(/\?join=/);
  return linkBox(page).inputValue();
}

async function joins(browser: Browser, link: string, name: string, phone = false) {
  const page = await person(browser, name, path(link), phone);
  await expect(boardName(page)).toHaveValue('Trip');
  return page;
}

/** Counts the pretend server's board saves from `page`. */
function countSaves(page: Page) {
  const n = { saves: 0 };
  page.on('request', (r) => r.url().includes('/__collab/call') && /"method":"(write|read)"/.test(r.postData() ?? '') && n.saves++);
  return n;
}

test('a viewer sees the badge and a one-time note, no editing buttons, and can’t change anything; panning, Search and opening work', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  await aliceSharesTrip(alice);
  const view = await linkFor(alice, 'Can view');
  const bob = await joins(browser, view, `Bob${t}`);
  const sent = countSaves(bob);

  await expect(badge(bob)).toHaveText('View only', { timeout: 8000 });
  await expect(badge(bob)).toHaveAttribute('title', `You can look at this board but not change it. Ask Alice${t} if something needs changing.`);
  const note = bob.getByRole('status').filter({ hasText: `You can view this board. Ask Alice${t} if you need to change something.` });
  await expect(note).toBeVisible();
  for (const name of ['Undo (Ctrl+Z)', 'Redo (Ctrl+Y)', 'Note', 'Checklist', 'New container', 'Color of selected cards and containers', 'Arrange']) {
    await expect(toolbar(bob).getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await expect(toolbar(bob).getByRole('button', { name: 'Share' })).toBeVisible();
  await expect(boardName(bob)).toHaveAttribute('readonly', '');

  // Text can be selected but not changed; tick boxes can't be pressed; no trash cans or grips.
  const tent = noteTexts(bob);
  await expect(tent).toHaveValue('Tent');
  await expect(tent).not.toBeEditable();
  await tent.click();
  await bob.keyboard.type('XYZ');
  await expect(tent).toHaveValue('Tent');
  await expect(bob.getByRole('checkbox', { name: 'Done: Stove' })).toBeDisabled();
  await expect(bob.getByRole('button', { name: 'Delete card' })).toHaveCount(0);
  await expect(bob.getByRole('button', { name: 'Drag item' })).toHaveCount(0);
  await expect(bob.getByRole('button', { name: 'Collapse card' })).toHaveCount(0);

  // Keys: Delete, Ctrl+V, Ctrl+D and Ctrl+Z change nothing.
  const card = bob.locator('.card', { has: tent });
  await card.locator('.card-header').click();
  await expect(card).toHaveClass(/selected/);
  for (const key of ['Delete', 'Control+c', 'Control+v', 'Control+d', 'Control+z']) await bob.keyboard.press(key);
  await expect(bob.locator('.card')).toHaveCount(2);

  // Dragging a card moves the board instead; the card stays where it is on the board.
  const before = await box(card);
  const pan = await bob.getByTestId('canvas').getAttribute('data-pan-x');
  await bob.mouse.move(before.x + before.width / 2, before.y + 8);
  await bob.mouse.down();
  await bob.mouse.move(before.x + before.width / 2 + 120, before.y + 60, { steps: 6 });
  await bob.mouse.up();
  await expect(bob.getByTestId('canvas')).not.toHaveAttribute('data-pan-x', pan!);
  const after = await box(card);
  expect(Math.round(after.x - before.x)).toBe(120);

  // Nothing went to the server, and Alice's board is as it was.
  await bob.waitForTimeout(1500);
  expect(sent.saves).toBe(0);
  await expect(noteTexts(alice)).toHaveValue('Tent');

  // The note goes with ×, and stays gone after a reload.
  await note.getByRole('button', { name: 'Dismiss' }).click();
  await expect(note).toHaveCount(0);
  await bob.reload();
  await fontsLoaded(bob);
  await expect(badge(bob)).toHaveText('View only', { timeout: 8000 });
  await expect(bob.getByText('You can view this board.')).toHaveCount(0);

  // Their own home board is fully editable.
  await bob.getByRole('button', { name: 'Boards', exact: true }).click();
  await bob.getByRole('menu', { name: 'Boards' }).getByRole('menuitem').first().click();
  await expect(badge(bob)).toHaveCount(0);
  await toolbar(bob).getByRole('button', { name: 'Note', exact: true }).click();
  await bob.keyboard.type('Mine');
  await expect(noteTexts(bob).last()).toHaveValue('Mine');
  expect([...alice.errors, ...bob.errors]).toEqual([]);
});

test('a commenter’s badge says Can comment; a role change takes effect at once, both ways', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  await aliceSharesTrip(alice);
  const comment = await linkFor(alice, 'Can comment');
  const bob = await joins(browser, comment, `Bob${t}`);
  await expect(badge(bob)).toHaveText('Can comment', { timeout: 8000 });
  await expect(bob.getByText(`You can view this board and comment on its cards. Ask Alice${t} if you need to change something.`)).toBeVisible();

  // Alice makes him an editor: he can type straight away, and she sees it.
  const people = panel(alice).getByRole('list', { name: 'People' });
  await people.getByRole('button', { name: `Bob${t}’s role: Can comment` }).click();
  await people.getByRole('menuitemradio', { name: /^Can edit/ }).click();
  await expect(badge(bob)).toHaveCount(0, { timeout: 8000 });
  await expect(toolbar(bob).getByRole('button', { name: 'Note', exact: true })).toBeVisible();
  await noteTexts(bob).click();
  await bob.keyboard.press('End');
  await bob.keyboard.type(' and poles');
  await expect(noteTexts(alice)).toHaveValue('Tent and poles', { timeout: 8000 });

  // And back to Can view: read-only again at once.
  await people.getByRole('button', { name: `Bob${t}’s role: Can edit` }).click();
  await people.getByRole('menuitemradio', { name: /^Can view/ }).click();
  await alice.getByRole('alertdialog', { name: `Change Bob${t} to Can view?` }).getByRole('button', { name: 'Change role' }).click();
  await expect(badge(bob)).toHaveText('View only', { timeout: 8000 });
  await expect(noteTexts(bob)).not.toBeEditable();
  await expect(toolbar(bob).getByRole('button', { name: 'Note', exact: true })).toHaveCount(0);
  expect([...alice.errors, ...bob.errors]).toEqual([]);
});

test('on a phone, a viewer has the badge and no Undo, Redo or Add in the bottom bar; More still opens', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  await aliceSharesTrip(alice);
  const view = await linkFor(alice, 'Can view');
  const bob = await joins(browser, view, `Bob${t}`, true);
  await expect(badge(bob)).toHaveText('View only', { timeout: 8000 });
  const bar = bob.getByRole('toolbar', { name: 'Board actions' });
  for (const name of ['Undo', 'Redo', 'Add']) await expect(bar.getByRole('button', { name, exact: true })).toHaveCount(0);
  await bar.getByRole('button', { name: 'More' }).click();
  const more = bob.getByRole('dialog', { name: 'More' });
  await expect(more.getByRole('button', { name: 'Search' })).toBeVisible();
  await expect(more.getByRole('button', { name: 'Snap to grid' })).toHaveCount(0);
  expect((await box(more.getByRole('button', { name: 'Search' }))).height).toBeGreaterThanOrEqual(44);
  expect(await bob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(bob.errors).toEqual([]);
});
