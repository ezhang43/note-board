import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeWorkspace, parseWorkspace } from '../model/workspace';
import type { RemoteDoc } from '../store/sync';

// The signed-in session (src/sync/session.ts), tested end to end with pretend Firebase pieces:
// sign-in to ready, the 5-second wait for shares, sign-out, the account deleted elsewhere, deleting
// your own account, the page being hidden, going offline and the "Saved" note. session.ts keeps its
// state at module level and starts watching as soon as it is imported, so each test sets up the
// browser globals first and imports a fresh copy.

type Listener = (doc: RemoteDoc | null) => void;

interface FakeRemote {
  send: (doc: RemoteDoc | null) => void;
  error: (e: unknown) => void;
  writes: RemoteDoc[];
  fail: { on: boolean };
  watching: () => boolean;
}

const h = vi.hoisted(() => ({
  userCb: null as null | ((u: unknown) => void),
  remotes: new Map<string, unknown>(),
  server: null as unknown as {
    control: { refuse: boolean; offline: boolean };
    shares: Map<string, { data: string; rev: number; link: string }>;
    backendFor: (who: { uid: string; name: string; photo: null }) => Record<string, unknown>;
  },
  account: null as unknown,
  silentShares: false,
  user: null as null | { uid: string },
  calls: [] as string[],
}));

function memory(initial: Record<string, string> = {}) {
  const d = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return d.size;
    },
    key: (i: number) => [...d.keys()][i] ?? null,
    getItem: (k: string) => d.get(k) ?? null,
    setItem: (k: string, v: string) => void d.set(k, v),
    removeItem: (k: string) => void d.delete(k),
  };
}

vi.mock('./firebase', () => ({
  watchUser: (cb: (u: unknown) => void) => ((h.userCb = cb), () => {}),
  currentUser: () => h.user,
  signInWithGoogle: vi.fn(async () => {}),
  signOutUser: vi.fn(async () => {
    h.calls.push('signOutUser');
  }),
  confirmSignIn: vi.fn(async () => {}),
}));

// The database code (./database) is loaded once someone signs in (job 169); here it arrives at once.
vi.mock('./database', async () => {
  const { localVersionStore } = await import('../store/versions');
  const versionsStore = localVersionStore(memory());
  return {
    clearOfflineCopy: vi.fn(async () => {
      h.calls.push('clearOfflineCopy');
    }),
    sendFeedback: vi.fn(async () => {}),
    accountRemote: () => h.account,
    collabRemote: (u: { uid: string }) => {
      const backend = h.server.backendFor({ uid: u.uid, name: u.uid, photo: null });
      return h.silentShares ? { ...backend, watchMyShares: () => () => {} } : backend;
    },
    versionsRemote: () => versionsStore,
    boardRemote: (uid: string) => {
      let listener: Listener | null = null;
      let onErr: ((e: unknown) => void) | null = null;
      const writes: RemoteDoc[] = [];
      const fail = { on: false };
      const remote: FakeRemote & { watch: unknown; write: unknown } = {
        watch: (onChange: Listener, onError: (e: unknown) => void) => {
          listener = onChange;
          onErr = onError;
          return () => {
            listener = null;
          };
        },
        write: (doc: RemoteDoc) => {
          writes.push(doc);
          return fail.on ? Promise.reject(new Error('refused')) : Promise.resolve();
        },
        send: (doc) => listener?.(doc),
        error: (e) => onErr?.(e),
        writes,
        fail,
        watching: () => listener !== null,
      };
      h.remotes.set(uid, remote);
      return remote;
    },
  };
});

vi.mock('../store/appStore', async () => ({ appStore: (await import('../store/store')).createStore(null, (fn) => fn()) }));

const remote = (uid: string) => h.remotes.get(uid) as FakeRemote;
/** Asked again (review 137-A H5), alice's sign-in is gone once her account is deleted, unless a test says otherwise. */
const signIn = { gone: true };
const alice = {
  uid: 'alice',
  displayName: 'Alice',
  photoURL: null,
  getIdToken: async () => {
    if (signIn.gone) throw Object.assign(new Error('gone'), { code: 'auth/user-token-expired' });
    return 'token';
  },
};
const bob = { uid: 'bob', displayName: 'Bob', photoURL: null };

