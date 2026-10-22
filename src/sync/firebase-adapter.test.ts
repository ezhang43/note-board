import { beforeEach, describe, expect, it, vi } from 'vitest';

// The Firestore side of sharing, version history and the board (src/sync/database.ts), against a
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
    /** A batch commit this says no to is refused, as the rules would (job 161: joining with the wrong role). */
    refuseBatch: null as null | ((ops: { op: string; path: string; value?: Data }[]) => boolean),
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
      set: (ref: string, value: Data, o?: { merge?: boolean }) => void ops.push({ op: o?.merge ? 'update' : 'set', path: ref, value }),
      update: (ref: string, value: Data) => void ops.push({ op: 'update', path: ref, value }),
      delete: (ref: string | { path?: string }) => void ops.push({ op: 'delete', path: typeof ref === 'string' ? ref : String(ref) }),
      commit: async () => {
        if (fs.state.refuseBatch?.(ops)) throw Object.assign(new Error('refused'), { code: 'permission-denied' });
        fs.state.commits.push({ kind: 'batch', ops });
        ops.forEach((o) => fs.apply(o.op, o.path, o.value));
      },
    };
  },
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const ops: { op: string; path: string; value?: Data }[] = [];
    const out = await fn({
      get: async (ref: string) => fs.snap(ref),
      // A merged set changes only the fields given, as an update does (here it may also make the record).
      set: (ref: string, value: Data, o?: { merge?: boolean }) => void ops.push({ op: o?.merge ? 'update' : 'set', path: ref, value }),
      update: (ref: string, value: Data) => void ops.push({ op: 'update', path: ref, value }),
      delete: (ref: string) => void ops.push({ op: 'delete', path: ref }),
    });
    if (fs.state.refuseBatch?.(ops)) throw Object.assign(new Error('refused'), { code: 'permission-denied' });
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

const { collabRemote, boardRemote, versionsRemote } = await import('./database');
const user = { uid: 'u1', displayName: 'Eric', photoURL: null } as unknown as Parameters<typeof collabRemote>[0];

beforeEach(() => {
  fs.docs.clear();
  fs.state.commits = [];
  fs.state.deletes = [];
  fs.state.refuseDelete.clear();
  fs.state.refuseBatch = null;
  fs.state.listeners = [];
});

/** A document snapshot as a watch hands it out. */
const docSnap = (data: Data | undefined, fromCache: boolean, pending = false) => ({ exists: () => data !== undefined, data: () => data!, metadata: { fromCache, hasPendingWrites: pending } });
const listener = (path: string) => fs.state.listeners.find((l) => l.path === path)!;

const keys = { edit: 'k2', comment: 'c2', view: 'v2' };

function seedShare(link: string | null = 'k', members = ['u1', 'u2'], rev = 3) {
  fs.docs.set('shared/s1', { owner: 'u1', root: 'b1', link, data: 'old', client: 'other', rev });
  members.forEach((m) => fs.docs.set(`shared/s1/members/${m}`, { name: m }));
}

