import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_KEY } from '../model/calendar';

// The published site's calendar access (src/calendar/google.ts), with Firebase sign-in pretended:
// the access kept on this device (job 107) is reused for the same person and dropped on sign-out, on another
// person signing in, and when Google refuses it. No OAuth client ID is set in tests, so a token()
// that resolves came from what was kept, without asking Google.

const auth = vi.hoisted(() => ({ currentUser: null as { uid: string; email: string } | null, listener: null as ((u: { uid: string } | null) => void) | null }));
vi.mock('firebase/auth', () => ({
  getAuth: () => auth,
  onAuthStateChanged: (_auth: unknown, cb: (u: { uid: string } | null) => void) => {
    auth.listener = cb;
  },
}));

const data = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) });

const keep = (user: string, token = 'kept', ms = 3_000_000) => data.set(ACCESS_KEY, JSON.stringify({ token, expiresAt: Date.now() + ms, user }));
const load = () => import('./google');

describe('calendar access on the published site', () => {
  beforeEach(() => {
    vi.resetModules();
    data.clear();
    auth.currentUser = { uid: 'u1', email: 'a@example.com' };
    auth.listener = null;
  });

  it('after a reload, uses the access kept for this person without asking Google', async () => {
    keep('u1');
    const google = await load();
    auth.listener!({ uid: 'u1' });
    await expect(google.token()).resolves.toBe('kept');
    expect(data.has(ACCESS_KEY)).toBe(true);
  });

  it('asks Google (here: fails, no client ID) when what is kept is someone else’s, nearly expired or damaged', async () => {
    for (const set of [() => keep('u2'), () => keep('u1', 'kept', 30_000), () => data.set(ACCESS_KEY, '{oops')]) {
      vi.resetModules();
      set();
      const google = await load();
      await expect(google.token()).rejects.toThrow('No OAuth client ID');
      expect(data.has(ACCESS_KEY)).toBe(false);
    }
  });

  it('signing out drops it, from the device and from memory', async () => {
    keep('u1');
    const google = await load();
    auth.listener!({ uid: 'u1' });
    await expect(google.token()).resolves.toBe('kept');
    auth.currentUser = null;
    auth.listener!(null);
    await expect(google.token()).rejects.toThrow();
    expect(data.has(ACCESS_KEY)).toBe(false);
  });

  it('another person signing in drops it, from the device and from memory', async () => {
    keep('u1');
    const google = await load();
    auth.listener!({ uid: 'u1' });
    await expect(google.token()).resolves.toBe('kept');
    auth.currentUser = { uid: 'u2', email: 'b@example.com' };
    auth.listener!({ uid: 'u2' });
    await expect(google.token()).rejects.toThrow();
    expect(data.has(ACCESS_KEY)).toBe(false);
  });

  describe('with Google asked (a pretend Google script)', () => {
    type Config = { callback: (r: { access_token?: string; expires_in?: number | string }) => void };
    let clients: Config[];
    beforeEach(() => {
      clients = [];
      vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client');
      const gis = { accounts: { oauth2: { initTokenClient: (c: Config) => (clients.push(c), { requestAccessToken() {} }), hasGrantedAllScopes: () => true } } };
      vi.stubGlobal('window', { google: gis });
      vi.stubGlobal('document', { createElement: () => ({}), head: { appendChild: (tag: { onload(): void }) => tag.onload() } });
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.stubGlobal('window', undefined);
      vi.stubGlobal('document', undefined);
    });
    const asked = (n: number) => vi.waitFor(() => expect(clients).toHaveLength(n));

    it('keeps the token Google gives for the person who asked', async () => {
      const google = await load();
      const t = google.token();
      await asked(1);
      clients[0].callback({ access_token: 'new', expires_in: 3599 });
      await expect(t).resolves.toBe('new');
      expect(JSON.parse(data.get(ACCESS_KEY)!)).toMatchObject({ token: 'new', user: 'u1' });
      await expect(google.token()).resolves.toBe('new');
      expect(clients).toHaveLength(1);
    });

    it('a token arriving after another person signed in is neither kept nor used, and the new person is asked afresh', async () => {
      const google = await load();
      const forA = google.token();
      await asked(1);
      auth.currentUser = { uid: 'u2', email: 'b@example.com' };
      auth.listener!({ uid: 'u2' });
      void google.token();
      await asked(2);
      clients[0].callback({ access_token: 'for-a', expires_in: 3599 });
      await expect(forA).rejects.toMatchObject({ reason: 'window' });
      expect(data.has(ACCESS_KEY)).toBe(false);
    });

    it('a bad expiry from Google is not taken as never running out', async () => {
      for (const [n, expires_in] of ['soon', 'Infinity'].entries()) {
        const google = await load();
        const t = google.token();
        await asked(2 * n + 1);
        clients[2 * n].callback({ access_token: 'odd', expires_in });
        await expect(t).resolves.toBe('odd');
        void google.token();
        await asked(2 * n + 2);
        vi.resetModules();
      }
    });
  });

  describe('keptToken for the Visualizer (never opens Google’s window)', () => {
    it('gives the access kept for this person, and leaves it stored', async () => {
      keep('u1');
      const google = await load();
      auth.listener!({ uid: 'u1' });
      expect(google.keptToken()).toBe('kept');
      expect(data.has(ACCESS_KEY)).toBe(true);
    });

    it('gives null, without asking Google, when there is none fresh (someone else’s or nearly expired)', async () => {
      for (const set of [() => keep('u2'), () => keep('u1', 'kept', 30_000)]) {
        vi.resetModules();
        data.clear();
        set();
        const google = await load();
        expect(google.keptToken()).toBe(null);
      }
    });

    it('gives null when nobody is signed in, and does NOT drop the stored access (guards the destructive readAccess)', async () => {
      keep('u1');
      const google = await load();
      auth.currentUser = null;
      expect(google.keptToken()).toBe(null);
      // The guard must return before readAccess(device, null), which would drop the device copy.
      expect(data.has(ACCESS_KEY)).toBe(true);
    });
  });

  it('forget (Google refused the access) drops it', async () => {
    keep('u1');
    const google = await load();
    await expect(google.token()).resolves.toBe('kept');
    google.forget();
    expect(data.has(ACCESS_KEY)).toBe(false);
    await expect(google.token()).rejects.toThrow();
  });
});

