import { beforeEach, describe, expect, it, vi } from 'vitest';

// The published site's sign-in screen loads only Firebase's sign-in code (job 169); the database code
// (./database) comes down once someone is signed in. These check what happens while it is on its way.
// Everything session.ts talks to is replaced by stand-ins.

const m = vi.hoisted(() => ({
  onUser: null as ((user: { uid: string } | null) => void) | null,
  /** Lets the database code "arrive". */
  release: () => {},
  /** Whether the database code was asked for. */
  requested: false,
  /** The account this device's boards belong to (OWNER_KEY), null: never signed in here. */
  held: null as string | null,
  fail: false,
  collabRemote: vi.fn((user: { uid: string }) => ({ me: { uid: user.uid, name: '', photo: null } })),
  startSharing: vi.fn(() => ({ stop: vi.fn(), flush: vi.fn(), retry: vi.fn(), isShared: () => false, ownCopy: vi.fn() })),
  claimDevice: vi.fn(),
  startSync: vi.fn((..._args: unknown[]) => ({ stop: vi.fn(), flush: vi.fn(), sharedChanged: vi.fn() })),
  /** This browser's storage (shared by its tabs). */
  storage: new Map<string, string>(),
  user: null as { uid: string } | null,
  deleteAccountData: vi.fn(async () => ({ shareIds: [] as string[] })),
  accountRemote: vi.fn(),
  remover: null as (() => Promise<void>) | null,
}));

vi.mock('./firebase', () => ({
  watchUser: (fn: typeof m.onUser) => {
    m.onUser = fn;
  },
  currentUser: () => m.user,
  confirmSignIn: vi.fn(),
  signInWithGoogle: vi.fn(async () => {}),
  signOutUser: vi.fn(),
}));
vi.mock('../store/appStore', () => ({ appStore: {} }));
vi.mock('../store/sharing', () => ({
  boardsInKeptShares: () => [],
  ownBoardsGuard: () => ({ remote: {}, isShared: () => false, known: vi.fn() }),
  startSharing: m.startSharing,
}));
vi.mock('../store/sync', () => ({ startSync: m.startSync }));
vi.mock('../store/versions', () => ({ activeVersionStore: () => null, startVersions: vi.fn() }));
vi.mock('../store/account', () => ({ claimDevice: m.claimDevice, deleteAccountData: m.deleteAccountData, OWNER_KEY: 'owner', heldKey: (uid: string) => `held:${uid}` }));
vi.mock('./account', () => ({ account: { setRemover: (fn: unknown) => void (m.remover = fn as typeof m.remover) }, finishDeletion: vi.fn(), takeDeletedNote: () => false }));
vi.mock('./collabSession', () => ({ collab: { set: vi.fn(), setNotice: vi.fn() }, joinFromAddress: vi.fn() }));
vi.mock('./feedback', () => ({ feedback: { reset: vi.fn(), setSender: vi.fn() } }));
vi.mock('./pageHide', () => ({ flushWhenHidden: vi.fn() }));

vi.stubGlobal('localStorage', {
  getItem: (k: string) => (k === 'owner' ? m.held : (m.storage.get(k) ?? null)),
  setItem: (k: string, v: string) => void m.storage.set(k, v),
  removeItem: (k: string) => void m.storage.delete(k),
});
vi.stubGlobal('window', { addEventListener: () => {} });
vi.stubGlobal('document', {});
vi.stubGlobal('navigator', { onLine: true });

/** A fresh copy of session.ts, as on a page just opened, with the database code held back. */
async function openPage() {
  vi.resetModules();
  const gate = new Promise<void>((done) => (m.release = done));
  vi.doMock('./database', async () => {
    m.requested = true;
    await gate;
    if (m.fail) throw new Error('Failed to fetch dynamically imported module');
    return { collabRemote: m.collabRemote, boardRemote: vi.fn(() => ({})), versionsRemote: vi.fn(() => ({})), accountRemote: m.accountRemote, clearOfflineCopy: vi.fn(), sendFeedback: vi.fn() };
  });
  const { session } = await import('./session');
  return session;
}

