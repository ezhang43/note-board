import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Time estimates and the day an item was ticked (job saved-estimate-doneon). A note and each checklist item can carry a
// time estimate in whole minutes (1 to 24 hours). A note sets or clears it from a small button in its header; an item
// from a faint clock in its hover strip (owner decision 2026-11-11), and once set shows the estimate after its text and
// changes or clears it from there. It opens a small box with a few quick choices, a Minutes box and Clear. Both are saved with the
// board (format 6), so they are still there after a reload. Ticking an item saves the day it was ticked; unticking clears it.

async function seed(page: Page, estimate?: number) {
  await page.evaluate((estimate) => {
    const base = { color: null, collapsed: false, h: null };
    const board = {
      name: 'T',
      snap: true,
      cards: {
        t1: { ...base, id: 't1', kind: 'todo', title: 'Today', completedOpen: true, x: 100, y: 100, w: 320, items: [{ id: 'a', text: 'Write report', done: false, children: [], ...(estimate ? { estimate } : {}) }] },
        n1: { ...base, id: 'n1', kind: 'note', text: 'Plan the week', x: 500, y: 100, w: 240 },
      },
      columns: {},
      order: ['t1', 'n1'],
    };
    localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board }));
  }, estimate);
  await page.reload();
  await fontsLoaded(page);
}

/** The board as saved on this device. */
async function saved(page: Page) {
  return page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1') ?? '{}');
    const board = raw.boards?.[raw.home];
    return { version: raw.version, item: board?.cards.t1.items[0], note: board?.cards.n1 };
  });
}

const row = (page: Page) => page.locator('[data-card-id="t1"] [data-item-id="a"]');
const note = (page: Page) => page.locator('[data-card-id="n1"]');
const picker = (page: Page) => page.getByRole('dialog', { name: 'Time estimate' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
  await seed(page);
});

test('an item with an estimate: its pill changes it with a quick choice, it is saved, and Clear takes it off', async ({ page }) => {
  await seed(page, 45);
  const pill = (label: string) => row(page).getByRole('button', { name: `Time estimate: ${label}` });
  await pill('45m').click();
  await expect(picker(page)).toBeVisible();
  await picker(page).getByRole('button', { name: '30m' }).click();
  await expect(picker(page)).toBeHidden();
  await expect(pill('30m')).toHaveText('30m');
  await expect.poll(async () => (await saved(page)).item?.estimate).toBe(30);
  expect((await saved(page)).version).toBe(6);

  await page.reload();
  await fontsLoaded(page);
  await pill('30m').click();
  await picker(page).getByRole('button', { name: 'Clear' }).click();
  await expect(row(page).getByRole('button', { name: /^Time estimate:/ })).toHaveCount(0);
  await expect.poll(async () => 'estimate' in ((await saved(page)).item ?? {})).toBe(false);
  // Its pill is gone, so the keyboard goes back into the item's text.
  await expect(row(page).getByLabel('Item text')).toBeFocused();

  // Ctrl+Z brings it back, as with any change.
  await page.keyboard.press('Control+z');
  await expect(pill('30m')).toBeVisible();
});

test('a note: minutes typed in the box, Enter sets them; Escape closes without a change', async ({ page }) => {
  await note(page).hover();
  await note(page).getByRole('button', { name: 'Add a time estimate' }).click();
  const minutes = picker(page).getByLabel('Minutes');
  await expect(minutes).toBeFocused();
  await minutes.fill('90');
  await minutes.press('Enter');
  await expect(picker(page)).toBeHidden();
  const chip = note(page).getByRole('button', { name: 'Time estimate: 1h 30m' });
  await expect(chip).toHaveText('1h 30m');
  await expect(chip).toBeFocused(); // the keyboard goes back to the button
  await expect.poll(async () => (await saved(page)).note?.estimate).toBe(90);

  // Typing and pressing Backspace or Delete in the box changes the box only, never the board.
  await chip.click();
  await minutes.fill('45');
  await minutes.press('Backspace');
  await minutes.press('Delete');
  await minutes.press('Escape');
  await expect(picker(page)).toBeHidden();
  await expect(chip).toBeVisible();
  await expect(note(page)).toBeVisible();
  expect((await saved(page)).note?.estimate).toBe(90);

  await page.reload();
  await fontsLoaded(page);
  await expect(note(page).getByRole('button', { name: 'Time estimate: 1h 30m' })).toBeVisible();
});

