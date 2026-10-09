import { expect, test, type Browser, type Dialog, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { add, box, fontsLoaded } from './helpers';

// Sharing a board and editing it together (owner request, 2026-10-05). Locally, `npm run dev` has
// a pretend sharing server: ?demo-user=Alice and ?demo-user=Bob are two people, each in their own
// browser window (here: their own browser context, as on two computers).

/** Names unique to each test, since the pretend server is shared by tests running at once. */
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

const toolbar = (page: Page) => page.locator('header.toolbar');
const boardName = (page: Page) => page.getByLabel('Board name');
const sharePanel = (page: Page) => page.getByRole('dialog', { name: /Share/ });
const noteTexts = (page: Page) => page.getByLabel('Note text');

async function openShare(page: Page) {
  // Already open (it stays open after sharing): leave it.
  if (!(await sharePanel(page).isVisible())) await toolbar(page).getByRole('button', { name: 'Share' }).click();
  await expect(sharePanel(page)).toBeVisible();
}

/** Alice makes a board "Trip" with a note "Tent", shares it, and returns the link. */
async function aliceSharesTrip(page: Page) {
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'New board' }).click();
  await boardName(page).fill('Trip');
  await add(page, 'Note');
  await page.keyboard.type('Tent');
  await openShare(page);
  await sharePanel(page).getByRole('button', { name: 'Share this board' }).click();
  const link = sharePanel(page).getByLabel('Share link');
  await expect(link).toHaveValue(/\?join=/);
  return (await link.inputValue()).replace(/^https?:\/\/[^/]+/, '');
}

async function bobJoins(browser: Browser, link: string, name: string) {
  const bob = await person(browser, name, link);
  await expect(boardName(bob)).toHaveValue('Trip');
  return bob;
}

test('Alice shares a board by link; Bob opens it, and what each one does shows on the other’s screen', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  const link = await aliceSharesTrip(alice);
  const bob = await bobJoins(browser, link, `Bob${t}`);
  await expect(noteTexts(bob)).toHaveValue('Tent');

  // Both edit at once: Alice types in her note, Bob adds one of his own.
  await noteTexts(alice).first().fill('Tent and stove');
  await add(bob, 'Note');
  await bob.keyboard.type('Bob was here');
  for (const page of [alice, bob]) {
    await expect(noteTexts(page)).toHaveCount(2, { timeout: 8000 });
    await expect.poll(() => noteTexts(page).evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value).sort()), { timeout: 8000 }).toEqual(['Bob was here', 'Tent and stove']);
  }

  // Both see who has the board; only Alice manages it.
  await openShare(alice);
  await expect(sharePanel(alice).getByText(`Bob${t}`)).toBeVisible();
  await expect(sharePanel(alice).getByRole('button', { name: `Remove Bob${t}` })).toBeVisible();
  await openShare(bob);
  await expect(sharePanel(bob).getByText(`Alice${t}`)).toBeVisible();
  await expect(sharePanel(bob).getByRole('button', { name: /Remove/ })).toHaveCount(0);
  await expect(sharePanel(bob).getByRole('button', { name: 'Leave this board' })).toBeVisible();
  expect([...alice.errors, ...bob.errors]).toEqual([]);
});

test('the person who shared it can remove someone: the board leaves their screen, with a note saying so', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  const link = await aliceSharesTrip(alice);
  const bob = await bobJoins(browser, link, `Bob${t}`);
  await openShare(alice);
  alice.once('dialog', (d) => d.accept());
  await sharePanel(alice).getByRole('button', { name: `Remove Bob${t}` }).click();
  await expect(sharePanel(alice).getByText(`Bob${t}`)).toHaveCount(0);
  await expect(bob.getByRole('status').filter({ hasText: '“Trip” is no longer shared with you.' })).toBeVisible({ timeout: 8000 });
  await expect(boardName(bob)).not.toHaveValue('Trip');
  await bob.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(bob.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'Trip' })).toHaveCount(0);
});

test('a link that was turned off doesn’t let anyone in', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  const link = await aliceSharesTrip(alice);
  await sharePanel(alice).getByRole('button', { name: 'Turn link off' }).click();
  await expect(sharePanel(alice).getByText('The link is turned off')).toBeVisible();
  const bob = await person(browser, `Bob${t}`, link);
  await expect(bob.getByRole('status').filter({ hasText: 'This share link doesn’t work' })).toBeVisible({ timeout: 8000 });
  await expect(boardName(bob)).not.toHaveValue('Trip');
});