/** Lets the database code arrive and everything waiting on it run. */
async function arrive() {
  m.release();
  await vi.dynamicImportSettled();
  await new Promise((done) => setTimeout(done, 0));
}

beforeEach(() => {
  m.fail = false;
  m.requested = false;
  m.held = null;
  m.collabRemote.mockClear();
  m.startSharing.mockClear();
  m.claimDevice.mockClear();
  m.startSync.mockClear();
  m.storage.clear();
  m.user = null;
  m.deleteAccountData.mockClear();
  m.accountRemote.mockClear();
});

describe('the database code loads only after sign-in (job 169)', () => {
  it('shows "loading" while it comes down, then starts syncing the person who signed in', async () => {
    const session = await openPage();
    m.onUser!({ uid: 'ann' });
    expect(session.getStatus()).toBe('loading');
    expect(m.startSharing).not.toHaveBeenCalled();
    await arrive();
    expect(m.claimDevice).toHaveBeenCalledTimes(1);
    expect(m.collabRemote).toHaveBeenCalledWith({ uid: 'ann' });
    expect(m.startSharing).toHaveBeenCalledTimes(1);
  });

  it('signed out before it arrives: nothing starts syncing and the sign-in screen stays', async () => {
    const session = await openPage();
    m.onUser!({ uid: 'ann' });
    m.onUser!(null);
    await arrive();
    expect(m.startSharing).not.toHaveBeenCalled();
    expect(m.claimDevice).not.toHaveBeenCalled();
    expect(session.getStatus()).toBe('signed-out');
  });

  it('another person signs in before it arrives: the first person is never started', async () => {
    await openPage();
    m.onUser!({ uid: 'ann' });
    m.onUser!({ uid: 'bob' });
    // Not arrive(): Bob's import never finishes here (below), so only Ann's is waited for.
    m.release();
    await new Promise((done) => setTimeout(done, 50));
    // simple: Vitest never finishes a second import of a held-back stand-in, so Bob's start (the
    // same path as the first test) can't be checked here; only that Ann's is dropped.
    expect(m.collabRemote).not.toHaveBeenCalled();
    expect(m.claimDevice).not.toHaveBeenCalled();
  });

  it('starts downloading when Sign in is pressed, while Google’s window is open', async () => {
    const session = await openPage();
    await new Promise((done) => setTimeout(done, 0));
    expect(m.requested).toBe(false);
    session.signIn();
    await new Promise((done) => setTimeout(done, 0));
    expect(m.requested).toBe(true);
  });

  it('on a device someone signed in on before, starts downloading at once, alongside the sign-in check', async () => {
    m.held = 'ann';
    await openPage();
    await new Promise((done) => setTimeout(done, 0));
    expect(m.requested).toBe(true);
  });

  it('it can’t be downloaded (offline, never cached): the error screen, not "loading" forever', async () => {
    const session = await openPage();
    m.fail = true;
    m.onUser!({ uid: 'ann' });
    await arrive();
    expect(session.getStatus()).toBe('error');
    expect(m.startSharing).not.toHaveBeenCalled();
  });
});

/** The save-state reporters handed to the most recent shared-board and own-board syncs. */
function reporters() {
  type Opts = { onSaveState: (state: 'saved' | 'saving' | 'failed') => void; onReady: () => void };
  const shared = (m.startSharing.mock.calls.at(-1) as unknown as [unknown, unknown, Opts])[2];
  shared.onReady(); // the shared boards are known, so the own boards start syncing too
  const own = (m.startSync.mock.calls.at(-1) as unknown as [unknown, unknown, Opts])[2];
  return { shared: shared.onSaveState, own: own.onSaveState };
}

describe('"Couldn’t save online" belongs to the account it happened to (job 172)', () => {
  for (const [which, signsOut] of [['shared', true], ['own', true], ['shared', false], ['own', false]] as const) {
    it(`a refused save of ${which} boards isn't shown to the next person who signs in${signsOut ? '' : ' (no sign-out between)'}`, async () => {
      const session = await openPage();
      m.onUser!({ uid: 'ann' });
      await arrive();
      reporters()[which]('failed');
      expect(session.getSaveFailed()).toBe(true);
      if (signsOut) m.onUser!(null);
      m.onUser!({ uid: 'bob' });
      expect(session.getSaveFailed()).toBe(false);
      expect(session.getSaveNote()).toBe('Saved');
    });
  }
});

