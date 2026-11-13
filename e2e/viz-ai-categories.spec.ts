import { expect, test, type Page, type Route } from '@playwright/test';
import { cspGuard, violations } from './csp-guard';
import { fontsLoaded, freshBoardEachTest } from './helpers';

// "Sort with AI" in the Visualizer (owner request, 2026-11-13): with the person's own key, Claude sorts the
// finished items into its own categories. Anthropic is never reached here: a stand-in answers every request.

freshBoardEachTest();

const KEY = 'sk-ant-api03-SECRET-abcd1234';
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Visualizer' });
const sortButton = (page: Page) => dialog(page).getByRole('button', { name: 'Sort with AI' });
const canvas = (page: Page) => dialog(page).locator('canvas.viz-canvas');
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST' };

/** [board, list, text]: finished items on two boards, all cleaned up today. */
const SEED: [string, string, string][] = [
  ['home', 'Groceries', 'milk'],
  ['home', 'Groceries', 'bread'],
  ['home', 'Chores', 'laundry'],
  ['b2', 'Tools', 'sand the door'],
];
const AI: Record<string, string> = { milk: 'Food', bread: 'Food', laundry: 'Housework' }; // "sand the door" gets no label

async function seed(page: Page) {
  await page.evaluate((seed) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const boards: Record<string, unknown> = {};
    for (const [id, name] of [['home', 'Home'], ['b2', 'Garage']]) {
      const entries = seed
        .filter((s) => s[0] === id)
        .map(([, list, text], i) => ({ item: { id: `${id}_${i}`, text, done: true, children: [], note: 'secret note' }, fromCardId: `${id}_l`, fromTitle: list, fromParentId: null }));
      boards[id] = { name, snap: true, cards: { [`${id}_done`]: { id: `${id}_done`, kind: 'completed', color: 'stone', x: 0, y: 0, groups: [{ date, entries }] } }, columns: {}, order: [`${id}_done`] };
    }
    localStorage.setItem('note-board:v1', JSON.stringify({ version: 6, home: 'home', boards }));
    // The press tests start with Sort automatically off; the auto tests below turn it back on.
    localStorage.setItem('note-board:viz-ai-auto', '0');
  }, SEED);
  await page.reload();
  await fontsLoaded(page);
}

/** Answers Anthropic with labels from AI (or with `status` and an error), and keeps every request body. */
async function anthropic(page: Page, status = 200) {
  const bodies: string[] = [];
  await page.route('https://api.anthropic.com/**', (r: Route) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    const body = r.request().postData() ?? '';
    bodies.push(body);
    if (status !== 200) return r.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }) });
    const user: string = JSON.parse(body).messages[0].content;
    // A sub-item comes as {"item","under"}; the stand-in labels it by its own text.
    const texts = (JSON.parse(user.slice(user.lastIndexOf('['))) as (string | { item: string })[]).map((t) => (typeof t === 'string' ? t : t.item));
    const categories = ['Food', 'Housework'];
    const labels = texts.flatMap((t, i) => (AI[t] ? [{ i, c: categories.indexOf(AI[t]) }] : []));
    const reply = { type: 'message', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ categories, labels }) }] };
    return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(reply) });
  });
  return bodies;
}

async function saveKey(page: Page) {
  await page.locator('header.toolbar').getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'AI settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'AI settings' });
  await settings.getByLabel('Anthropic API key').fill(KEY);
  await settings.getByRole('button', { name: 'Save key' }).click();
  await expect(settings.getByText('sk-ant-…1234')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
}

async function openVisualizer(page: Page) {
  await page.locator('header.toolbar').getByRole('button', { name: 'Visualizer', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await cspGuard(page);
  await seed(page);
});
test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

test('no button without a key, and nothing is sent', async ({ page }) => {
  const bodies = await anthropic(page);
  await openVisualizer(page);
  await expect(canvas(page)).toHaveAttribute('aria-label', /Errands & shopping 2/);
  await expect(sortButton(page)).toHaveCount(0);
  expect(bodies).toEqual([]);
});

test('sorting sends only the item texts, changes the categories, and a reload reuses them without asking again', async ({ page }) => {
  const bodies = await anthropic(page);
  await saveKey(page);
  await openVisualizer(page);
  await expect(dialog(page).getByText(/Sends the text of 4 finished items from your own boards to Anthropic/)).toBeVisible();
  expect(bodies).toEqual([]);

  await sortButton(page).click();
  // Items without a label keep their built-in category (Other here).
  await expect(canvas(page)).toHaveAttribute('aria-label', '4 items cleaned up: Food 2, Housework 1, Other 1.');
  expect(bodies).toHaveLength(1);
  const sent = bodies[0];
  for (const text of ['milk', 'bread', 'laundry', 'sand the door']) expect(sent).toContain(text);
  for (const never of ['Home', 'Garage', 'Groceries', 'Chores', 'Tools', 'home_0', 'b2_', 'secret note']) expect(sent).not.toContain(never);
  expect(sent).not.toContain('SECRET');
  // The one item Claude gave no label is remembered as asked, so it is not sent (and billed) again.
  await expect(dialog(page).getByText('Nothing left to sort from your own boards. The labels stay on this device.')).toBeVisible();
  await expect(sortButton(page)).toBeDisabled();

  await page.reload();
  await fontsLoaded(page);
  await openVisualizer(page);
  await expect(canvas(page)).toHaveAttribute('aria-label', '4 items cleaned up: Food 2, Housework 1, Other 1.');
  expect(bodies).toHaveLength(1);
  // The board is untouched: no label went into the saved boards.
  expect(await page.evaluate(() => localStorage.getItem('note-board:v1'))).not.toContain('Food');

  // Forget key: the labels go too, and the built-in categories are back.
  await page.keyboard.press('Escape');
  await page.locator('header.toolbar').getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'AI settings', exact: true }).click();
  await page.getByRole('dialog', { name: 'AI settings' }).getByRole('button', { name: 'Forget key' }).click();
  expect(await page.evaluate(() => localStorage.getItem('note-board:ai-categories'))).toBeNull();
  await page.keyboard.press('Escape');
  await openVisualizer(page);
  await expect(canvas(page)).toHaveAttribute('aria-label', /Errands & shopping 2/);
  await expect(sortButton(page)).toHaveCount(0);
});

