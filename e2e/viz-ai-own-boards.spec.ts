import { expect, test, type Browser, type Page, type Route } from '@playwright/test';
import { labelKey } from '../src/model/aiCategories';
import { fontsLoaded, more } from './helpers';

// Sort with AI sends only items from the person's own boards (owner, 2026-11-13): never from a board someone
// else shared with them. Two demo people on the pretend sharing server (as in sharing.spec.ts): Alice shares
// "Trip", which has a finished item; Bob joins it and sorts. Anthropic is never reached: a stand-in answers.

const tag = () => Math.random().toString(36).slice(2, 8);
const KEY = 'sk-ant-api03-SECRET-abcd1234';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST' };
const SHARED_TEXT = 'pack the striped tent';
const OWN_TEXT = 'buy oat milk';

/** A board with a Completed panel holding finished items `texts`, cleaned up today. */
function completedBoard(id: string, name: string, texts: string[]) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const entries = texts.map((text, i) => ({ item: { id: `${id}_${i}`, text, done: true, children: [] }, fromCardId: `${id}_l`, fromTitle: 'List', fromParentId: null }));
  return { name, snap: true, cards: { [`${id}_done`]: { id: `${id}_done`, kind: 'completed', color: 'stone', x: 0, y: 0, groups: [{ date, entries }] } }, columns: {}, order: [`${id}_done`] };
}

/** A demo person whose boards on this device start as `boards` (set before the app first loads). */
async function person(browser: Browser, name: string, boards: Record<string, unknown>, path = '/') {
  const context = await browser.newContext();
  const uid = `demo-${name.toLowerCase()}`;
  await context.addInitScript(
    ([k, v]) => {
      if (!localStorage.getItem(k)) localStorage.setItem(k, v);
    },
    [`${uid}:note-board:v1`, JSON.stringify({ version: 6, home: 'home', boards })] as const,
  );
  const page = await context.newPage();
  const url = new URL(path, 'http://x');
  url.searchParams.set('demo-user', name);
  await page.goto(url.pathname + url.search);
  await fontsLoaded(page);
  return page;
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Visualizer' });

test('Sort with AI never sends an item from a board shared with you, and that item keeps its built-in category', async ({ browser }) => {
  const t = tag();
  const alice = await person(browser, `Alice${t}`, { home: completedBoard('home', 'Home', []), [`trip${t}`]: completedBoard(`trip${t}`, 'Trip', [SHARED_TEXT]) });
  await alice.getByRole('button', { name: 'Boards', exact: true }).click();
  await alice.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'Trip' }).click();
  await alice.locator('header.toolbar').getByRole('button', { name: 'Share' }).click();
  const share = alice.getByRole('dialog', { name: /Share/ });
  await share.getByRole('button', { name: 'Share this board' }).click();
  await expect(share.getByLabel('Share link')).toHaveValue(/\?join=/);
  const link = (await share.getByLabel('Share link').inputValue()).replace(/^https?:\/\/[^/]+/, '');

  const bob = await person(browser, `Bob${t}`, { home: completedBoard('home', 'Home', [OWN_TEXT]) }, link);
  await expect(bob.getByLabel('Board name')).toHaveValue('Trip');

  const bodies: string[] = [];
  await bob.route('https://api.anthropic.com/**', (r: Route) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    const body = r.request().postData() ?? '';
    bodies.push(body);
    const user: string = JSON.parse(body).messages[0].content;
    const texts = JSON.parse(user.slice(user.lastIndexOf('['))) as string[];
    // Every item sent goes to "Camping", so a shared item that got through would show there.
    const reply = { type: 'message', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ categories: ['Camping'], labels: texts.map((_, i) => ({ i, c: 0 })) }) }] };
    return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(reply) });
  });

  await bob.locator('header.toolbar').getByRole('button', { name: 'More', exact: true }).click();
  await bob.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'AI settings', exact: true }).click();
  const settings = bob.getByRole('dialog', { name: 'AI settings' });
  await settings.getByLabel('Anthropic API key').fill(KEY);
  await settings.getByRole('button', { name: 'Save key' }).click();
  await expect(settings.getByText('sk-ant-…1234')).toBeVisible();
  const model = await settings.locator('input[name="ai-model"]:checked').inputValue();
  await bob.keyboard.press('Escape');
  // A label saved earlier on this device for the shared item's text (as before this change) is not used for it.
  await bob.evaluate(([owner, key]) => localStorage.setItem('note-board:ai-categories', JSON.stringify({ v: 1, owner, entries: { [key]: 'Camping' } })), [`demo-bob${t}`, labelKey(SHARED_TEXT, model)] as const);

  await (await more(bob)).getByRole('button', { name: 'Visualizer', exact: true }).click();
  const canvas = dialog(bob).locator('canvas.viz-canvas');
  // Both items are on the disc; only Bob's own one would be sent, and the hint says so.
  await expect(canvas).toHaveAttribute('aria-label', /^2 items cleaned up/);
  await expect(dialog(bob).getByText('Sends the text of 1 finished item from your own boards to Anthropic', { exact: false })).toBeVisible();
  await expect(dialog(bob).getByText(/shared with you/)).toBeVisible();

  await expect(canvas).toHaveAttribute('aria-label', '2 items cleaned up: Errands & shopping 1, Other 1.');
  await dialog(bob).getByRole('button', { name: 'Sort with AI' }).click();
  // Bob's own item is in Camping; the shared one keeps its built-in category (Other), despite the saved label.
  await expect(canvas).toHaveAttribute('aria-label', '2 items cleaned up: Camping 1, Other 1.');
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toContain(OWN_TEXT);
  expect(bodies[0]).not.toContain('striped tent');
  await expect(dialog(bob).getByText(/Nothing left to sort from your own boards/)).toBeVisible();
  await alice.context().close();
  await bob.context().close();
});
