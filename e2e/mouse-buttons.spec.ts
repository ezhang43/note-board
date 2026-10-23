import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, box, clickEmpty, columns, emptySpot, freshBoardEachTest, grabPoint, importLinkCard, looseCards } from './helpers';

// Job 188 (owner request, 2026-10-22): there is no Hand / Select choice any more. Job 193 (owner request,
// 2026-10-23) swapped the two jobs: a left-drag on empty board pans it (closed glove while dragging); the
// middle button, or the left and right buttons held together, draw the selection box instead, anywhere
// on the board, over cards too.

freshBoardEachTest();

const canvas = (page: Page) => page.getByTestId('canvas');
const pan = async (page: Page) => ({ x: Number(await canvas(page).getAttribute('data-pan-x')), y: Number(await canvas(page).getAttribute('data-pan-y')) });
const cursorOf = (l: Locator) => l.evaluate((el) => getComputedStyle(el).cursor);

/** Records what the page did with each click-like event, after the app has had its say. */
async function watchEvents(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { seen: { type: string; button: number; prevented: boolean }[] };
    w.seen = [];
    for (const type of ['contextmenu', 'auxclick', 'click', 'mousedown'])
      window.addEventListener(type, (e) => w.seen.push({ type, button: (e as MouseEvent).button, prevented: e.defaultPrevented }));
  });
}
const seen = (page: Page) => page.evaluate(() => (window as unknown as { seen: { type: string; button: number; prevented: boolean }[] }).seen);

/** A note with some text, and a spot of it that is safe to press (its header). */
async function aNote(page: Page, text = 'Hello there') {
  await add(page, 'Note');
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  const card = looseCards(page).first();
  return { card, grab: await grabPoint(card) };
}

test('the toolbar has no Hand or Select buttons, and H and V do nothing', async ({ page }) => {
  await expect(page.getByRole('group', { name: 'Board tool' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Hand/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Select \(/ })).toHaveCount(0);
  await clickEmpty(page);
  await page.keyboard.press('h');
  await page.keyboard.press('v');
  await expect(canvas(page)).not.toHaveClass(/tool-/);
});

test('dragging empty board with the left button pans it with the closed glove, draws no box, and the arrow is back afterwards', async ({ page }) => {
  const { card } = await aNote(page);
  const before = await box(card);
  const start = await emptySpot(page);
  expect(await cursorOf(canvas(page))).toBe('default');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  expect(await cursorOf(canvas(page))).toBe('default'); // a press alone (a click) is not a drag
  await page.mouse.move(start.x + 60, start.y - 40, { steps: 6 });
  await expect(canvas(page)).toHaveClass(/panning/);
  expect(await cursorOf(canvas(page))).toContain('url(');
  await expect(page.getByTestId('marquee')).toHaveCount(0);
  await page.mouse.up();
  await expect(canvas(page)).not.toHaveClass(/panning/);
  expect(await cursorOf(canvas(page))).toBe('default');
  expect(await pan(page)).toEqual({ x: 60, y: -40 });
  const after = await box(card);
  expect(after.x).toBeCloseTo(before.x + 60, 0);
  expect(after.y).toBeCloseTo(before.y - 40, 0);
});

test('a left drag that starts on a card still moves the card and does not pan', async ({ page }) => {
  const { card, grab } = await aNote(page);
  const before = await box(card);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 100, grab.y + 60, { steps: 6 });
  await expect(canvas(page)).not.toHaveClass(/panning/);
  await page.mouse.up();
  expect(await pan(page)).toEqual({ x: 0, y: 0 });
  expect((await box(card)).x).toBeGreaterThan(before.x + 60);
});

for (const key of ['Control', 'Shift'] as const) {
  test(`${key} + left drag on empty board draws a selection box that adds to the selection, and does not pan`, async ({ page }) => {
    const first = await aNote(page, 'First');
    await add(page, 'Note');
    await page.keyboard.type('Second');
    await page.keyboard.press('Escape');
    const second = looseCards(page).nth(1);
    await first.card.click({ position: { x: 30, y: 10 } });
    await expect(first.card).toHaveClass(/selected/);
    const r = await box(second);
    const start = await emptySpot(page);
    await page.keyboard.down(key);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(r.x + 5, r.y + 5, { steps: 8 });
    await expect(page.getByTestId('marquee')).toBeVisible();
    await expect(canvas(page)).not.toHaveClass(/panning/);
    await page.mouse.up();
    await page.keyboard.up(key);
    await expect(page.getByTestId('marquee')).toHaveCount(0);
    await expect(first.card).toHaveClass(/selected/);
    await expect(second).toHaveClass(/selected/);
    expect(await pan(page)).toEqual({ x: 0, y: 0 });
  });
}

