import { expect, test, type Browser, type Page } from '@playwright/test';
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