test('someone it was shared with can’t rename or delete the shared board, but can leave it', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  const link = await aliceSharesTrip(alice);
  const bob = await bobJoins(browser, link, `Bob${t}`);
  await expect(boardName(bob)).toHaveAttribute('readonly', '');
  await bob.getByRole('button', { name: 'Boards', exact: true }).click();
  const menu = bob.getByRole('menu', { name: 'Boards' });
  await expect(menu.getByRole('menuitem', { name: /Trip/ })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Delete board Trip' })).toHaveCount(0);
  await bob.keyboard.press('Escape');
  await bob.locator('header.toolbar').click({ position: { x: 600, y: 5 } });

  await openShare(bob);
  bob.once('dialog', (d) => d.accept());
  await sharePanel(bob).getByRole('button', { name: 'Leave this board' }).click();
  await expect(boardName(bob)).not.toHaveValue('Trip');
  await openShare(alice);
  await expect(sharePanel(alice).getByText(`Bob${t}`)).toHaveCount(0, { timeout: 8000 });
});

test('leaving a board that doesn’t work says so, and the board stays', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  const link = await aliceSharesTrip(alice);
  const bob = await bobJoins(browser, link, `Bob${t}`);
  // No connection for leaving: the pretend server never hears it.
  await bob.route('**/call', (route) => (route.request().postData()?.includes('"method":"leave"') ? route.abort() : route.continue()));
  await openShare(bob);
  bob.once('dialog', (d) => d.accept());
  await sharePanel(bob).getByRole('button', { name: 'Leave this board' }).click();
  await expect(sharePanel(bob).getByRole('alert')).toHaveText('That didn’t work. Check your connection and try again.');
  await expect(boardName(bob)).toHaveValue('Trip');
});

test('deleting a shared board (by the person who shared it) deletes it for everyone', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  const link = await aliceSharesTrip(alice);
  const bob = await bobJoins(browser, link, `Bob${t}`);
  await alice.keyboard.press('Escape');
  await alice.getByRole('button', { name: 'Boards', exact: true }).click();
  alice.once('dialog', (d) => d.accept());
  await alice.getByRole('menu', { name: 'Boards' }).getByRole('button', { name: 'Delete board Trip' }).click();
  await expect(boardName(alice)).not.toHaveValue('Trip');
  await expect(bob.getByRole('status').filter({ hasText: '“Trip” was deleted by the person who shared it.' })).toBeVisible({ timeout: 8000 });
  await expect(boardName(bob)).not.toHaveValue('Trip');
});

test('the home board can’t be shared', async ({ browser }) => {
  const alice = await person(browser, `Alice${tag()}`);
  await openShare(alice);
  await expect(sharePanel(alice).getByText('can’t be shared')).toBeVisible();
  await expect(sharePanel(alice).getByRole('button', { name: 'Share this board' })).toHaveCount(0);
});

