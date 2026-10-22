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
    setDoc: async (d: { path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) =>
      void fs.docs.set(d.path, opts?.merge ? { ...fs.docs.get(d.path), ...data } : data),
    serverTimestamp: () => 'SERVER_TIME',
    deleteField: () => 'DELETE_FIELD',
    updateDoc: async (d: { path: string }, data: Record<string, unknown>) => {
      const next = { ...fs.docs.get(d.path), ...data };
      for (const [k, v] of Object.entries(data)) if (v === 'DELETE_FIELD') delete next[k];
      fs.docs.set(d.path, next);
    },
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
    expect(await accountRemote(user, shares, 'page1').myShares()).toEqual([
      { id: 's1', owner: 'me' },
      { id: 's2', owner: 'bob' },
      { id: 's3', owner: null },
      { id: 's4', owner: null },
    ]);
  });

  it('deletes every version (list and boards, even one left without its list entry) and their list of shares, and nobody else’s; the marker in place of their boards stays', async () => {
    fs.docs.set('boards/me', { deleting: 'started', client: 'page1' });
    for (let i = 0; i < 450; i++) fs.docs.set(`boards/me/versions/v${i}`, { savedAt: i });
    for (let i = 0; i < 451; i++) fs.docs.set(`boards/me/versionData/v${i}`, { data: '{}' });
    fs.docs.set('boards/me/shared/s9', {});
    fs.docs.set('boards/bob', { data: '{}' });
    fs.docs.set('boards/bob/versions/v1', { savedAt: 1 });
    fs.docs.set('shared/s9', { owner: 'bob' });
    await accountRemote(user, shares, 'page1').deleteOwnData();
    expect([...fs.docs.keys()].sort()).toEqual(['boards/bob', 'boards/bob/versions/v1', 'boards/me', 'shared/s9']);
    // Over 900 deletes: more than one batch (Firestore takes at most 500 at once).
    expect(fs.batches).toBeGreaterThan(2);
    // Running it again is fine.
    await accountRemote(user, shares, 'page1').deleteOwnData();
  });

  it('marks their boards as being deleted by this page (the boards stay in it), then replaces them with the marker that it is done (review 137-A H5)', async () => {
    fs.docs.set('boards/me', { data: '{}', client: 'other', updatedAt: 1 });
    fs.docs.set('boards/bob', { data: '{}' });
    await accountRemote(user, shares, 'page1').markDeleting();
    expect(fs.docs.get('boards/me')).toEqual({ data: '{}', deleting: 'started', client: 'page1', updatedAt: 'SERVER_TIME' });
    await accountRemote(user, shares, 'page1').markDeleted();
    expect(fs.docs.get('boards/me')).toEqual({ deleting: 'done', client: 'page1', updatedAt: 'SERVER_TIME' });
    expect(fs.docs.get('boards/bob')).toEqual({ data: '{}' });
  });

  it('marked done before (only the sign-in failed to go), marking again leaves it done', async () => {
    fs.docs.set('boards/me', { deleting: 'done', client: 'old-page', updatedAt: 1 });
    await accountRemote(user, shares, 'page1').markDeleting();
    expect(fs.docs.get('boards/me')).toEqual({ deleting: 'done', client: 'old-page', updatedAt: 1 });
  });

  it('takes the mark off again, keeping the boards', async () => {
    fs.docs.set('boards/me', { data: '{}', deleting: 'started', client: 'page1', updatedAt: 1 });
    accountRemote(user, shares, 'page1').unmarkDeleting();
    await new Promise((done) => setTimeout(done, 0));
    expect(fs.docs.get('boards/me')).toEqual({ data: '{}', client: 'page1', updatedAt: 1 });
  });

  it('leaving a board shared with them deletes the comments they wrote on it first, then their record (job 161, PR 4: their name and photo go)', async () => {
    const calls: string[] = [];
    const both = { deleteMyComments: async (id: string) => void calls.push(`comments ${id}`), leave: async (id: string) => void calls.push(`leave ${id}`) } as unknown as CollabBackend;
    await accountRemote(user, both, 'page1').leave('s2');
    expect(calls).toEqual(['comments s2', 'leave s2']);
  });

  it('the sign-in is deleted with Firebase’s own call', async () => {
    await accountRemote(user, shares, 'page1').deleteUser();
    expect(fs.deleteUser).toHaveBeenCalledWith(user);
  });
});
