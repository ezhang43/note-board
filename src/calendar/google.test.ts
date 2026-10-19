import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    expect(data.has(ACCESS_KEY)).toBe(false);
    await expect(google.token()).rejects.toThrow();
  });

  it('another person signing in drops it, from the tab and from memory', async () => {
    keep('u1');
    const google = await load();
    auth.listener!({ uid: 'u1' });
    await expect(google.token()).resolves.toBe('kept');
    auth.currentUser = { uid: 'u2', email: 'b@example.com' };
    auth.listener!({ uid: 'u2' });
    expect(data.has(ACCESS_KEY)).toBe(false);
    await expect(google.token()).rejects.toThrow();
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
