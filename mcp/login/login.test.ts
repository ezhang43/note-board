import { afterEach, describe, expect, it } from 'vitest';
import type { TokenFile } from '../auth';
import { startLogin } from './login';

const KEY = 'AIzaTestKey-0123456789abcdefghijk';
let close = () => {};
afterEach(() => close());

it('refuses a --key that isn’t shaped like a Google API key (it goes into the page)', async () => {
  await expect(startLogin({ apiKey: '"</script><script>alert(1)//', save: async () => {} })).rejects.toThrow(/API key/);
});

async function start() {
  const saved: TokenFile[] = [];
  const login = await startLogin({ apiKey: KEY, save: async (t) => void saved.push(t) });
  close = login.close;
  const u = new URL(login.url);
  return { login, saved, origin: u.origin, nonce: u.searchParams.get('n')! };
}

const post = (origin: string, body: unknown, from = origin) =>
  fetch(`${origin}/token`, { method: 'POST', headers: { 'content-type': 'application/json', origin: from }, body: JSON.stringify(body) });

const good = (nonce: string) => ({ nonce, refreshToken: 'R', uid: 'me', email: 'me@example.com' });

describe('the sign-in helper page', () => {
  it('opens at localhost with a long one-time code', async () => {
    const { login, nonce } = await start();
    expect(new URL(login.url).hostname).toBe('localhost');
    expect(nonce.length).toBeGreaterThanOrEqual(32);
  });

  it('serves the page only with the code', async () => {
    const { origin, nonce } = await start();
    expect((await fetch(`${origin}/`)).status).toBe(404);
    expect((await fetch(`${origin}/?n=wrong`)).status).toBe(404);
    const page = await fetch(`${origin}/?n=${nonce}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(KEY);
    expect(html).toContain('Sign in with Google');
  });

  it('saves the sign-in sent with the code from the page, once', async () => {
    const { origin, nonce, saved, login } = await start();
    const r = await post(origin, good(nonce));
    expect(r.status).toBe(200);
    expect(await login.done).toEqual({ refreshToken: 'R', uid: 'me', email: 'me@example.com', apiKey: KEY });
    expect(saved).toHaveLength(1);
  });

  it('refuses a wrong code, another site, or bad data', async () => {
    const { origin, nonce, saved } = await start();
    expect((await post(origin, good('nope'))).status).toBe(403);
    expect((await post(origin, good(nonce), 'https://evil.example')).status).toBe(403);
    expect((await post(origin, { nonce, refreshToken: 5, uid: 'me' })).status).toBe(400);
    expect(saved).toHaveLength(0);
  });

  it('the code can’t be used twice', async () => {
    const { origin, nonce, login } = await start();
    await post(origin, good(nonce));
    await login.done;
    // The helper stops once signed in; nothing else is accepted.
    const again = await post(origin, good(nonce)).catch(() => null);
    expect(again === null || again.status === 403).toBe(true);
  });
});
