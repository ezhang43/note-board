import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handle, type Env, type KV } from './handler';

// The calendar helper (owner decision, 2026-11-20): it keeps each person's Google refresh token,
// sealed, and hands the page a fresh calendar access when asked. Google and Workers KV are pretend
// here; the Firebase ID tokens are real JWTs signed with a test key.

const PROJECT = 'test-project';
const CLIENT = 'client-id.apps.googleusercontent.com';
const ORIGIN = 'https://ezhang43.github.io';
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

let keys: CryptoKeyPair;
let otherKeys: CryptoKeyPair;

const b64url = (bytes: Uint8Array | string) =>
  Buffer.from(typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function jwt(claims: Record<string, unknown>, opts: { key?: CryptoKey; kid?: string; alg?: string } = {}) {
  const head = b64url(JSON.stringify({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'k1', typ: 'JWT' }));
  const body = b64url(JSON.stringify(claims));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', opts.key ?? keys.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

const s = NOW / 1000;
/** A Firebase ID token for `uid` (signed in with Google account `gsub`), valid now. */
const idToken = (over: Record<string, unknown> = {}, opts?: Parameters<typeof jwt>[1]) =>
  jwt(
    {
      iss: `https://securetoken.google.com/${PROJECT}`,
      aud: PROJECT,
      sub: 'uid-1',
      user_id: 'uid-1',
      auth_time: s - 600,
      iat: s - 60,
      exp: s + 3000,
      email: 'a@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com', identities: { 'google.com': ['gsub-1'], email: ['a@example.com'] } },
      ...over,
    },
    opts,
  );
/** Google's own ID token in the token endpoint's answer (not checked for a signature: it comes straight from Google over TLS). */
const googleIdToken = (over: Record<string, unknown> = {}) =>
  `${b64url(JSON.stringify({ alg: 'RS256' }))}.${b64url(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT, sub: 'gsub-1', email: 'a@example.com', email_verified: true, ...over }))}.sig`;

function fakeKv(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    put: async (k, v) => void data.set(k, v),
    delete: async (k) => void data.delete(k),
  };
}

