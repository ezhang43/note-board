import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accountKeys, deleteAccountData, type AccountBackend } from './account';
import { memoryServer, type Person } from './collab';

// Deleting your account and data (job #63, Google Play). Everything online goes first and the
// sign-in last, so a failure part-way leaves the person able to sign in and try again; running it
// twice is fine.

/** A pretend account online: its own data, its shares and whether the sign-in still exists. */
function fakeAccount(shares: { id: string; owner: string | null }[]) {
  const calls: string[] = [];
  /** board: the own boards online, or the marker of deleting the account ('started', 'done'). */
  const state = { shares: [...shares], board: 'boards' as 'boards' | 'started' | 'done', ownData: true, user: true };
  const fail = new Set<string>();
  /**
   * Another device of this person's, still open (review 137-A H5). When a board they shared goes, it
   * saves a version and its own boards again, and those saves land online one step later, unless the
   * online rules refuse them (they do while the marker is there).
   */
  const other = { open: false };
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
    async markDeleting() {
      step('markDeleting');
      if (state.board !== 'done') state.board = 'started';
      land();
    },
    unmarkDeleting() {
      calls.push('unmarkDeleting');
      if (state.board === 'started') state.board = 'boards';
    },
    async deleteShare(id) {
      step(`deleteShare ${id}`);
      state.shares = state.shares.filter((s) => s.id !== id);
      if (other.open)
        sent.push(() => {
          if (state.board !== 'boards') return; // refused by the rules
          state.ownData = true; // its safety version
        });
      land();
    },
    async leave(id) {
      step(`leave ${id}`);
      state.shares = state.shares.filter((s) => s.id !== id);
      land();
    },
    async deleteOwnData() {
      step('deleteOwnData');
      state.ownData = false;
      land();
    },
    async markDeleted() {
      step('markDeleted');
      state.board = 'done';
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

const gone = { shares: [], board: 'done', ownData: false, user: false };

describe('deleteAccountData', () => {
  it('marks the boards as being deleted first, lists the shares, deletes shared boards for everyone, leaves the others’ shares, marks it done, then the person’s own data, and the sign-in last', async () => {
    const { backend, calls, state } = fakeAccount([
      { id: 's1', owner: 'me' },
      { id: 's2', owner: 'bob' },
    ]);
    const done = await deleteAccountData('me', backend);
    expect(calls).toEqual(['markDeleting', 'myShares', 'deleteShare s1', 'leave s2', 'markDeleted', 'deleteOwnData', 'deleteUser']);
    expect(done.shareIds).toEqual(['s1', 's2']);
    expect(state).toEqual(gone);
  });

  it('another device still open can’t put a version back online as a shared board goes (review 137-A H5)', async () => {
    const { backend, state, other } = fakeAccount([{ id: 's1', owner: 'me' }]);
    other.open = true;
    await deleteAccountData('me', backend);
    expect(state).toEqual(gone);
  });

  it('stops at the first failure: the sign-in stays, so the person can sign in and try again', async () => {
    const { backend, calls, state, fail } = fakeAccount([
      { id: 's1', owner: 'me' },
      { id: 's2', owner: 'bob' },
    ]);
    fail.add('leave s2');
    // Something was already deleted, so the person is told it stopped part-way.
    await expect(deleteAccountData('me', backend)).rejects.toMatchObject({ partial: true });
    // The boards are no longer marked, so the person's pages carry on syncing (and saving versions).
    expect(calls).toEqual(['markDeleting', 'myShares', 'deleteShare s1', 'leave s2', 'unmarkDeleting']);
    expect(state.board).toBe('boards');
    expect(state.user).toBe(true);
    expect(state.ownData).toBe(true);

    // Trying again finishes the job.
    fail.clear();
    calls.length = 0;
    await deleteAccountData('me', backend);
    expect(calls).toEqual(['markDeleting', 'myShares', 'leave s2', 'markDeleted', 'deleteOwnData', 'deleteUser']);
    expect(state).toEqual(gone);
  });

  it('a failure before anything but the marker is not called part-way (syncing starts again and puts the boards back)', async () => {
    const { backend, fail } = fakeAccount([{ id: 's1', owner: 'me' }]);
    fail.add('deleteShare s1');
    await expect(deleteAccountData('me', backend)).rejects.toMatchObject({ partial: false });
  });

  it('a failure deleting the sign-in itself is part-way, and trying again finishes it, the boards staying marked done', async () => {
    const { backend, fail, state, calls } = fakeAccount([]);
    fail.add('deleteUser');
    await expect(deleteAccountData('me', backend)).rejects.toMatchObject({ partial: true });
    expect(calls).not.toContain('unmarkDeleting');
    expect(state.board).toBe('done');
    fail.clear();
    await deleteAccountData('me', backend);
    expect(state).toEqual(gone);
  });

  it('a failure listing the shares, just after marking, takes the mark off and isn’t part-way', async () => {
    const { backend, fail, state, calls } = fakeAccount([{ id: 's1', owner: 'me' }]);
    fail.add('myShares');
    await expect(deleteAccountData('me', backend)).rejects.toMatchObject({ partial: false });
    expect(calls).toEqual(['markDeleting', 'myShares', 'unmarkDeleting']);
    expect(state.board).toBe('boards');
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
      markDeleting: async () => {},
      unmarkDeleting: () => {},
      deleteOwnData: async () => {},
      markDeleted: async () => {},
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
      // Up to when each card's comments were seen (job 161, PR 4).
      'note-board:comments-seen:me',
      'note-board:comments-seen:someone-else',
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
        'note-board:comments-seen:me',
        'note-board:share-base:s1',
        'note-board:share-base:s2',
        // The owner key stays, so the boards left are never taken for the next account's.
        'note-board:parked:me',
        'note-board:parked-bases:me',
        'note-board:calendar-access',
      ].sort(),
    );
  });

  it('copies kept of an unreadable save go too (job #160)', () => {
    const got = accountKeys(['note-board:v1:unreadable', 'note-board:v1:unreadable-2', 'note-board:view:v1'], 'me', [], null);
    expect(got).toEqual(['note-board:v1:unreadable', 'note-board:v1:unreadable-2', 'note-board:view:v1']);
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