test('an error from Anthropic is shown in plain words, and the categories stay as they were', async ({ page }) => {
  await anthropic(page, 429);
  await saveKey(page);
  await openVisualizer(page);
  await sortButton(page).click();
  await expect(dialog(page).getByRole('alert')).toContainText('too many requests');
  await expect(canvas(page)).toHaveAttribute('aria-label', /Errands & shopping 2/);
  await expect(sortButton(page)).toBeEnabled();
});

// Sort automatically (owner request 2026-11-13, job "viz-ai-autosort"): on by default, remembered on this device.
const autoBox = (page: Page) => dialog(page).getByRole('checkbox', { name: 'Sort automatically' });
const autoDefault = (page: Page) => page.evaluate(() => localStorage.removeItem('note-board:viz-ai-auto'));

test('Sort automatically is on by default and sorts as soon as the Visualizer opens, sending only the item texts', async ({ page }) => {
  await autoDefault(page);
  const bodies = await anthropic(page);
  await saveKey(page);
  expect(bodies).toEqual([]);
  await openVisualizer(page);
  await expect(autoBox(page)).toBeChecked();
  await expect(canvas(page)).toHaveAttribute('aria-label', '4 items cleaned up: Food 2, Housework 1, Other 1.');
  expect(bodies).toHaveLength(1);
  for (const text of ['milk', 'bread', 'laundry', 'sand the door']) expect(bodies[0]).toContain(text);
  for (const never of ['Home', 'Garage', 'Groceries', 'Chores', 'Tools', 'secret note', 'SECRET']) expect(bodies[0]).not.toContain(never);
  // "sand the door" got no label: that is remembered too, so nothing is left to send, now or on the next open.
  await expect(dialog(page).getByText('Nothing left to sort from your own boards. The labels stay on this device.')).toBeVisible();
  await page.waitForTimeout(500);
  expect(bodies).toHaveLength(1);
  await page.keyboard.press('Escape');
  await openVisualizer(page);
  await expect(canvas(page)).toHaveAttribute('aria-label', '4 items cleaned up: Food 2, Housework 1, Other 1.');
  await page.waitForTimeout(500);
  expect(bodies).toHaveLength(1);
});

test('with Sort automatically off, opening sends nothing, as before', async ({ page }) => {
  const bodies = await anthropic(page);
  await saveKey(page);
  await openVisualizer(page);
  await expect(autoBox(page)).not.toBeChecked();
  await expect(dialog(page).getByText(/^Sends the text of 4 finished items from your own boards/)).toBeVisible();
  await page.waitForTimeout(500);
  expect(bodies).toEqual([]);
  await expect(canvas(page)).toHaveAttribute('aria-label', /Errands & shopping 2/);
});

test('the Sort automatically choice is remembered on this device', async ({ page }) => {
  await autoDefault(page);
  const bodies = await anthropic(page);
  await saveKey(page);
  await openVisualizer(page);
  await expect(canvas(page)).toHaveAttribute('aria-label', /Food 2/);
  expect(bodies).toHaveLength(1);
  await autoBox(page).uncheck();
  expect(await page.evaluate(() => localStorage.getItem('note-board:viz-ai-auto'))).toBe('0');

  await page.reload();
  await fontsLoaded(page);
  await openVisualizer(page);
  await expect(autoBox(page)).not.toBeChecked();
  // With the box off nothing goes by itself (and "sand the door" was already asked about, so nothing is waiting).
  await expect(dialog(page).getByText(/^Nothing left to sort/)).toBeVisible();
  await page.waitForTimeout(500);
  expect(bodies).toHaveLength(1);
  await autoBox(page).check();
  expect(await page.evaluate(() => localStorage.getItem('note-board:viz-ai-auto'))).toBe('1');
});

