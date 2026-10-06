import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WEB_API_KEY, deleteToken, idTokens, loadToken, saveToken, tokenPath } from './auth';

const token = { refreshToken: 'REFRESH-1', uid: 'me', email: 'me@example.com' };

function fakeFetch(replies: { status: number; body: unknown }[]) {
  const calls: { url: string; body: string; type: string | null }[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body), type: new Headers(init?.headers).get('content-type') });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status });
  };
  return { fn: fn as typeof fetch, calls };
}

const ok = (id: string, refresh = 'REFRESH-1', uid = 'me') => ({ status: 200, body: { id_token: id, refresh_token: refresh, expires_in: '3600', user_id: uid, token_type: 'Bearer' } });

describe('token file', () => {
  it('lives in %APPDATA%\\busyants-mcp\\token.json', () => {
    expect(tokenPath({ APPDATA: 'C:\\Users\\x\\AppData\\Roaming' })).toBe(join('C:\\Users\\x\\AppData\\Roaming', 'busyants-mcp', 'token.json'));
  });

  it('is saved, read back and deleted; missing gives null', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'busyants-')), 'busyants-mcp', 'token.json');
    expect(await loadToken(path)).toBeNull();
    await saveToken(path, token);
    expect(await loadToken(path)).toEqual(token);
    expect(await deleteToken(path)).toBe(true);
    expect(await deleteToken(path)).toBe(false);
    expect(await loadToken(path)).toBeNull();
  });

  it('a damaged file asks to sign in again', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'busyants-')), 'token.json');
    await writeFile(path, '{"refreshToken": 5}');
    await expect(loadToken(path)).rejects.toThrow(/npm run mcp:login/);
  });
});

describe('refresh token → id token', () => {
  it('asks Google’s token service with the app’s web key, and keeps the id token until near its end', async () => {
    let now = 1_000_000;
    const { fn, calls } = fakeFetch([ok('ID-1'), ok('ID-2')]);
    const get = idTokens(token, { fetch: fn, now: () => now });
    expect(await get()).toBe('ID-1');
    expect(calls[0].url).toBe(`https://securetoken.googleapis.com/v1/token?key=${WEB_API_KEY}`);
    expect(calls[0].type).toBe('application/x-www-form-urlencoded');
    expect(new URLSearchParams(calls[0].body).get('grant_type')).toBe('refresh_token');
    expect(new URLSearchParams(calls[0].body).get('refresh_token')).toBe('REFRESH-1');
    now += 50 * 60_000;
    expect(await get()).toBe('ID-1');
    expect(calls).toHaveLength(1);
    now += 6 * 60_000;
    expect(await get()).toBe('ID-2');
    expect(calls).toHaveLength(2);
  });

  it('uses the key saved at sign-in when there is one', async () => {
    const { fn, calls } = fakeFetch([ok('ID-1')]);
    await idTokens({ ...token, apiKey: 'OTHER-KEY' }, { fetch: fn })();
    expect(calls[0].url).toBe('https://securetoken.googleapis.com/v1/token?key=OTHER-KEY');
  });

  it('a new refresh token from Google is saved', async () => {
    const saved: unknown[] = [];
    const { fn } = fakeFetch([ok('ID-1', 'REFRESH-2')]);
    await idTokens(token, { fetch: fn, save: async (t) => void saved.push(t) })();
    expect(saved).toEqual([{ ...token, refreshToken: 'REFRESH-2' }]);
  });

  it('an expired or revoked sign-in asks to sign in again', async () => {
    const { fn } = fakeFetch([{ status: 400, body: { error: { code: 400, message: 'TOKEN_EXPIRED', status: 'INVALID_ARGUMENT' } } }]);
    await expect(idTokens(token, { fetch: fn })()).rejects.toThrow(/expired.*npm run mcp:login/s);
  });

  it('a web key restricted to the site’s address says how to fix it', async () => {
    const { fn } = fakeFetch([{ status: 403, body: { error: { code: 403, message: 'Requests from referer <empty> are blocked.', status: 'PERMISSION_DENIED', details: [{ reason: 'API_KEY_HTTP_REFERRER_BLOCKED' }] } } }]);
    await expect(idTokens(token, { fetch: fn })()).rejects.toThrow(/restricted to the site.s address.*--key/s);
  });

  it('a token for another account is refused', async () => {
    const { fn } = fakeFetch([ok('ID-1', 'REFRESH-1', 'someone-else')]);
    await expect(idTokens(token, { fetch: fn })()).rejects.toThrow(/different account/);
  });

  it('the token itself never appears in an error', async () => {
    const { fn } = fakeFetch([{ status: 500, body: 'oops' }]);
    const err = await idTokens(token, { fetch: fn })().catch((e: Error) => e);
    expect(String(err)).not.toContain('REFRESH-1');
  });
});

it('the saved file is plain JSON', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'busyants-')), 'token.json');
  await saveToken(path, token);
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(token);
});
