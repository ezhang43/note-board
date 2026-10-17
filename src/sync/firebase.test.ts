import { beforeEach, describe, expect, it, vi } from 'vitest';

// Leaving a shared board online (main session check, 2026-10-06): all or nothing. Firebase itself
// is replaced by a stand-in that records what would be written.

const calls = vi.hoisted(() => ({ batches: [] as { deletes: string[]; committed: boolean }[], deleteDoc: [] as string[], added: [] as { ref: string; data: unknown }[], fail: false }));

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
  serverTimestamp: () => 'SERVER_TIME',
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: async (ref: string, data: unknown) => {
    if (calls.fail) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
    calls.added.push({ ref, data });
  },
}));

const { collabRemote, sendFeedback, boardRemote } = await import('./firebase');
const firestore = await import('firebase/firestore');
const { startSync } = await import('../store/sync');
const { createStore } = await import('../store/store');
const { serializeWorkspace } = await import('../model/workspace');
const user = { uid: 'u1', displayName: 'Bob', photoURL: null } as unknown as Parameters<typeof collabRemote>[0];

beforeEach(() => {
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

// Job 92 (whole-app review, H1): signed in and offline, with changes this device hadn't sent yet,
// reopening the board stayed on "Opening your board…": every snapshot carried those unsent changes
// ("pending writes") and was skipped, and offline the server never confirms them.
describe('opening your board offline with unsent changes (job 92)', () => {
  type Snap = { exists: () => boolean; data: () => unknown; metadata: { fromCache: boolean; hasPendingWrites: boolean } };
  const snap = (data: unknown, fromCache: boolean, hasPendingWrites: boolean): Snap => ({
    exists: () => data !== undefined,
    data: () => data,
    metadata: { fromCache, hasPendingWrites },
  });
  /** Starts watching boards/u1 and returns a way to hand it snapshots, as Firestore would. */
  function watching(onChange: (doc: unknown) => void) {
    let next: (s: Snap) => void = () => {};
    vi.mocked(firestore.onSnapshot).mockImplementation(((_ref: unknown, _opts: unknown, fn: (s: Snap) => void) => {
      next = fn;
      return () => {};
    }) as never);
    boardRemote('u1').watch(onChange, () => {});
    return (s: Snap) => next(s);
  }

  it('opens from this device’s copy, unsent changes included', () => {
    const got: unknown[] = [];
    const send = watching((d) => got.push(d));
    send(snap({ data: 'mine', client: 'old-page' }, true, true));
    expect(got).toEqual([{ data: 'mine', client: 'old-page' }]);
  });

  it('once open, its own unconfirmed saves are still skipped', () => {
    const got: unknown[] = [];
    const send = watching((d) => got.push(d));
    send(snap({ data: 'v1', client: 'x' }, true, false));
    send(snap({ data: 'v2', client: 'me' }, true, true));
    expect(got).toEqual([{ data: 'v1', client: 'x' }]);
  });

  it('a delete not yet sent is never taken for “there is no online board” (that would upload this device’s board again)', () => {
    const got: unknown[] = [];
    const send = watching((d) => got.push(d));
    send(snap(undefined, false, true));
    send(snap(undefined, true, true));
    expect(got).toEqual([]);
  });

  it('the board opens, and when the changes reach the server nothing is sent again or replaced', () => {
    const store = createStore(null, (fn) => fn());
    const ws = { ...store.workspace() };
    const home = ws.boards[ws.home];
    const mine = serializeWorkspace({ home: ws.home, boards: { [ws.home]: { ...home, name: 'Made offline' } } });
    let next: (s: Snap) => void = () => {};
    vi.mocked(firestore.onSnapshot).mockImplementation(((_ref: unknown, _opts: unknown, fn: (s: Snap) => void) => {
      next = fn;
      return () => {};
    }) as never);
    vi.mocked(firestore.setDoc).mockClear();
    const onReady = vi.fn();
    startSync(store, boardRemote('u1'), { client: 'new-page', onReady, onError: () => {} });

    next(snap({ data: mine, client: 'old-page' }, true, true));
    expect(onReady).toHaveBeenCalledOnce();
    expect(store.getState().board.name).toBe('Made offline');

    const before = store.workspace();
    next(snap({ data: mine, client: 'old-page' }, false, false));
    expect(store.workspace()).toBe(before);
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });
});