test('Share fits in the toolbar with Sign out, at 1280px', async ({ browser }) => {
  const alice = await person(browser, `Alice${tag()}`, '/?signed-in');
  for (const width of [1280, 1440]) {
    await alice.setViewportSize({ width, height: 800 });
    expect(await toolbar(alice).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const out = await box(toolbar(alice).getByRole('button', { name: 'Sign out' }));
    expect(out.x + out.width).toBeLessThanOrEqual(width);
  }
});

test('on a phone, Share is in the ⋯ menu', async ({ browser }) => {
  const alice = await person(browser, `Alice${tag()}`);
  await alice.setViewportSize({ width: 390, height: 800 });
  await alice.getByRole('button', { name: 'More' }).click();
  await alice.getByRole('button', { name: 'Share' }).click();
  await expect(sharePanel(alice)).toBeVisible();
});

// Security review fix (2026-10-05): whatever is saved online in a share can't take, replace or
// delete one of the boards of the person opening its link.
test('a share link can’t take or overwrite one of your own boards', async ({ browser }) => {
  const t = tag();
  const bob = await person(browser, `Bob${t}`);
  await bob.getByRole('button', { name: 'Boards', exact: true }).click();
  await bob.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'New board' }).click();
  await boardName(bob).fill('Diary');
  await add(bob, 'Note');
  await bob.keyboard.type('secret');
  await bob.keyboard.press('Escape');
  // Bob's diary as saved on his device: its id, and a board to build the hostile share from.
  await expect
    .poll(() => bob.evaluate(() => Object.values(localStorage).some((v) => v.includes('"Diary"') && v.includes('secret'))))
    .toBe(true);
  const { diaryId, diary } = await bob.evaluate(() => {
    for (const v of Object.values(localStorage)) {
      try {
        const ws = JSON.parse(v) as { boards?: Record<string, { name: string }> };
        for (const [id, b] of Object.entries(ws.boards ?? {})) if (b.name === 'Diary') return { diaryId: id, diary: b as Record<string, unknown> };
      } catch {
        // Not a workspace.
      }
    }
    throw new Error('Diary not saved');
  });
  // Mallory's share: its board opens Bob's diary, and it holds a board with the diary's id.
  const card = { id: 'k-bait', kind: 'board', boardId: diaryId, color: 'stone', collapsed: false, x: 40, y: 40, w: null, h: null };
  const bait = { ...diary, name: 'Bait', cards: { 'k-bait': card }, columns: {}, order: ['k-bait'] };
  const overwritten = { ...diary, name: 'Overwritten', cards: {}, columns: {}, order: [] };
  const data = JSON.stringify({ version: 3, home: 'm1', boards: { m1: bait, [diaryId]: overwritten } });
  const mallory = { uid: `demo-mallory${t}`, name: `Mallory${t}`, photo: null };
  const shareId = `sbad${t}`;
  const res = await bob.request.post('/__collab/call', { data: { who: mallory, method: 'createShare', args: [shareId, 'm1', 'badkey', data, 'mallory'] } });
  expect(await res.json()).toEqual({ ok: null });

  await bob.goto(`/?join=${shareId}.badkey&demo-user=Bob${t}`);
  await expect(boardName(bob)).toHaveValue('Bait');
  // Mallory deletes her share: Bob's diary stays, as it was.
  await bob.request.post('/__collab/call', { data: { who: mallory, method: 'deleteShare', args: [shareId] } });
  await expect(boardName(bob)).not.toHaveValue('Bait', { timeout: 8000 });
  await bob.getByRole('button', { name: 'Boards', exact: true }).click();
  await bob.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'Diary' }).click();
  await expect(boardName(bob)).toHaveValue('Diary');
  await expect(noteTexts(bob)).toHaveValue('secret');
});

test('a share link whose board is one of your own doesn’t open, and leaves it alone', async ({ browser }) => {
  const t = tag();
  const bob = await person(browser, `Bob${t}`);
  await bob.getByRole('button', { name: 'Boards', exact: true }).click();
  await bob.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'New board' }).click();
  await boardName(bob).fill('Diary');
  await add(bob, 'Note');
  await bob.keyboard.type('secret');
  await bob.keyboard.press('Escape');
  await expect.poll(() => bob.evaluate(() => Object.values(localStorage).some((v) => v.includes('"Diary"') && v.includes('secret')))).toBe(true);
  const diaryId = await bob.evaluate(() => {
    for (const v of Object.values(localStorage)) {
      try {
        const ws = JSON.parse(v) as { boards?: Record<string, { name: string }> };
        for (const [id, b] of Object.entries(ws.boards ?? {})) if (b.name === 'Diary') return id;
      } catch {
        // Not a workspace.
      }
    }
    throw new Error('Diary not saved');
  });
  const empty = { version: 3, home: 'm1', boards: { m1: { name: 'Bait', snap: true, cards: {}, columns: {}, order: [] } } };
  const mallory = { uid: `demo-mallory${t}`, name: `Mallory${t}`, photo: null };
  const shareId = `sroot${t}`;
  await bob.request.post('/__collab/call', { data: { who: mallory, method: 'createShare', args: [shareId, diaryId, 'badkey', JSON.stringify(empty), 'mallory'] } });

  await bob.goto(`/?join=${shareId}.badkey&demo-user=Bob${t}`);
  await expect(bob.getByRole('status').filter({ hasText: 'This share link doesn’t work' })).toBeVisible({ timeout: 8000 });
  await bob.getByRole('button', { name: 'Boards', exact: true }).click();
  await bob.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'Diary' }).click();
  await expect(boardName(bob)).toHaveValue('Diary');
  await expect(noteTexts(bob)).toHaveValue('secret');
});

// Main session check fixes (2026-10-06).
const boardsMenu = (page: Page) => page.getByRole('menu', { name: 'Boards' });
const historyPanel = (page: Page) => page.getByRole('complementary', { name: 'Version history' });
const previewBar = (page: Page) => page.getByRole('region', { name: 'Looking at an earlier version' });

