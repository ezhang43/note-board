import { jwtPart, verifyIdToken, type FirebaseUser, type KeyFor } from './firebaseToken';
import { seal, sealKey, unseal } from './seal';

// The calendar helper (owner decision, 2026-11-20): keeps each signed-in person's Google refresh token,
// sealed, in Workers KV under their Firebase uid, so the page gets a fresh calendar access (about an
// hour each) without Google's window showing again. Three calls, each a POST from the published site
// with the person's Firebase ID token:
//   /connect     the code from Google's window (GIS code client, popup): exchanged at Google, the
//                refresh token kept, the first access returned. The refresh token never leaves here.
//   /access      a fresh access from the kept refresh token; 404 when not connected.
//   /disconnect  revokes the refresh token at Google and deletes the entry.

export interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  TOKENS: KV;
  /** Not secret (also in the site's .env.production). */
  GOOGLE_CLIENT_ID: string;
  /** Secret, set with `wrangler secret put`. */
  GOOGLE_CLIENT_SECRET: string;
  /** Secret: base64 of 32 random bytes, seals the refresh tokens. */
  TOKEN_KEY: string;
  FIREBASE_PROJECT_ID: string;
  /** Space-separated origins allowed to call, e.g. "https://ezhang43.github.io http://localhost:4173". */
  ALLOWED_ORIGINS: string;
  /** The redirect_uri sent with a popup code (Google's code model: "postmessage"). */
  CODE_REDIRECT_URI?: string;
  /** Cloudflare's rate limiting binding, when set up in wrangler.toml. */
  LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}

export interface Deps {
  fetch: typeof fetch;
  keyFor: KeyFor;
  now(): number;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/** What is kept per person. */
interface Entry {
  v: 1;
  /** The refresh token, sealed to the uid. */
  sealed: string;
  /** The Google account it belongs to. */
  sub: string;
}

const kvKey = (uid: string) => `refresh:${uid}`;

class Answer {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {}
}
const fail = (status: number, error: string) => new Answer(status, { error });

function allowedOrigin(req: Request, env: Env): string | null {
  const origin = req.headers.get('origin');
  if (!origin) return null;
  return (env.ALLOWED_ORIGINS ?? '').split(/\s+/).filter(Boolean).includes(origin) ? origin : null;
}

function respond(answer: Answer | null, origin: string | null): Response {
  const headers: Record<string, string> = { 'cache-control': 'no-store', vary: 'Origin' };
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-methods'] = 'POST';
    headers['access-control-allow-headers'] = 'Authorization, Content-Type, X-Requested-With';
    headers['access-control-max-age'] = '600';
  }
  if (!answer) return new Response(null, { status: 204, headers });
  headers['content-type'] = 'application/json';
  return new Response(JSON.stringify(answer.body), { status: answer.status, headers });
}

export async function handle(req: Request, env: Env, deps: Deps): Promise<Response> {
  const origin = allowedOrigin(req, env);
  if (!origin) return respond(fail(403, 'origin'), null);
  if (req.method === 'OPTIONS') return respond(null, origin);
  try {
    return respond(await route(req, env, deps), origin);
  } catch {
    // Google or KV unreachable: nothing about it is sent back.
    return respond(fail(502, 'unavailable'), origin);
  }
}

async function route(req: Request, env: Env, deps: Deps): Promise<Answer> {
  if (req.method !== 'POST') return fail(405, 'method');
  const path = new URL(req.url).pathname;
  if (!['/connect', '/access', '/disconnect'].includes(path)) return fail(404, 'path');
  // Google's code model advises this header for the popup flow: a page elsewhere can't send it without a preflight, which CORS refuses.
  if (req.headers.get('x-requested-with') !== 'XmlHttpRequest') return fail(400, 'header');
  const key = await sealKey(env.TOKEN_KEY);
  if (!key || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_CLIENT_ID || !env.FIREBASE_PROJECT_ID) return fail(500, 'setup');

  const bearer = /^Bearer (\S+)$/.exec(req.headers.get('authorization') ?? '')?.[1];
  const user = bearer ? await verifyIdToken(bearer, env.FIREBASE_PROJECT_ID, deps.keyFor, deps.now()) : null;
  if (!user) return fail(401, 'sign_in');
  if (env.LIMITER && !(await env.LIMITER.limit({ key: user.uid })).success) return fail(429, 'slow_down');

  const google = googleCalls(env, deps.fetch);
  if (path === '/connect') return connect(req, env, user, key, google);
  if (path === '/access') return access(env, user, key, google);
  return disconnect(env, user, key, google);
}

type Google = ReturnType<typeof googleCalls>;

