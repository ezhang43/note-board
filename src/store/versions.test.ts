import { describe, expect, it, vi } from 'vitest';
import { serializeBoard } from '../model/persist';
import { readWorkspace, serializeWorkspace } from '../model/workspace';
import { KEEP_VERSIONS, LOCAL_KEEP_VERSIONS, VERSION_GAP_MS, type VersionMeta } from '../model/versions';
import { createStore } from './store';
import { VERSION_SAVE_WAIT_MS, deleteBoardSafely, localVersionStore, restoreFromBackup, restoreVersion, startVersions } from './versions';

// Version history (owner request): the board as it was is saved when editing starts after a quiet spell.

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

/** The home board in a saved version (versions hold every board). */
const homeIn = (raw: string | null) => readWorkspace(raw)?.ws.boards.home ?? null;

async function settled() {
  for (let i = 0; i < 100; i++) await Promise.resolve();
}

function setup() {
  const store = createStore(null, (fn) => fn());
  const versions = localVersionStore(memory());
  const clock = { now: new Date(2026, 9, 4, 9, 0).getTime() };
  const recorder = startVersions(store, versions, { now: () => clock.now });
  return { store, versions, clock, recorder };
}

describe('saving versions', () => {
  it('the first change saves the board as it was just before it', async () => {
    const { store, versions } = setup();
    store.renameBoard('Before');
    await settled();
    store.renameBoard('After');
    await settled();
    const list = await versions.list();
    expect(list).toHaveLength(1);
    expect(homeIn(await versions.get(list[0].id))?.name).toBe('My first board');
  });

  it('no new version while editing carries on; one after a 10-minute quiet spell', async () => {
    const { store, versions, clock } = setup();
    store.renameBoard('One');
    await settled();
    clock.now += VERSION_GAP_MS - 1000;
    store.renameBoard('Two');
    await settled();
    expect(await versions.list()).toHaveLength(1);
    clock.now += VERSION_GAP_MS;
    store.renameBoard('Three');
    await settled();
    const list = await versions.list();
    expect(list).toHaveLength(2);
    // Newest first: the board just before "Three".
    expect(homeIn(await versions.get(list[0].id))?.name).toBe('Two');
  });

  it("a change from another device doesn't save a version (that device saves its own)", async () => {
    const { store, versions } = setup();
    store.replaceBoard({ ...store.getState().board, name: 'From the phone' });
    await settled();
    expect(await versions.list()).toHaveLength(0);
  });

  it(`keeps the newest ${KEEP_VERSIONS} online`, async () => {
    const store = createStore(null, (fn) => fn());
    const versions = localVersionStore(memory(), KEEP_VERSIONS);
    const clock = { now: new Date(2026, 9, 4, 9, 0).getTime() };
    startVersions(store, versions, { now: () => clock.now });
    for (let i = 0; i < KEEP_VERSIONS + 2; i++) {
      clock.now += VERSION_GAP_MS;
      store.renameBoard(`Name ${i}`);
      await settled();
    }
    expect(await versions.list()).toHaveLength(KEEP_VERSIONS);
  });
});

describe('looking at and restoring a version', () => {
  it('previewing shows the old board without touching the real one, and edits are refused meanwhile', async () => {
    const { store, versions } = setup();
    store.renameBoard('Old');
    await settled();
    store.renameBoard('New');
    await settled();
    const [v] = await versions.list();
    store.previewVersion(v, homeIn(await versions.get(v.id))!);
    expect(store.getState().ui.preview?.board.name).toBe('My first board');
    expect(store.getState().board.name).toBe('New');
    store.renameBoard('Typed while looking');
    expect(store.getState().board.name).toBe('New');
    store.endPreview();
    expect(store.getState().ui.preview).toBeNull();
  });

  it('restoring saves the current board as a version first, and can be undone', async () => {
    const { store, versions, clock } = setup();
    store.renameBoard('Old');
    await settled();
    store.renameBoard('New');
    await settled();
    const [v] = await versions.list();
    clock.now += 60_000;
    await restoreVersion(store, versions, v.id, () => clock.now);
    expect(store.getState().board.name).toBe('My first board');
    expect(store.getState().ui.preview).toBeNull();
    const list = await versions.list();
    expect(list).toHaveLength(2);
    expect(homeIn(await versions.get(list[0].id))?.name).toBe('New');
    // The restore itself doesn't save the same version again.
    await settled();
    expect(await versions.list()).toHaveLength(2);
    store.undo();
    expect(store.getState().board.name).toBe('New');
  });
});