/** Lets the pretend server's answers (microtasks) and uploads arrive. */
async function settle() {
  for (let i = 0; i < 60; i++) await Promise.resolve();
}

function target() {
  const ls = new Map<string, (() => void)[]>();
  return {
    addEventListener: (t: string, f: () => void) => void ls.set(t, [...(ls.get(t) ?? []), f]),
    fire: (t: string) => ls.get(t)?.forEach((f) => f()),
  };
}

let win: ReturnType<typeof target>;
let doc: ReturnType<typeof target> & { visibilityState: string };
let nav: { onLine: boolean };
let local: ReturnType<typeof memory>;
let sessionStore: ReturnType<typeof memory>;
let loc: { search: string; href: string; reload: ReturnType<typeof vi.fn> };
let hist: { state: null; replaceState: ReturnType<typeof vi.fn> };

async function load() {
  vi.resetModules();
  h.remotes.clear();
  h.server = (await import('../store/collab')).memoryServer((fn) => queueMicrotask(fn)) as never;
  h.calls.length = 0;
  h.silentShares = false;
  h.user = null;
  h.account = null;
  const session = (await import('./session')).session;
  const versions = await import('../store/versions');
  const appStore = (await import('../store/appStore')).appStore;
  const collab = (await import('./collabSession')).collab;
  const account = (await import('./account')).account;
  const firebase = await import('./firebase');
  return { session, versions, appStore, collab, account, firebase };
}

