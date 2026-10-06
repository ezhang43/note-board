import { beforeEach, describe, expect, it, vi } from 'vitest';

// Job 22 (owner report, 2026-10-06): on the published site, sharing a new board made it vanish a few
// seconds later with "“X” is no longer shared with you." Firestore is replaced here by a stand-in
// that behaves like it in the way that matters: a save shows on this device at once (still on its
// way), while the server only knows it once it arrives; and the server checks the rules when a
// watch starts, so watching a shared board before the save that makes you one of its people has
// arrived is refused.

type Data = Record<string, unknown>;
const fs = vi.hoisted(() => {
  const server = new Map<string, Data>();
  const local = new Map<string, Data>();
  let pending: { writes: [string, Data | null][]; done: () => void }[] = [];
  let waiting: (() => void)[] = [];
  const watches = new Set<{
    path: string;
    answered: boolean;
    deliver: () => void;
    refuse: () => void;
  }>();
  const kids = (path: string) => [...local.keys()].filter((k) => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/'));
  /** The rules, as in firestore.rules: a shared board (and its people) only for its people. */
  const allowed = (path: string, uid: string) => {
    const m = /^shared\/([^/]+)/.exec(path);
    return !m || server.has(`shared/${m[1]}/members/${uid}`);
  };
  const isPending = (path: string) => pending.some((p) => p.writes.some(([k]) => k === path));
  const changed = () => Promise.resolve().then(() => watches.forEach((w) => w.deliver()));
  return {
    server,
    local,
    watches,
    uid: 'u1',
    reset() {
      server.clear();
      local.clear();
      pending = [];
      waiting = [];
      watches.clear();
    },
    kids,
    allowed,
    isPending,
    changed,
    write(writes: [string, Data | null][]) {
      for (const [k, v] of writes) v ? local.set(k, v) : local.delete(k);
      changed();
      return new Promise<void>((done) => pending.push({ writes, done }));
    },
    /** The server answers the watches started since last time (checking the rules). */
    answerWatches() {
      for (const w of [...watches]) if (!w.answered) allowed(w.path, fs.uid) ? ((w.answered = true), w.deliver()) : w.refuse();
    },
    /** The saves on their way arrive. */
    arrive() {
      for (const p of pending.splice(0)) {
        for (const [k, v] of p.writes) v ? server.set(k, v) : server.delete(k);
        p.done();
      }
      waiting.splice(0).forEach((fn) => fn());
      changed();
    },
    waitForPendingWrites: () => (pending.length ? new Promise<void>((done) => waiting.push(done)) : Promise.resolve()),
  };
});

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  GoogleAuthProvider: class {},
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('firebase/firestore', () => {
  const docSnap = (path: string, fromCache: boolean) => ({
    id: path.split('/').pop(),
    exists: () => fs.local.has(path),
    data: () => fs.local.get(path),
    metadata: { fromCache, hasPendingWrites: fs.isPending(path) },
  });
  return {
    initializeFirestore: () => ({}),
    persistentLocalCache: () => ({}),
    persistentMultipleTabManager: () => ({}),
    doc: (_db: unknown, ...path: string[]) => path.join('/'),
    collection: (_db: unknown, ...path: string[]) => path.join('/'),
    serverTimestamp: () => 0,
    waitForPendingWrites: () => fs.waitForPendingWrites(),
    writeBatch: () => {
      const writes: [string, Data | null][] = [];
      return {
        set: (ref: string, v: Data) => void writes.push([ref, v]),
        delete: (ref: string) => void writes.push([ref, null]),
        commit: () => fs.write(writes),
      };
    },
    runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      const writes: [string, Data | null][] = [];
      const out = await fn({
        get: async (ref: string) => docSnap(ref, false),
        update: (ref: string, v: Data) => void writes.push([ref, { ...fs.local.get(ref), ...v }]),
      });
      if (writes.length) await fs.write(writes);
      return out;
    },
    onSnapshot: (ref: string, ...args: unknown[]) => {
      const [next, error] = args.filter((a) => typeof a === 'function') as [(s: unknown) => void, (e: unknown) => void];
      const isDoc = ref.split('/').length % 2 === 0;
      const w = {
        path: ref,
        // This person's own list is theirs: answered from the start.
        answered: !ref.startsWith('shared/'),
        deliver: () => {
          if (!fs.watches.has(w)) return;
          const fromCache = !w.answered;
          next(
            isDoc
              ? docSnap(ref, fromCache)
              : {
                  docs: fs.kids(ref).map((k) => docSnap(k, fromCache)),
                  metadata: {
                    fromCache,
                    hasPendingWrites: fs.kids(ref).some(fs.isPending),
                  },
                },
          );
        },
        refuse: () => {
          fs.watches.delete(w);
          error(
            Object.assign(new Error('Missing or insufficient permissions.'), {
              code: 'permission-denied',
            }),
          );
        },
      };
      fs.watches.add(w);
      // The device's own copy first, as Firestore does.
      Promise.resolve().then(w.deliver);
      return () => void fs.watches.delete(w);
    },
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    orderBy: vi.fn(),
    query: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
  };
});

