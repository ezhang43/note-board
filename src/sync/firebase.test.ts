import { beforeEach, describe, expect, it, vi } from 'vitest';

// Leaving a shared board online (main session check, 2026-10-06): all or nothing. Firebase itself
// is replaced by a stand-in that records what would be written.

const calls = vi.hoisted(() => ({ batches: [] as { deletes: string[]; committed: boolean }[], deleteDoc: [] as string[], fail: false }));

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  GoogleAuthProvider: class {},
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  initializeFirestore: () => ({}),
  persistentLocalCache: () => ({}),
  persistentMultipleTabManager: () => ({}),
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  collection: (_db: unknown, ...path: string[]) => path.join('/'),
  deleteDoc: async (ref: string) => void calls.deleteDoc.push(ref),
  writeBatch: () => {
    const batch = { deletes: [] as string[], committed: false };
    calls.batches.push(batch);
    return {
      delete: (ref: string) => void batch.deletes.push(ref),
      set: vi.fn(),
      commit: async () => {
        if (calls.fail) throw new Error('offline');
        batch.committed = true;
      },
    };
  },
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

const { collabRemote } = await import('./firebase');
const user = { uid: 'u1', displayName: 'Bob', photoURL: null } as unknown as Parameters<typeof collabRemote>[0];

beforeEach(() => {
  calls.batches = [];
  calls.deleteDoc = [];
  calls.fail = false;
});

describe('leaving a shared board online', () => {
  it('takes the person off it and off their list in one go', async () => {
    await collabRemote(user).leave('s1');
    expect(calls.deleteDoc).toEqual([]);
    expect(calls.batches).toHaveLength(1);
    expect(calls.batches[0].deletes.sort()).toEqual(['boards/u1/shared/s1', 'shared/s1/members/u1']);
    expect(calls.batches[0].committed).toBe(true);
  });

  it('fails as a whole when it can’t be saved', async () => {
    calls.fail = true;
    await expect(collabRemote(user).leave('s1')).rejects.toThrow();
    expect(calls.deleteDoc).toEqual([]);
  });
});
