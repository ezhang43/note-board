import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accountKeys, deleteAccountData, type AccountBackend } from './account';
import { memoryServer, type Person } from './collab';

// Deleting your account and data (job #63, Google Play). Everything online goes first and the
// sign-in last, so a failure part-way leaves the person able to sign in and try again; running it
// twice is fine.

/** A pretend account online: its own data, its shares and whether the sign-in still exists. */
function fakeAccount(shares: { id: string; owner: string | null }[]) {
  const calls: string[] = [];
  const state = { shares: [...shares], ownBoards: true, ownData: true, user: true };
  const fail = new Set<string>();
  /**
   * Another device of this person's, still open (review 137-A H5). It stops syncing once it sees its
   * own boards gone online. A share of theirs deleted while it still syncs makes it save a version
   * and its own boards again; `sameSnapshot`: it sees the share go together with its own boards, so
   * it still saves the version before it stops. Its saves land online one step later.
   */
  const other = { open: false, syncing: true, sameSnapshot: false };
  let landing: (() => void)[] = [];
  let sent: (() => void)[] = [];
  const step = (name: string) => {
    calls.push(name);
    if (fail.has(name)) throw Object.assign(new Error('offline'), { code: 'unavailable' });
  };
  /** After each step: the other device's saves sent before it land. */
  const land = () => {
    landing.forEach((fn) => fn());
    landing = sent;
    sent = [];
  };
  const backend: AccountBackend = {
    async myShares() {
      step('myShares');
      return state.shares;
    },
    async deleteShare(id) {
      step(`deleteShare ${id}`);
      state.shares = state.shares.filter((s) => s.id !== id);
      if (other.open && (other.syncing || other.sameSnapshot))
        sent.push(() => {
          state.ownData = true; // its safety version
          if (other.syncing) state.ownBoards = true;
        });
      land();
    },
    async leave(id) {
      step(`leave ${id}`);
      state.shares = state.shares.filter((s) => s.id !== id);
      land();
    },
    async deleteOwnBoards() {
      step('deleteOwnBoards');
      state.ownBoards = false;
      other.syncing = false;
      land();
    },
    async deleteOwnData() {
      step('deleteOwnData');
      state.ownBoards = false;
      state.ownData = false;
      other.syncing = false;
      land();
    },
    async deleteUser() {
      step('deleteUser');
      state.user = false;
      land();
    },
  };
  return { backend, calls, state, fail, other };
}

describe('deleteAccountData', () => {
  it('deletes shared boards for everyone, leaves the others’ shares, then the person’s own data, and the sign-in last', async () => {
    const { backend, calls, state } = fakeAccount([
      { id: 's1', owner: 'me' },
      { id: 's2', owner: 'bob' },
    ]);
    const done = await deleteAccountData('me', backend);
    expect(calls).toEqual(['myShares', 'deleteOwnBoards', 'deleteShare s1', 'leave s2', 'deleteOwnData', 'deleteOwnData', 'deleteUser']);
    expect(done.shareIds).toEqual(['s1', 's2']);
    expect(state).toEqual({ shares: [], ownBoards: false, ownData: false, user: false });
  });

  it('another device still open stops syncing before any shared board goes, so it never puts the boards back online (review 137-A H5)', async () => {
    const { backend, state, other } = fakeAccount([{ id: 's1', owner: 'me' }]);
    other.open = true;
    await deleteAccountData('me', backend);
    expect(other.syncing).toBe(false);
    expect(state).toEqual({ shares: [], ownBoards: false, ownData: false, user: false });
  });

  it('a version the other device saves as it stops, landing after the own data went, is deleted before the sign-in (review 137-A H5)', async () => {
    const { backend, state, other } = fakeAccount([{ id: 's1', owner: 'me' }]);
    other.open = true;
    other.sameSnapshot = true;
    await deleteAccountData('me', backend);
    expect(state).toEqual({ shares: [], ownBoards: false, ownData: false, user: false });
  });

  it('stops at the first failure: the sign-in stays, so the person can sign in and try again', async () => {
    const { backend, calls, state, fail } = fakeAccount([
      { id: 's1', owner: 'me' },
      { id: 's2', owner: 'bob' },
    ]);
    fail.add('leave s2');
    // Something was already deleted, so the person is told it stopped part-way.
    await expect(deleteAccountData('me', backend)).rejects.toMatchObject({ partial: true });
    expect(calls).toEqual(['myShares', 'deleteOwnBoards', 'deleteShare s1', 'leave s2']);
    expect(state.user).toBe(true);
    // Only the own boards went (this device uploads them again when syncing starts again).
    expect(state.ownData).toBe(true);

    // Trying again finishes the job.
    fail.clear();
    calls.length = 0;
    await deleteAccountData('me', backend);
    expect(calls).toEqual(['myShares', 'deleteOwnBoards', 'leave s2', 'deleteOwnData', 'deleteOwnData', 'deleteUser']);
    expect(state).toEqual({ shares: [], ownBoards: false, ownData: false, user: false });
  });

  it('a failure before anything was deleted is not called part-way', async () => {
    const { backend, fail } = fakeAccount([{ id: 's1', owner: 'me' }]);
    // The own boards went first, but this device puts them back as syncing starts again.
    fail.add('deleteShare s1');
    await expect(deleteAccountData('me', backend)).rejects.toMatchObject({ partial: false });
  });

  it('a failure deleting the sign-in itself still rejects (Firebase wanting a recent sign-in, say)', async () => {
    const { backend, fail } = fakeAccount([]);
    fail.add('deleteUser');
    await expect(deleteAccountData('me', backend)).rejects.toThrow();
  });

  it('with the pretend sharing server: the board Alice shared is gone for Bob, Bob’s board stays with Bob, without Alice', async () => {
    vi.useFakeTimers();
    const { server, shares, backendFor } = memoryServer();
    const alice: Person = { uid: 'alice', name: 'Alice', photo: null };
    const bob: Person = { uid: 'bob', name: 'Bob', photo: null };
    const a = backendFor(alice);
    const b = backendFor(bob);
    await a.createShare('trip', 'tripRoot', 'k1', '{}', 'c');
    await b.join('trip', 'k1');
    await b.createShare('work', 'workRoot', 'k2', '{}', 'c');
    await a.join('work', 'k2');
    const backend: AccountBackend = {
      myShares: async () => ['trip', 'work'].filter((id) => shares.get(id)?.people.some((p) => p.uid === 'alice')).map((id) => ({ id, owner: shares.get(id)!.owner })),
      deleteShare: a.deleteShare,
      leave: a.leave,
      deleteOwnBoards: async () => {},
      deleteOwnData: async () => {},
      deleteUser: async () => {},
    };
    await deleteAccountData('alice', backend);
    expect(shares.has('trip')).toBe(false);
    expect(shares.get('work')?.people.map((p) => p.uid)).toEqual(['bob']);
    await expect(server.read(bob, 'work')).resolves.toBeTruthy();
    vi.useRealTimers();
  });
});

