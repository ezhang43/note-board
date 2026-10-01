import { expect, test, type Page } from '@playwright/test';

// Step 1: canvas, toolbar, pan and zoom, grid, and saving to the browser.

async function view(page: Page) {
  const c = page.getByTestId('canvas');
  return {
    panX: Number(await c.getAttribute('data-pan-x')),
    panY: Number(await c.getAttribute('data-pan-y')),
    zoom: Number(await c.getAttribute('data-zoom')),
  };
}

async function canvasBox(page: Page) {
  const box = await page.getByTestId('canvas').boundingBox();
  if (!box) throw new Error('canvas not visible');
  return box;
}

const zoomLabel = (page: Page) => page.getByRole('button', { name: 'Reset zoom' });

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  (page as Page & { errors: string[] }).errors = errors;
  await page.goto('/');
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { errors: string[] }).errors).toEqual([]);
});

test('first visit shows the toolbar in spec order and a 100% board', async ({ page }) => {
  await expect(page.getByLabel('Board name')).toHaveValue('My first board');
  const toolbar = page.locator('header.toolbar');
  const labels = await toolbar.locator('input, button').evaluateAll((els) =>
    els.map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim()),
  );
  expect(labels).toEqual([
    'Board name',
    'Hand (H)',
    'Select (V)',
    'Undo (Ctrl+Z)',
    'Redo (Ctrl+Y)',
    'Snap to grid',
    'Colour of selected block',
    'Auto-colour',
    'Collapse all',
    'Note',
    'To-do list',
    'Link',
    'New column',
    'Import',
    'Milanote Markdown file',
    'Clean up',
  ]);
  await expect(page.getByRole('button', { name: 'Hand (H)' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Snap to grid' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Undo (Ctrl+Z)' })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', { name: 'Redo (Ctrl+Y)' })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', { name: 'Colour of selected block' })).toHaveAttribute('aria-disabled', 'true');
  await expect(zoomLabel(page)).toHaveText('100%');
});

test('board name box grows and shrinks with its text', async ({ page }) => {
  const input = page.getByLabel('Board name');
  const start = (await input.boundingBox())!.width;
  await input.fill('A much, much longer board name than before');
  const longer = (await input.boundingBox())!.width;
  await input.fill('Hi');
  const shorter = (await input.boundingBox())!.width;
  expect(longer).toBeGreaterThan(start + 100);
  expect(shorter).toBeLessThan(start);
});

test('zoom buttons step by 20%, stop at 30% and 250%, and the percentage resets', async ({ page }) => {
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(zoomLabel(page)).toHaveText('120%');
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect(zoomLabel(page)).toHaveText('100%');

  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(zoomLabel(page)).toHaveText('250%');
  for (let i = 0; i < 20; i++) await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect(zoomLabel(page)).toHaveText('30%');

  await zoomLabel(page).click();
  await expect(zoomLabel(page)).toHaveText('100%');
});

test('reset keeps the middle of the screen in place', async ({ page }) => {
  const box = await canvasBox(page);
  const mid = { x: box.width / 2, y: box.height / 2 };
  const toBoard = (v: { panX: number; panY: number; zoom: number }) => ({
    x: (mid.x - v.panX) / v.zoom,
    y: (mid.y - v.panY) / v.zoom,
  });

  // Zoom in at a corner so the middle of the screen points somewhere new.
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await view(page)).zoom).toBeGreaterThan(1.5);

  const before = toBoard(await view(page));
  await zoomLabel(page).click();
  const after = await view(page);
  expect(after.zoom).toBe(1);
  expect(toBoard(after).x).toBeCloseTo(before.x, 0);
  expect(toBoard(after).y).toBeCloseTo(before.y, 0);
});