describe('fixes from the code review (2026-10-05)', () => {
  /** A version store that counts how often it is asked for the list and for a board. */
  function counted() {
    const inner = localVersionStore(memory());
    const calls = { list: 0, get: 0 };
    return {
      calls,
      store: {
        ...inner,
        list: () => (calls.list++, inner.list()),
        get: (id: string) => (calls.get++, inner.get(id)),
      },
    };
  }

  it("typing doesn't go online for every change: the list is only read when a version may be due", async () => {
    const store = createStore(null, (fn) => fn());
    const { calls, store: versions } = counted();
    startVersions(store, versions, { now: () => new Date(2026, 9, 4, 9, 0).getTime() });
    await settled();
    store.renameBoard('A'); // the first change saves a version
    await settled();
    const after = calls.list;
    for (let i = 0; i < 20; i++) {
      store.renameBoard('A'.repeat(i + 2));
      await settled();
    }
    expect(calls.list).toBe(after);
  });

  it("saving a version doesn't download the newest one to compare", async () => {
    const { store, versions, clock } = setupCounted();
    store.renameBoard('One');
    await settled();
    clock.now += VERSION_GAP_MS;
    store.calls.get = 0;
    store.s.renameBoard('Two');
    await settled();
    expect(await versions.list()).toHaveLength(2);
    expect(store.calls.get).toBe(0);
  });

  it("blocks re-arranging themselves (no edit) don't save a version", async () => {
    const { store, versions, clock } = setup();
    const place = (y: number) => {
      store.addCard('note');
      const id = store.getState().ui.selection[0];
      const c = store.getState().board.cards[id];
      store.startDrag('card', id, c.x, c.y);
      store.moveDrag(0, y, null);
      store.dropDrag(null);
      return id;
    };
    const a = place(0);
    place(200);
    await settled();
    const before = (await versions.list()).length;
    clock.now += VERSION_GAP_MS * 2;
    const boardBefore = store.getState().board;
    store.setMeasuredHeight(a, 400); // grows over the note below, which moves down by itself
    expect(store.getState().board).not.toBe(boardBefore);
    await settled();
    expect(await versions.list()).toHaveLength(before);
  });

  it("a resize or drag that ends while looking at an old version doesn't stay stuck on screen", async () => {
    const { store, versions } = setup();
    store.renameBoard('Old');
    await settled();
    const [v] = await versions.list();
    store.addCard('note');
    const id = store.getState().ui.selection[0];
    store.previewVersion(v, homeIn(await versions.get(v.id))!);
    store.showResize({ kind: 'card', id, w: 300, h: 200, label: '300 × 200', labelAt: { x: 0, y: 0 } } as never);
    store.commitResize();
    expect(store.getState().ui.resize).toBeNull();
    expect(store.getState().board.cards[id].w).not.toBe(300);
  });

  it(`on this device only (no online history) it keeps ${LOCAL_KEEP_VERSIONS}, so the board itself always has room to save`, async () => {
    const { store, versions, clock } = setup();
    for (let i = 0; i < LOCAL_KEEP_VERSIONS + 3; i++) {
      clock.now += VERSION_GAP_MS;
      store.renameBoard(`Name ${i}`);
      await settled();
    }
    expect(await versions.list()).toHaveLength(LOCAL_KEEP_VERSIONS);
  });

  it('undo after a quiet spell saves the board as it was first, like any other edit', async () => {
    const { store, versions, clock } = setup();
    store.renameBoard('One');
    await settled();
    store.renameBoard('Two');
    await settled();
    clock.now += VERSION_GAP_MS;
    store.undo();
    await settled();
    const list = await versions.list();
    expect(list).toHaveLength(2);
    expect(homeIn(await versions.get(list[0].id))?.name).toBe('Two');
  });

  it("a version that couldn't be saved is tried again a minute later, not an hour later", async () => {
    const store = createStore(null, (fn) => fn());
    const inner = localVersionStore(memory());
    let offline = true;
    const versions = { ...inner, save: (m: VersionMeta, d: string) => (offline ? Promise.reject(new Error('offline')) : inner.save(m, d)) };
    const clock = { now: new Date(2026, 9, 4, 9, 0).getTime() };
    startVersions(store, versions, { now: () => clock.now });
    await settled();
    store.renameBoard('One'); // the save fails
    await settled();
    expect(await inner.list()).toHaveLength(0);
    offline = false;
    clock.now += 30_000;
    store.renameBoard('Two'); // too soon to try again
    await settled();
    expect(await inner.list()).toHaveLength(0);
    clock.now += 31_000;
    store.renameBoard('Three');
    await settled();
    const list = await inner.list();
    expect(list).toHaveLength(1);
    // The board kept is the one from before the edits began, not a later one.
    expect(homeIn(await inner.get(list[0].id))?.name).toBe('My first board');
  });

  it('while looking at an old version, only what a gesture showed is cleared; nothing else changes', async () => {
    const { store, versions } = setup();
    store.renameBoard('Old');
    await settled();
    const [v] = await versions.list();
    store.previewVersion(v, homeIn(await versions.get(v.id))!);
    store.addCard('note');
    expect(store.getState().ui.selection).toEqual([]);
    expect(Object.keys(store.getState().board.cards)).toHaveLength(0);
  });
});

