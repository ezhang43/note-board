import { expect, test, type Page } from '@playwright/test';
import { add, cards, freshBoardEachTest } from './helpers';

// Web addresses, pictures and videos put on the board by pasting or dropping them (job 124).
// Nothing is uploaded; the page only ever shows media from its web address. No test needs the internet.

freshBoardEachTest();

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const link = (page: Page) => page.locator('[data-kind="link"]');

/** Paste `text` (and maybe a file) onto the page, as the browser does after Ctrl+V. */
async function paste(page: Page, target: string, text: string, file = false) {
  await page.evaluate(
    ([sel, t, f]) => {
      const dt = new DataTransfer();
      if (t) dt.setData('text/plain', t);
      if (f) dt.items.add(new File(['x'], 'shot.png', { type: 'image/png' }));
      const el = sel === 'body' ? document.body : document.querySelector(sel)!;
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    [target, text, file] as const,
  );
}

/** Drop onto the board at a spot, carrying dragged address text and/or a file. */
async function drop(page: Page, at: { x: number; y: number }, data: Record<string, string>, file = false) {
  await page.evaluate(
    ([p, d, f]) => {
      const dt = new DataTransfer();
      for (const [type, value] of Object.entries(d)) dt.setData(type, value);
      if (f) dt.items.add(new File(['x'], 'photo.png', { type: 'image/png' }));
      const el = document.elementFromPoint(p.x, p.y)!;
      el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: p.x, clientY: p.y }));
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: p.x, clientY: p.y }));
    },
    [at, data, file] as const,
  );
}

test('pasting a web address makes a selected link card, and one undo removes it', async ({ page }) => {
  await paste(page, 'body', 'https://example.com/page');
  await expect(link(page)).toHaveCount(1);
  await expect(link(page)).toHaveClass(/selected/);
  await expect(link(page).getByLabel('Link address')).toHaveValue('https://example.com/page');
  await expect(link(page).locator('img, iframe, video')).toHaveCount(0); // an ordinary link card
  await page.keyboard.press('Control+z');
  await expect(link(page)).toHaveCount(0);
});

test('an image address shows the picture, with alt text, and nothing is a broken image', async ({ page }) => {
  await page.route('https://pics.example.test/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
  await paste(page, 'body', 'https://pics.example.test/cat.png?w=200');
  const img = link(page).locator('img');
  await expect(img).toHaveAttribute('src', 'https://pics.example.test/cat.png?w=200');
  await expect(img).toHaveAttribute('loading', 'lazy');
  await expect(img).toHaveAttribute('alt', /.+/);
});

test('an image that does not load falls back to the ordinary link card', async ({ page }) => {
  await page.route('https://pics.example.test/**', (r) => r.abort());
  await paste(page, 'body', 'https://pics.example.test/gone.png');
  await expect(link(page)).toHaveCount(1);
  await expect(link(page).locator('img')).toHaveCount(0);
  await expect(link(page).getByLabel('Link address')).toBeVisible();
});

test('a YouTube address shows a locked-down embedded player', async ({ page }) => {
  await page.route('https://www.youtube-nocookie.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<p>player</p>' }));
  await paste(page, 'body', 'https://youtu.be/dQw4w9WgXcQ');
  const frame = link(page).locator('iframe');
  await expect(frame).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  await expect(frame).toHaveAttribute('allow', 'fullscreen; picture-in-picture');
  const sandbox = (await frame.getAttribute('sandbox')) ?? '';
  expect(sandbox).toContain('allow-scripts');
  expect(sandbox).not.toContain('allow-top-navigation');
  expect(sandbox).not.toContain('allow-forms');
});

test('an mp4 address shows a video with controls', async ({ page }) => {
  await page.route('https://videos.example.test/**', () => {}); // never answers: the video is still loading, so it stays on the card
  await paste(page, 'body', 'https://videos.example.test/clip.mp4');
  const video = link(page).locator('video');
  await expect(video).toHaveAttribute('src', 'https://videos.example.test/clip.mp4');
  await expect(video).toHaveAttribute('preload', 'metadata');
  await expect(video).toHaveAttribute('controls', '');
});

test('a video that cannot play falls back to the ordinary link card', async ({ page }) => {
  await page.route('https://videos.example.test/**', (r) => r.abort());
  await paste(page, 'body', 'https://videos.example.test/clip.mp4');
  await expect(link(page)).toHaveCount(1);
  await expect(link(page).locator('video')).toHaveCount(0);
});

test('clicking media on a card that is not selected selects the card instead of playing', async ({ page }) => {
  await page.route('https://www.youtube-nocookie.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<p>player</p>' }));
  await paste(page, 'body', 'https://youtu.be/dQw4w9WgXcQ');
  await page.locator('[data-testid="canvas"]').click({ position: { x: 5, y: 5 } }); // clears the selection
  await expect(link(page)).not.toHaveClass(/selected/);
  await link(page).locator('iframe').click({ force: true });
  await expect(link(page)).toHaveClass(/selected/);
});