type Call = { url: string; body: URLSearchParams };
/** A pretend Google token and revoke endpoint. `answer` decides what the token endpoint says. */
function fakeGoogle(answer: (body: URLSearchParams) => { status: number; json: unknown }) {
  const calls: Call[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = new URLSearchParams(String(init?.body ?? ''));
    calls.push({ url, body });
    if (url === 'https://oauth2.googleapis.com/revoke') return new Response('', { status: 200 });
    if (url === 'https://oauth2.googleapis.com/token') {
      const a = answer(body);
      return new Response(JSON.stringify(a.json), { status: a.status, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return { calls, fetchFn };
}

const okCode = () => ({ status: 200, json: { access_token: 'at-1', expires_in: 3599, refresh_token: 'rt-1', scope: `openid ${SCOPE} email`, token_type: 'Bearer', id_token: googleIdToken() } });
const okRefresh = () => ({ status: 200, json: { access_token: 'at-2', expires_in: 3599, scope: SCOPE, token_type: 'Bearer' } });

let kv: ReturnType<typeof fakeKv>;
let google: ReturnType<typeof fakeGoogle>;
let env: Env;

const deps = () => ({
  fetch: google.fetchFn,
  now: () => NOW,
  keyFor: async (kid: string) => (kid === 'k1' ? keys.publicKey : null),
});

async function call(path: string, opts: { token?: string | null; body?: unknown; origin?: string | null; method?: string; xrw?: string | null } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const origin = opts.origin === undefined ? ORIGIN : opts.origin;
  if (origin) headers.origin = origin;
  const xrw = opts.xrw === undefined ? 'XmlHttpRequest' : opts.xrw;
  if (xrw) headers['x-requested-with'] = xrw;
  const token = opts.token === undefined ? await idToken() : opts.token;
  if (token) headers.authorization = `Bearer ${token}`;
  const req = new Request(`https://helper.example.workers.dev${path}`, { method: opts.method ?? 'POST', headers, body: opts.method === 'OPTIONS' || opts.method === 'GET' ? undefined : JSON.stringify(opts.body ?? {}) });
  const res = await handle(req, env, deps());
  const json = res.status === 204 ? null : await res.json();
  return { res, status: res.status, json };
}

const connect = (code = 'code-1') => call('/connect', { body: { code } });

beforeAll(async () => {
  const gen = () => crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
  keys = await gen();
  otherKeys = await gen();
});

beforeEach(() => {
  kv = fakeKv();
  google = fakeGoogle(okCode);
  env = {
    TOKENS: kv,
    GOOGLE_CLIENT_ID: CLIENT,
    GOOGLE_CLIENT_SECRET: 'secret',
    TOKEN_KEY: Buffer.from(new Uint8Array(32).fill(7)).toString('base64'),
    FIREBASE_PROJECT_ID: PROJECT,
    ALLOWED_ORIGINS: `${ORIGIN} http://localhost:4173`,
  };
});

describe('connect: the code from Google’s window is exchanged and the refresh token kept, sealed', () => {
  it('returns the first access, never the refresh token, and stores it encrypted under the uid', async () => {
    const r = await connect();
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ access_token: 'at-1', expires_in: 3599 });
    expect(JSON.stringify(r.json)).not.toContain('rt-1');
    const exchange = google.calls[0];
    expect(exchange.url).toBe('https://oauth2.googleapis.com/token');
    expect(Object.fromEntries(exchange.body)).toEqual({ code: 'code-1', client_id: CLIENT, client_secret: 'secret', redirect_uri: 'postmessage', grant_type: 'authorization_code' });
    const stored = kv.data.get('refresh:uid-1')!;
    expect(stored).toBeTruthy();
    expect(stored).not.toContain('rt-1');
    expect(r.res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(r.res.headers.get('cache-control')).toBe('no-store');
  });

  it('a Google account other than the one signed in is refused, and nothing is kept', async () => {
    google = fakeGoogle(() => ({ ...okCode(), json: { ...okCode().json, id_token: googleIdToken({ sub: 'gsub-2', email: 'b@example.com' }) } }));
    const r = await connect();
    expect(r.status).toBe(403);
    expect(r.json).toEqual({ error: 'account' });
    expect(kv.data.size).toBe(0);
  });

  it('without a Google identity on the sign-in, the verified email must match', async () => {
    const token = await idToken({ firebase: { sign_in_provider: 'google.com', identities: {} } });
    expect((await call('/connect', { token, body: { code: 'c' } })).status).toBe(200);
    kv.data.clear();
    google = fakeGoogle(() => ({ ...okCode(), json: { ...okCode().json, id_token: googleIdToken({ email: 'B@example.com', sub: 'x' }) } }));
    expect((await call('/connect', { token, body: { code: 'c' } })).json).toEqual({ error: 'account' });
    google = fakeGoogle(() => ({ ...okCode(), json: { ...okCode().json, id_token: googleIdToken({ sub: 'x', email_verified: false }) } }));
    expect((await call('/connect', { token, body: { code: 'c' } })).json).toEqual({ error: 'account' });
    expect(kv.data.size).toBe(0);
  });

  it('a Google ID token for another app (wrong audience) is refused', async () => {
    google = fakeGoogle(() => ({ ...okCode(), json: { ...okCode().json, id_token: googleIdToken({ aud: 'other-client' }) } }));
    expect((await connect()).json).toEqual({ error: 'account' });
    expect(kv.data.size).toBe(0);
  });

  it('calendar access unticked on Google’s screen is refused, and nothing is kept', async () => {
    google = fakeGoogle(() => ({ ...okCode(), json: { ...okCode().json, scope: 'openid email' } }));
    const r = await connect();
    expect(r.status).toBe(403);
    expect(r.json).toEqual({ error: 'refused' });
    expect(kv.data.size).toBe(0);
  });

  it('no refresh token (an earlier grant): that grant is revoked so the next window asks afresh', async () => {
    google = fakeGoogle(() => ({ ...okCode(), json: { ...okCode().json, refresh_token: undefined } }));
    const r = await connect();
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: 'again' });
    expect(google.calls.at(-1)).toMatchObject({ url: 'https://oauth2.googleapis.com/revoke' });
    expect(google.calls.at(-1)!.body.get('token')).toBe('at-1');
    expect(kv.data.size).toBe(0);
  });

  it('no refresh token while one is already kept: the kept one stays', async () => {
    await connect();
    const before = kv.data.get('refresh:uid-1');
    google = fakeGoogle(() => ({ ...okCode(), json: { ...okCode().json, refresh_token: undefined } }));
    const r = await connect();
    expect(r.status).toBe(200);
    expect(kv.data.get('refresh:uid-1')).toBe(before);
  });

  it('a code Google refuses (used or expired) is a bad request; a Google outage is 502', async () => {
    google = fakeGoogle(() => ({ status: 400, json: { error: 'invalid_grant' } }));
    expect((await connect()).status).toBe(400);
    google = fakeGoogle(() => ({ status: 500, json: { error: 'internal' } }));
    expect((await connect()).status).toBe(502);
    expect(kv.data.size).toBe(0);
  });

  it('a missing or odd code is refused without asking Google', async () => {
    for (const body of [{}, { code: 5 }, { code: '' }, { code: 'x'.repeat(5000) }]) expect((await call('/connect', { body })).status).toBe(400);
    expect(google.calls).toHaveLength(0);
  });
});

describe('the Firebase sign-in is checked on every call', () => {
  const bad: [string, () => Promise<string | null>][] = [
    ['no token', async () => null],
    ['not a JWT', async () => 'nonsense'],
    ['wrong audience (another Firebase project)', () => idToken({ aud: 'other-project' })],
    ['wrong issuer', () => idToken({ iss: 'https://securetoken.google.com/other-project' })],
    ['expired', () => idToken({ exp: s - 1 })],
    ['issued in the future', () => idToken({ iat: s + 3600 })],
    ['signed in in the future', () => idToken({ auth_time: s + 3600 })],
    ['no uid', () => idToken({ sub: '' })],
    ['signed by another key', () => idToken({}, { key: otherKeys.privateKey })],
    ['unknown key id', () => idToken({}, { kid: 'k9' })],
    ['another algorithm', () => idToken({}, { alg: 'HS256' })],
  ];
  for (const [name, make] of bad) {
    it(`${name}: 401, and Google and the store are not touched`, async () => {
      for (const path of ['/connect', '/access', '/disconnect']) {
        const r = await call(path, { token: await make(), body: { code: 'c' } });
        expect(r.status).toBe(401);
      }
      expect(google.calls).toHaveLength(0);
      expect(kv.data.size).toBe(0);
    });
  }

  it('a tampered payload fails the signature check', async () => {
    const [h, , sig] = (await idToken()).split('.');
    const forged = `${h}.${b64url(JSON.stringify({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: 'uid-2', iat: s - 1, auth_time: s - 1, exp: s + 100 }))}.${sig}`;
    expect((await call('/access', { token: forged })).status).toBe(401);
  });
});

describe('access: a fresh access from the kept refresh token', () => {
  it('not connected yet: 404, so the page opens Google’s window', async () => {
    const r = await call('/access');
    expect(r.status).toBe(404);
    expect(r.json).toEqual({ error: 'not_connected' });
  });

  it('connected: refreshes at Google and returns the access', async () => {
    await connect();
    google = fakeGoogle(okRefresh);
    const r = await call('/access');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ access_token: 'at-2', expires_in: 3599 });
    expect(Object.fromEntries(google.calls[0].body)).toEqual({ refresh_token: 'rt-1', client_id: CLIENT, client_secret: 'secret', grant_type: 'refresh_token' });
  });

  it('each person gets only their own: another uid is not connected', async () => {
    await connect();
    google = fakeGoogle(okRefresh);
    const r = await call('/access', { token: await idToken({ sub: 'uid-2', user_id: 'uid-2' }) });
    expect(r.status).toBe(404);
    expect(google.calls).toHaveLength(0);
  });

  it('an entry moved to another uid cannot be opened (sealed to its uid) and is dropped', async () => {
    await connect();
    kv.data.set('refresh:uid-2', kv.data.get('refresh:uid-1')!);
    google = fakeGoogle(okRefresh);
    const r = await call('/access', { token: await idToken({ sub: 'uid-2', user_id: 'uid-2' }) });
    expect(r.status).toBe(404);
    expect(kv.data.has('refresh:uid-2')).toBe(false);
    expect(google.calls).toHaveLength(0);
  });

  it('Google says invalid_grant (revoked in Google’s settings, expired): the entry is deleted and it is not connected', async () => {
    await connect();
    google = fakeGoogle(() => ({ status: 400, json: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } }));
    const r = await call('/access');
    expect(r.status).toBe(404);
    expect(r.json).toEqual({ error: 'not_connected' });
    expect(kv.data.size).toBe(0);
  });

  it('Google down: 502, and the entry is kept', async () => {
    await connect();
    google = fakeGoogle(() => ({ status: 503, json: {} }));
    expect((await call('/access')).status).toBe(502);
    expect(kv.data.size).toBe(1);
  });

  it('a wrong sealing key (TOKEN_KEY changed) drops the entry rather than failing for ever', async () => {
    await connect();
    env.TOKEN_KEY = Buffer.from(new Uint8Array(32).fill(9)).toString('base64');
    expect((await call('/access')).status).toBe(404);
    expect(kv.data.size).toBe(0);
  });
});