// Review 137-A H5: another page deleted the account (its marker says 'done'). It may have got only as
// far as the sign-in, or be just about to delete it; and a sign-out in one tab signs out every tab of
// the browser, the deleting one too. So the page asks Google whether the sign-in is still there.
const GONE_CHECK_MS = 60_000;

describe('the account deleted on another page', () => {
  /** A page signed in as `user`, with her own boards syncing; returns what its sync was told. */
  async function signedInPage(user: { uid: string; getIdToken?: (force: boolean) => Promise<string> }) {
    const session = await openPage();
    m.onUser!(user);
    await arrive();
    const sharingOpts = (m.startSharing.mock.calls[0] as unknown as [unknown, unknown, { onReady: () => void }])[2];
    sharingOpts.onReady();
    const { startSync } = await import('../store/sync');
    const syncOpts = vi.mocked(startSync).mock.calls.at(-1)![2] as { onGone: () => void; client: string };
    const { signOutUser } = await import('./firebase');
    vi.mocked(signOutUser).mockClear();
    return { session, syncOpts, signOutUser: vi.mocked(signOutUser) };
  }

  it('the sign-in is gone too: the page signs out, with the note', async () => {
    const getIdToken = vi.fn(async () => {
      throw Object.assign(new Error('gone'), { code: 'auth/user-token-expired' });
    });
    const { session, syncOpts, signOutUser } = await signedInPage({ uid: 'ann', getIdToken });
    syncOpts.onGone();
    await new Promise((done) => setTimeout(done, 0));
    expect(getIdToken).toHaveBeenCalledWith(true);
    expect(signOutUser).toHaveBeenCalledOnce();
    expect(session.wasDeleted()).toBe(true);
  });

  it('the sign-in is still there (another page is about to delete it, or deleting it failed): the page isn’t signed out, and asks again a while', async () => {
    let gone = false;
    const getIdToken = vi.fn(async () => {
      if (gone) throw Object.assign(new Error('gone'), { code: 'auth/user-token-expired' });
      return 'token';
    });
    const { syncOpts, signOutUser } = await signedInPage({ uid: 'ann', getIdToken });
    vi.useFakeTimers();
    try {
      syncOpts.onGone();
      await vi.advanceTimersByTimeAsync(0);
      expect(signOutUser).not.toHaveBeenCalled();
      // The deleting page deletes the sign-in a moment later.
      gone = true;
      await vi.advanceTimersByTimeAsync(GONE_CHECK_MS);
      expect(signOutUser).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('it stops asking after a while (deleting stopped at the sign-in)', async () => {
    const getIdToken = vi.fn(async () => 'token');
    const { syncOpts } = await signedInPage({ uid: 'ann', getIdToken });
    vi.useFakeTimers();
    try {
      syncOpts.onGone();
      await vi.advanceTimersByTimeAsync(GONE_CHECK_MS * 100);
      expect(getIdToken.mock.calls.length).toBeLessThanOrEqual(11);
    } finally {
      vi.useRealTimers();
    }
  });

  it('no connection to ask: the page isn’t signed out', async () => {
    const getIdToken = vi.fn(async () => {
      throw Object.assign(new Error('offline'), { code: 'auth/network-request-failed' });
    });
    const { syncOpts, signOutUser } = await signedInPage({ uid: 'ann', getIdToken });
    syncOpts.onGone();
    await new Promise((done) => setTimeout(done, 0));
    expect(signOutUser).not.toHaveBeenCalled();
  });

  it('the page deleting sets the marker as itself', async () => {
    const user = { uid: 'ann' };
    const { syncOpts } = await signedInPage(user);
    m.user = user;
    vi.stubGlobal('location', { reload: vi.fn() });
    await m.remover!();
    expect(m.accountRemote).toHaveBeenCalledWith(user, expect.anything(), syncOpts.client);
  });
});