test('the middle button draws a selection box from empty space and from over a card, and never pans or drags the card', async ({ page }) => {
  const { card, grab } = await aNote(page);
  const before = await box(card);
  const start = await emptySpot(page);
  await watchEvents(page);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(before.x + 5, before.y + 5, { steps: 8 });
  await expect(page.getByTestId('marquee')).toBeVisible();
  await expect(card).toHaveClass(/selected/); // selected while still dragging
  await expect(canvas(page)).not.toHaveClass(/panning/);
  expect(await cursorOf(canvas(page))).toBe('default');
  await page.mouse.up({ button: 'middle' });
  await expect(page.getByTestId('marquee')).toHaveCount(0);
  expect(await pan(page)).toEqual({ x: 0, y: 0 });

  // Starting over the card: a box, not a drag of the card (and the old selection is replaced).
  await clickEmpty(page);
  await expect(card).not.toHaveClass(/selected/);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(grab.x + 120, grab.y + 90, { steps: 6 });
  await expect(page.getByTestId('marquee')).toBeVisible();
  await expect(card).toHaveClass(/selected/);
  await page.mouse.up({ button: 'middle' });
  expect(await pan(page)).toEqual({ x: 0, y: 0 });
  const after = await box(card);
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);

  // The browser's own middle-button work (autoscroll, open in a new tab, paste) is always refused on the board.
  const middles = (await seen(page)).filter((e) => e.button === 1 && (e.type === 'mousedown' || e.type === 'auxclick'));
  expect(middles.length).toBeGreaterThan(0);
  for (const e of middles) expect(e.prevented, e.type).toBe(true);
});

test('Shift + the middle button adds to the selection; without Shift it starts a new one', async ({ page }) => {
  const first = await aNote(page, 'First');
  await add(page, 'Note');
  await page.keyboard.type('Second');
  await page.keyboard.press('Escape');
  const second = looseCards(page).nth(1);
  await first.card.click({ position: { x: 30, y: 10 } });
  const r = await box(second);
  const start = await emptySpot(page);
  await page.keyboard.down('Shift');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(r.x + 5, r.y + 5, { steps: 8 });
  await page.mouse.up({ button: 'middle' });
  await page.keyboard.up('Shift');
  await expect(first.card).toHaveClass(/selected/);
  await expect(second).toHaveClass(/selected/);
  await page.mouse.move(r.x + 10, r.y + 10); // a small box on the second note only
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(r.x + 30, r.y + 30, { steps: 4 });
  await page.mouse.up({ button: 'middle' });
  await expect(first.card).not.toHaveClass(/selected/);
  await expect(second).toHaveClass(/selected/);
});

test('the middle button over a link card draws a box and never opens the link', async ({ page }) => {
  await clickEmpty(page);
  const link = await importLinkCard(page);
  const open = link.locator('.link-open');
  await open.scrollIntoViewIfNeeded();
  const r = await box(open);
  await watchEvents(page);
  let popups = 0;
  page.context().on('page', () => popups++);
  const at = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(at.x + 50, at.y + 30, { steps: 5 });
  await expect(page.getByTestId('marquee')).toBeVisible();
  await page.mouse.up({ button: 'middle' });
  expect(await pan(page)).toEqual({ x: 0, y: 0 });
  await page.waitForTimeout(300);
  expect(popups).toBe(0);
  for (const e of (await seen(page)).filter((e) => e.type === 'auxclick')) expect(e.prevented).toBe(true);
});