test('minutes outside 1 to 24 hours are not taken', async ({ page }) => {
  await note(page).hover();
  await note(page).getByRole('button', { name: 'Add a time estimate' }).click();
  const minutes = picker(page).getByLabel('Minutes');
  for (const bad of ['0', '1441']) {
    await minutes.fill(bad);
    await minutes.press('Enter');
    await expect(picker(page)).toBeVisible();
  }
  await page.keyboard.press('Escape');
  expect('estimate' in ((await saved(page)).note ?? {})).toBe(false);
});

test('a click outside the box closes it', async ({ page }) => {
  await seed(page, 45);
  await row(page).getByRole('button', { name: 'Time estimate: 45m' }).click();
  await expect(picker(page)).toBeVisible();
  await page.mouse.click(900, 600);
  await expect(picker(page)).toBeHidden();
});

test('Tab out of the box closes it', async ({ page }) => {
  await note(page).hover();
  await note(page).getByRole('button', { name: 'Add a time estimate' }).click();
  await expect(picker(page).getByLabel('Minutes')).toBeFocused();
  await page.keyboard.press('Tab'); // Set
  await expect(picker(page)).toBeVisible();
  await page.keyboard.press('Tab'); // out of the box
  await expect(picker(page)).toBeHidden();
});

test('the box closes when its item is no longer shown (Ctrl+Z folds the list away)', async ({ page }) => {
  await seed(page, 45);
  const list = page.locator('[data-card-id="t1"]');
  await list.hover();
  await list.getByRole('button', { name: 'Collapse card' }).click();
  await list.getByRole('button', { name: 'Expand card' }).click();
  await row(page).getByRole('button', { name: 'Time estimate: 45m' }).click();
  await expect(picker(page)).toBeVisible();
  await page.keyboard.press('Control+z'); // the list is folded again: the item and its button are gone
  await expect(row(page)).toHaveCount(0);
  await expect(picker(page)).toBeHidden();
});

test('a collapsed note shows no clock to add an estimate (expand it first), so its preview keeps its room', async ({ page }) => {
  await note(page).hover();
  await note(page).getByRole('button', { name: 'Collapse card' }).click();
  await note(page).hover();
  await expect(note(page).getByRole('button', { name: 'Add a time estimate' })).toBeHidden();
  await note(page).getByRole('button', { name: 'Expand card' }).click();
  await note(page).hover();
  await expect(note(page).getByRole('button', { name: 'Add a time estimate' })).toBeVisible();
});

test('at the biggest text a note keeps its two buttons on one line: no clock, and a set pill comes after them', async ({ page }) => {
  await note(page).hover();
  await note(page).getByRole('button', { name: 'Add a time estimate' }).click();
  await picker(page).getByRole('button', { name: '30m' }).click();
  for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Larger text' }).click();
  await note(page).hover();
  const chip = note(page).getByRole('button', { name: 'Time estimate: 30m' });
  const collapse = await note(page).getByRole('button', { name: 'Collapse card' }).boundingBox();
  const del = await note(page).getByRole('button', { name: 'Delete card' }).boundingBox();
  const pill = await chip.boundingBox();
  expect(Math.abs(collapse!.y - del!.y)).toBeLessThan(1);
  // The pill comes after the buttons: beside them when it fits, else on a line below; always inside the card.
  const c = (await note(page).boundingBox())!;
  expect(pill!.x >= del!.x + del!.width - 1 || pill!.y >= del!.y + del!.height - 1).toBe(true);
  expect(pill!.x + pill!.width).toBeLessThanOrEqual(c.x + c.width + 1);
  await chip.click();
  await picker(page).getByRole('button', { name: 'Clear' }).click();
  await note(page).hover();
  await expect(note(page).getByRole('button', { name: 'Add a time estimate' })).toBeHidden();
});

test('an item shows a faint clock in its hover strip; it sets an estimate in one undo step and the keyboard goes back to it', async ({ page }) => {
  const text = row(page).getByLabel('Item text');
  const clock = row(page).getByRole('button', { name: 'Add a time estimate' });
  await expect(clock).toHaveCSS('opacity', '0'); // faint until the pointer is over the row
  await row(page).hover();
  await expect(clock).toHaveCSS('opacity', '1');
  // It sits in the strip after the text, never over it.
  const t = (await text.boundingBox())!;
  const c = (await clock.boundingBox())!;
  expect(c.x).toBeGreaterThanOrEqual(t.x + t.width - 0.5);
  await clock.click();
  await expect(picker(page)).toBeVisible();
  await picker(page).getByRole('button', { name: '30m' }).click();
  const pill = row(page).getByRole('button', { name: 'Time estimate: 30m' });
  await expect(pill).toBeFocused();
  await expect.poll(async () => (await saved(page)).item?.estimate).toBe(30);
  await page.keyboard.press('Control+z'); // one step
  await expect(row(page).getByRole('button', { name: /^Time estimate:/ })).toHaveCount(0);
  await expect.poll(async () => 'estimate' in ((await saved(page)).item ?? {})).toBe(false);
  await expect(clock).toBeVisible();
});