describe('accountKeys', () => {
  let keys: string[];
  beforeEach(() => {
    keys = [
      'note-board:v1',
      'note-board:open',
      'note-board:view:v1',
      'note-board:versions:v1',
      'note-board:version:v123',
      'note-board:shares:me',
      'note-board:own-boards:me',
      'note-board:share-base:s1',
      'note-board:share-base:s2',
      'note-board:share-base:other',
      'note-board:shares:someone-else',
      'note-board:own-boards:someone-else',
      // Whose boards the device holds, and boards kept aside while another account uses it (job #145).
      'note-board:owner-uid',
      'note-board:parked:me',
      'note-board:parked-bases:me',
      'note-board:parked:someone-else',
      // Settings of this device, not the account's data.
      'note-board:theme',
      'note-board:color-theme',
      'note-board:hotkeys',
      'note-board:font',
      'note-board:tour-done',
      'note-board:pomodoro',
      'note-board:calendar-width',
      'note-board:panel-widths',
      // The calendar access (job 107): not a setting, so it goes.
      'note-board:calendar-access',
      'unrelated',
    ];
  });

  it('picks every key holding this person’s boards, versions and shares, and nothing of another account or the device’s settings', () => {
    const kept = JSON.stringify([{ id: 's2', owner: false, ownerUid: 'bob' }]);
    expect(accountKeys(keys, 'me', ['s1'], kept).sort()).toEqual(
      [
        'note-board:v1',
        'note-board:open',
        'note-board:view:v1',
        'note-board:versions:v1',
        'note-board:version:v123',
        'note-board:shares:me',
        'note-board:own-boards:me',
        'note-board:share-base:s1',
        'note-board:share-base:s2',
        // The owner key stays, so the boards left are never taken for the next account's.
        'note-board:parked:me',
        'note-board:parked-bases:me',
        'note-board:calendar-access',
      ].sort(),
    );
  });

  it('a damaged kept list of shares is ignored', () => {
    expect(accountKeys(keys, 'me', [], '{not json')).not.toContain('note-board:share-base:s2');
  });

  it('for a demo person, only their own prefixed keys', () => {
    const demo = ['demo-alice:note-board:v1', 'demo-alice:note-board:shares:demo-alice', 'demo-bob:note-board:v1', 'note-board:v1', 'note-board:tour-done', 'note-board:calendar-access'];
    // The calendar access is kept once for the device, not per demo person: it goes too.
    expect(accountKeys(demo, 'demo-alice', [], null, 'demo-alice:').sort()).toEqual(['demo-alice:note-board:shares:demo-alice', 'demo-alice:note-board:v1', 'note-board:calendar-access']);
  });
});
