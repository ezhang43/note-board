import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollabBackend } from '../store/collab';

// Deleting an account on the published site (job #63): every document the app writes for a person
// goes. Firestore is replaced by a stand-in holding documents by path.

const fs = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  /** Paths whose read is refused (as by the rules, for a share the person was removed from). */
  refused: new Set<string>(),
  deleted: [] as string[],
  batches: 0,
  deleteUser: vi.fn(async () => {}),
}));

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: null }),
  GoogleAuthProvider: class {
    setCustomParameters() {}
  },
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  reauthenticateWithPopup: vi.fn(),
  deleteUser: fs.deleteUser,
}));
vi.mock('firebase/firestore', () => {
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) });
  const join = (base: unknown, parts: string[]) => [typeof base === 'object' && base && 'path' in base ? (base as { path: string }).path : null, ...parts].filter(Boolean).join('/');
  const kids = (path: string) => [...fs.docs.keys()].filter((k) => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/'));
  return {
    initializeFirestore: () => ({}),
    persistentLocalCache: () => ({}),
    persistentMultipleTabManager: () => ({}),
    doc: (base: unknown, ...parts: string[]) => ref(join(base, parts)),
    collection: (base: unknown, ...parts: string[]) => ref(join(base, parts)),
    getDocsFromServer: async (c: { path: string }) => ({ docs: kids(c.path).map((k) => ({ id: k.split('/').at(-1), ref: ref(k), data: () => fs.docs.get(k) })) }),
    getDocFromServer: async (d: { path: string }) => {
      if (fs.refused.has(d.path)) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
      return { exists: () => fs.docs.has(d.path), data: () => fs.docs.get(d.path) };
    },
    writeBatch: () => {
      const dels: string[] = [];
      return {
        delete: (r: { path: string }) => dels.push(r.path),
        commit: async () => {
          fs.batches++;
          for (const p of dels) {
            fs.docs.delete(p);
            fs.deleted.push(p);
          }
        },
      };
    },
    terminate: vi.fn(async () => {}),
    clearIndexedDbPersistence: vi.fn(async () => {}),
  };
});

const { accountRemote } = await import('./database');

beforeEach(() => {
  fs.docs.clear();
  fs.refused.clear();
  fs.deleted = [];
  fs.batches = 0;
});

const user = { uid: 'me' } as never;
const shares = { deleteShare: vi.fn(async () => {}), leave: vi.fn(async () => {}) } as unknown as CollabBackend;

describe('accountRemote', () => {
  it('lists the person’s shares with who shared each, and a share they can no longer read or that is gone as nobody’s', async () => {
    fs.docs.set('boards/me/shared/s1', {});
    fs.docs.set('boards/me/shared/s2', {});
    fs.docs.set('boards/me/shared/s3', {});
    fs.docs.set('boards/me/shared/s4', {});
    fs.docs.set('shared/s1', { owner: 'me' });
    fs.docs.set('shared/s2', { owner: 'bob' });
    fs.docs.set('shared/s3', { owner: 'bob' });
    fs.refused.add('shared/s3');
    expect(await accountRemote(user, shares).myShares()).toEqual([
      { id: 's1', owner: 'me' },
      { id: 's2', owner: 'bob' },
      { id: 's3', owner: null },
      { id: 's4', owner: null },
    ]);
  });

  it('deletes their boards, every version (list and boards, even one left without its list entry) and their list of shares, and nobody else’s', async () => {
    fs.docs.set('boards/me', { data: '{}' });
    for (let i = 0; i < 450; i++) fs.docs.set(`boards/me/versions/v${i}`, { savedAt: i });
    for (let i = 0; i < 451; i++) fs.docs.set(`boards/me/versionData/v${i}`, { data: '{}' });
    fs.docs.set('boards/me/shared/s9', {});
    fs.docs.set('boards/bob', { data: '{}' });
    fs.docs.set('boards/bob/versions/v1', { savedAt: 1 });
    fs.docs.set('shared/s9', { owner: 'bob' });
    await accountRemote(user, shares).deleteOwnData();
    expect([...fs.docs.keys()].sort()).toEqual(['boards/bob', 'boards/bob/versions/v1', 'shared/s9']);
    // Over 900 deletes: more than one batch (Firestore takes at most 500 at once).
    expect(fs.batches).toBeGreaterThan(2);
    // Running it again is fine.
    await accountRemote(user, shares).deleteOwnData();
  });

  it('the sign-in is deleted with Firebase’s own call', async () => {
    await accountRemote(user, shares).deleteUser();
    expect(fs.deleteUser).toHaveBeenCalledWith(user);
  });
});