test('someone a board is shared with can look at its old versions but not restore them', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  const link = await aliceSharesTrip(alice);
  const bob = await bobJoins(browser, link, `Bob${t}`);
  await add(bob, 'Note');
  await bob.keyboard.type('Bob’s note');
  await bob.keyboard.press('Escape');
  await bob.getByRole('button', { name: 'Version history', exact: true }).click();
  await historyPanel(bob).getByRole('button', { name: /card|Empty board/ }).first().click();
  await expect(previewBar(bob)).toContainText('Only the person who shared this board can restore it.');
  await expect(previewBar(bob).getByRole('button', { name: 'Restore this version' })).toHaveCount(0);
});

test('a card to one of your own boards, pasted onto a shared board, doesn’t share that board', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  const link = await aliceSharesTrip(alice);
  const bob = await bobJoins(browser, link, `Bob${t}`);
  // Bob makes "Diary" inside his home board.
  await bob.getByRole('button', { name: 'Boards', exact: true }).click();
  await boardsMenu(bob).getByRole('menuitem').first().click();
  await bob.getByRole('button', { name: 'Boards', exact: true }).click();
  await boardsMenu(bob).getByRole('menuitem', { name: 'Add a sub-board here' }).click();
  const diaryCard = bob.locator('[data-card-id][data-kind="board"]').first();
  await diaryCard.getByRole('button', { name: 'Open board' }).click();
  await boardName(bob).fill('Diary');
  await add(bob, 'Note');
  await bob.keyboard.type('secret');
  await bob.keyboard.press('Escape');
  await bob.getByRole('button', { name: /^Back to/ }).click();
  // He copies its card onto the shared board.
  await diaryCard.click({ position: { x: 12, y: 12 } });
  await bob.keyboard.press('Control+c');
  await bob.getByRole('button', { name: 'Boards', exact: true }).click();
  await boardsMenu(bob).getByRole('menuitem', { name: /Trip/ }).click();
  await expect(boardName(bob)).toHaveValue('Trip');
  await bob.keyboard.press('Control+v');
  await expect(bob.locator('[data-card-id][data-kind="board"]')).toHaveCount(1);
  // Alice gets the card, but not the board.
  await expect(alice.locator('[data-card-id][data-kind="board"]')).toHaveCount(1, { timeout: 8000 });
  await alice.waitForTimeout(1500);
  expect(await alice.evaluate(() => Object.values(localStorage).some((v) => v.includes('secret')))).toBe(false);
  await alice.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(boardsMenu(alice).getByRole('menuitem', { name: 'Diary' })).toHaveCount(0);
});

test('a shared board you leave can be brought back from Version history', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  const link = await aliceSharesTrip(alice);
  const bob = await bobJoins(browser, link, `Bob${t}`);
  await openShare(bob);
  bob.once('dialog', (d) => d.accept());
  await sharePanel(bob).getByRole('button', { name: 'Leave this board' }).click();
  await expect(boardName(bob)).not.toHaveValue('Trip');
  await bob.keyboard.press('Escape');
  await bob.getByRole('button', { name: 'Version history', exact: true }).click();
  await historyPanel(bob).getByRole('button', { name: /card|Empty board/ }).first().click();
  await previewBar(bob).getByRole('button', { name: 'Restore this version' }).click();
  await bob.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(boardsMenu(bob).getByRole('menuitem', { name: /Trip/ })).toBeVisible();
});

test('the link can be turned off and on again', async ({ browser }) => {
  const alice = await person(browser, `Alice${tag()}`);
  await aliceSharesTrip(alice);
  await sharePanel(alice).getByRole('button', { name: 'Turn link off' }).click();
  await sharePanel(alice).getByRole('button', { name: 'Turn link on', exact: true }).click();
  await expect(sharePanel(alice).getByLabel('Share link')).toHaveValue(/\?join=/);
});

