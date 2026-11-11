import { expect, test, type Browser, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { add, cards, fontsLoaded } from './helpers';
import { clearViolations, cspGuard, violations } from './csp-guard';

// Content Security Policy (job 11): the flows tested here, in `npm run dev`, break none of the page's
// rules on where scripts, frames and requests may come from. The published build is checked in
// published-csp.spec.ts. No test needs the internet: a blocked request is refused before it leaves.

const tag = () => Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, '');
const toolbar = (page: Page) => page.locator('header.toolbar');

async function open(page: Page, user = `Csp${tag()}`, path = '/') {
  await cspGuard(page);
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}demo-user=${user}`);
  await fontsLoaded(page);
  await expect(page.getByTestId('canvas')).toBeVisible();
}

async function fileMenu(page: Page, item: string) {
  await toolbar(page).getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

async function paste(page: Page, text: string) {
  await page.evaluate((t) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
}

test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

test('the page carries the policy, and it really blocks a request to a site not on its list', async ({ page }) => {
  await open(page);
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain("object-src 'none'");
  // The policy is in force: a request elsewhere is refused and reported (then cleared, so the afterEach check passes).
  const refused = await page.evaluate(() => fetch('https://not-allowed.example/steal').then(() => 'sent', () => 'refused'));
  expect(refused).toBe('refused');
  await expect.poll(() => violations(page)).toEqual(
    expect.arrayContaining([expect.stringContaining('connect-src https://not-allowed.example'), expect.stringMatching(/^console: .*not-allowed\.example/)]),
  );
  await clearViolations(page);
});

test('editing a note and a checklist, undo and redo, and the focus timer', async ({ page }) => {
  await open(page);
  await add(page, 'Note');
  await page.keyboard.type('Hello');
  await add(page, 'Checklist');
  await page.keyboard.type('Milk');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Eggs');
  await expect(cards(page)).toHaveCount(2);
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 300);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y');
  await page.locator('.corner-controls').getByRole('button', { name: 'Focus timer' }).click();
  await page.keyboard.press('Escape');
});

test('the Google Calendar panel shows events (the pretend calendar)', async ({ page }) => {
  await open(page);
  await page.locator('.corner-controls').getByRole('button', { name: 'Google Calendar' }).click();
  const panel = page.getByRole('complementary', { name: 'Google Calendar' });
  await expect(panel.getByRole('button', { name: /Dentist/ }).first()).toBeVisible();
});

async function person(browser: Browser, name: string, path = '/') {
  const page = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).newPage();
  await cspGuard(page);
  await page.addInitScript(() => localStorage.setItem('note-board:tour-done', '1'));
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}demo-user=${name}`);
  await expect(page.getByTestId('canvas')).toBeVisible();
  return page;
}

test('sharing a board, and someone joining it with the link', async ({ page, browser }) => {
  const t = tag();
  await open(page, `Alice${t}`);
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('menu', { name: 'Boards' }).getByRole('menuitem', { name: 'New board' }).click();
  await page.getByLabel('Board name').fill('Trip');
  await add(page, 'Note');
  await page.keyboard.type('Tent');
  await toolbar(page).getByRole('button', { name: 'Share' }).click();
  const panel = page.getByRole('dialog', { name: /Share/ });
  await panel.getByRole('button', { name: 'Share this board' }).click();
  await expect(panel.getByLabel('Share link')).toHaveValue(/\?join=/);
  const link = (await panel.getByLabel('Share link').inputValue()).replace(/^https?:\/\/[^/]+/, '');
  const bob = await person(browser, `Bob${t}`, link);
  await expect(bob.locator('article[data-kind="note"]')).toHaveCount(1);
  expect(await violations(bob)).toEqual([]);
  await bob.context().close();
});