const { collabRemote } = await import('./firebase');
const { createStore } = await import('../store/store');
const { startSharing } = await import('../store/sharing');
const { serializeShare } = await import('../model/sharing');

const user = {
  uid: 'u1',
  displayName: 'Eric',
  photoURL: null,
} as unknown as Parameters<typeof collabRemote>[0];

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const ticks = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => fs.reset());

describe('sharing a new board on the published site (job 22)', () => {
  it('the board stays, still shared, when the server refuses to show it for a moment before the share has arrived', async () => {
    const store = createStore(memoryStorage(), (fn) => fn());
    const notices: string[] = [];
    const sharing = startSharing(store, collabRemote(user), {
      client: 'page',
      storage: memoryStorage(),
      onNotice: (t) => notices.push(t),
    });
    await ticks();
    const trip = store.newBoard();
    store.renameBoard('Trip');
    store.addCard('note');

    const sharingIt = sharing.share(trip);
    await ticks();
    // The share shows on this device before it has arrived: its board is watched, and the server,
    // not yet knowing this person is one of its people, refuses.
    fs.answerWatches();
    await ticks();
    fs.arrive();
    await ticks();
    fs.answerWatches();
    await ticks();
    await sharingIt;
    await ticks();

    expect(notices).toEqual([]);
    expect(store.workspace().boards[trip]?.name).toBe('Trip');
    expect(sharing.isShared(trip)).toBe(true);
    expect(store.getState().ui.shares).toMatchObject([{ root: trip, owner: true, people: [{ uid: 'u1' }] }]);
    // Still on the person's list and one of the share's people online.
    expect([...fs.server.keys()].filter((k) => k.includes('/shared/') || k.includes('/members/')).sort()).toHaveLength(2);
  });

  it('refused again once this device’s saves have arrived: it really is no longer shared with them', async () => {
    const backend = collabRemote(user);
    fs.server.set('shared/s1', {
      owner: 'u2',
      root: 'b1',
      link: 'k',
      data: '{}',
      client: '',
      rev: 1,
    });
    const errors: unknown[] = [];
    backend.watchShare(
      's1',
      () => {},
      (e) => errors.push(e),
    );
    await ticks();
    fs.answerWatches();
    await ticks();
    fs.answerWatches();
    await ticks();
    expect(errors).toMatchObject([{ code: 'permission-denied' }]);
  });

  it('joining by link: the same moment of refusal doesn’t take the board away', async () => {
    const owner = createStore(memoryStorage(), (fn) => fn());
    const trip = owner.newBoard();
    owner.renameBoard('Trip');
    fs.server.set('shared/s1', { owner: 'u2', root: trip, link: 'k', data: serializeShare(trip, { [trip]: owner.workspace().boards[trip] }), client: '', rev: 1 });
    fs.server.set('shared/s1/members/u2', { name: 'Ann', photo: null, key: 'k', joinedAt: 0 });
    fs.server.forEach((v, k) => fs.local.set(k, v));
    const store = createStore(memoryStorage(), (fn) => fn());
    const notices: string[] = [];
    const sharing = startSharing(store, collabRemote(user), { client: 'page', storage: memoryStorage(), onNotice: (t) => notices.push(t) });
    await ticks();
    const joining = sharing.join('s1', 'k');
    await ticks();
    fs.answerWatches();
    await ticks();
    fs.arrive();
    await ticks();
    fs.answerWatches();
    await ticks();
    expect(await joining).toBe(trip);
    expect(notices).toEqual([]);
    expect(store.workspace().boards[trip]?.name).toBe('Trip');
    expect(fs.server.has('shared/s1/members/u1')).toBe(true);
  });

  it('stopped while waiting: it isn’t watched again', async () => {
    const backend = collabRemote(user);
    void fs.write([['boards/u1/shared/s1', { joinedAt: 0 }]]);
    const errors: unknown[] = [];
    const stop = backend.watchShare(
      's1',
      () => {},
      (e) => errors.push(e),
    );
    await ticks();
    fs.answerWatches();
    await ticks();
    stop();
    fs.arrive();
    await ticks();
    expect(fs.watches.size).toBe(0);
    expect(errors).toEqual([]);
  });
});
