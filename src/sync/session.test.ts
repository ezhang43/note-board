import { beforeEach, describe, expect, it, vi } from 'vitest';

// The published site's sign-in screen loads only Firebase's sign-in code (job 169); the database code
// (./database) comes down once someone is signed in. These check what happens while it is on its way.
// Everything session.ts talks to is replaced by stand-ins.

const m = vi.hoisted(() => ({
  onUser: null as ((user: { uid: string } | null) => void) | null,
  /** Lets the database code "arrive". */
  release: () => {},
  fail: false,
  collabRemote: vi.fn((user: { uid: string }) => ({ me: { uid: user.uid, name: '', photo: null } })),
  startSharing: vi.fn(() => ({ stop: vi.fn(), flush: vi.fn(), retry: vi.fn(), isShared: () => false, ownCopy: vi.fn() })),
  claimDevice: vi.fn(),
}));

vi.mock('./firebase', () => ({
  watchUser: (fn: typeof m.onUser) => {
    m.onUser = fn;
  },
  currentUser: () => null,
  confirmSignIn: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
}));
vi.mock('../store/appStore', () => ({ appStore: {} }));
vi.mock('../store/sharing', () => ({
  boardsInKeptShares: () => [],
  ownBoardsGuard: () => ({ remote: {}, isShared: () => false, known: vi.fn() }),
  startSharing: m.startSharing,
}));
vi.mock('../store/sync', () => ({ startSync: vi.fn(() => ({ stop: vi.fn(), flush: vi.fn(), sharedChanged: vi.fn() })) }));
vi.mock('../store/versions', () => ({ activeVersionStore: () => null, startVersions: vi.fn() }));
vi.mock('../store/account', () => ({ claimDevice: m.claimDevice, deleteAccountData: vi.fn(), OWNER_KEY: 'owner' }));
vi.mock('./account', () => ({ account: { setRemover: vi.fn() }, finishDeletion: vi.fn(), takeDeletedNote: () => false }));
vi.mock('./collabSession', () => ({ collab: { set: vi.fn(), setNotice: vi.fn() }, joinFromAddress: vi.fn() }));
vi.mock('./feedback', () => ({ feedback: { reset: vi.fn(), setSender: vi.fn() } }));
vi.mock('./pageHide', () => ({ flushWhenHidden: vi.fn() }));

vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
vi.stubGlobal('window', { addEventListener: () => {} });
vi.stubGlobal('document', {});
vi.stubGlobal('navigator', { onLine: true });

/** A fresh copy of session.ts, as on a page just opened, with the database code held back. */
async function openPage() {
  vi.resetModules();
  const gate = new Promise<void>((done) => (m.release = done));
  vi.doMock('./database', async () => {
    await gate;
    if (m.fail) throw new Error('Failed to fetch dynamically imported module');
    return { collabRemote: m.collabRemote, boardRemote: vi.fn(() => ({})), versionsRemote: vi.fn(() => ({})), accountRemote: vi.fn(), clearOfflineCopy: vi.fn(), sendFeedback: vi.fn() };
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
  m.collabRemote.mockClear();
  m.startSharing.mockClear();
  m.claimDevice.mockClear();
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
    await arrive();
    // simple: Vitest never finishes a second import of a held-back stand-in, so Bob's start (the
    // same path as the first test) isn't checked here; only that Ann's is dropped.
    expect(m.collabRemote).not.toHaveBeenCalledWith({ uid: 'ann' });
    expect(m.claimDevice).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), 'ann', expect.anything());
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