beforeEach(() => {
  vi.useFakeTimers();
  win = target();
  doc = { ...target(), visibilityState: 'visible' };
  nav = { onLine: true };
  local = memory();
  sessionStore = memory();
  loc = { search: '', href: 'https://x/', reload: vi.fn() };
  hist = { state: null, replaceState: vi.fn() };
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('navigator', nav);
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', sessionStore);
  vi.stubGlobal('location', loc);
  vi.stubGlobal('history', hist);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Signs `user` in and has their online boards answer, so the session is ready. */
async function signInReady(user: { uid: string; displayName: string; photoURL: null } = alice, send: RemoteDoc | null = null) {
  h.user = user;
  h.userCb!(user);
  await settle();
  remote(user.uid).send(send);
  await settle();
}

describe('session: signing in', () => {
  it('is "checking" until Firebase says who is signed in, then "signed-out" with nobody', async () => {
    const { session } = await load();
    expect(session.getStatus()).toBe('checking');
    h.userCb!(null);
    expect(session.getStatus()).toBe('signed-out');
  });

  it('goes loading, then ready once the online boards arrive; version history only starts at ready', async () => {
    const s = await load();
    h.userCb!(alice);
    expect(s.session.getStatus()).toBe('loading');
    await settle();
    expect(s.versions.activeVersionStore()).toBeNull();
    remote('alice').send(null);
    expect(s.session.getStatus()).toBe('ready');
    expect(s.versions.activeVersionStore()).not.toBeNull();
  });

  it('uploads this device’s board when the person has no online copy yet', async () => {
    const s = await load();
    s.appStore.renameBoard('From this device');
    await signInReady();
    expect(remote('alice').writes).toHaveLength(1);
    expect(JSON.parse(remote('alice').writes[0].data).boards[JSON.parse(remote('alice').writes[0].data).home].name).toBe('From this device');
  });

  it('uses the online board when there is one, and writes nothing', async () => {
    const s = await load();
    const online = parseWorkspace(null);
    const data = serializeWorkspace({ ...online, boards: { [online.home]: { ...online.boards[online.home], name: 'From the cloud' } } });
    await signInReady(alice, { data, client: 'other' });
    expect(s.appStore.getState().board.name).toBe('From the cloud');
    vi.advanceTimersByTime(800);
    expect(remote('alice').writes).toEqual([]);
  });

  it('opens the person’s own boards after 5 seconds if the shared boards never answer, not before', async () => {
    const s = await load();
    // Shares that never answer, set before sign-in.
    h.silentShares = true;
    h.userCb!(alice);
    await settle();
    vi.advanceTimersByTime(4999);
    expect(remote('alice').watching()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(remote('alice').watching()).toBe(true);
    remote('alice').send(null);
    expect(s.session.getStatus()).toBe('ready');
  });

  it('the 5-second wait of a person who signed out does nothing for the next person', async () => {
    const s = await load();
    h.silentShares = true;
    h.userCb!(alice);
    await settle();
    const aliceRemote = remote('alice');
    vi.advanceTimersByTime(1000);
    h.userCb!(null);
    vi.advanceTimersByTime(1000);
    h.userCb!(bob);
    await settle();
    vi.advanceTimersByTime(3000);
    expect(aliceRemote.watching()).toBe(false);
    expect(remote('bob').watching()).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(remote('bob').watching()).toBe(true);
    expect(s.session.getStatus()).toBe('loading');
  });

  it('is "no-access" when the online rules turn the account away, and "error" for any other failure', async () => {
    const s = await load();
    h.userCb!(alice);
    await settle();
    remote('alice').error({ code: 'permission-denied' });
    expect(s.session.getStatus()).toBe('no-access');
    h.userCb!(null);
    h.userCb!(bob);
    await settle();
    remote('bob').error({ code: 'unavailable' });
    expect(s.session.getStatus()).toBe('error');
  });

  it('is "error" when the online copy cannot be read', async () => {
    const s = await load();
    await signInReady(alice, { data: 'not json', client: 'other' });
    expect(s.session.getStatus()).toBe('error');
  });

  it('a failed Google sign-in says so, but closing the Google window does not', async () => {
    const s = await load();
    s.session.signIn();
    const signIn = s.firebase.signInWithGoogle as ReturnType<typeof vi.fn>;
    expect(signIn).toHaveBeenCalledOnce();
    signIn.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });
    s.session.signIn();
    await settle();
    expect(s.session.getSignInError()).toBe('');
    signIn.mockRejectedValueOnce({ code: 'auth/network-request-failed' });
    s.session.signIn();
    await settle();
    expect(s.session.getStatus()).toBe('signed-out');
    expect(s.session.getSignInError()).toMatch(/Sign-in didn.t work/);
  });
});

describe('session: signing out and an account deleted elsewhere', () => {
  it('Sign out writes the waiting edit first, then signs out; later edits are not written', async () => {
    const s = await load();
    await signInReady();
    const writes = remote('alice').writes.length;
    s.appStore.renameBoard('Last words');
    s.session.signOut();
    expect(remote('alice').writes).toHaveLength(writes + 1);
    expect(h.calls).toEqual(['signOutUser']);
    h.userCb!(null);
    expect(s.session.getStatus()).toBe('signed-out');
    s.appStore.renameBoard('After sign-out');
    vi.advanceTimersByTime(800);
    await settle();
    expect(remote('alice').writes).toHaveLength(writes + 1);
  });

  it('the online board being deleted from another device signs this one out, with the note', async () => {
    const s = await load();
    const online = serializeWorkspace(parseWorkspace(null));
    await signInReady(alice, { data: online, client: 'other' });
    remote('alice').send(null);
    await settle();
    expect(h.calls).toEqual(['signOutUser']);
    h.userCb!(null);
    expect(s.session.getStatus()).toBe('signed-out');
    expect(s.session.wasDeleted()).toBe(true);
    const writes = remote('alice').writes.length;
    s.appStore.renameBoard('Edit after');
    vi.advanceTimersByTime(800);
    await settle();
    expect(remote('alice').writes).toHaveLength(writes);
    // Signing in again clears the note.
    h.userCb!(alice);
    expect(s.session.wasDeleted()).toBe(false);
  });

  it('another page marking the account deleted while its sign-in is still there (about to go, or deleting it failed): this one isn’t signed out and uploads nothing (review 137-A H5)', async () => {
    const s = await load();
    signIn.gone = false;
    try {
      await signInReady(alice, { data: serializeWorkspace(parseWorkspace(null)), client: 'other' });
      remote('alice').send({ data: '', client: 'other', deleting: 'done' });
      await settle();
      expect(h.calls).not.toContain('signOutUser');
      expect(s.session.getStatus()).toBe('ready');
      const writes = remote('alice').writes.length;
      s.appStore.renameBoard('Edit after');
      vi.advanceTimersByTime(800);
      await settle();
      expect(remote('alice').writes).toHaveLength(writes);
    } finally {
      signIn.gone = true;
    }
  });

  it('a different person signing in gets the sharing and sync of their own, and the earlier person’s is stopped', async () => {
    const s = await load();
    await signInReady(alice);
    const first = s.collab.sharing();
    h.userCb!(null);
    expect(s.collab.sharing()).toBeNull();
    await signInReady(bob);
    expect(s.collab.sharing()).not.toBe(first);
    expect(s.collab.me()?.uid).toBe('bob');
    expect(s.session.getStatus()).toBe('ready');
    expect(remote('alice').watching()).toBe(false);
  });
});

describe('session: the page and the connection', () => {
  it('hiding the page sends a waiting edit without waiting for the timer', async () => {
    const s = await load();
    await signInReady();
    const writes = remote('alice').writes.length;
    s.appStore.renameBoard('Hidden soon');
    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    expect(remote('alice').writes).toHaveLength(writes + 1);
  });

  it('shows Saved, Saving…, then Saved, and an offline note while there is no connection', async () => {
    const s = await load();
    await signInReady();
    expect(s.session.getSaveNote()).toBe('Saved');
    s.appStore.renameBoard('Changed');
    vi.advanceTimersByTime(800);
    expect(s.session.getSaveNote()).toBe('Saving…');
    await settle();
    expect(s.session.getSaveNote()).toBe('Saved');
    nav.onLine = false;
    win.fire('offline');
    expect(s.session.getSaveNote()).toBe('Offline. Will save when you’re back online');
    nav.onLine = true;
    win.fire('online');
    expect(s.session.getSaveNote()).toBe('Saved');
  });

  it('a refused upload shows the "couldn’t save" state and no note', async () => {
    const s = await load();
    await signInReady();
    remote('alice').fail.on = true;
    s.appStore.renameBoard('Too big');
    vi.advanceTimersByTime(800);
    await settle();
    expect(s.session.getSaveFailed()).toBe(true);
    expect(s.session.getSaveNote()).toBeNull();
  });

  it('listeners hear about status and save changes, and stop hearing when they unsubscribe', async () => {
    const s = await load();
    const heard = vi.fn();
    const off = s.session.subscribe(heard);
    h.userCb!(alice);
    expect(heard).toHaveBeenCalled();
    heard.mockClear();
    off();
    await settle();
    remote('alice').send(null);
    expect(heard).not.toHaveBeenCalled();
  });
});

describe('session: shared boards', () => {
  async function withShare(s: Awaited<ReturnType<typeof load>>) {
    await signInReady();
    const trip = s.appStore.newBoard();
    s.appStore.renameBoard('Trip');
    await s.collab.sharing()!.share(trip);
    await settle();
    return trip;
  }

  it('hiding the page sends a waiting edit to a shared board too', async () => {
    const s = await load();
    await withShare(s);
    s.appStore.renameBoard('Trip 2');
    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    await settle();
    const stored = [...h.server.shares.values()][0];
    expect(stored.rev).toBeGreaterThan(1);
    expect(stored.data).toContain('Trip 2');
  });

  it('coming back online sends a shared-board edit that failed while offline, before the 5-second retry', async () => {
    const s = await load();
    await withShare(s);
    h.server.control.offline = true;
    s.appStore.renameBoard('Trip 3');
    vi.advanceTimersByTime(800);
    await settle();
    expect(s.session.getSaveFailed()).toBe(false);
    h.server.control.offline = false;
    nav.onLine = true;
    win.fire('online');
    await settle();
    expect([...h.server.shares.values()][0].data).toContain('Trip 3');
  });

  it('opens the board of a share link (?join=) once ready, and takes the link out of the address', async () => {
    const s = await load();
    // Bob shares a board; Alice opens his link.
    await signInReady(bob);
    const board = s.appStore.newBoard();
    await s.collab.sharing()!.share(board);
    await settle();
    const [id, stored] = [...h.server.shares.entries()][0] as [string, { link: string }];
    h.userCb!(null);
    loc.search = `?join=${id}.${stored.link}`;
    loc.href = `https://x/${loc.search}`;
    await signInReady(alice);
    await settle();
    expect(hist.replaceState).toHaveBeenCalled();
    expect(String(hist.replaceState.mock.calls[0][2])).not.toContain('join');
    expect(s.appStore.getState().boards.open).toBe(board);
  });

  it('a share link with the wrong key shows the notice', async () => {
    const s = await load();
    await signInReady(bob);
    const board = s.appStore.newBoard();
    await s.collab.sharing()!.share(board);
    await settle();
    const [id] = [...h.server.shares.keys()];
    h.userCb!(null);
    loc.search = `?join=${id}.wrong`;
    loc.href = `https://x/${loc.search}`;
    await signInReady(alice);
    await settle();
    expect(s.collab.notice()).toMatch(/share link doesn.t work/);
  });
});

describe('session: deleting the account', () => {
  function fakeAccount(failOwn = false) {
    const calls: string[] = [];
    return {
      calls,
      myShares: async () => [],
      deleteShare: async () => {},
      leave: async () => {},
      markDeleting: async () => void calls.push('markDeleting'),
      unmarkDeleting: () => void calls.push('unmarkDeleting'),
      markDeleted: async () => void calls.push('markDeleted'),
      deleteOwnData: async () => {
        calls.push('deleteOwnData');
        if (failOwn) throw Object.assign(new Error('offline'), { code: 'unavailable' });
      },
      deleteUser: async () => {
        calls.push('deleteUser');
      },
    };
  }

  it('after a failed delete, syncing starts again quietly (no "loading" flash) and nothing is lost', async () => {
    const s = await load();
    await signInReady();
    h.account = fakeAccount(true);
    const statuses: string[] = [];
    s.session.subscribe(() => statuses.push(s.session.getStatus()));
    await expect(s.account.remover()!()).rejects.toMatchObject({ code: 'unavailable' });
    await settle();
    expect(statuses).not.toContain('loading');
    expect(s.session.getStatus()).toBe('ready');
    expect(remote('alice').watching()).toBe(true);
    remote('alice').send({ data: serializeWorkspace(parseWorkspace(null)), client: 'other' });
    s.appStore.renameBoard('Still saving');
    vi.advanceTimersByTime(800);
    expect(remote('alice').writes.length).toBeGreaterThan(0);
  });

  it('a delete that works clears the offline copy, then the device, notes it for the sign-in screen and reloads', async () => {
    const s = await load();
    await signInReady();
    local.setItem('note-board:v1', '{"x":1}');
    const acct = fakeAccount();
    h.account = acct;
    await s.account.remover()!();
    expect(acct.calls).toEqual(['markDeleting', 'markDeleted', 'deleteOwnData', 'deleteUser']);
    expect(h.calls).toEqual(['clearOfflineCopy']);
    expect(loc.reload).toHaveBeenCalledOnce();
    expect(sessionStore.getItem('note-board:account-deleted')).toBe('1');
    expect(local.getItem('note-board:v1')).toBeNull();
  });

  it('while deleting, Firebase signing the person out leaves the screen as it is', async () => {
    const s = await load();
    await signInReady();
    const acct = fakeAccount();
    const deleteUser = acct.deleteUser;
    acct.deleteUser = async () => {
      h.userCb!(null);
      await deleteUser();
    };
    h.account = acct;
    await s.account.remover()!();
    expect(s.session.getStatus()).toBe('ready');
  });

  it('refuses when nobody is signed in', async () => {
    const s = await load();
    await settle();
    await expect(s.account.remover()!()).rejects.toThrow('Not signed in');
  });
});