for (const order of ['left then right', 'right then left'] as const) {
  test(`left and right held together draw a selection box (${order}), with no menu, pan or block drag`, async ({ page }) => {
    const { card } = await aNote(page);
    const before = await box(card);
    const start = await emptySpot(page);
    await watchEvents(page);

    await page.mouse.move(start.x, start.y);
    const [first, second] = order === 'left then right' ? (['left', 'right'] as const) : (['right', 'left'] as const);
    await page.mouse.down({ button: first });
    await page.mouse.down({ button: second });
    await page.mouse.move(before.x + 5, before.y + 5, { steps: 8 });
    await expect(page.getByTestId('marquee')).toBeVisible();
    await expect(card).toHaveClass(/selected/);
    await expect(canvas(page)).not.toHaveClass(/panning/);
    expect(await cursorOf(canvas(page))).toBe('default');
    await page.mouse.up({ button: 'right' });
    await page.mouse.up({ button: 'left' });
    await expect(page.getByTestId('marquee')).toHaveCount(0);
    expect(await pan(page)).toEqual({ x: 0, y: 0 });
    const after = await box(card);
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);

    // No context menu: every one the page was sent after both buttons were down was refused.
    // (Pressing the right button first can't be known to be half of a pair on systems whose menu opens on press.)
    const menus = (await seen(page)).filter((e) => e.type === 'contextmenu');
    if (order === 'left then right') for (const e of menus) expect(e.prevented).toBe(true);
  });
}

test('left and right together over a card: the card is not dragged, and a drag already begun is cancelled', async ({ page }) => {
  const { card, grab } = await aNote(page);
  const before = await box(card);
  // Left-drag the note a little (a block drag has begun), then the right button joins.
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 40, grab.y + 30, { steps: 5 });
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(grab.x + 120, grab.y + 90, { steps: 6 });
  await expect(page.getByTestId('marquee')).toBeVisible();
  await page.mouse.up({ button: 'right' });
  await page.mouse.up();
  await expect(page.getByTestId('marquee')).toHaveCount(0);
  expect(await pan(page)).toEqual({ x: 0, y: 0 });
  await expect(page.locator('.card.dragging')).toHaveCount(0);
  const after = await box(card);
  // The card is back where it was (the drag that had begun was cancelled), not left 40px away.
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
});

test('left and right together on empty board after a left pan had begun: the pan stops and a box starts', async ({ page }) => {
  const start = await emptySpot(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 30, start.y - 20, { steps: 3 });
  await expect(canvas(page)).toHaveClass(/panning/);
  await page.mouse.down({ button: 'right' });
  await expect(canvas(page)).not.toHaveClass(/panning/);
  const panned = await pan(page);
  await page.mouse.move(start.x + 130, start.y - 90, { steps: 5 });
  await expect(page.getByTestId('marquee')).toBeVisible();
  expect(await pan(page)).toEqual(panned);
  await page.mouse.up({ button: 'right' });
  await page.mouse.up();
});