test('the end of an item\'s text still takes clicks: the clock is beside it, not over it', async ({ page }) => {
  const text = row(page).getByLabel('Item text');
  await row(page).hover();
  const t = (await text.boundingBox())!;
  await page.mouse.click(t.x + t.width - 3, t.y + t.height / 2);
  await expect(text).toBeFocused();
  await expect(picker(page)).toBeHidden();
});

test('an item with an estimate keeps the strip: its pill is in the row and the clock is gone', async ({ page }) => {
  await seed(page, 45);
  await row(page).hover();
  await expect(row(page).getByRole('button', { name: 'Add a time estimate' })).toHaveCount(0);
  await expect(row(page).getByRole('button', { name: 'Time estimate: 45m' })).toBeVisible();
});

test('after Ctrl+Z in the Minutes box the box shows the undone value, so Enter does not put the old one back', async ({ page }) => {
  await seed(page, 45);
  await row(page).getByRole('button', { name: 'Time estimate: 45m' }).click();
  await picker(page).getByRole('button', { name: '30m' }).click(); // 45 -> 30, one undo step
  const pill = row(page).getByRole('button', { name: 'Time estimate: 30m' });
  await pill.click();
  const minutes = picker(page).getByLabel('Minutes');
  await expect(minutes).toHaveValue('30');
  await page.keyboard.press('Control+z'); // back to 45, with the box still open
  await expect(row(page).getByRole('button', { name: 'Time estimate: 45m' })).toBeVisible();
  await expect(minutes).toHaveValue('45');
  await minutes.press('Enter');
  await expect(row(page).getByRole('button', { name: 'Time estimate: 45m' })).toBeVisible();
  await expect.poll(async () => (await saved(page)).item?.estimate).toBe(45);
});

test('clicking the open pill again closes the box and the keyboard goes back to the pill', async ({ page }) => {
  await seed(page, 45);
  const pill = row(page).getByRole('button', { name: 'Time estimate: 45m' });
  await pill.click();
  await expect(picker(page)).toBeVisible();
  await expect(pill).toHaveAttribute('aria-expanded', 'true');
  await pill.click();
  await expect(picker(page)).toBeHidden();
  await expect(pill).toHaveAttribute('aria-expanded', 'false');
  await expect(pill).toBeFocused();
  // The same on a note's clock.
  await note(page).hover();
  const clock = note(page).getByRole('button', { name: 'Add a time estimate' });
  await clock.click();
  await clock.click();
  await expect(picker(page)).toBeHidden();
  await expect(clock).toBeFocused();
});

test('the open box does not measure itself again for a board change that leaves its button where it was', async ({ page }) => {
  await note(page).getByLabel('Note text').click();
  await page.keyboard.type('x'); // an undo step to undo while the box is open
  await row(page).hover();
  await row(page).getByRole('button', { name: 'Add a time estimate' }).click();
  await expect(picker(page)).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { sizeReads: number };
    w.sizeReads = 0;
    const box = document.querySelector('.estimate-picker')!;
    const get = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!.get!;
    Object.defineProperty(box, 'offsetWidth', { get() { w.sizeReads++; return get.call(this); } });
  });
  await page.keyboard.press('Control+z'); // the note's text changes; the item's button does not move
  await expect(note(page).getByLabel('Note text')).not.toHaveValue(/x$/);
  await expect(picker(page)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { sizeReads: number }).sizeReads)).toBe(0);
});

test('the open box follows its button when the board is moved', async ({ page }) => {
  await seed(page, 45);
  await row(page).getByRole('button', { name: 'Time estimate: 45m' }).click();
  const gap = async () => {
    const p = (await picker(page).boundingBox())!;
    const c = (await row(page).getByRole('button', { name: 'Time estimate: 45m' }).boundingBox())!;
    return { dx: Math.round(p.x + p.width - (c.x + c.width)), dy: Math.round(p.y - (c.y + c.height)) };
  };
  const before = await gap();
  await page.mouse.move(900, 600);
  await page.mouse.wheel(0, 120);
  await expect.poll(gap).toEqual(before);
});

test('ticking an item saves the day it was ticked; unticking clears it', async ({ page }) => {
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const box = row(page).getByRole('checkbox');
  await box.check();
  await expect.poll(async () => (await saved(page)).item?.doneOn).toBe(today);
  await box.uncheck();
  await expect.poll(async () => 'doneOn' in ((await saved(page)).item ?? {})).toBe(false);
});
