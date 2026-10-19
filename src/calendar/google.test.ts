import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_KEY } from '../model/calendar';

// The published site's calendar access (src/calendar/google.ts), with Firebase sign-in pretended:
// the access kept for this tab is reused for the same person and dropped on sign-out, on another
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
vi.stubGlobal('sessionStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) });

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

  it('signing out drops it, from the tab and from memory', async () => {
    keep('u1');
    const google = await load();
    auth.listener!({ uid: 'u1' });
    await expect(google.token()).resolves.toBe('kept');
    auth.currentUser = null;
    auth.listener!(null);
    await expect(google.token()).rejects.toThrow();
    expect(data.has(ACCESS_KEY)).toBe(false);
  });

  it('another person signing in drops it, from the tab and from memory', async () => {
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

  it('forget (Google refused the access) drops it', async () => {
    keep('u1');
    const google = await load();
    await expect(google.token()).resolves.toBe('kept');
    google.forget();
    expect(data.has(ACCESS_KEY)).toBe(false);
    await expect(google.token()).rejects.toThrow();
  });
});