test('Ctrl + = / − / 0 zoom from the keyboard', async ({ page }) => {
  await page.getByTestId('canvas').click();
  await page.keyboard.press('Control+Equal');
  await expect(zoomLabel(page)).toHaveText('120%');
  await page.keyboard.press('Control+Minus');
  await page.keyboard.press('Control+Minus');
  await expect(zoomLabel(page)).toHaveText('83%');
  await page.keyboard.press('Control+0');
  await expect(zoomLabel(page)).toHaveText('100%');
});

test('Ctrl + scroll zooms around the cursor', async ({ page }) => {
  const box = await canvasBox(page);
  const cursor = { x: 300, y: 200 };
  await page.mouse.move(box.x + cursor.x, box.y + cursor.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await view(page)).zoom).toBeGreaterThan(1.2);
  // The board point under the cursor was 300,200 at 100% with no pan; it must still be there.
  const v = await view(page);
  expect((cursor.x - v.panX) / v.zoom).toBeCloseTo(300, 0);
  expect((cursor.y - v.panY) / v.zoom).toBeCloseTo(200, 0);
});

test('scrolling pans the board with either tool', async ({ page }) => {
  const box = await canvasBox(page);
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.wheel(120, 80);
  await expect.poll(async () => view(page)).toEqual({ panX: -120, panY: -80, zoom: 1 });

  await page.keyboard.press('v');
  await page.mouse.wheel(0, -30);
  await expect.poll(async () => (await view(page)).panY).toBe(-50);
});

test('Hand tool drags the board; Select tool does not', async ({ page }) => {
  const box = await canvasBox(page);
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 340, { steps: 5 });
  await page.mouse.up();
  expect(await view(page)).toEqual({ panX: 60, panY: 40, zoom: 1 });

  await page.getByRole('button', { name: 'Select (V)' }).click();
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 400, { steps: 5 });
  await page.mouse.up();
  expect(await view(page)).toEqual({ panX: 60, panY: 40, zoom: 1 });
});

test('H and V switch tools, but not while typing the board name', async ({ page }) => {
  const hand = page.getByRole('button', { name: 'Hand (H)' });
  const select = page.getByRole('button', { name: 'Select (V)' });

  await page.getByTestId('canvas').click();
  await page.keyboard.press('v');
  await expect(select).toHaveAttribute('aria-pressed', 'true');
  await expect(hand).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('h');
  await expect(hand).toHaveAttribute('aria-pressed', 'true');

  const name = page.getByLabel('Board name');
  await name.fill('');
  await name.pressSequentially('vh');
  await expect(name).toHaveValue('vh');
  await expect(hand).toHaveAttribute('aria-pressed', 'true');
});

test('snap toggle fades the grid dots', async ({ page }) => {
  const snap = page.getByRole('button', { name: 'Snap to grid' });
  const dots = () => page.getByTestId('canvas').evaluate((el) => getComputedStyle(el).backgroundImage);
  const on = await dots();
  await snap.click();
  await expect(snap).toHaveAttribute('aria-pressed', 'false');
  expect(await dots()).not.toEqual(on);
  await snap.click();
  expect(await dots()).toEqual(on);
});

test('board name, snap, pan and zoom are kept after reload', async ({ page }) => {
  await page.getByLabel('Board name').fill('Holiday plans');
  await page.getByRole('button', { name: 'Snap to grid' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  const box = await canvasBox(page);
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.wheel(50, 70);
  await expect.poll(async () => (await view(page)).panY).toBeLessThan(0);
  const before = await view(page);

  await page.reload();

  await expect(page.getByLabel('Board name')).toHaveValue('Holiday plans');
  await expect(page.getByRole('button', { name: 'Snap to grid' })).toHaveAttribute('aria-pressed', 'false');
  await expect(zoomLabel(page)).toHaveText('120%');
  expect(await view(page)).toEqual(before);
});

test('damaged saved data starts a fresh board instead of breaking', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('note-board:v1', '{not valid json');
    localStorage.setItem('note-board:view:v1', '"nope"');
  });
  await page.reload();
  await expect(page.getByLabel('Board name')).toHaveValue('My first board');
  await expect(zoomLabel(page)).toHaveText('100%');
});