describe('disconnect', () => {
  it('revokes the refresh token at Google and deletes the entry', async () => {
    await connect();
    google = fakeGoogle(okRefresh);
    const r = await call('/disconnect');
    expect(r.status).toBe(200);
    expect(google.calls).toHaveLength(1);
    expect(google.calls[0].url).toBe('https://oauth2.googleapis.com/revoke');
    expect(google.calls[0].body.get('token')).toBe('rt-1');
    expect(kv.data.size).toBe(0);
    expect((await call('/access')).status).toBe(404);
  });

  it('when not connected it is fine (nothing to do)', async () => {
    expect((await call('/disconnect')).status).toBe(200);
    expect(google.calls).toHaveLength(0);
  });

  it('Google unreachable: 502 and the entry is kept, so trying again revokes it', async () => {
    await connect();
    google = { calls: [], fetchFn: (async () => new Response('', { status: 503 })) as unknown as typeof fetch };
    expect((await call('/disconnect')).status).toBe(502);
    expect(kv.data.size).toBe(1);
  });

  it('a token Google already forgot (400) still deletes the entry', async () => {
    await connect();
    google = { calls: [], fetchFn: (async () => new Response('{"error":"invalid_token"}', { status: 400 })) as unknown as typeof fetch };
    expect((await call('/disconnect')).status).toBe(200);
    expect(kv.data.size).toBe(0);
  });
});

