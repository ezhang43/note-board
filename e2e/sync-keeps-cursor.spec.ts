import { expect, test, type Browser, type Page } from '@playwright/test';
import { add, fontsLoaded } from './helpers';

// Job sync-keeps-cursor (owner-approved, 2026-11-09): when the text box being typed in leaves the screen because of
// something else (here: someone else's change syncing in), the cursor falls onto the page with the card still selected.
// A Backspace or Delete then must never delete that card.

const tag = () => Math.random().toString(36).slice(2, 8);

async function person(browser: Browser, name: string, path = '/') {
  const context = await browser.newContext();
  const page = await context.newPage();
  const url = new URL(path, 'http://x');
  url.searchParams.set('demo-user', name);
  await page.goto(url.pathname + url.search);
  await fontsLoaded(page);
  return page;
}

const boardName = (page: Page) => page.getByLabel('Board name');
const toolbar = (page: Page) => page.locator('header.toolbar');
const share = (page: Page) => page.getByRole('dialog', { name: /Share/ });
const list = (page: Page) => page.locator('article[data-kind="todo"]');
const texts = (page: Page) => list(page).getByLabel('Item text').evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));

/** Alice shares a board "Trip" with a checklist "one", "two"; Bob opens it. */
async function sharedChecklist(browser: Browser) {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  await alice.getByRole('button', { name: 'Boards', exact: true }).click();
  await alice.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'New board' }).click();
  await boardName(alice).fill('Trip');
  await add(alice, 'Checklist');
  await alice.keyboard.type('one');
  await alice.keyboard.press('Enter');
  await alice.keyboard.type('two');
  await toolbar(alice).getByRole('button', { name: 'Share' }).click();
  await share(alice).getByRole('button', { name: 'Share this board' }).click();
  const link = share(alice).getByLabel('Share link');
  await expect(link).toHaveValue(/\?join=/);
  const path = (await link.inputValue()).replace(/^https?:\/\/[^/]+/, '');
  await alice.keyboard.press('Escape');
  await expect(share(alice)).toHaveCount(0);
  const bob = await person(browser, `Bob${t}`, path);
  await expect(boardName(bob)).toHaveValue('Trip');
  await expect.poll(() => texts(bob), { timeout: 8000 }).toEqual(['one', 'two']);
  return { alice, bob };
}

/** Where the card sits on the board (not on the screen, which an arrow pans). */
const place = (page: Page) => list(page).evaluate((el) => [(el as HTMLElement).offsetLeft, (el as HTMLElement).offsetTop, el.getAttribute('style')]);

const onPage = (page: Page) => page.evaluate(() => document.activeElement === document.body);

/** Alice clicks into "one" and types "!": once Bob sees it, everything Alice did before has reached him. */
async function aliceSyncs(alice: Page, bob: Page, before: string[]) {
  await list(alice).getByLabel('Item text').first().click();
  await alice.keyboard.press('End');
  await alice.keyboard.type('!');
  await expect.poll(() => texts(bob), { timeout: 8000 }).toEqual([before[0] + '!', ...before.slice(1)]);
}

test('the item being typed in is deleted on another device: Backspace and Delete after it never delete the card', async ({ browser }) => {
  const { alice, bob } = await sharedChecklist(browser);
  await list(alice).getByLabel('Item text').nth(1).click();
  await expect(list(alice)).toHaveClass(/selected/);
  await alice.keyboard.press('End');

  // Bob empties "two" and takes it out.
  await list(bob).getByLabel('Item text').nth(1).fill('');
  await bob.keyboard.press('Backspace');
  await expect.poll(() => texts(bob)).toEqual(['one']);
  await expect.poll(() => texts(alice), { timeout: 8000 }).toEqual(['one']);
  expect(await onPage(alice)).toBe(true); // Alice's cursor has fallen onto the page

  // Alice goes on typing, and presses an arrow as if still in the box: the card neither goes nor moves.
  const at = await place(alice);
  await alice.keyboard.press('ArrowLeft');
  await alice.keyboard.press('Backspace');
  await alice.keyboard.press('Delete');
  await alice.keyboard.press('Backspace');
  await expect(list(alice)).toHaveCount(1);
  await expect.poll(() => texts(alice)).toEqual(['one']);
  expect(await place(alice)).toEqual(at); // (with nothing selected the arrow pans the view, as anywhere)
  await expect(list(alice)).not.toHaveClass(/selected/); // the selection was let go
  // Nothing was deleted for Bob either.
  await aliceSyncs(alice, bob, ['one']);
  await expect(list(bob)).toHaveCount(1);

  // A deliberate click on the card, then Delete, still deletes it.
  await list(alice).locator('.card-header').click({ position: { x: 4, y: 4 } });
  await expect(list(alice)).toHaveClass(/selected/);
  expect(await onPage(alice)).toBe(true);
  await alice.keyboard.press('Delete');
  await expect(list(alice)).toHaveCount(0);
  await alice.context().close();
  await bob.context().close();
});

test('the row being typed in is moved by another device: the cursor stays in it, and Backspace never deletes the card (code review)', async ({ browser }) => {
  const { alice, bob } = await sharedChecklist(browser);
  await list(alice).getByLabel('Item text').first().click();
  await alice.keyboard.press('End');
  await alice.keyboard.press('Space'); // a click inside the box being typed in, then typing, as people do
  await list(alice).getByLabel('Item text').first().click();
  await alice.keyboard.press('Backspace');

  // Bob moves "two" to the top.
  await list(bob).getByLabel('Item text').nth(1).click();
  await bob.keyboard.press('Control+Shift+ArrowUp');
  await expect.poll(() => texts(bob)).toEqual(['two', 'one']);
  await expect.poll(() => texts(alice), { timeout: 8000 }).toEqual(['two', 'one']);
  // The cursor stays in Alice's item (the redraw keeps it), so Backspace edits its text.
  await expect.poll(() => alice.evaluate(() => (document.activeElement as HTMLTextAreaElement | null)?.value)).toBe('one');
  await alice.keyboard.press('Backspace');
  await alice.keyboard.press('Delete');
  await expect(list(alice)).toHaveCount(1);
  await expect.poll(() => texts(alice)).toEqual(['two', 'on']);
  await alice.context().close();
  await bob.context().close();
});

test('Escape out of an item, then Delete, still deletes the card', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`);
  await add(alice, 'Checklist');
  await alice.keyboard.type('one');
  await alice.keyboard.press('Escape');
  await expect(list(alice)).toHaveClass(/selected/);
  await alice.keyboard.press('Delete');
  await expect(list(alice)).toHaveCount(0);
  await alice.context().close();
});