function googleCalls(env: Env, fetchFn: typeof fetch) {
  const post = async (url: string, form: Record<string, string>) => {
    const res = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, json };
  };
  const client = { client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET };
  return {
    exchange: (code: string) => post(TOKEN_URL, { code, ...client, redirect_uri: env.CODE_REDIRECT_URI || 'postmessage', grant_type: 'authorization_code' }),
    refresh: (refreshToken: string) => post(TOKEN_URL, { refresh_token: refreshToken, ...client, grant_type: 'refresh_token' }),
    revoke: (token: string) => post(REVOKE_URL, { token }),
  };
}

/** The access to hand back, or null when Google's answer lacks one. */
function accessOf(json: Record<string, unknown>): Answer | null {
  const expires = Number(json.expires_in);
  if (typeof json.access_token !== 'string' || !json.access_token || !Number.isFinite(expires) || expires <= 0) return null;
  return new Answer(200, { access_token: json.access_token, expires_in: expires });
}

/** Whether Google's ID token (straight from its token endpoint over TLS, so not signature-checked) is the signed-in person's Google account. */
function sameAccount(idToken: unknown, env: Env, user: FirebaseUser): string | null {
  if (typeof idToken !== 'string') return null;
  const claims = jwtPart(idToken.split('.')[1]);
  if (!claims || claims.aud !== env.GOOGLE_CLIENT_ID || !GOOGLE_ISSUERS.includes(String(claims.iss)) || typeof claims.sub !== 'string') return null;
  if (user.googleIds.length) return user.googleIds.includes(claims.sub) ? claims.sub : null;
  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
  const same = email !== null && user.email !== null && user.emailVerified && claims.email_verified === true && email === user.email.toLowerCase();
  return same ? claims.sub : null;
}

async function connect(req: Request, env: Env, user: FirebaseUser, key: CryptoKey, google: Google): Promise<Answer> {
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = body?.code;
  if (typeof code !== 'string' || !code || code.length > 4096) return fail(400, 'code');
  const got = await google.exchange(code);
  if (!got.ok) return got.json.error === 'invalid_grant' ? fail(400, 'code') : fail(502, 'google');
  const access = accessOf(got.json);
  if (!access) return fail(502, 'google');
  const scopes = String(got.json.scope ?? '').split(' ');
  // Calendar access unticked on Google's screen: nothing is kept (the page says it wasn't given).
  if (!scopes.includes(SCOPE)) return fail(403, 'refused');
  // Another Google account picked in the window: its tokens are dropped, not kept or used.
  const sub = sameAccount(got.json.id_token, env, user);
  if (!sub) return fail(403, 'account');

  const refreshToken = got.json.refresh_token;
  if (typeof refreshToken !== 'string' || !refreshToken) {
    // Google gives a refresh token only when the person first agrees. Already kept: carry on with it.
    if (await env.TOKENS.get(kvKey(user.uid))) return access;
    // Not kept (an earlier grant from the hourly window): that grant is revoked, so the next window asks afresh and gives one.
    await google.revoke(String(got.json.access_token)).catch(() => {});
    return fail(409, 'again');
  }
  const entry: Entry = { v: 1, sealed: await seal(key, refreshToken, user.uid), sub };
  await env.TOKENS.put(kvKey(user.uid), JSON.stringify(entry));
  return access;
}

/** The refresh token kept for this person, or null (none, or one that doesn't open, which is deleted). */
async function kept(env: Env, user: FirebaseUser, key: CryptoKey): Promise<string | null> {
  const raw = await env.TOKENS.get(kvKey(user.uid));
  if (!raw) return null;
  let entry: Partial<Entry> | null = null;
  try {
    entry = JSON.parse(raw) as Partial<Entry>;
  } catch {
    entry = null;
  }
  const token = entry?.v === 1 && typeof entry.sealed === 'string' ? await unseal(key, entry.sealed, user.uid) : null;
  if (!token) await env.TOKENS.delete(kvKey(user.uid));
  return token;
}

async function access(env: Env, user: FirebaseUser, key: CryptoKey, google: Google): Promise<Answer> {
  const refreshToken = await kept(env, user, key);
  if (!refreshToken) return fail(404, 'not_connected');
  const got = await google.refresh(refreshToken);
  if (!got.ok) {
    // Revoked in Google's settings, expired or otherwise dead: forgotten, so the page opens Google's window.
    if (got.json.error === 'invalid_grant') {
      await env.TOKENS.delete(kvKey(user.uid));
      return fail(404, 'not_connected');
    }
    return fail(502, 'google');
  }
  return accessOf(got.json) ?? fail(502, 'google');
}

async function disconnect(env: Env, user: FirebaseUser, key: CryptoKey, google: Google): Promise<Answer> {
  const refreshToken = await kept(env, user, key);
  if (refreshToken) {
    const revoked = await google.revoke(refreshToken);
    // 400: Google no longer knows it (already revoked or expired). Anything else: kept, so trying again revokes it.
    if (!revoked.ok && revoked.status !== 400) return fail(502, 'google');
    await env.TOKENS.delete(kvKey(user.uid));
  }
  return new Answer(200, { ok: true });
}