describe('roles on a shared board (job 161, PR 2)', () => {
  it('removing someone changes the comment and view links that are on too, and leaves those off alone', async () => {
    seedShare(null);
    fs.docs.set('shared/s1/private/links', { edit: 'k', comment: null, view: 'v' });
    await collabRemote(user).removePerson('s1', 'u2', keys);
    expect(fs.state.commits[0].ops).toEqual([
      { op: 'delete', path: 'shared/s1/members/u2' },
      { op: 'delete', path: 'shared/s1/joins/u2' },
      { op: 'update', path: 'shared/s1/private/links', value: { edit: 'k2', view: 'v2' } },
    ]);
  });

  it('the first comment or view link changes an edit link that is on, in the same step (D1)', async () => {
    seedShare('old');
    await collabRemote(user).makeLink('s1', 'comment', keys);
    expect(fs.state.commits[0]).toEqual({
      kind: 'transaction',
      ops: [
        { op: 'update', path: 'shared/s1/private/links', value: { comment: 'c2', edit: 'k2' } },
        { op: 'update', path: 'shared/s1', value: { link: null } },
      ],
    });
    // The next one doesn't (roles are in use: the comment field is there).
    await collabRemote(user).makeLink('s1', 'view', { edit: 'k3', comment: 'c3', view: 'v3' });
    expect(fs.state.commits[1].ops).toEqual([{ op: 'update', path: 'shared/s1/private/links', value: { view: 'v3' } }]);
    expect(fs.docs.get('shared/s1/private/links')).toEqual({ comment: 'c2', edit: 'k2', view: 'v3' });
  });

  it('the first view link while the edit link is off leaves it off; the edit link alone changes nothing else', async () => {
    seedShare(null);
    fs.docs.set('shared/s1/private/links', { edit: null });
    await collabRemote(user).makeLink('s1', 'view', keys);
    expect(fs.state.commits[0].ops).toEqual([{ op: 'update', path: 'shared/s1/private/links', value: { view: 'v2' } }]);
    await collabRemote(user).makeLink('s1', 'edit', keys);
    expect(fs.state.commits[1].ops).toEqual([{ op: 'update', path: 'shared/s1/private/links', value: { edit: 'k2' } }]);
  });

  it('turning links off empties every link there is (no comment or view field added before roles are in use)', async () => {
    seedShare('old');
    await collabRemote(user).linksOff('s1');
    expect(fs.state.commits[0].ops).toEqual([
      { op: 'update', path: 'shared/s1/private/links', value: { edit: null } },
      { op: 'update', path: 'shared/s1', value: { link: null } },
    ]);
    fs.docs.set('shared/s1/private/links', { edit: 'k', comment: 'c' });
    await collabRemote(user).linksOff('s1');
    expect(fs.state.commits[1].ops).toEqual([{ op: 'update', path: 'shared/s1/private/links', value: { edit: null, comment: null, view: null } }]);
  });

  it('changing a role writes only the role; lowering changes the links above the new role that are on', async () => {
    seedShare('old');
    fs.docs.set('shared/s1/members/u2', { name: 'u2', key: 'old' });
    fs.docs.set('shared/s1/private/links', { comment: 'c' });
    await collabRemote(user).setRole('s1', 'u2', 'view', keys);
    expect(fs.state.commits[0].ops).toEqual([
      { op: 'update', path: 'shared/s1/members/u2', value: { role: 'view' } },
      { op: 'update', path: 'shared/s1/private/links', value: { edit: 'k2', comment: 'c2' } },
      { op: 'update', path: 'shared/s1', value: { link: null } },
    ]);
    // Raising changes no link; the same role changes nothing.
    await collabRemote(user).setRole('s1', 'u2', 'comment', keys);
    expect(fs.state.commits[1].ops).toEqual([{ op: 'update', path: 'shared/s1/members/u2', value: { role: 'comment' } }]);
    await collabRemote(user).setRole('s1', 'u2', 'comment', keys);
    expect(fs.state.commits).toHaveLength(2);
    // Lowering to comment changes only the edit link.
    fs.docs.set('shared/s1/members/u2', { name: 'u2', role: 'edit' });
    await collabRemote(user).setRole('s1', 'u2', 'comment', { edit: 'k9', comment: 'c9', view: 'v9' });
    expect(fs.state.commits[2].ops).toEqual([
      { op: 'update', path: 'shared/s1/members/u2', value: { role: 'comment' } },
      { op: 'update', path: 'shared/s1/private/links', value: { edit: 'k9' } },
    ]);
  });

  // Code review (high): otherwise an old app could put the new edit key where the lowered person reads it.
  it('lowering someone on a share with no comment or view link yet puts roles in use (both fields, empty)', async () => {
    seedShare(null);
    fs.docs.set('shared/s1/members/u2', { name: 'u2' });
    fs.docs.set('shared/s1/private/links', { edit: 'k' });
    await collabRemote(user).setRole('s1', 'u2', 'view', keys);
    expect(fs.state.commits[0].ops).toEqual([
      { op: 'update', path: 'shared/s1/members/u2', value: { role: 'view' } },
      { op: 'update', path: 'shared/s1/private/links', value: { comment: null, view: null, edit: 'k2' } },
    ]);
  });

  // Code review (high): the links watch, refused while they weren't an editor, starts again once they are one.
  it('someone made an editor gets the links without reloading', async () => {
    const onChange = vi.fn();
    collabRemote(user).watchShare('s1', onChange, vi.fn());
    listener('shared/s1').next(docSnap({ owner: 'u9', root: 'b1', link: null, data: '{}' }, false));
    const refused = Object.assign(new Error('no'), { code: 'permission-denied' });
    listener('shared/s1/private/links').error(refused);
    await new Promise((done) => setTimeout(done, 0));
    listener('shared/s1/private/links').error(refused);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ links: { edit: null, comment: null, view: null, roles: false } }));
    // (This pretend Firestore keeps refused watches on its list: the newest one is the one in use.)
    const watch = () => fs.state.listeners.filter((l) => l.path === 'shared/s1/private/links').at(-1);
    const before = watch();
    listener('shared/s1/members/u1').next(docSnap({ name: 'Eric', role: 'view' }, false));
    expect(watch()).toBe(before);
    listener('shared/s1/members/u1').next(docSnap({ name: 'Eric', role: 'edit' }, false));
    expect(watch()).not.toBe(before);
    fs.state.listeners.filter((l) => l.path === 'shared/s1/private/links').at(-1)!.next(docSnap({ edit: 'e', comment: null, view: 'v' }, false));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ links: { edit: 'e', comment: null, view: 'v', roles: true } }));
  });

  it('someone not on it, or a share that is gone: refused as "not allowed", nothing written', async () => {
    await expect(collabRemote(user).setRole('s1', 'u2', 'view', keys)).rejects.toMatchObject({ code: 'permission-denied' });
    seedShare('k', ['u1']);
    await expect(collabRemote(user).setRole('s1', 'u2', 'view', keys)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(collabRemote(user).makeLink('s9', 'view', keys)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(fs.state.commits).toEqual([]);
  });

  /** Refuses a join batch unless its member record has `role`. */
  const onlyRole = (role: string) => (ops: { path: string; value?: Data }[]) => ops.some((o) => o.path === 'shared/s1/members/u1' && o.value?.role !== role);

  it('joining takes the role the key gives: tried from edit down, the others refused online', async () => {
    seedShare(null, ['u2']);
    fs.state.refuseBatch = onlyRole('view');
    expect(await collabRemote(user).join('s1', 'vkey')).toBe(true);
    expect(fs.state.commits).toHaveLength(1);
    expect(fs.state.commits[0].ops).toEqual([
      { op: 'set', path: 'shared/s1/joins/u1', value: { key: 'vkey' } },
      { op: 'update', path: 'shared/s1/members/u1', value: { name: 'Eric', photo: null, role: 'view', joinedAt: 'SERVER_TIME' } },
      { op: 'set', path: 'boards/u1/shared/s1', value: { joinedAt: 'SERVER_TIME' } },
    ]);
  });

  it('someone already on it tries only their role and those above it, keeping their place in the list (and an old key)', async () => {
    seedShare(null, ['u2']);
    fs.docs.set('shared/s1/members/u1', { name: 'Old name', key: 'old', role: 'comment', joinedAt: 5 });
    const tried: string[] = [];
    fs.state.refuseBatch = (ops) => {
      const role = String(ops.find((o) => o.path === 'shared/s1/members/u1')?.value?.role);
      tried.push(role);
      return role !== 'comment';
    };
    expect(await collabRemote(user).join('s1', 'vkey')).toBe(false);
    expect(tried).toEqual(['edit', 'comment']);
    expect(fs.docs.get('shared/s1/members/u1')).toEqual({ name: 'Eric', photo: null, key: 'old', role: 'comment', joinedAt: 5 });
  });

  it('a key that gives no role is refused', async () => {
    seedShare(null, ['u2']);
    fs.state.refuseBatch = () => true;
    await expect(collabRemote(user).join('s1', 'bad')).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('removing someone from a shared board (G14)', () => {
  it('takes them off and changes the link in one transaction', async () => {
    seedShare('k');
    await collabRemote(user).removePerson('s1', 'u2', keys);
    expect(fs.state.commits).toHaveLength(1);
    expect(fs.state.commits[0].kind).toBe('transaction');
    // Job 161: the new key goes in the private record, and one still in the share moves out of it.
    expect(fs.state.commits[0].ops).toEqual([
      { op: 'delete', path: 'shared/s1/members/u2' },
      { op: 'delete', path: 'shared/s1/joins/u2' },
      { op: 'update', path: 'shared/s1/private/links', value: { edit: 'k2' } },
      { op: 'update', path: 'shared/s1', value: { link: null } },
    ]);
    expect(fs.docs.has('shared/s1/members/u2')).toBe(false);
    expect(fs.docs.get('shared/s1/private/links')!.edit).toBe('k2');
    expect(fs.docs.get('shared/s1')!.link).toBeNull();
    expect(fs.docs.has('shared/s1/members/u1')).toBe(true);
  });

  it('changes a key kept in the private record (job 161)', async () => {
    seedShare(null);
    fs.docs.set('shared/s1/private/links', { edit: 'k' });
    await collabRemote(user).removePerson('s1', 'u2', keys);
    expect(fs.state.commits[0].ops).toEqual([
      { op: 'delete', path: 'shared/s1/members/u2' },
      { op: 'delete', path: 'shared/s1/joins/u2' },
      { op: 'update', path: 'shared/s1/private/links', value: { edit: 'k2' } },
    ]);
  });

  it('a link turned off stays off (decided from the online copy, not the caller)', async () => {
    seedShare(null);
    fs.docs.set('shared/s1/private/links', { edit: null });
    await collabRemote(user).removePerson('s1', 'u2', keys);
    expect(fs.state.commits[0].ops).toEqual([
      { op: 'delete', path: 'shared/s1/members/u2' },
      { op: 'delete', path: 'shared/s1/joins/u2' },
    ]);
    expect(fs.docs.get('shared/s1')!.link).toBeNull();
    expect(fs.docs.get('shared/s1/private/links')!.edit).toBeNull();
  });

  it('a share that is gone is refused as "not allowed", and nothing is written', async () => {
    fs.docs.set('shared/s1/members/u2', { name: 'u2' });
    await expect(collabRemote(user).removePerson('s1', 'u2', keys)).rejects.toMatchObject({ code: 'permission-denied' });
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
  it('deletes every comment, person, joins and links record and the share, then the owner’s list entry', async () => {
    seedShare('k', ['u1', 'u2', 'u3']);
    fs.docs.set('boards/u1/shared/s1', { joinedAt: 1 });
    fs.docs.set('shared/s1/private/links', { edit: 'k' });
    fs.docs.set('shared/s1/joins/u2', { key: 'k' });
    fs.docs.set('shared/s1/comments/c1', { text: 'hi' });
    await collabRemote(user).deleteShare('s1');
    // Comments and joins records first (in batches of at most 400), then the rest in one go.
    expect(fs.state.commits).toHaveLength(2);
    expect(fs.state.commits[0].ops.map((o) => `${o.op} ${o.path}`).sort()).toEqual([
      'delete shared/s1/comments/c1',
      'delete shared/s1/joins/u1',
      'delete shared/s1/joins/u2',
      'delete shared/s1/joins/u3',
    ]);
    expect(fs.state.commits[1].ops.map((o) => `${o.op} ${o.path}`).sort()).toEqual([
      'delete shared/s1',
      'delete shared/s1/members/u1',
      'delete shared/s1/members/u2',
      'delete shared/s1/members/u3',
      'delete shared/s1/private/links',
    ]);
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
    expect(onChange).toHaveBeenCalledWith({ owner: 'u9', root: 'b1', links: { edit: 'k', comment: null, view: null, roles: false }, data: '{}', client: 'c', rev: 4 });
  });

  it('fills in a missing link, page and save count, and ignores a link that is not text', () => {
    const onChange = vi.fn();
    collabRemote(user).watchShare('s1', onChange, vi.fn());
    listener('shared/s1').next(docSnap({ owner: 'u9', root: 'b1', link: 5, data: '{}' }, false));
    // Job 161: the link isn't known until the private links record has answered (here: there is none).
    expect(onChange).toHaveBeenLastCalledWith({ owner: 'u9', root: 'b1', links: undefined, data: '{}', client: '', rev: 0 });
    listener('shared/s1/private/links').next(docSnap(undefined, false));
    expect(onChange).toHaveBeenLastCalledWith({ owner: 'u9', root: 'b1', links: { edit: null, comment: null, view: null, roles: false }, data: '{}', client: '', rev: 0 });
  });

  it('hands on all three links from the private record, and whether roles are in use (job 161)', () => {
    const onChange = vi.fn();
    collabRemote(user).watchShare('s1', onChange, vi.fn());
    listener('shared/s1').next(docSnap({ ...good, link: null }, false));
    listener('shared/s1/private/links').next(docSnap({ edit: 'e', comment: null, view: 'v' }, false));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ links: { edit: 'e', comment: null, view: 'v', roles: true } }));
    listener('shared/s1/private/links').next(docSnap({ edit: 'e', comment: 7 }, false));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ links: { edit: 'e', comment: null, view: null, roles: true } }));
  });

  it('the People list carries each role (none, or one that isn’t known, is edit)', () => {
    const onChange = vi.fn();
    collabRemote(user).watchPeople('s1', onChange, vi.fn());
    const member = (id: string, data: Data) => ({ id, data: () => data });
    listener('shared/s1/members').next({ docs: [member('a', { name: 'A', joinedAt: null }), member('b', { name: 'B', role: 'view' }), member('c', { name: 'C', role: 'boss' })], metadata: { fromCache: false } });
    expect(onChange).toHaveBeenCalledWith([
      { uid: 'a', name: 'A', photo: null, role: 'edit' },
      { uid: 'b', name: 'B', photo: null, role: 'view' },
      { uid: 'c', name: 'C', photo: null, role: 'edit' },
    ]);
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
      { uid: 'a', name: 'Name a', photo: 'https://x/p.png', role: 'edit' },
      { uid: 'b', name: 'Name b', photo: null, role: 'edit' },
      { uid: 'c', name: 'Name c', photo: null, role: 'edit' },
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

describe('comments on cards (job 161, PR 4)', () => {
  it('a new comment: the fields the rules allow, the server’s time, not resolved, as this person', async () => {
    const { setDoc } = await import('firebase/firestore');
    vi.mocked(setDoc).mockClear();
    await collabRemote(user).addComment('s1', { id: 'm1', card: 'k_1', text: 'Looks good', name: 'Eric', photo: null });
    expect(vi.mocked(setDoc).mock.calls).toEqual([['shared/s1/comments/m1', { card: 'k_1', text: 'Looks good', author: 'u1', name: 'Eric', photo: null, at: 'SERVER_TIME', resolved: false }]]);
  });

  it('resolving or reopening changes only resolved and its time', async () => {
    const { updateDoc } = await import('firebase/firestore');
    vi.mocked(updateDoc).mockClear();
    await collabRemote(user).resolveComment('s1', 'm1', true);
    await collabRemote(user).resolveComment('s1', 'm1', false);
    expect(vi.mocked(updateDoc).mock.calls).toEqual([
      ['shared/s1/comments/m1', { resolved: true, resolvedAt: 'SERVER_TIME' }],
      ['shared/s1/comments/m1', { resolved: false, resolvedAt: 'SERVER_TIME' }],
    ]);
  });

  it('deleting one deletes its record', async () => {
    fs.docs.set('shared/s1/comments/m1', { text: 'x' });
    await collabRemote(user).deleteComment('s1', 'm1');
    expect(fs.state.deletes).toEqual(['shared/s1/comments/m1']);
  });

  it('watching: times as milliseconds (a comment on its way gets an estimate), records that aren’t right are skipped, only secure photos', () => {
    const got: unknown[] = [];
    collabRemote(user).watchComments('s1', (c) => got.push(c), () => {});
    const at = (ms: number) => ({ toMillis: () => ms });
    const d = (id: string, data: Data) => ({ id, data: () => data });
    listener('shared/s1/comments').next({
      metadata: { fromCache: false },
      docs: [
        d('m1', { card: 'k_1', text: 'hi', author: 'u2', name: 'Sam', photo: 'https://x/p.png', at: at(5), resolved: true, resolvedAt: at(9) }),
        d('m2', { card: 'k_1', text: 'yo', author: 'u3', name: 'Ann', photo: 'http://x/p.png', at: null, resolved: false }),
        d('m3', { card: 5, text: 'bad', author: 'u3', name: 'Ann', photo: null, at: at(1), resolved: false }),
        d('m4', { card: 'k_1', text: { x: 1 }, author: 'u3', name: 'Ann', photo: null, at: at(1), resolved: false }),
      ],
    });
    expect(got).toHaveLength(1);
    const list = got[0] as { id: string; photo: string | null; at: number; resolvedAt: number | null }[];
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ id: 'm1', card: 'k_1', text: 'hi', author: 'u2', name: 'Sam', photo: 'https://x/p.png', at: 5, resolved: true, resolvedAt: 9 });
    expect(list[1]).toMatchObject({ id: 'm2', photo: null, resolved: false, resolvedAt: null });
    expect(list[1].at).toEqual(expect.any(Number));
  });
});
