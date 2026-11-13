import { expect, test, type Page, type Route } from '@playwright/test';
import { cspGuard, violations } from './csp-guard';
import { fontsLoaded, freshBoardEachTest, more } from './helpers';

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
    const texts = JSON.parse(user.slice(user.lastIndexOf('['))) as string[];
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
  await (await more(page)).getByRole('button', { name: 'Visualizer', exact: true }).click();
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
  // The one item with no label is the only one left to send.
  await expect(dialog(page).getByText(/Sends the text of 1 finished item from your own boards to Anthropic/)).toBeVisible();

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