test('pasting a web address while typing in a text field stays plain text', async ({ page }) => {
  await add(page, 'Note');
  const note = cards(page).first().locator('textarea, [contenteditable]').first();
  await note.focus();
  await paste(page, 'textarea', 'https://example.com/typed');
  await expect(link(page)).toHaveCount(0);
  await expect(cards(page)).toHaveCount(1);
});

/** Select the only card on the board, ready to copy. */
async function selectOnlyCard(page: Page) {
  await add(page, 'Note');
  await page.keyboard.press('Escape');
  await page.locator('[data-card-id]').first().click({ position: { x: 8, y: 18 } });
}

// The newest copy wins: cards copied in the app, or an address copied after them (real keys and the real clipboard).
test('copying a card and pasting still duplicates it, and one undo removes the copy', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await selectOnlyCard(page);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(cards(page)).toHaveCount(2);
  await expect(link(page)).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(cards(page)).toHaveCount(1);
});

test('a web address copied after copying a card is what Ctrl+V pastes', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await selectOnlyCard(page);
  await page.keyboard.press('Control+c');
  await page.evaluate(() => navigator.clipboard.writeText('https://example.com/copied-later')); // copied in another tab or app
  await page.keyboard.press('Control+v');
  await expect(link(page)).toHaveCount(1);
  await expect(link(page).getByLabel('Link address')).toHaveValue('https://example.com/copied-later');
  await expect(cards(page)).toHaveCount(2); // the original note and the link card, no copy of the note
});

test('if the browser refuses to write to the clipboard, Ctrl+V still pastes the copied cards', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => (document.execCommand = () => false));
  await selectOnlyCard(page);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(cards(page)).toHaveCount(2);
  await expect(link(page)).toHaveCount(0);
});

test('cards copied after an address are what Ctrl+V pastes', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => navigator.clipboard.writeText('https://example.com/copied-first'));
  await selectOnlyCard(page);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(cards(page)).toHaveCount(2);
  await expect(link(page)).toHaveCount(0);
});

test('dropping an address from another page makes a link card where it was dropped', async ({ page }) => {
  await drop(page, { x: 500, y: 400 }, { 'text/uri-list': 'https://example.com/dragged', 'text/plain': 'https://example.com/dragged' });
  await expect(link(page)).toHaveCount(1);
  await expect(link(page).getByLabel('Link address')).toHaveValue('https://example.com/dragged');
  const b = (await link(page).boundingBox())!;
  expect(Math.abs(b.x + b.width / 2 - 500)).toBeLessThan(80);
  await page.keyboard.press('Control+z');
  await expect(link(page)).toHaveCount(0);
});

test('dropping an address onto a container puts the card into it', async ({ page }) => {
  await add(page, 'New container');
  const col = page.locator('[data-col-id]').first();
  const b = (await col.boundingBox())!;
  await drop(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, { 'text/uri-list': 'https://example.com/in-column' });
  await expect(col.locator('[data-kind="link"]')).toHaveCount(1);
});

test('a video on a selected card keeps its own controls (the press is not taken over by a card drag)', async ({ page }) => {
  await page.route('https://videos.example.test/**', () => {});
  await paste(page, 'body', 'https://videos.example.test/clip.mp4');
  const taken = await link(page).locator('video').evaluate((v) => {
    const e = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse' });
    v.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(taken).toBe(false);
  await expect(link(page)).toHaveClass(/selected/);
});

test('a paste or drop while the Journal panel is open adds nothing to the board behind it', async ({ page }) => {
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Journal' })).toBeVisible();
  await page.locator('body').evaluate((b) => (document.activeElement as HTMLElement | null)?.blur?.() ?? b);
  await paste(page, 'body', 'https://example.com/behind-panel');
  await drop(page, { x: 400, y: 400 }, { 'text/uri-list': 'https://example.com/behind-panel' });
  await expect(link(page)).toHaveCount(0);
});

test('a dropped file shows a friendly message and adds nothing', async ({ page }) => {
  await drop(page, { x: 500, y: 400 }, {}, true);
  await expect(page.getByText('Images from your computer can’t be added yet. Paste a web address instead.')).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
});

test('a pasted screenshot shows the same message', async ({ page }) => {
  await paste(page, 'body', '', true);
  await expect(page.getByText('Images from your computer can’t be added yet. Paste a web address instead.')).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
});

test('a javascript: or data: address never becomes a card or media', async ({ page }) => {
  await paste(page, 'body', 'javascript:alert(1)//x.png');
  await paste(page, 'body', 'data:image/png;base64,AAAA');
  await drop(page, { x: 500, y: 400 }, { 'text/uri-list': 'javascript:alert(1)' });
  await expect(cards(page)).toHaveCount(0);
  await expect(page.locator('img[src^="data:"], img[src^="javascript:"], iframe, video')).toHaveCount(0);
});

test('a link card already saved with a javascript: address shows no media', async ({ page }) => {
  await paste(page, 'body', 'https://example.com/ok');
  await link(page).getByLabel('Link address').fill('javascript:alert(1)//x.png');
  await expect(link(page).locator('img, iframe, video')).toHaveCount(0);
});
