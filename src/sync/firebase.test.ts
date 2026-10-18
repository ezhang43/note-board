import { beforeEach, describe, expect, it, vi } from 'vitest';

// Leaving a shared board online (main session check, 2026-10-06): all or nothing. Firebase itself
// is replaced by a stand-in that records what would be written.

const calls = vi.hoisted(() => ({ batches: [] as { deletes: string[]; sets: string[]; committed: boolean }[], deleteDoc: [] as string[], added: [] as { ref: string; data: unknown }[], fail: false }));

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
  doc: (base: unknown, ...path: string[]) => (typeof base === 'string' ? [base, ...path] : path).join('/'),
  collection: (_db: unknown, ...path: string[]) => path.join('/'),
  deleteDoc: async (ref: string) => void calls.deleteDoc.push(ref),
  writeBatch: () => {
    const batch = { deletes: [] as string[], sets: [] as string[], committed: false };
    calls.batches.push(batch);
    return {
      delete: (ref: string) => void batch.deletes.push(ref),
      set: (ref: string) => void batch.sets.push(ref),
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
  serverTimestamp: () => 'SERVER_TIME',
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: async (ref: string, data: unknown) => {
    if (calls.fail) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
    calls.added.push({ ref, data });
  },
}));

const { collabRemote, sendFeedback, boardRemote, versionsRemote } = await import('./firebase');
const firestore = await import('firebase/firestore');
const user = { uid: 'u1', displayName: 'Bob', photoURL: null } as unknown as Parameters<typeof collabRemote>[0];

beforeEach(() => {
  vi.mocked(firestore.onSnapshot).mockReset();
  calls.batches = [];
  calls.deleteDoc = [];
  calls.added = [];
  calls.fail = false;
});

describe('sending feedback online (job #69)', () => {
  const eve = { uid: 'u1', email: 'eve@example.com' } as unknown as Parameters<typeof sendFeedback>[0];

  it('adds one note to the feedback collection: the text, who sent it and when, nothing else', async () => {
    await sendFeedback(eve, 'Love it');
    expect(calls.added).toEqual([{ ref: 'feedback', data: { text: 'Love it', uid: 'u1', email: 'eve@example.com', sentAt: 'SERVER_TIME' } }]);
  });

  it('passes on a refusal, so the panel can say it didn’t send', async () => {
    calls.fail = true;
    await expect(sendFeedback(eve, 'Love it')).rejects.toThrow();
  });
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

describe('saving a version online (job #93)', () => {
  it('saves its board and its list entry in one go, so offline both wait together (a reload keeps both)', async () => {
    await versionsRemote('u1').save({ id: 'v1', savedAt: 1, cards: 0, columns: 0 }, '{}');
    expect(calls.batches).toHaveLength(1);
    expect(calls.batches[0].sets).toEqual(['boards/u1/versionData/v1', 'boards/u1/versions/v1']);
    expect(calls.batches[0].committed).toBe(true);
  });
});

// Job 92 (whole-app review, H1): signed in and offline, with changes this device hadn't sent yet,
// reopening the board stayed on "Opening your board…": every snapshot carried those unsent changes
// ("pending writes") and was skipped, and offline the server never confirms them. What startSync
// does with such a first version is tested in src/store/sync.test.ts.
describe('opening your board offline with unsent changes (job 92)', () => {
  type Snap = { exists: () => boolean; data: () => unknown; metadata: { fromCache: boolean; hasPendingWrites: boolean } };
  const snap = (data: unknown, fromCache: boolean, hasPendingWrites: boolean): Snap => ({
    exists: () => data !== undefined,
    data: () => data,
    metadata: { fromCache, hasPendingWrites },
  });
  /** Watches boards/u1, noting what it reports, and returns a way to hand it snapshots as Firestore would. */
  function watching(got: unknown[]) {
    let next: (s: Snap) => void = () => {};
    vi.mocked(firestore.onSnapshot).mockImplementation(((_ref: unknown, _opts: unknown, fn: (s: Snap) => void) => {
      next = fn;
      return () => {};
    }) as never);
    boardRemote('u1').watch((d) => got.push(d), () => {});
    return (s: Snap) => next(s);
  }

  it('opens from this device’s copy, unsent changes included, saying they are not on the server yet', () => {
    const got: unknown[] = [];
    watching(got)(snap({ data: 'mine', client: 'old-page' }, true, true));
    expect(got).toEqual([{ data: 'mine', client: 'old-page', pending: true }]);
  });

  it('once open, unconfirmed saves are still skipped', () => {
    const got: unknown[] = [];
    const send = watching(got);
    send(snap({ data: 'v1', client: 'x' }, true, false));
    send(snap({ data: 'v2', client: 'me' }, true, true));
    send(snap({ data: 'v2', client: 'me' }, false, false));
    expect(got).toEqual([
      { data: 'v1', client: 'x' },
      { data: 'v2', client: 'me' },
    ]);
  });

  it('a delete not yet sent is never taken for “there is no online board” (that would upload this device’s boards again)', () => {
    const got: unknown[] = [];
    const send = watching(got);
    send(snap(undefined, false, true));
    send(snap(undefined, true, true));
    expect(got).toEqual([]);
  });

  it('an unsent copy that isn’t a board is not opened from, nor taken for “no online board”', () => {
    const got: unknown[] = [];
    watching(got)(snap({ data: 42 }, true, true));
    expect(got).toEqual([]);
  });
});
