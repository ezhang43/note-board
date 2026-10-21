import { beforeEach, describe, expect, it, vi } from 'vitest';

// The Firestore side of sharing, version history and the board (src/sync/firebase.ts), against a
// small pretend Firestore that keeps documents by path and records what each batch, transaction and
// delete did. These are the code paths behind the promises in SPEC "Sharing": removing someone
// changes the link in the same step, a save is refused (not retried quietly) once the share is
// gone, a shared board is deleted with its people, and a list from the offline copy says so.

type Data = Record<string, unknown>;

const fs = vi.hoisted(() => {
  const docs = new Map<string, Data>();
  const state = {
    /** Every batch commit and transaction, as the writes it made (set / update / delete, with path and value). */
    commits: [] as { kind: 'batch' | 'transaction'; ops: { op: string; path: string; value?: Data }[] }[],
    /** Single deletes made outside a batch. */
    deletes: [] as string[],
    /** Paths whose single delete is refused. */
    refuseDelete: new Set<string>(),
    listeners: [] as { path: string; next: (s: unknown) => void; error: (e: unknown) => void }[],
  };
  const kids = (path: string) => [...docs.keys()].filter((k) => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/'));
  const snap = (path: string) => ({ id: path.split('/').pop()!, ref: path, exists: () => docs.has(path), data: () => docs.get(path)! });
  const apply = (op: string, path: string, value?: Data) => {
    if (op === 'delete') docs.delete(path);
    else if (op === 'update') docs.set(path, { ...docs.get(path), ...value });
    else docs.set(path, value!);
  };
  return { docs, state, kids, snap, apply };
});

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
  collection: (base: unknown, ...path: string[]) => (typeof base === 'string' ? [base, ...path] : path).join('/'),
  query: (path: string) => path,
  orderBy: vi.fn(),
  serverTimestamp: () => 'SERVER_TIME',
  waitForPendingWrites: () => Promise.resolve(),
  getDoc: async (path: string) => fs.snap(path),
  getDocs: async (path: string) => ({ docs: fs.kids(path).map(fs.snap) }),
  getDocFromServer: async (path: string) => fs.snap(path),
  getDocsFromServer: async (path: string) => ({ docs: fs.kids(path).map(fs.snap) }),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: async (path: string) => {
    if (fs.state.refuseDelete.has(path)) throw Object.assign(new Error('refused'), { code: 'permission-denied' });
    fs.state.deletes.push(path);
    fs.apply('delete', path);
  },
  writeBatch: () => {
    const ops: { op: string; path: string; value?: Data }[] = [];
    return {
      set: (ref: string, value: Data) => void ops.push({ op: 'set', path: ref, value }),
      delete: (ref: string | { path?: string }) => void ops.push({ op: 'delete', path: typeof ref === 'string' ? ref : String(ref) }),
      commit: async () => {
        fs.state.commits.push({ kind: 'batch', ops });
        ops.forEach((o) => fs.apply(o.op, o.path, o.value));
      },
    };
  },
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const ops: { op: string; path: string; value?: Data }[] = [];
    const out = await fn({
      get: async (ref: string) => fs.snap(ref),
      update: (ref: string, value: Data) => void ops.push({ op: 'update', path: ref, value }),
      delete: (ref: string) => void ops.push({ op: 'delete', path: ref }),
    });
    if (ops.length) {
      fs.state.commits.push({ kind: 'transaction', ops });
      ops.forEach((o) => fs.apply(o.op, o.path, o.value));
    }
    return out;
  },
  onSnapshot: (path: string, ...args: unknown[]) => {
    const [next, error] = args.filter((a) => typeof a === 'function') as [(s: unknown) => void, (e: unknown) => void];
    const l = { path, next, error };
    fs.state.listeners.push(l);
    return () => void fs.state.listeners.splice(fs.state.listeners.indexOf(l), 1);
  },
}));

const { collabRemote, boardRemote, versionsRemote } = await import('./firebase');
const user = { uid: 'u1', displayName: 'Eric', photoURL: null } as unknown as Parameters<typeof collabRemote>[0];