describe('who may call', () => {
  it('only the published site and local previews: another origin is refused', async () => {
    for (const origin of ['https://evil.example', 'https://ezhang43.github.io.evil.example', null]) {
      const r = await call('/access', { origin });
      expect(r.status).toBe(403);
      expect(r.res.headers.get('access-control-allow-origin')).toBe(null);
    }
  });

  it('the preflight answers allowed origins only', async () => {
    const ok = await call('/access', { method: 'OPTIONS' });
    expect(ok.status).toBe(204);
    expect(ok.res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(ok.res.headers.get('access-control-allow-headers')).toMatch(/authorization/i);
    expect((await call('/access', { method: 'OPTIONS', origin: 'https://evil.example' })).status).toBe(403);
  });

  it('needs the X-Requested-With header Google advises for the popup code flow', async () => {
    expect((await call('/connect', { xrw: null, body: { code: 'c' } })).status).toBe(400);
    expect(google.calls).toHaveLength(0);
  });

  it('only POST, only the three paths', async () => {
    expect((await call('/access', { method: 'GET' })).status).toBe(405);
    expect((await call('/other')).status).toBe(404);
  });

  it('a light limit per person when the rate limiter is set up', async () => {
    let n = 0;
    env.LIMITER = { limit: async () => ({ success: ++n <= 2 }) };
    expect((await call('/access')).status).toBe(404);
    expect((await call('/access')).status).toBe(404);
    expect((await call('/access')).status).toBe(429);
  });

  it('missing secrets: 500, nothing asked', async () => {
    env.GOOGLE_CLIENT_SECRET = '';
    expect((await connect()).status).toBe(500);
    env.GOOGLE_CLIENT_SECRET = 'secret';
    env.TOKEN_KEY = 'short';
    expect((await connect()).status).toBe(500);
    expect(google.calls).toHaveLength(0);
  });
});

it('the committed wrangler.toml holds no account id, KV id or secret (the repo is public)', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  const lines = toml.split('\n').filter((l) => !l.trim().startsWith('#'));
  expect(lines.join('\n')).not.toMatch(/account_id|^\s*id\s*=|CLIENT_SECRET\s*=|TOKEN_KEY\s*=/m);
});