test('backup download and restore, Download as text, and PDF import', async ({ page }, info) => {
  await open(page);
  await add(page, 'Note');
  await page.keyboard.type('Keep me');
  const waiting = page.waitForEvent('download');
  await fileMenu(page, 'Download backup');
  const backup = readFileSync((await (await waiting).path())!, 'utf8');
  const file = info.outputPath('backup.json');
  writeFileSync(file, backup);
  let chooser = page.waitForEvent('filechooser');
  await fileMenu(page, 'Restore from backup…');
  await (await chooser).setFiles(file);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Replace board' }).click();
  await expect(cards(page)).toHaveCount(1);

  const text = page.waitForEvent('download');
  await fileMenu(page, 'Download as text');
  await text;

  chooser = page.waitForEvent('filechooser');
  await fileMenu(page, 'Import file…');
  await (await chooser).setFiles(fileURLToPath(new URL('./fixtures/pdf-sample.pdf', import.meta.url)));
  await expect(cards(page)).toHaveCount(5, { timeout: 20_000 }); // pdf.js and its reader (a worker) loaded and ran
});

test('pictures, videos and players on link cards, and the picture and PDF downloads', async ({ page }) => {
  await open(page);
  const red = await page.evaluate(() => {
    const c = Object.assign(document.createElement('canvas'), { width: 40, height: 40 });
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 40, 40);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.route('https://pics.example.test/**', (r) =>
    r.fulfill({ contentType: 'image/png', body: Buffer.from(red, 'base64'), headers: { 'Access-Control-Allow-Origin': '*' } }),
  );
  await page.route('https://www.youtube-nocookie.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<p>player</p>' }));
  await page.route('https://player.vimeo.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<p>player</p>' }));
  await paste(page, 'https://pics.example.test/red.png');
  await expect(page.locator('[data-kind="link"] img')).toHaveCount(1);
  await page.mouse.click(5, 300);
  await paste(page, 'https://youtu.be/dQw4w9WgXcQ');
  await page.mouse.click(5, 300);
  await paste(page, 'https://vimeo.com/123456');
  await expect(page.locator('[data-kind="link"] iframe')).toHaveCount(2);
  await expect(page.frameLocator('iframe[src*="youtube-nocookie"]').locator('p')).toHaveText('player');

  for (const item of ['Download as picture (PNG)', 'Download as PDF']) {
    const waiting = page.waitForEvent('download');
    await fileMenu(page, item);
    await waiting;
  }
});

test('a picture from another site that allows it is still drawn into the picture download', async ({ page }) => {
  await open(page);
  const red = await page.evaluate(() => {
    const c = Object.assign(document.createElement('canvas'), { width: 400, height: 300 });
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 400, 300);
    return c.toDataURL('image/png').split(',')[1];
  });
  const referers: (string | undefined)[] = [];
  await page.route('https://pics.example.test/**', (r) => {
    referers.push(r.request().headers()['referer']);
    return r.fulfill({ contentType: 'image/png', body: Buffer.from(red, 'base64'), headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await paste(page, 'https://pics.example.test/red.png');
  await expect(page.locator('[data-kind="link"] img')).toHaveCount(1);
  const waiting = page.waitForEvent('download');
  await fileMenu(page, 'Download as picture (PNG)');
  const png = readFileSync((await (await waiting).path())!);
  const redPixels = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] > 240 && px[i + 1] < 20 && px[i + 2] < 20) n++;
    return n;
  }, png.toString('base64'));
  expect(redPixels).toBeGreaterThan(1000);
  // Copied in as the card shows it: without telling the picture's site which page asked (as the card's own picture).
  expect(referers.length).toBeGreaterThanOrEqual(2);
  expect(referers.filter(Boolean)).toEqual([]);
});

test('a picture whose site never answers doesn’t hold up the picture download', async ({ page }) => {
  await open(page);
  await page.route('https://slow.example.test/**', () => {}); // never answered
  await paste(page, 'https://slow.example.test/never.png');
  await expect(page.locator('[data-kind="link"]')).toHaveCount(1);
  await page.mouse.click(5, 300);
  await add(page, 'Note');
  await page.keyboard.type('Still saved');
  const waiting = page.waitForEvent('download', { timeout: 20_000 });
  await fileMenu(page, 'Download as picture (PNG)');
  await waiting;
});

test('the website pages', async ({ page }) => {
  await cspGuard(page);
  for (const path of ['/about/', '/faq/', '/terms/', '/privacy/', '/delete-account/']) {
    await page.goto(path);
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
    await page.waitForLoadState('networkidle');
    expect(await violations(page), path).toEqual([]);
  }
});