beforeEach(() => {
  fs.docs.clear();
  fs.state.commits = [];
  fs.state.deletes = [];
  fs.state.refuseDelete.clear();
  fs.state.listeners = [];
});

/** A document snapshot as a watch hands it out. */
const docSnap = (data: Data | undefined, fromCache: boolean, pending = false) => ({ exists: () => data !== undefined, data: () => data!, metadata: { fromCache, hasPendingWrites: pending } });
const listener = (path: string) => fs.state.listeners.find((l) => l.path === path)!;

function seedShare(link: string | null = 'k', members = ['u1', 'u2'], rev = 3) {
  fs.docs.set('shared/s1', { owner: 'u1', root: 'b1', link, data: 'old', client: 'other', rev });
  members.forEach((m) => fs.docs.set(`shared/s1/members/${m}`, { name: m }));
}

describe('removing someone from a shared board (G14)', () => {
  it('takes them off and changes the link in one transaction', async () => {
    seedShare('k');
    await collabRemote(user).removePerson('s1', 'u2', 'k2');
    expect(fs.state.commits).toHaveLength(1);
    expect(fs.state.commits[0].kind).toBe('transaction');
    expect(fs.state.commits[0].ops).toEqual([
      { op: 'delete', path: 'shared/s1/members/u2' },
      { op: 'update', path: 'shared/s1', value: { link: 'k2' } },
    ]);
    expect(fs.docs.has('shared/s1/members/u2')).toBe(false);
    expect(fs.docs.get('shared/s1')!.link).toBe('k2');
    expect(fs.docs.has('shared/s1/members/u1')).toBe(true);
  });

  it('a link turned off stays off (decided from the online copy, not the caller)', async () => {
    seedShare(null);
    await collabRemote(user).removePerson('s1', 'u2', 'k2');
    expect(fs.state.commits[0].ops).toEqual([{ op: 'delete', path: 'shared/s1/members/u2' }]);
    expect(fs.docs.get('shared/s1')!.link).toBeNull();
  });

  it('a share that is gone is refused as "not allowed", and nothing is written', async () => {
    fs.docs.set('shared/s1/members/u2', { name: 'u2' });
    await expect(collabRemote(user).removePerson('s1', 'u2', 'k2')).rejects.toMatchObject({ code: 'permission-denied' });
    expect(fs.state.commits).toEqual([]);
    expect(fs.docs.has('shared/s1/members/u2')).toBe(true);
  });
});

describe('saving a shared board (G15)', () => {
  it('writes nothing when the change leaves the text as it is, and reports what is online', async () => {
    seedShare();
    const out = await collabRemote(user).updateShare('s1', () => 'old', 'page');
    expect(out).toEqual({ data: 'old', rev: 3 });
    expect(fs.state.commits).toEqual([]);
  });

  it('writes nothing when the change says "nothing to write" (null)', async () => {
    seedShare();
    expect(await collabRemote(user).updateShare('s1', () => null, 'page')).toEqual({ data: 'old', rev: 3 });
    expect(fs.state.commits).toEqual([]);
  });

  it('writes the new text with this page, the next save count and the server time, and reports it', async () => {
    seedShare();
    const seen: string[] = [];
    const out = await collabRemote(user).updateShare('s1', (latest) => (seen.push(latest), 'new'), 'page');
    expect(seen).toEqual(['old']);
    expect(out).toEqual({ data: 'new', rev: 4 });
    expect(fs.state.commits[0].ops).toEqual([{ op: 'update', path: 'shared/s1', value: { data: 'new', client: 'page', rev: 4, updatedAt: 'SERVER_TIME' } }]);
  });

  it('a share that is gone is refused as "not allowed" (a red banner, not a quiet retry), and nothing is recreated', async () => {
    await expect(collabRemote(user).updateShare('s1', () => 'new', 'page')).rejects.toMatchObject({ code: 'permission-denied' });
    expect(fs.state.commits).toEqual([]);
    expect(fs.docs.size).toBe(0);
  });
});