test('with no key saved, Sort automatically sends nothing and is not shown', async ({ page }) => {
  await autoDefault(page);
  const bodies = await anthropic(page);
  await openVisualizer(page);
  await expect(canvas(page)).toHaveAttribute('aria-label', /Errands & shopping 2/);
  await expect(autoBox(page)).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(bodies).toEqual([]);
});

test('after a failure Sort automatically does not try again by itself in the same range', async ({ page }) => {
  await autoDefault(page);
  const bodies = await anthropic(page, 429);
  await saveKey(page);
  await openVisualizer(page);
  await expect(dialog(page).getByRole('alert')).toContainText('too many requests');
  expect(bodies).toHaveLength(1);
  // Switching to By board and back is the same range in the same open: no second request.
  await dialog(page).getByRole('button', { name: 'By board' }).click();
  await dialog(page).getByRole('button', { name: 'By category' }).click();
  await expect(sortButton(page)).toBeEnabled();
  await page.waitForTimeout(500);
  expect(bodies).toHaveLength(1);
  // Another range is its own run.
  await dialog(page).getByRole('button', { name: '7 days' }).click();
  await expect.poll(() => bodies.length).toBe(2);
});

test('a press counts as the run for that range: ticking Sort automatically afterwards sends nothing more', async ({ page }) => {
  const bodies = await anthropic(page);
  await saveKey(page);
  await openVisualizer(page);
  await sortButton(page).click();
  await expect(canvas(page)).toHaveAttribute('aria-label', /Food 2/);
  expect(bodies).toHaveLength(1);
  await autoBox(page).check();
  await page.waitForTimeout(500);
  expect(bodies).toHaveLength(1);
});

test('an automatic sort cut short by switching to By board runs again on coming back to By category', async ({ page }) => {
  await autoDefault(page);
  let answer: () => void = () => {};
  const held = new Promise<void>((r) => (answer = r));
  let asked = 0;
  await page.route('https://api.anthropic.com/**', async (r: Route) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    asked++;
    await held;
    return r.fulfill({ status: 500, headers: cors, body: '{}' }).catch(() => {});
  });
  await saveKey(page);
  await openVisualizer(page);
  await expect(dialog(page).getByText('Sorting… 0 of 4')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'By board' }).click();
  await dialog(page).getByRole('button', { name: 'By category' }).click();
  await expect(dialog(page).getByText('Sorting… 0 of 4')).toBeVisible();
  await expect.poll(() => asked).toBe(2);
  answer();
});

test('Cancel stops a sort that is still running', async ({ page }) => {
  let answer: () => void = () => {};
  const held = new Promise<void>((r) => (answer = r));
  await page.route('https://api.anthropic.com/**', async (r: Route) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    await held;
    return r.fulfill({ status: 500, headers: cors, body: '{}' }).catch(() => {});
  });
  await saveKey(page);
  await openVisualizer(page);
  await sortButton(page).click();
  await expect(dialog(page).getByText('Sorting… 0 of 4')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page).getByText('Stopped.')).toBeVisible();
  await expect(sortButton(page)).toBeEnabled();
  answer();
});

test('a sub-item goes with the text of the item it is under; a parent like Today or one that names a topic is not sent', async ({ page }) => {
  // Three more finished entries on Home, each a ticked parent with one ticked sub-item.
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('note-board:v1')!);
    const entries = data.boards.home.cards.home_done.groups[0].entries;
    const sub = (id: string, parent: string, child: string) => ({
      item: { id, text: parent, done: true, note: 'secret note', children: [{ id: `${id}c`, text: child, done: true, children: [], note: 'secret note' }] },
      fromCardId: 'home_l',
      fromTitle: 'Groceries',
      fromParentId: null,
    });
    entries.push(sub('p1', 'Elden Ring', 'Beat the boss'), sub('p2', 'Today', 'water plants'), sub('p3', 'Clean the garage', 'find the box'));
    localStorage.setItem('note-board:v1', JSON.stringify(data));
  });
  await page.reload();
  await fontsLoaded(page);
  const bodies = await anthropic(page);
  await saveKey(page);
  await openVisualizer(page);
  // The hint says a sub-item goes with its parent's text only when one is waiting to be sent.
  await expect(dialog(page).getByText(/^Sends the text of 6 finished items from your own boards to Anthropic with your key \(a sub-item with the text of the item it is under\): no board names/)).toBeVisible();
  await sortButton(page).click();
  await expect(dialog(page).getByText(/^Sorted /)).toBeVisible();
  expect(bodies).toHaveLength(1);
  const sent = bodies[0];
  // The sub-item goes with its parent's text, as context.
  expect(sent).toContain('{\\"item\\":\\"Beat the boss\\",\\"under\\":\\"Elden Ring\\"}');
  // Under a time word it goes by its own words alone; under a parent that names a topic it is not sent at all.
  expect(sent).toContain('\\"water plants\\"');
  expect(sent).not.toContain('Today');
  expect(sent).not.toContain('find the box');
  expect(sent).not.toContain('Clean the garage');
  for (const never of ['Home', 'Garage', 'Groceries', 'home_', 'secret note', 'SECRET']) expect(sent).not.toContain(never);
});
