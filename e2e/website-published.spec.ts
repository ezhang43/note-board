import { expect, test } from '@playwright/test';

// Job 29: the website pages on the published build (served under /note-board/, as GitHub Pages does).

test('the website pages are published beside the app, with working links', async ({ page }) => {
  for (const [path, h1] of [
    ['about/', 'Free, with no limits. Your notes stay safe.'],
    ['faq/', 'Questions and answers'],
    ['terms/', 'Terms of use'],
    ['privacy/', 'Privacy policy'],
    ['delete-account/', 'Delete your account'],
  ]) {
    const res = await page.goto(path);
    expect(res?.ok(), path).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(h1);
    // The stylesheet and the ant icon load under /note-board/.
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  }
  await page.goto('about/');
  // The demo video is there, autoplays and loops, and its clip loads under /note-board/.
  const video = page.locator('.hero video');
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute('autoplay', '');
  expect(await video.evaluate((v: HTMLVideoElement) => v.loop && v.muted)).toBe(true);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => /\/note-board\/assets\/demo-.*\.(webm|mp4)$/.test(v.currentSrc) && v.readyState >= 2)).toBe(true);
  // Its poster (light and dark) is a real file in the build, not a broken address.
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('about/');
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => new Promise<number>((r) => { const i = new Image(); i.onload = () => r(i.naturalWidth); i.onerror = () => r(0); i.src = v.poster; })), scheme).toBeGreaterThan(0);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.poster), scheme).toMatch(scheme === 'dark' ? /board-dark-.*\.webp$/ : /board-(?!dark).*\.webp$/);
  }
  await page.getByRole('link', { name: 'Start your board, free' }).first().click();
  await expect(page).toHaveURL(/\/note-board\/$/);
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
});

test('visiting a website page never replaces the offline copy of the app', async ({ page, context, browserName }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(async () => (await (await caches.open('busyants-v6')).keys()).length))
    .toBeGreaterThan(2);

  await page.goto('faq/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Questions and answers');

  // Playwright's WebKit can't fake offline for a page with a service worker (it blocks requests
  // before the worker sees them; the worker itself answers from its saved copy). Checked up to here.
  test.skip(browserName === 'webkit', "Playwright's WebKit can't fake offline past a service worker");
  await context.setOffline(true);
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await context.setOffline(false);
});

// Job 117: the usage counter (GoatCounter) is in every published page, but only talks to the outside on the real site.
test('every published page carries the GoatCounter loader, and nothing is requested from it on localhost', async ({ page }) => {
  const counted: string[] = [];
  page.on('request', (r) => /gc\.zgo\.at|goatcounter\.com/.test(r.url()) && counted.push(r.url()));
  for (const path of ['./', 'about/', 'faq/', 'terms/', 'privacy/', 'delete-account/']) {
    const html = await (await page.request.get(path)).text();
    expect(html, path).toContain('https://gc.zgo.at/count.js');
    expect(html, path).toContain('https://busyants.goatcounter.com/count');
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  expect(counted).toEqual([]);
});

// Job 117: on the real address the counter is added, with the owner's site code, and is given the path only (a share link's key is never sent).
test('on the published address the counter is added and sent the page path without the query', async ({ page, baseURL }) => {
  const local = new URL(baseURL!).origin;
  // Pretend the build is served from the published address; the counter's own script is a stub that records how it was added.
  await page.route('https://ezhang43.github.io/note-board/**', async (route) => route.fulfill({ response: await route.fetch({ url: route.request().url().replace('https://ezhang43.github.io', local) }) }));
  await page.route('https://gc.zgo.at/count.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.__gc = { site: document.currentScript.dataset.goatcounter, settings: document.currentScript.dataset.goatcounterSettings };' }));
  await page.goto('https://ezhang43.github.io/note-board/about/?join=s_ab12cd34.k3y9secret');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __gc?: unknown }).__gc)).toEqual({ site: 'https://busyants.goatcounter.com/count', settings: '{"path":"/note-board/about/"}' });
});