describe('deleting a shared board (G16)', () => {
  it('deletes every person record and the share in one batch, then the owner’s list entry', async () => {
    seedShare('k', ['u1', 'u2', 'u3']);
    fs.docs.set('boards/u1/shared/s1', { joinedAt: 1 });
    await collabRemote(user).deleteShare('s1');
    expect(fs.state.commits).toHaveLength(1);
    expect(fs.state.commits[0].ops.map((o) => `${o.op} ${o.path}`).sort()).toEqual(['delete shared/s1', 'delete shared/s1/members/u1', 'delete shared/s1/members/u2', 'delete shared/s1/members/u3']);
    expect(fs.state.deletes).toEqual(['boards/u1/shared/s1']);
    expect([...fs.docs.keys()]).toEqual([]);
  });

  it('still counts as deleted when only the owner’s list entry can’t be removed', async () => {
    seedShare();
    fs.docs.set('boards/u1/shared/s1', { joinedAt: 1 });
    fs.state.refuseDelete.add('boards/u1/shared/s1');
    await expect(collabRemote(user).deleteShare('s1')).resolves.toBeUndefined();
    expect(fs.docs.has('shared/s1')).toBe(false);
  });
});

describe('the list of shares (G17)', () => {
  it('says whether the list is confirmed: the offline copy is not, the server’s is; ids are sorted', () => {
    const onChange = vi.fn();
    collabRemote(user).watchMyShares(onChange, vi.fn());
    const l = listener('boards/u1/shared');
    const qs = (ids: string[], fromCache: boolean) => ({ docs: ids.map((id) => ({ id })), metadata: { fromCache } });
    l.next(qs(['s2', 's1'], true));
    l.next(qs(['s2', 's1'], false));
    expect(onChange.mock.calls).toEqual([
      [['s1', 's2'], false],
      [['s1', 's2'], true],
    ]);
  });

  it('passes a failure on', () => {
    const onError = vi.fn();
    collabRemote(user).watchMyShares(vi.fn(), onError);
    const err = new Error('x');
    listener('boards/u1/shared').error(err);
    expect(onError).toHaveBeenCalledWith(err);
  });
});

