import { describe, expect, it, vi } from 'vitest';
import { serializeBoard } from '../model/persist';
import { readWorkspace, serializeWorkspace } from '../model/workspace';
import { KEEP_VERSIONS, LOCAL_KEEP_VERSIONS, VERSION_GAP_MS, contentHash, type VersionMeta } from '../model/versions';
import { createStore } from './store';
import { VERSION_SAVE_WAIT_MS, deleteBoardSafely, localVersionStore, restoreFromBackup, restoreVersion, saveSafetyVersion, startVersions } from './versions';

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

describe('restoring a version while offline (job #93)', () => {
  /**
   * The home board named 'Then' saved as version 'old', a board 'Other', the home board now 'Now'
   * and open, looking at 'old'; the version store's saves never answer (offline).
   */
  async function offline() {
    const store = createStore(null, (fn) => fn());
    const local = localVersionStore(memory());
    const home = store.getState().boards.open;
    store.renameBoard('Then');
    await local.save({ id: 'old', savedAt: 1, cards: 0, columns: 0 }, serializeWorkspace(store.workspace()));
    const other = store.addBoardCard();
    store.openBoard(other);
    store.renameBoard('Other');
    store.openBoard(home);
    store.renameBoard('Now');
    const hanging = { ...local, save: () => new Promise<void>(() => {}) };
    const meta = (await local.list())[0];
    const look = () => store.previewVersion(meta, readWorkspace(serializeWorkspace(store.workspace()))!.ws.boards[store.getState().boards.open]);
    look();
    return { store, hanging, meta, home, other, look };
  }

  it('goes ahead after at most 3 seconds when the safety version can’t be saved yet', async () => {
    vi.useFakeTimers();
    try {
      const { store, hanging } = await offline();
      const done = restoreVersion(store, hanging, 'old');
      await vi.advanceTimersByTimeAsync(VERSION_SAVE_WAIT_MS);
      expect(await done).toEqual([]);
      expect(store.getState().board.name).toBe('Then');
      expect(store.getState().ui.preview).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does nothing if Back to current was pressed meanwhile', async () => {
    vi.useFakeTimers();
    try {
      const { store, hanging } = await offline();
      const done = restoreVersion(store, hanging, 'old');
      store.endPreview();
      await vi.advanceTimersByTimeAsync(VERSION_SAVE_WAIT_MS);
      expect(await done).toEqual([]);
      expect(store.getState().board.name).toBe('Now');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does nothing if Back to current was pressed and the same version picked again meanwhile', async () => {
    vi.useFakeTimers();
    try {
      const { store, hanging, look } = await offline();
      const done = restoreVersion(store, hanging, 'old');
      store.endPreview();
      look();
      await vi.advanceTimersByTimeAsync(VERSION_SAVE_WAIT_MS);
      await done;
      expect(store.getState().board.name).toBe('Now');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a safety version that fails to save (not just waits) still stops the restore', async () => {
    const { store, hanging } = await offline();
    const failing = { ...hanging, save: async () => Promise.reject(new Error('denied')) };
    await expect(restoreVersion(store, failing, 'old')).rejects.toThrow();
    expect(store.getState().board.name).toBe('Now');
  });

  it('does nothing if another version is being looked at by then', async () => {
    vi.useFakeTimers();
    try {
      const { store, hanging, meta } = await offline();
      const done = restoreVersion(store, hanging, 'old');
      store.previewVersion({ ...meta, id: 'other' }, store.getState().board);
      await vi.advanceTimersByTimeAsync(VERSION_SAVE_WAIT_MS);
      await done;
      expect(store.getState().board.name).toBe('Now');
      expect(store.getState().ui.preview?.meta.id).toBe('other');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does nothing if another board is open by then, even looking at the same version there', async () => {
    vi.useFakeTimers();
    try {
      const { store, hanging, home, other, look } = await offline();
      const done = restoreVersion(store, hanging, 'old');
      store.openBoard(other);
      look();
      await vi.advanceTimersByTimeAsync(VERSION_SAVE_WAIT_MS);
      await done;
      expect(store.getState().board.name).toBe('Other');
      expect(store.boardName(home)).toBe('Now');
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts saving the safety version straight away, before the version list is read (owner, check of PR #87)', async () => {
    vi.useFakeTimers();
    try {
      const { store, hanging } = await offline();
      const saved: string[] = [];
      // Just offline: reading the list doesn't answer yet either.
      const slow = { ...hanging, list: () => new Promise<VersionMeta[]>(() => {}), save: (_: VersionMeta, data: string) => (saved.push(data), new Promise<void>(() => {})) };
      const done = restoreVersion(store, slow, 'old');
      await vi.advanceTimersByTimeAsync(0);
      expect(saved.map((d) => homeIn(d)?.name)).toEqual(['Now']);
      await vi.advanceTimersByTimeAsync(VERSION_SAVE_WAIT_MS);
      await done;
      expect(store.getState().board.name).toBe('Then');
    } finally {
      vi.useRealTimers();
    }
  });

  it('tells the person if the safety version fails after the restore went ahead', async () => {
    vi.useFakeTimers();
    try {
      const { store, hanging } = await offline();
      const late = { ...hanging, save: () => new Promise<void>((_, no) => setTimeout(() => no(new Error('denied')), 5000)) };
      const note = vi.fn();
      const done = restoreVersion(store, late, 'old', Date.now, note);
      await vi.advanceTimersByTimeAsync(VERSION_SAVE_WAIT_MS);
      await done;
      expect(store.getState().board.name).toBe('Then');
      expect(note).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(5000);
      expect(note).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts saving the safety version straight away, before the chosen version is read (owner, second check of PR #87)', async () => {
    vi.useFakeTimers();
    try {
      const { store, hanging } = await offline();
      const saved: string[] = [];
      // Just after the connection drops, reading the version can take about 10 seconds.
      let answer: (data: string | null) => void = () => {};
      const slow = {
        ...hanging,
        get: (id: string) => new Promise<string | null>((done) => (answer = () => hanging.get(id).then(done))),
        save: (_: VersionMeta, data: string) => (saved.push(data), new Promise<void>(() => {})),
      };
      const done = restoreVersion(store, slow, 'old');
      await vi.advanceTimersByTimeAsync(0);
      expect(saved.map((d) => homeIn(d)?.name)).toEqual(['Now']);
      await vi.advanceTimersByTimeAsync(10_000);
      answer(null);
      await vi.advanceTimersByTimeAsync(VERSION_SAVE_WAIT_MS);
      await done;
      expect(store.getState().board.name).toBe('Then');
      expect(saved).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores nothing if the safety version is refused right at the 3-second mark', async () => {
    vi.useFakeTimers();
    try {
      const { store, hanging } = await offline();
      const late = { ...hanging, save: () => new Promise<void>((_, no) => setTimeout(() => no(new Error('denied')), VERSION_SAVE_WAIT_MS)) };
      const note = vi.fn();
      const done = restoreVersion(store, late, 'old', Date.now, note);
      await vi.advanceTimersByTimeAsync(0);
      vi.advanceTimersByTime(VERSION_SAVE_WAIT_MS); // the refusal and the end of the wait in the same moment
      // Known refused before anything was replaced: nothing is restored, and the bar says so.
      await expect(done).rejects.toThrow();
      expect(store.getState().board.name).toBe('Now');
      expect(note).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores nothing if the safety version is refused after the 3 seconds but before the chosen version is read', async () => {
    vi.useFakeTimers();
    try {
      const { store, hanging } = await offline();
      const slow = {
        ...hanging,
        get: (id: string) => new Promise<string | null>((done) => setTimeout(() => hanging.get(id).then(done), 10_000)),
        save: () => new Promise<void>((_, no) => setTimeout(() => no(new Error('denied')), 5000)),
      };
      const note = vi.fn();
      const done = restoreVersion(store, slow, 'old', Date.now, note);
      const failed = expect(done).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(10_000);
      await failed;
      expect(store.getState().board.name).toBe('Now');
      expect(note).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays quiet if the chosen version can’t be read after the person moved on', async () => {
    vi.useFakeTimers();
    try {
      const { store, hanging } = await offline();
      const slow = { ...hanging, get: () => new Promise<string | null>((_, no) => setTimeout(() => no(new Error('offline')), 10_000)) };
      const done = restoreVersion(store, slow, 'old');
      store.endPreview();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await done).toEqual([]);
      expect(store.getState().board.name).toBe('Now');
    } finally {
      vi.useRealTimers();
    }
  });

  it('no note for a late failure when nothing was restored', async () => {
    vi.useFakeTimers();
    try {
      const { store, hanging } = await offline();
      const late = { ...hanging, save: () => new Promise<void>((_, no) => setTimeout(() => no(new Error('denied')), 5000)) };
      const note = vi.fn();
      const done = restoreVersion(store, late, 'old', Date.now, note);
      store.endPreview();
      await vi.advanceTimersByTimeAsync(VERSION_SAVE_WAIT_MS + 5000);
      await done;
      expect(note).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves no 3-second timer behind once the safety version is saved', async () => {
    vi.useFakeTimers();
    try {
      const store = createStore(null, (fn) => fn());
      const versions = localVersionStore(memory());
      store.renameBoard('Before');
      await versions.save({ id: 'old', savedAt: 1, cards: 0, columns: 0 }, serializeWorkspace(store.workspace()));
      store.renameBoard('After');
      const timers = vi.getTimerCount();
      await restoreVersion(store, versions, 'old');
      expect(vi.getTimerCount()).toBe(timers);
      expect(await versions.list()).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a delete also starts its safety version before reading the list', async () => {
    vi.useFakeTimers();
    try {
      const { store, hanging, other } = await offline();
      let saves = 0;
      const slow = { ...hanging, list: () => new Promise<VersionMeta[]>(() => {}), save: () => (saves++, new Promise<void>(() => {})) };
      const done = deleteBoardSafely(store, slow, other);
      await vi.advanceTimersByTimeAsync(0);
      expect(saves).toBe(1);
      await vi.advanceTimersByTimeAsync(VERSION_SAVE_WAIT_MS);
      await done;
      expect(store.workspace().boards[other]).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('two identical safety versions that answer together keep one of them, not none', async () => {
    const store = createStore(null, (fn) => fn());
    const local = localVersionStore(memory());
    const answers: (() => void)[] = [];
    // Offline, both saves wait, then answer together once back online.
    const queued = { ...local, save: (meta: VersionMeta, data: string) => new Promise<void>((done) => answers.push(() => void local.save(meta, data).then(done))) };
    let at = 1;
    const first = saveSafetyVersion(store, queued, () => at++);
    const second = saveSafetyVersion(store, queued, () => at++);
    answers.forEach((answer) => answer());
    await Promise.all([first, second]);
    await settled();
    expect(await local.list()).toHaveLength(1);
  });

  it('no note for a late failure when the restore waited for shared boards instead', async () => {
    vi.useFakeTimers();
    try {
      const { store, hanging } = await offline();
      const late = { ...hanging, save: () => new Promise<void>((_, no) => setTimeout(() => no(new Error('denied')), 5000)) };
      const note = vi.fn();
      const done = restoreVersion(store, late, 'old', Date.now, note);
      store.setShares([], false);
      await vi.advanceTimersByTimeAsync(VERSION_SAVE_WAIT_MS);
      expect(await done).toBe('loading');
      await vi.advanceTimersByTimeAsync(5000);
      expect(note).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a safety version refused after the person moved on changes nothing and says nothing', async () => {
    vi.useFakeTimers();
    try {
      const { store, hanging } = await offline();
      const refused = { ...hanging, save: () => new Promise<void>((_, no) => setTimeout(() => no(new Error('denied')), 1000)) };
      const done = restoreVersion(store, refused, 'old');
      store.endPreview();
      await vi.advanceTimersByTimeAsync(VERSION_SAVE_WAIT_MS);
      expect(await done).toEqual([]);
      expect(store.getState().board.name).toBe('Now');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a safety version answering after a newer, different version is still dropped if it repeats the one before it', async () => {
    const store = createStore(null, (fn) => fn());
    const local = localVersionStore(memory());
    store.renameBoard('Same');
    const same = serializeWorkspace(store.workspace());
    await local.save({ id: 'before', savedAt: 1, cards: 0, columns: 0, hash: contentHash(same) }, same);
    let answer = () => {};
    const queued = { ...local, save: (meta: VersionMeta, data: string) => new Promise<void>((done) => (answer = () => void local.save(meta, data).then(done))) };
    const saving = saveSafetyVersion(store, queued, () => 2);
    store.renameBoard('Different');
    await local.save({ id: 'newer', savedAt: 3, cards: 0, columns: 0 }, serializeWorkspace(store.workspace()));
    answer();
    await saving;
    expect((await local.list()).map((v) => v.id)).toEqual(['newer', 'before']);
  });
});

// Job #147 (review 137, H3): a phone's old copy, saved offline and sent hours later, replaces every
// board on the computer. The boards as they were just before are kept as a version, so the work
// done here can be brought back from Version history.
describe('changes from another device replacing work done here', () => {
  const MIN = 60_000;
  type Ws = ReturnType<ReturnType<typeof createStore>['workspace']>;
  /** The boards as another device last saw them, with the home board renamed. */
  const oldCopy = (ws: Ws, name: string): Ws => ({ ...ws, boards: { ...ws.boards, [ws.home]: { ...ws.boards[ws.home], name } } });

  it('saves the boards as they were just before, marked as such, and still shows the incoming copy', async () => {
    const { store, versions, clock } = setup();
    const phone = store.workspace();
    store.renameBoard('Work'); // 9:00, saves the first version
    await settled();
    clock.now += 5 * MIN;
    store.renameBoard('More work');
    await settled();
    clock.now += 15 * MIN;
    store.replaceWorkspace(oldCopy(phone, 'Old phone copy'));
    await settled();
    expect(store.getState().board.name).toBe('Old phone copy');
    const list = await versions.list();
    expect(list).toHaveLength(2);
    expect(list[0].kind).toBe('outside');
    expect(list[0].savedAt).toBe(clock.now);
    expect(homeIn(await versions.get(list[0].id))?.name).toBe('More work');
    expect(list[1].kind).toBeUndefined();
  });

  it('the work can be brought back by restoring that version', async () => {
    const { store, versions, clock } = setup();
    store.setShares([], true);
    const phone = store.workspace();
    store.renameBoard('Work');
    await settled();
    clock.now += 20 * MIN;
    store.replaceWorkspace(oldCopy(phone, 'Old phone copy'));
    await settled();
    const [v] = await versions.list();
    await restoreVersion(store, versions, v.id, () => clock.now);
    expect(store.getState().board.name).toBe('Work');
  });

  it('no version when nothing was edited on this page since its last version', async () => {
    const { store, versions, clock } = setup();
    const phone = store.workspace();
    store.renameBoard('Work');
    await settled();
    clock.now += 20 * MIN;
    store.replaceWorkspace(oldCopy(phone, 'One'));
    await settled();
    clock.now += 20 * MIN;
    store.replaceWorkspace(oldCopy(phone, 'Two'));
    await settled();
    expect(await versions.list()).toHaveLength(2);
  });

  it('none within 10 minutes of the last version, so using two devices at once doesn’t fill the history', async () => {
    const { store, versions, clock } = setup();
    const phone = store.workspace();
    store.renameBoard('Work');
    await settled();
    clock.now += 5 * MIN;
    store.renameBoard('More work');
    clock.now += 1 * MIN;
    store.replaceWorkspace(oldCopy(phone, 'From the phone'));
    await settled();
    expect(await versions.list()).toHaveLength(1);
  });

  it('a shared board changed by someone else doesn’t save one (only the person’s own boards count)', async () => {
    const { store, versions, clock } = setup();
    const id = store.newBoard();
    store.setShares([{ id: 's1', root: id, boards: [id], owner: false, ownerUid: 'bob', people: [], link: null }], true);
    store.openBoard(store.getState().boards.home);
    store.renameBoard('Work');
    await settled();
    clock.now += 20 * MIN;
    const shared = store.workspace().boards[id];
    store.replaceBoards({ [id]: { ...shared, name: 'Changed by Bob' } });
    await settled();
    expect(await versions.list()).toHaveLength(1);
  });

  it('a version that can’t be saved (too big for the online limit, say) doesn’t stop the incoming copy', async () => {
    const store = createStore(null, (fn) => fn());
    const inner = localVersionStore(memory());
    let refuse = false;
    const versions = { ...inner, save: (m: VersionMeta, d: string) => (refuse ? Promise.reject(new Error('too big')) : inner.save(m, d)) };
    const clock = { now: new Date(2026, 9, 4, 9, 0).getTime() };
    startVersions(store, versions, { now: () => clock.now });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const phone = store.workspace();
    store.renameBoard('Work');
    await settled();
    refuse = true;
    clock.now += 20 * MIN;
    store.replaceWorkspace(oldCopy(phone, 'Old phone copy'));
    await settled();
    expect(store.getState().board.name).toBe('Old phone copy');
    expect(await inner.list()).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('starts saving straight away, before anything else can clear this device (deleting a demo account)', async () => {
    const { store, versions, clock } = setup();
    const phone = store.workspace();
    store.renameBoard('Work');
    await settled();
    clock.now += 20 * MIN;
    const save = vi.spyOn(versions, 'save');
    store.replaceWorkspace(oldCopy(phone, 'Old phone copy'));
    expect(save).toHaveBeenCalledTimes(1);
  });
});