function setupCounted() {
  const s = createStore(null, (fn) => fn());
  const inner = localVersionStore(memory());
  const calls = { list: 0, get: 0 };
  const versions = { ...inner, list: () => (calls.list++, inner.list()), get: (id: string) => (calls.get++, inner.get(id)) };
  const clock = { now: new Date(2026, 9, 4, 9, 0).getTime() };
  startVersions(s, versions, { now: () => clock.now });
  return { store: { s, calls, renameBoard: s.renameBoard }, versions, clock };
}

describe('restoring a backup file (owner request)', () => {
  it('saves the board as it is now as a version first, ends any preview, and puts the backup in place', async () => {
    const { store, versions } = setup();
    store.renameBoard('Before');
    await settled();
    const backup = serializeBoard({ ...store.getState().board, name: 'From the backup' });
    const [v] = await versions.list();
    store.previewVersion(v, homeIn(await versions.get(v.id))!);
    store.renameBoard('Now');
    await restoreFromBackup(store, versions, backup);
    expect(store.getState().ui.preview).toBeNull();
    expect(store.getState().board.name).toBe('From the backup');
    const list = await versions.list();
    expect(homeIn(await versions.get(list[0].id))?.name).toBe('Before');
  });

  it('refuses a file that is not a backup, changing nothing', async () => {
    const { store, versions } = setup();
    expect(await restoreFromBackup(store, versions, '{"hello":1}')).toBe(false);
    expect(store.getState().board.name).toBe('My first board');
  });
});

