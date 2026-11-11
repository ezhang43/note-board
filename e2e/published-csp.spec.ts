import { expect, test, type Page } from '@playwright/test';
import { cspGuard, clearViolations, violations } from './csp-guard';

// Content Security Policy (job 11) on the published build, served as GitHub Pages serves it: every
// page carries it, nothing on them breaks it, and what sign-in, sync, the calendar and the Anthropic
// API need is allowed. Google can't be reached from the tests, but the policy is checked before a
// request leaves the browser, so each allowed address is tried here against a stand-in answer.

const PAGES = ['./', 'about/', 'faq/', 'terms/', 'privacy/', 'delete-account/'];
const policy = (page: Page) => page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');

test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

test('all six pages carry the policy, before any script or stylesheet, and break none of it', async ({ page }) => {
  await cspGuard(page);
  for (const path of PAGES) {
    await page.goto(path);
    const p = await policy(page);
    expect(p, path).toContain("default-src 'self'");
    expect(p, path).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    // Before any script, stylesheet or font link in the page's head.
    const first = await page.evaluate(() => [...document.head.children].findIndex((el) => el.matches('script, link[rel="stylesheet"], link[rel="preconnect"], style')));
    const at = await page.evaluate(() => [...document.head.children].findIndex((el) => el.matches('meta[http-equiv="Content-Security-Policy"]')));
    expect(at, path).toBeGreaterThanOrEqual(0);
    expect(at, path).toBeLessThan(first);
    await page.waitForLoadState('networkidle');
    expect(await violations(page), path).toEqual([]);
  }
});

test("the About page's own script (which picks the light or dark demo clip) still runs", async ({ page }) => {
  await cspGuard(page);
  await page.goto('about/');
  await expect(page.locator('.demo video')).toHaveAttribute('src', /demo/);
});

test('the policy is in force: a request or a script from a site not on its list is refused', async ({ page }) => {
  await cspGuard(page);
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  expect(await page.evaluate(() => fetch('https://not-allowed.example/x').then(() => 'sent', () => 'refused'))).toBe('refused');
  await page.evaluate(() => {
    const s = document.createElement('script');
    s.src = 'https://not-allowed.example/x.js';
    document.head.append(s);
  });
  await expect.poll(async () => (await violations(page)).filter((v) => !v.startsWith('console:'))).toEqual([
    expect.stringContaining('connect-src https://not-allowed.example'),
    expect.stringContaining('script-src-elem https://not-allowed.example'),
  ]);
  await clearViolations(page);
});

test('Sign in with Google loads what Firebase needs for its window (Google’s gapi loader), without breaking the policy', async ({ page }) => {
  await cspGuard(page);
  // Stand-ins for Google, so nothing leaves the computer: the loader, Firebase's sign-in frame and window.
  const asked: string[] = [];
  await page.route('https://apis.google.com/**', (r) => (asked.push(r.request().url()), r.fulfill({ contentType: 'text/javascript', body: '' })));
  await page.route('https://note-board-a672a.firebaseapp.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<p>auth</p>' }));
  await page.route('https://identitytoolkit.googleapis.com/**', (r) => r.fulfill({ status: 400, contentType: 'application/json', body: '{}' }));
  await page.goto('./');
  // Firebase loads the loader (to open its hidden frame) before it opens Google's window; the
  // stand-in loader never answers, so no window opens.
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await expect.poll(() => asked.some((u) => u.startsWith('https://apis.google.com/js/api.js'))).toBe(true);
});

test('sign-in, sync, the calendar and the Anthropic API may be reached, and Firebase’s sign-in frame may open', async ({ page }) => {
  await cspGuard(page);
  const hosts = [
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup',
    'https://securetoken.googleapis.com/v1/token',
    'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel',
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    'https://accounts.google.com/gsi/status',
    'https://api.anthropic.com/v1/messages',
    'https://fonts.googleapis.com/css2?family=Lora',
  ];
  for (const h of hosts) await page.route(`${new URL(h).origin}/**`, (r) => r.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.route('https://note-board-a672a.firebaseapp.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<p>auth</p>' }));
  await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.gsiLoaded = true;' }));
  // gapi's iframe module, which api.js loads from this path on the same host (its own config: "/_/scs/abc-static/...").
  await page.route('https://apis.google.com/_/scs/**', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.gapiModule = true;' }));
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  const results = await page.evaluate(
    (urls) => Promise.all(urls.map((u) => fetch(u, { method: u.includes('anthropic') ? 'POST' : 'GET' }).then((r) => `${u} ${r.status}`, () => `${u} refused`))),
    hosts,
  );
  // None refused (the fonts' stylesheet can come from the offline copy instead, with a 200).
  expect(results.filter((r) => r.endsWith('refused'))).toEqual([]);
  expect(results).toHaveLength(hosts.length);
  // Firebase's hidden sign-in frame (https://<authDomain>/__/auth/iframe) and the Calendar connection's script.
  await page.evaluate(() => {
    const f = document.createElement('iframe');
    f.src = 'https://note-board-a672a.firebaseapp.com/__/auth/iframe';
    document.body.append(f);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    document.head.append(s);
    const m = document.createElement('script');
    m.src = 'https://apis.google.com/_/scs/abc-static/_/js/k=gapi.lb.en.x/m=__features__';
    document.head.append(m);
  });
  await expect(page.frameLocator('iframe[src*="firebaseapp.com"]').locator('p')).toHaveText('auth');
  await expect.poll(() => page.evaluate(() => (window as unknown as { gsiLoaded?: boolean }).gsiLoaded)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as { gapiModule?: boolean }).gapiModule)).toBe(true);
});

test('another script or address on Google’s shared hosts is still refused', async ({ page }) => {
  await cspGuard(page);
  await page.route('https://apis.google.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.otherGoogle = true;' }));
  await page.route('https://www.googleapis.com/**', (r) => r.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  expect(await page.evaluate(() => fetch('https://www.googleapis.com/upload/drive/v3/files').then(() => 'sent', () => 'refused'))).toBe('refused');
  await page.evaluate(() => {
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/other.js';
    document.head.append(s);
  });
  await expect.poll(async () => (await violations(page)).filter((v) => !v.startsWith('console:'))).toEqual([
    expect.stringContaining('connect-src https://www.googleapis.com/upload'),
    expect.stringContaining('script-src-elem https://apis.google.com/js/other.js'),
  ]);
  expect(await page.evaluate(() => (window as unknown as { otherGoogle?: boolean }).otherGoogle)).toBeUndefined();
  await clearViolations(page);
});
