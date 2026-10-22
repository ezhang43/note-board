import { afterEach, describe, expect, it } from 'vitest';
import { VERSION_GAP_MS } from '../model/versions';
import { collab } from '../sync/collabSession';
import { createStore } from './store';
import { deleteBoardSafely, localVersionStore, restoreFromBackup, restoreVersion, saveSafetyVersion, startVersions, TOO_BIG_NOTE, TOO_BIG_RESTORE, type VersionStore } from './versions';

// Review 137-A M6 (owner: "m6 yes", job 175). A version holds every board, shared ones too, and the
// online rules refuse one over 900,000 characters. Past that, versions silently stopped saving, a
// restore always failed with "Try again", and deleting a board kept no copy. Now the person is told
// why. (Saving shared boards' versions apart, so they don't count, is a later job.)

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

async function settled() {
  for (let i = 0; i < 100; i++) await Promise.resolve();
}

/** A version store that holds at most 2,000 characters, as the online one holds at most 900,000. */
function setup() {
  const store = createStore(null, (fn) => fn());
  const local = localVersionStore(memory());
  const saves: string[] = [];
  const versions: VersionStore = { ...local, limit: 2000, save: (meta, data) => (saves.push(data), local.save(meta, data)) };
  const clock = { now: new Date(2026, 9, 22, 9, 0).getTime() };
  return { store, versions, saves, clock, local };
}

const long = 'x'.repeat(3000);

afterEach(() => collab.setNotice(null));

describe('boards too big for Version history (review 137-A M6)', () => {
  it('a version that would be too big isn’t sent, and the note says why, once until the next version is due', async () => {
    const { store, versions, saves, clock } = setup();
    startVersions(store, versions, { now: () => clock.now });
    store.renameBoard(long);
    await settled();
    store.renameBoard(long + 'y'); // the version due now holds the long name
    await settled();
    clock.now += VERSION_GAP_MS + 1;
    store.renameBoard(long + 'z');
    await settled();
    expect(saves.filter((d) => d.length > 2000)).toEqual([]);
    expect(collab.notice()).toBe(TOO_BIG_NOTE);
    // Dismissed, it stays away while editing carries on (no retry every minute).
    collab.setNotice(null);
    clock.now += 120_000;
    store.renameBoard(long + 'w');
    await settled();
    expect(collab.notice()).toBeNull();
  });

  it('the boards from before changes from another device aren’t sent either, with the note', async () => {
    const { store, versions, saves, clock } = setup();
    startVersions(store, versions, { now: () => clock.now });
    store.renameBoard(long);
    await settled();
    saves.length = 0;
    store.replaceWorkspace({ home: 'home', boards: { home: { ...store.getState().board, name: 'From the phone' } } });
    await settled();
    expect(saves).toEqual([]);
    expect(collab.notice()).toBe(TOO_BIG_NOTE);
  });

  it('counts characters as the online rules do (an emoji is one)', async () => {
    const { store, versions, saves } = setup();
    // 1,000 emoji: 2,000 UTF-16 units, but 1,000 characters plus the rest of the board.
    store.renameBoard('😀'.repeat(1000));
    expect(await saveSafetyVersion(store, versions, () => 1)).toBe(true);
    expect(saves).toHaveLength(1);
    expect(collab.notice()).toBeNull();
  });

  it('deleting a board still deletes it, and says no copy could be kept', async () => {
    const { store, versions, saves } = setup();
    const gone = store.addBoardCard();
    store.openBoard(gone);
    store.renameBoard(long);
    store.openBoard(store.getState().boards.home);
    await deleteBoardSafely(store, versions, gone);
    expect(store.boardName(gone)).toBe('');
    expect(saves).toEqual([]);
    expect(collab.notice()).toBe(TOO_BIG_NOTE);
  });

  it('restoring says the boards are too big, and changes nothing', async () => {
    const { store, versions, local, saves } = setup();
    await local.save({ id: 'v1', savedAt: 1, cards: 0, columns: 0 }, JSON.stringify({ version: 3, home: 'home', boards: { home: { name: 'Old', snap: true, cards: {}, columns: {}, order: [] } } }));
    store.renameBoard(long);
    await expect(restoreVersion(store, versions, 'v1', () => 2)).rejects.toThrow(TOO_BIG_RESTORE);
    expect(store.getState().board.name).toBe(long);
    expect(saves).toEqual([]);
  });

  it('restoring a backup still goes ahead, with the note', async () => {
    const { store, versions, saves } = setup();
    store.renameBoard(long);
    const backup = JSON.stringify({ version: 3, home: 'home', boards: { home: { name: 'From the backup', snap: true, cards: {}, columns: {}, order: [] } } });
    await restoreFromBackup(store, versions, backup);
    expect(store.getState().board.name).toBe('From the backup');
    expect(saves).toEqual([]);
    expect(collab.notice()).toBe(TOO_BIG_NOTE);
  });

  it('versions kept on this device have no such limit', async () => {
    const store = createStore(null, (fn) => fn());
    const versions = localVersionStore(memory());
    store.renameBoard(long);
    expect(await saveSafetyVersion(store, versions, () => 1)).toBe(true);
    expect(await versions.list()).toHaveLength(1);
    expect(collab.notice()).toBeNull();
  });
});