describe('versions of several boards (owner request)', () => {
  it('a version holds every board', async () => {
    const { store, versions, clock } = setup();
    store.renameBoard('Home');
    const id = store.newBoard();
    store.renameBoard('Second');
    await settled();
    clock.now += VERSION_GAP_MS * 2;
    store.renameBoard('Second, later');
    await settled();
    const [v] = await versions.list();
    expect(v.boards).toBe(2);
    expect(readWorkspace(await versions.get(v.id))!.ws.boards[id].name).toBe('Second');
  });

  it('restoring puts back the open board, brings back a deleted board, and leaves other boards alone', async () => {
    const { store, versions, clock } = setup();
    const home = store.getState().boards.open;
    const gone = store.addBoardCard();
    store.openBoard(gone);
    store.renameBoard('Deleted later');
    const kept = store.newBoard();
    store.renameBoard('Kept');
    store.openBoard(home);
    store.renameBoard('Home then');
    await settled();
    clock.now += VERSION_GAP_MS * 2;
    store.renameBoard('Home now');
    await settled();
    const [v] = await versions.list();
    store.deleteBoard(gone);
    store.openBoard(kept);
    store.renameBoard('Kept, renamed');
    store.openBoard(home);
    await restoreVersion(store, versions, v.id, () => clock.now + 1000);
    expect(store.getState().board.name).toBe('Home then');
    expect(store.boardName(gone)).toBe('Deleted later');
    expect(store.boardName(kept)).toBe('Kept, renamed');
  });

  it('deleting a board saves every board as a version first, so it can be brought back', async () => {
    const { store, versions } = setup();
    const gone = store.addBoardCard();
    store.openBoard(gone);
    store.renameBoard('Old plans');
    store.openBoard(store.getState().boards.home);
    await settled();
    const before = (await versions.list()).length;
    await deleteBoardSafely(store, versions, gone);
    expect(store.boardName(gone)).toBe('');
    const list = await versions.list();
    expect(list.length).toBe(before + 1);
    expect(readWorkspace(await versions.get(list[0].id))!.ws.boards[gone].name).toBe('Old plans');
  });

  it('with one board here and one in the backup, restoring it is an ordinary change (Ctrl+Z undoes it)', async () => {
    const { store, versions } = setup();
    store.renameBoard('Before');
    const home = store.getState().boards.open;
    const backup = serializeWorkspace({ home, boards: { [home]: { ...store.getState().board, name: 'Backup' } } });
    expect(store.isFullBackup(backup)).toBe(false);
    await restoreFromBackup(store, versions, backup);
    expect(store.getState().board.name).toBe('Backup');
    store.undo();
    expect(store.getState().board.name).toBe('Before');
  });

  it('a backup of every board replaces every board, keeping them all as a version first', async () => {
    const { store, versions } = setup();
    store.renameBoard('Before');
    const home = store.getState().boards.open;
    const backup = serializeWorkspace({ home, boards: { [home]: { ...store.getState().board, name: 'Backup home' }, other: { ...store.getState().board, name: 'Backup other' } } });
    expect(store.isBackup(backup)).toBe(true);
    await restoreFromBackup(store, versions, backup);
    expect(store.getState().board.name).toBe('Backup home');
    expect(store.boardName('other')).toBe('Backup other');
    const [v] = await versions.list();
    expect(homeIn(await versions.get(v.id))?.name).toBe('Before');
  });
});

describe('review fixes: several boards (2026-10-05)', () => {
  it('deleting a board still happens when the version can’t be saved yet (offline: the save never answers)', async () => {
    vi.useFakeTimers();
    try {
      const store = createStore(null, (fn) => fn());
      const hanging = { ...localVersionStore(memory()), save: () => new Promise<void>(() => {}) };
      const gone = store.addBoardCard();
      const done = deleteBoardSafely(store, hanging, gone);
      await vi.advanceTimersByTimeAsync(VERSION_SAVE_WAIT_MS);
      await done;
      expect(store.boardName(gone)).toBe('');
      expect(store.getState().boards.others[gone]).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a version from before there were several boards is of the home board: restoring it opens home and puts it back', async () => {
    const { store, versions } = setup();
    const home = store.getState().boards.home;
    const old = serializeBoard({ ...store.getState().board, name: 'Home long ago' });
    await versions.save({ id: 'old', savedAt: 1, cards: 0, columns: 0 }, old);
    const other = store.newBoard();
    store.renameBoard('Other');
    await restoreVersion(store, versions, 'old');
    expect(store.getState().boards.open).toBe(home);
    expect(store.getState().board.name).toBe('Home long ago');
    expect(store.boardName(other)).toBe('Other');
  });
});