test('someone it was shared with restores an old backup: their own boards come back, the shared board stays as it is', async ({ browser }, info) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  const link = await aliceSharesTrip(alice);
  const bob = await bobJoins(browser, link, `Bob${t}`);
  await expect(noteTexts(bob)).toHaveValue('Tent');
  const fileMenu = async (item: string) => {
    await toolbar(bob).getByRole('button', { name: 'File', exact: true }).click();
    await bob.getByRole('menuitem', { name: item }).click();
  };

  // Bob downloads a backup holding his boards and the shared board as it is now.
  const waiting = bob.waitForEvent('download');
  await fileMenu('Download backup');
  const backup = readFileSync((await (await waiting).path())!, 'utf8');
  expect(backup).toContain('Tent');

  // A one-board backup (from before there were several boards) while Trip is open: not even asked.
  const saved = JSON.parse(backup);
  const tripId = Object.keys(saved.boards).find((id) => saved.boards[id].name === 'Trip')!;
  const single = info.outputPath('trip-only.json');
  writeFileSync(single, JSON.stringify({ version: 2, board: { ...saved.boards[tripId], name: 'Trip from a file' } }));
  let asked = false;
  const ask = (d: Dialog) => ((asked = true), void d.dismiss());
  bob.on('dialog', ask);
  const picking = bob.waitForEvent('filechooser');
  await fileMenu('Restore from backup…');
  await (await picking).setFiles(single);
  await expect(bob.getByRole('status').filter({ hasText: 'Only the person who shared this board can restore it.' })).toBeVisible();
  bob.off('dialog', ask);
  expect(asked).toBe(false);
  await expect(boardName(bob)).toHaveValue('Trip');
  await bob.getByRole('status').getByRole('button', { name: 'Dismiss' }).click();

  // Alice changes the shared board; Bob renames his home board.
  await noteTexts(alice).first().fill('Tent and stove');
  await expect(noteTexts(bob)).toHaveValue('Tent and stove', { timeout: 8000 });
  await bob.getByRole('button', { name: 'Boards', exact: true }).click();
  await bob.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'My first board' }).click();
  await boardName(bob).fill('Bob later');

  // Bob restores the old backup.
  const file = info.outputPath('bob-backup.json');
  writeFileSync(file, backup);
  bob.once('dialog', (d) => d.accept());
  const chooser = bob.waitForEvent('filechooser');
  await fileMenu('Restore from backup…');
  await (await chooser).setFiles(file);
  await expect(bob.getByRole('status').filter({ hasText: '“Trip” is shared with you, so it was left as it is.' })).toBeVisible();
  await expect(boardName(bob)).toHaveValue('My first board');

  // The shared board is as Alice left it, for both of them.
  await bob.getByRole('button', { name: 'Boards', exact: true }).click();
  await bob.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'Trip' }).click();
  await expect(noteTexts(bob)).toHaveValue('Tent and stove');
  // Once a later edit of Bob's reaches Alice, anything the restore sent would have too.
  await add(bob, 'Note');
  await bob.keyboard.type('After the restore');
  await expect(noteTexts(alice)).toHaveCount(2, { timeout: 8000 });
  await expect(noteTexts(alice).first()).toHaveValue('Tent and stove');
  expect([...alice.errors, ...bob.errors]).toEqual([]);
});

test('before the list of shared boards has arrived, a restore changes nothing and says so (job #33)', async ({ browser }, info) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  // The pretend server never answers with Carol's list of shared boards.
  await page.route((url) => url.pathname.endsWith('/__collab/watch') && url.searchParams.get('what') === 'shares', (route) => route.abort());
  await page.goto(`/?demo-user=Carol${tag()}`);
  await fontsLoaded(page);
  await boardName(page).fill('Now');
  const backup = info.outputPath('carol.json');
  writeFileSync(backup, JSON.stringify({ version: 2, board: { name: 'Then', snap: true, cards: {}, columns: {}, order: [] } }));
  let asked = 0;
  page.on('dialog', (d) => (asked++, void d.accept()));
  const restore = async () => {
    const picking = page.waitForEvent('filechooser');
    await toolbar(page).getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Restore from backup…' }).click();
    await (await picking).setFiles(backup);
  };
  await restore();
  const waitNote = page.getByRole('status').filter({ hasText: 'Your shared boards are still loading, so nothing was restored. Try again in a moment.' });
  await expect(waitNote).toBeVisible();
  await expect(boardName(page)).toHaveValue('Now');
  // Not asked "Replace this board…?" for a restore that won't happen.
  expect(asked).toBe(0);

  // Once the list has arrived, the same restore goes ahead.
  await page.unrouteAll();
  await page.reload();
  await fontsLoaded(page);
  await expect(boardName(page)).toHaveValue('Now');
  await expect(async () => {
    await restore();
    await expect(boardName(page)).toHaveValue('Then', { timeout: 1000 });
  }).toPass({ timeout: 10000 });
  await context.close();
});