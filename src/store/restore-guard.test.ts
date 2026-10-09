import { describe, expect, it } from 'vitest';
import { serializeBoard } from '../model/persist';
import { readWorkspace, serializeWorkspace } from '../model/workspace';
import { createStore } from './store';
import { localVersionStore, restoreFromBackup, restoreVersion } from './versions';

// Only the person who shared a board restores old versions of it (owner, 2026-10-06): a restore by
// someone it was shared with leaves every board of that share as it is, and restores their own.

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

/** Home, a board "Trip" shared (with them, or by them: `owner`) with a board "Days" inside it, and their own board "Mine". */
function setup(owner: boolean) {
  const store = createStore(null, (fn) => fn());
  const versions = localVersionStore(memory());
  const home = store.getState().boards.home;
  store.renameBoard('Home');
  const trip = store.addBoardCard();
  store.openBoard(trip);
  store.renameBoard('Trip');
  const days = store.addBoardCard();
  store.openBoard(days);
  store.renameBoard('Days');
  store.openBoard(home);
  const mine = store.addBoardCard();
  store.openBoard(mine);
  store.renameBoard('Mine');
  store.openBoard(home);
  // An old backup of every board, then everything changes.
  const backup = serializeWorkspace(store.workspace());
  const rename = (id: string, name: string) => {
    store.openBoard(id);
    store.renameBoard(name);
  };
  rename(trip, 'Trip now');
  rename(days, 'Days now');
  rename(mine, 'Mine now');
  rename(home, 'Home now');
  // (Set last: a board shared with them can't be renamed here.)
  store.setShares([{ id: 's1', root: trip, boards: [trip, days], owner, ownerUid: 'alice', people: [], link: null }], true);
  return { store, versions, home, trip, days, mine, backup };
}

const newestVersion = async (versions: ReturnType<typeof localVersionStore>) => readWorkspace(await versions.get((await versions.list())[0].id))!.ws;

describe('restoring a backup file on a board shared with them', () => {
  it('restores their own boards, leaves the shared boards as they are, and says so', async () => {
    const { store, versions, trip, days, mine, backup } = setup(false);
    expect(await restoreFromBackup(store, versions, backup)).toEqual([trip]);
    expect(store.boardName(store.getState().boards.home)).toBe('Home');
    expect(store.boardName(mine)).toBe('Mine');
    expect(store.boardName(trip)).toBe('Trip now');
    expect(store.boardName(days)).toBe('Days now');
  });

  it('the boards as they were are still saved as a version first', async () => {
    const { store, versions, trip, mine, backup } = setup(false);
    await restoreFromBackup(store, versions, backup);
    const saved = await newestVersion(versions);
    expect(saved.boards[mine].name).toBe('Mine now');
    expect(saved.boards[trip].name).toBe('Trip now');
  });

  it('a backup from before the board was shared doesn’t remove it', async () => {
    const { store, versions, home, trip, days } = setup(false);
    const old = serializeWorkspace({ home, boards: { [home]: { ...store.workspace().boards[home], name: 'Home long ago' }, other: { ...store.workspace().boards[home], name: 'Other' } } });
    expect(await restoreFromBackup(store, versions, old)).toEqual([trip]);
    expect(store.boardName(home)).toBe('Home long ago');
    expect(store.boardName(trip)).toBe('Trip now');
    expect(store.boardName(days)).toBe('Days now');
  });

  it('a backup whose home board is the shared board can’t make it their home', async () => {
    const { store, versions, home, trip } = setup(false);
    const ws = store.workspace();
    const odd = serializeWorkspace({ home: trip, boards: { [trip]: { ...ws.boards[trip], name: 'Trip hijacked' }, other: { ...ws.boards[home], name: 'Other' } } });
    expect(await restoreFromBackup(store, versions, odd)).toEqual([trip]);
    expect(store.getState().boards.home).toBe(home);
    expect(store.boardName(home)).toBe('Home now');
    expect(store.boardName(trip)).toBe('Trip now');
    expect(store.boardName('other')).toBe('Other');
  });

  it('a one-board backup while the shared board is open leaves it as it is', async () => {
    const { store, versions, trip } = setup(false);
    store.openBoard(trip);
    const single = serializeBoard({ ...store.getState().board, name: 'Trip from a file' });
    expect(await restoreFromBackup(store, versions, single)).toEqual([trip]);
    expect(store.boardName(trip)).toBe('Trip now');
  });

  it('the person who shared it restores it as before', async () => {
    const { store, versions, trip, days, mine, backup } = setup(true);
    expect(await restoreFromBackup(store, versions, backup)).toEqual([]);
    expect(store.boardName(trip)).toBe('Trip');
    expect(store.boardName(days)).toBe('Days');
    expect(store.boardName(mine)).toBe('Mine');
  });
});

describe('restoring a version of a board shared with them', () => {
  async function withVersion(owner: boolean) {
    const s = setup(owner);
    await s.versions.save({ id: 'old', savedAt: 1, cards: 0, columns: 0 }, s.backup);
    return s;
  }

  it('leaves the shared board as it is (the screen hides Restore there; this is the store’s own check)', async () => {
    const { store, versions, trip } = await withVersion(false);
    store.openBoard(trip);
    expect(await restoreVersion(store, versions, 'old')).toEqual([trip]);
    expect(store.getState().board.name).toBe('Trip now');
    // The safety version is still saved first.
    expect((await newestVersion(versions)).boards[trip].name).toBe('Trip now');
  });

  it('a board inside the share is left as it is too', async () => {
    const { store, versions, trip, days } = await withVersion(false);
    store.openBoard(days);
    expect(await restoreVersion(store, versions, 'old')).toEqual([trip]);
    expect(store.getState().board.name).toBe('Days now');
  });

  it('their own board is restored as before', async () => {
    const { store, versions, mine } = await withVersion(false);
    store.openBoard(mine);
    expect(await restoreVersion(store, versions, 'old')).toEqual([]);
    expect(store.getState().board.name).toBe('Mine');
  });

  it('the person who shared it restores it as before', async () => {
    const { store, versions, trip } = await withVersion(true);
    store.openBoard(trip);
    expect(await restoreVersion(store, versions, 'old')).toEqual([]);
    expect(store.getState().board.name).toBe('Trip');
  });
});

describe('restoring while the shared boards aren’t known yet (job #33, code review)', () => {
  it('a version or a backup: nothing is saved, opened or changed, and it says why', async () => {
    const { store, versions, mine, backup } = setup(false);
    await versions.save({ id: 'old', savedAt: 1, cards: 0, columns: 0 }, backup);
    store.setShares(store.getState().ui.shares, false);
    store.openBoard(mine);
    expect(await restoreVersion(store, versions, 'old')).toBe('loading');
    expect(await restoreFromBackup(store, versions, backup)).toBe('loading');
    expect(await versions.list()).toHaveLength(1);
    expect(store.getState().boards.open).toBe(mine);
    expect(store.getState().board.name).toBe('Mine now');
  });
});