// The calendar helper (owner decision, 2026-11-20): with VITE_CALENDAR_HELPER_URL set, a fresh access
// comes from the helper (which keeps the Google refresh token), so Google's window shows once per
// account, not hourly. Without it, or when the helper can't be reached, the hourly window as before.
describe('with the calendar helper', () => {
  const HELPER = 'https://helper.example';
  type TokenConfig = { callback: (r: { access_token?: string; expires_in?: number }) => void };
  type CodeConfig = { scope: string; login_hint?: string; ux_mode?: string; callback: (r: { code?: string; scope?: string; error?: string }) => void; error_callback?: (e: { type?: string }) => void };
  let tokenClients: TokenConfig[];
  let codeClients: CodeConfig[];
  let requests: { url: string; init: RequestInit }[];
  let answer: (path: string, body: Record<string, unknown>) => Response | Promise<Response>;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  beforeEach(() => {
    vi.resetModules();
    data.clear();
    auth.currentUser = { uid: 'u1', email: 'a@example.com' };
    auth.listener = null;
    tokenClients = [];
    codeClients = [];
    requests = [];
    answer = () => json(404, { error: 'not_connected' });
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client');
    vi.stubEnv('VITE_CALENDAR_HELPER_URL', HELPER);
    Object.assign(auth.currentUser, { getIdToken: async () => `id-token-${auth.currentUser?.uid}` });
    const gis = {
      accounts: {
        oauth2: {
          initTokenClient: (c: TokenConfig) => (tokenClients.push(c), { requestAccessToken() {} }),
          initCodeClient: (c: CodeConfig) => (codeClients.push(c), { requestCode() {} }),
          hasGrantedAllScopes: () => true,
        },
      },
    };
    vi.stubGlobal('window', { google: gis });
    vi.stubGlobal('document', { createElement: () => ({}), head: { appendChild: (tag: { onload(): void }) => tag.onload() } });
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return answer(url.slice(HELPER.length), JSON.parse(String(init.body ?? '{}')));
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('fetch', undefined);
  });
  const paths = () => requests.map((r) => r.url.slice(HELPER.length));
  const codeAsked = (n: number) => vi.waitFor(() => expect(codeClients).toHaveLength(n));

  it('connected: the helper gives a fresh access, with the sign-in token, and no Google window opens', async () => {
    answer = () => json(200, { access_token: 'from-helper', expires_in: 3599 });
    const google = await load();
    await expect(google.token()).resolves.toBe('from-helper');
    expect(paths()).toEqual(['/access']);
    const headers = requests[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer id-token-u1');
    expect(headers['X-Requested-With']).toBe('XmlHttpRequest');
    expect(requests[0].init.method).toBe('POST');
    expect(tokenClients).toHaveLength(0);
    expect(codeClients).toHaveLength(0);
    expect(JSON.parse(data.get(ACCESS_KEY)!)).toMatchObject({ token: 'from-helper', user: 'u1' });
  });

  it('what is kept on the device is used first, without asking the helper', async () => {
    keep('u1');
    const google = await load();
    await expect(google.token()).resolves.toBe('kept');
    expect(requests).toHaveLength(0);
  });

  it('a 401 from Google (forget) asks the helper again for a fresh access, without a window', async () => {
    keep('u1');
    answer = () => json(200, { access_token: 'fresh', expires_in: 3599 });
    const google = await load();
    await expect(google.token()).resolves.toBe('kept');
    google.forget();
    await expect(google.token()).resolves.toBe('fresh');
    expect(paths()).toEqual(['/access']);
    expect(codeClients).toHaveLength(0);
  });

  it('not connected yet: Google’s window asks once (code, offline), and the code goes to the helper', async () => {
    const google = await load();
    const t = google.token();
    await codeAsked(1);
    expect(codeClients[0].scope.split(' ')).toEqual(expect.arrayContaining(['openid', 'email', 'https://www.googleapis.com/auth/calendar.events']));
    expect(codeClients[0].login_hint).toBe('a@example.com');
    expect(codeClients[0].ux_mode).toBe('popup');
    answer = (path, body) => (path === '/connect' && body.code === 'the-code' ? json(200, { access_token: 'first', expires_in: 3599 }) : json(500, {}));
    codeClients[0].callback({ code: 'the-code', scope: 'email openid https://www.googleapis.com/auth/calendar.events' });
    await expect(t).resolves.toBe('first');
    expect(paths()).toEqual(['/access', '/connect']);
    expect(tokenClients).toHaveLength(0);
    expect(JSON.parse(data.get(ACCESS_KEY)!)).toMatchObject({ token: 'first', user: 'u1' });
  });

  it('once it is known there is no connection, the next ask opens the window straight away (from the click, so it isn’t blocked)', async () => {
    const google = await load();
    const first = google.token();
    await codeAsked(1);
    codeClients[0].error_callback!({ type: 'popup_closed' });
    await expect(first).rejects.toMatchObject({ reason: 'window' });
    requests = [];
    void google.token();
    // Synchronously, before any request: GIS was loaded and the helper already said "not connected".
    expect(codeClients).toHaveLength(2);
    expect(requests).toHaveLength(0);
  });

  it('calendar unticked, or refused, on Google’s screen: refused, nothing sent to the helper', async () => {
    const google = await load();
    const t = google.token();
    await codeAsked(1);
    codeClients[0].callback({ code: 'c', scope: 'openid email' });
    await expect(t).rejects.toMatchObject({ reason: 'refused' });
    const t2 = google.token();
    await codeAsked(2);
    codeClients[1].callback({ error: 'access_denied' });
    await expect(t2).rejects.toMatchObject({ reason: 'refused' });
    expect(paths()).toEqual(['/access']);
  });

  it('the helper’s answers to a code: another Google account, and one more step needed', async () => {
    const google = await load();
    for (const [status, error, reason] of [[403, 'account', 'account'], [409, 'again', 'again'], [403, 'refused', 'refused']] as const) {
      const before = codeClients.length;
      const t = google.token();
      await codeAsked(before + 1);
      answer = () => json(status, { error });
      codeClients.at(-1)!.callback({ code: 'c', scope: 'https://www.googleapis.com/auth/calendar.events' });
      await expect(t).rejects.toMatchObject({ reason });
      expect(data.has(ACCESS_KEY)).toBe(false);
    }
  });

  it('an access arriving after another person signed in is neither kept nor used', async () => {
    let release!: (r: Response) => void;
    answer = () => new Promise<Response>((done) => (release = done));
    const google = await load();
    const t = google.token();
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    auth.currentUser = { uid: 'u2', email: 'b@example.com' };
    auth.listener!({ uid: 'u2' });
    release(json(200, { access_token: 'for-u1', expires_in: 3599 }));
    await expect(t).rejects.toMatchObject({ reason: 'window' });
    expect(data.has(ACCESS_KEY)).toBe(false);
  });

  it('the helper unreachable or failing: the hourly window as before (token client)', async () => {
    for (const fail of [() => Promise.reject(new TypeError('Failed to fetch')), () => json(502, { error: 'google' }), () => json(200, { nonsense: true })]) {
      vi.resetModules();
      tokenClients = [];
      answer = fail as typeof answer;
      const google = await load();
      const t = google.token();
      await vi.waitFor(() => expect(tokenClients).toHaveLength(1));
      tokenClients[0].callback({ access_token: 'hourly', expires_in: 3599 });
      await expect(t).resolves.toBe('hourly');
      expect(codeClients).toHaveLength(0);
      data.clear();
    }
  });

  it('Disconnect: the helper revokes and forgets it, this device’s access goes, and the next ask opens the window', async () => {
    keep('u1');
    answer = (path) => (path === '/disconnect' ? json(200, { ok: true }) : json(404, { error: 'not_connected' }));
    const google = await load();
    await google.disconnect();
    expect(paths()).toEqual(['/disconnect']);
    expect(data.has(ACCESS_KEY)).toBe(false);
    void google.token();
    await codeAsked(1);
    expect(paths()).toEqual(['/disconnect']);
  });

  it('an access already on its way when Disconnect happens is neither kept nor used (code review 2026-11-20)', async () => {
    let release!: (r: Response) => void;
    answer = (path) => (path === '/disconnect' ? json(200, { ok: true }) : new Promise<Response>((done) => (release = done)));
    const google = await load();
    const t = google.token();
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await google.disconnect();
    release(json(200, { access_token: 'revoked', expires_in: 3599 }));
    await expect(t).rejects.toMatchObject({ reason: 'window' });
    expect(data.has(ACCESS_KEY)).toBe(false);
    // Still known as not connected: the next ask opens the window, without asking the helper first.
    requests = [];
    void google.token();
    await codeAsked(1);
    expect(requests).toHaveLength(0);
  });

  it('a code that comes back after another person signed in is not sent with their sign-in (code review 2026-11-20)', async () => {
    const google = await load();
    const t = google.token();
    await codeAsked(1);
    auth.currentUser = { uid: 'u2', email: 'b@example.com' };
    auth.listener!({ uid: 'u2' });
    codeClients[0].callback({ code: 'c', scope: 'https://www.googleapis.com/auth/calendar.events' });
    await expect(t).rejects.toMatchObject({ reason: 'window' });
    expect(paths()).toEqual(['/access']);
  });

  it('Disconnect that fails keeps everything and says so', async () => {
    keep('u1');
    answer = () => json(502, { error: 'google' });
    const google = await load();
    await expect(google.disconnect()).rejects.toThrow();
    expect(data.has(ACCESS_KEY)).toBe(true);
  });

  it('dormant without VITE_CALENDAR_HELPER_URL: never calls a helper, the hourly window as before', async () => {
    vi.stubEnv('VITE_CALENDAR_HELPER_URL', '');
    const google = await load();
    const t = google.token();
    await vi.waitFor(() => expect(tokenClients).toHaveLength(1));
    tokenClients[0].callback({ access_token: 'hourly', expires_in: 3599 });
    await expect(t).resolves.toBe('hourly');
    expect(requests).toHaveLength(0);
    expect(codeClients).toHaveLength(0);
    await google.disconnect(); // nothing to do
    expect(requests).toHaveLength(0);
  });
});
