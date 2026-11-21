import { expect, test, type Locator, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Panning a big board (job perf-paint-chunks): every hover-only button (a row's grip, trash can, estimate clock and
// Move up / down pill, a card's or container's trash can and estimate clock) was drawn on every frame of a pan even
// while faded out, each icon a separate masked piece the browser had to paint and stack. Now a faded-out button draws
// no icon (and the pill no shadow) until it shows, and keeps them while it fades away, so nothing looks different.

const base = { color: null, collapsed: false, h: null, w: null };
const board = {
  name: 'T',
  snap: true,
  cards: {
    t1: { ...base, id: 't1', kind: 'todo', title: 'List', x: 100, y: 120, w: 260, items: ['First', 'Second', 'Third'].map((text, i) => ({ id: `i${i}`, text, done: false, children: [] })) },
    n1: { ...base, id: 'n1', kind: 'note', text: 'A note', x: 500, y: 120 },
  },
  columns: {},
  order: ['t1', 'n1'],
};

async function seed(page: Page) {
  await page.goto('/');
  await page.evaluate((b) => localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board: b })), board);
  await page.reload();
  await fontsLoaded(page);
  await page.mouse.click(1300, 800); // nothing selected
  await page.mouse.move(1300, 800);
}

/** Whether a button's icon (its ::after) is drawn. */
const drawn = (l: Locator) => l.evaluate((el) => getComputedStyle(el, '::after').visibility === 'visible');
const shadow = (l: Locator) => l.evaluate((el) => getComputedStyle(el).boxShadow);

test('a faded-out row button draws no icon; pointing at the row draws them, and they stay drawn while fading out', async ({ page }) => {
  await seed(page);
  const row = page.locator('[data-item-id="i1"]');
  const names = ['Move up', 'Move down', 'Delete item', 'Drag item', 'Add a time estimate'];
  const buttons = names.map((name) => row.getByRole('button', { name }));
  const pill = row.locator('.item-arrows');
  for (const b of buttons) expect(await drawn(b), 'hidden').toBe(false);
  expect(await shadow(pill)).toBe('none');

  await row.hover();
  await expect(pill).toHaveCSS('opacity', '1'); // Move up / down fade with their pill
  for (const b of buttons) {
    await expect(b).toHaveCSS('opacity', '1');
    expect(await drawn(b), 'shown').toBe(true);
  }
  expect(await shadow(pill)).not.toBe('none');

  // Pointing away: the buttons fade out over 120ms, still drawn until they are gone. (Read the moment each icon's and
  // the pill shadow's hold starts, in the page: a slow test machine can take longer than 120ms to ask afterwards.)
  await row.evaluate((el) => {
    const seen: string[] = ((window as unknown as { seen: string[] }).seen = []);
    el.addEventListener('transitionrun', (ev) => {
      const e = ev as TransitionEvent;
      const t = e.target as HTMLElement;
      if (e.propertyName === 'visibility' && e.pseudoElement === '::after') seen.push(`${t.getAttribute('aria-label')}: ${getComputedStyle(t, '::after').visibility}`);
      if (e.propertyName === 'box-shadow') seen.push(`pill: ${getComputedStyle(t).boxShadow !== 'none'}`);
    });
  });
  await page.mouse.move(1300, 800);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { seen: string[] }).seen.sort()))
    .toEqual([...names.map((n) => `${n}: visible`), 'pill: true'].sort());
  await expect.poll(() => drawn(buttons[2])).toBe(false);
  await expect.poll(() => shadow(pill)).toBe('none');
  for (const b of buttons) expect(await drawn(b)).toBe(false);
});

test('a card\'s hover-only header buttons draw their icons only while shown: pointed at or selected', async ({ page }) => {
  await seed(page);
  const card = page.locator('[data-card-id="n1"]');
  const trash = card.getByRole('button', { name: 'Delete card' });
  const clock = card.getByRole('button', { name: 'Add a time estimate' });
  expect(await drawn(trash)).toBe(false);
  expect(await drawn(clock)).toBe(false);
  await card.hover();
  // The icons switch on when the fade-in starts; ask until they have (reading at once raced it on CI).
  await expect.poll(() => drawn(trash)).toBe(true);
  await expect.poll(() => drawn(clock)).toBe(true);
  await page.mouse.move(1300, 800);
  await expect.poll(() => drawn(trash)).toBe(false);
  // Selected (clicked), with the pointer away again.
  await card.locator('.card-header').click({ position: { x: 40, y: 14 } });
  await page.mouse.move(1300, 800);
  await expect(card).toHaveClass(/selected/);
  await expect.poll(() => drawn(trash)).toBe(true);
  await expect.poll(() => drawn(clock)).toBe(true);
  // The collapse arrow keeps its icon always (it turns when collapsed).
  expect(await drawn(card.getByRole('button', { name: 'Collapse card' }))).toBe(true);
});