test('left and right together over text leave no text selection behind and do not open a link', async ({ page }) => {
  const { card } = await aNote(page, 'Some words to be tempted by');
  const field = card.locator('textarea').first();
  const r = await box(field);
  await page.mouse.move(r.x + 4, r.y + 8);
  await page.mouse.down();
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(r.x + r.width - 4, r.y + 12, { steps: 8 });
  await page.mouse.move(r.x + r.width + 80, r.y + 60, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await page.mouse.up();
  const selected = await page.evaluate(() => {
    const a = document.activeElement as HTMLTextAreaElement | null;
    return { page: window.getSelection()?.toString() ?? '', field: a && 'selectionStart' in a ? a.value.slice(a.selectionStart ?? 0, a.selectionEnd ?? 0) : '' };
  });
  expect(selected).toEqual({ page: '', field: '' });
});

test('left and right together over a link card draw a box and do not open the link', async ({ page }) => {
  await clickEmpty(page);
  const link = await importLinkCard(page);
  const open = link.locator('.link-open');
  const r = await box(open);
  const at = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  await watchEvents(page);
  let popups = 0;
  page.context().on('page', () => popups++);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(at.x, at.y + 40, { steps: 4 });
  await expect(page.getByTestId('marquee')).toBeVisible();
  await page.mouse.move(at.x, at.y, { steps: 4 }); // back over the link, so the browser would call it a click
  await page.mouse.up({ button: 'right' });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(popups).toBe(0);
  const clicks = (await seen(page)).filter((e) => e.type === 'click');
  for (const e of clicks) expect(e.prevented).toBe(true);
});

test('releasing either button ends the box', async ({ page }) => {
  const start = await emptySpot(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(start.x + 30, start.y - 30, { steps: 3 });
  await expect(page.getByTestId('marquee')).toBeVisible();
  await page.mouse.up({ button: 'left' });
  await expect(page.getByTestId('marquee')).toHaveCount(0);
  await page.mouse.move(start.x + 90, start.y - 80, { steps: 4 });
  await expect(page.getByTestId('marquee')).toHaveCount(0);
  expect(await pan(page)).toEqual({ x: 0, y: 0 }); // the right button alone, still down, does not pan either
  await page.mouse.up({ button: 'right' });

  // The middle button alone: letting go ends it.
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(start.x + 20, start.y - 20, { steps: 3 });
  await expect(page.getByTestId('marquee')).toBeVisible();
  await page.mouse.up({ button: 'middle' });
  await expect(page.getByTestId('marquee')).toHaveCount(0);
  await page.mouse.move(start.x + 80, start.y - 60, { steps: 3 });
  await expect(page.getByTestId('marquee')).toHaveCount(0);
});

test('the window losing focus ends the box', async ({ page }) => {
  const start = await emptySpot(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(start.x + 20, start.y - 20, { steps: 3 });
  await expect(page.getByTestId('marquee')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByTestId('marquee')).toHaveCount(0);
  await page.mouse.move(start.x + 90, start.y - 30, { steps: 3 });
  await expect(page.getByTestId('marquee')).toHaveCount(0);
  await page.mouse.up({ button: 'middle' });
});

test('over a container: the middle button and both buttons draw a box without dragging it', async ({ page }) => {
  await add(page, 'New container');
  await page.keyboard.press('Escape');
  const col = columns(page).first();
  const g = await grabPoint(col);
  const before = await box(col);
  await page.mouse.move(g.x, g.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(g.x + 50, g.y + 20, { steps: 4 });
  await expect(page.getByTestId('marquee')).toBeVisible();
  await page.mouse.up({ button: 'middle' });
  await page.mouse.move(g.x + 50, g.y + 20);
  await page.mouse.down();
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(g.x + 80, g.y + 50, { steps: 4 });
  await expect(page.getByTestId('marquee')).toBeVisible();
  await page.mouse.up({ button: 'right' });
  await page.mouse.up();
  expect(await pan(page)).toEqual({ x: 0, y: 0 });
  const after = await box(col);
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
});

test('with a panel over the board, the middle button draws no box', async ({ page }) => {
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: /shortcuts/i })).toBeVisible();
  const start = await emptySpot(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(start.x + 60, start.y - 20, { steps: 4 });
  await expect(page.getByTestId('marquee')).toHaveCount(0);
  await page.mouse.up({ button: 'middle' });
  expect(await pan(page)).toEqual({ x: 0, y: 0 });
});

test('a selection box drawn with the middle button at the bottom edge keeps moving the board', async ({ page }) => {
  const c = await box(canvas(page));
  const before = await pan(page);
  await page.mouse.move(c.x + 40, c.y + 40);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(c.x + 300, c.y + c.height - 3, { steps: 10 });
  await expect.poll(async () => (await pan(page)).y).toBeLessThan(before.y - 50);
  await expect.poll(async () => (await page.getByTestId('marquee').boundingBox())?.height ?? 0).toBeGreaterThan(c.height - 80);
  await page.mouse.up({ button: 'middle' });
});

test('a left click on the board still clears the selection and a right click is left alone', async ({ page }) => {
  const { card } = await aNote(page);
  await card.click({ position: { x: 30, y: 10 } });
  await expect(card).toHaveClass(/selected/);
  await watchEvents(page);
  await clickEmpty(page);
  await expect(card).not.toHaveClass(/selected/);
  const s = await emptySpot(page);
  await page.mouse.click(s.x, s.y, { button: 'right' });
  const menus = (await seen(page)).filter((e) => e.type === 'contextmenu');
  expect(menus.every((e) => !e.prevented)).toBe(true);
  expect(await pan(page)).toEqual({ x: 0, y: 0 });
});