describe('watching one shared board (G18)', () => {
  const good = { owner: 'u9', root: 'b1', link: 'k', data: '{}', client: 'c', rev: 4 };

  it('hands on a good copy', () => {
    const onChange = vi.fn();
    collabRemote(user).watchShare('s1', onChange, vi.fn());
    listener('shared/s1').next(docSnap(good, false));
    expect(onChange).toHaveBeenCalledWith({ owner: 'u9', root: 'b1', link: 'k', data: '{}', client: 'c', rev: 4 });
  });

  it('fills in a missing link, page and save count, and ignores a link that is not text', () => {
    const onChange = vi.fn();
    collabRemote(user).watchShare('s1', onChange, vi.fn());
    listener('shared/s1').next(docSnap({ owner: 'u9', root: 'b1', link: 5, data: '{}' }, false));
    expect(onChange).toHaveBeenCalledWith({ owner: 'u9', root: 'b1', link: null, data: '{}', client: '', rev: 0 });
  });

  it('ignores a record without text data or without a root', () => {
    const onChange = vi.fn();
    collabRemote(user).watchShare('s1', onChange, vi.fn());
    listener('shared/s1').next(docSnap({ ...good, data: 5 }, false));
    listener('shared/s1').next(docSnap({ owner: 'u9', data: '{}' }, false));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('"not there" from the offline copy says nothing; from the server it means deleted', () => {
    const onChange = vi.fn();
    collabRemote(user).watchShare('s1', onChange, vi.fn());
    listener('shared/s1').next(docSnap(undefined, true));
    expect(onChange).not.toHaveBeenCalled();
    listener('shared/s1').next(docSnap(undefined, false));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('once the server has shown the share, a refusal is believed at once', () => {
    const onError = vi.fn();
    collabRemote(user).watchShare('s1', vi.fn(), onError);
    listener('shared/s1').next(docSnap(good, false));
    const err = Object.assign(new Error('no'), { code: 'permission-denied' });
    listener('shared/s1').error(err);
    expect(onError).toHaveBeenCalledWith(err);
  });

  it('any other failure is passed on at once, even before the server has answered', () => {
    const onError = vi.fn();
    collabRemote(user).watchShare('s1', vi.fn(), onError);
    const err = Object.assign(new Error('x'), { code: 'unavailable' });
    listener('shared/s1').error(err);
    expect(onError).toHaveBeenCalledWith(err);
  });
});

describe('who a shared board is shared with (G19)', () => {
  const member = (id: string, joinedAt: unknown, photo: unknown = null) => ({ id, data: () => ({ name: `Name ${id}`, photo, joinedAt }) });
  const at = (ms: number) => ({ toMillis: () => ms });

  it('lists people by when they joined; a join still on its way (no time yet) is last', () => {
    const onChange = vi.fn();
    collabRemote(user).watchPeople('s1', onChange, vi.fn());
    listener('shared/s1/members').next({ docs: [member('late', at(200)), member('new', null), member('first', at(100))], metadata: { fromCache: false } });
    expect(onChange.mock.calls[0][0].map((p: { uid: string }) => p.uid)).toEqual(['first', 'late', 'new']);
  });

  it('keeps a secure photo address and drops any other', () => {
    const onChange = vi.fn();
    collabRemote(user).watchPeople('s1', onChange, vi.fn());
    listener('shared/s1/members').next({
      docs: [member('a', at(1), 'https://x/p.png'), member('b', at(2), 'http://x/p.png'), member('c', at(3), 7)],
      metadata: { fromCache: false },
    });
    expect(onChange.mock.calls[0][0]).toEqual([
      { uid: 'a', name: 'Name a', photo: 'https://x/p.png' },
      { uid: 'b', name: 'Name b', photo: null },
      { uid: 'c', name: 'Name c', photo: null },
    ]);
  });
});

describe('the signed-in person’s own board (G20)', () => {
  it('says nothing for "no board" from the offline copy, and "no board" (null) once the server says so', () => {
    const onChange = vi.fn();
    boardRemote('u1').watch(onChange, vi.fn());
    listener('boards/u1').next(docSnap(undefined, true, false));
    expect(onChange).not.toHaveBeenCalled();
    listener('boards/u1').next(docSnap(undefined, false, false));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('passes on the board with who saved it, marked cached when it came from the offline copy', () => {
    const onChange = vi.fn();
    boardRemote('u1').watch(onChange, vi.fn());
    listener('boards/u1').next(docSnap({ data: '{"a":1}', client: 'laptop' }, true));
    expect(onChange).toHaveBeenCalledWith({ data: '{"a":1}', client: 'laptop', cached: true });
  });

  it('after the first answer, this device’s own unconfirmed saves are skipped', () => {
    const onChange = vi.fn();
    boardRemote('u1').watch(onChange, vi.fn());
    listener('boards/u1').next(docSnap({ data: 'x', client: 'me' }, false));
    listener('boards/u1').next(docSnap({ data: 'y', client: 'me' }, false, true));
    expect(onChange).toHaveBeenCalledOnce();
  });
});

describe('version history online (G20)', () => {
  it('a version that is missing, or whose board is not text, reads as nothing', async () => {
    fs.docs.set('boards/u1/versionData/v2', { data: 5 });
    expect(await versionsRemote('u1').get('v1')).toBeNull();
    expect(await versionsRemote('u1').get('v2')).toBeNull();
    fs.docs.set('boards/u1/versionData/v3', { data: '{"x":1}' });
    expect(await versionsRemote('u1').get('v3')).toBe('{"x":1}');
  });

  it('removing a version deletes its list entry and its board', async () => {
    fs.docs.set('boards/u1/versions/v1', { savedAt: 1 });
    fs.docs.set('boards/u1/versionData/v1', { data: '{}' });
    await versionsRemote('u1').remove('v1');
    expect([...fs.docs.keys()]).toEqual([]);
    expect(fs.state.deletes.sort()).toEqual(['boards/u1/versionData/v1', 'boards/u1/versions/v1']);
  });
});
