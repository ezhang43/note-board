import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { addCard, createBoard } from '../model/board';
import { createCard } from '../model/cards';
import { BOARD_KEY, serializeBoard } from '../model/persist';
import { journalRich, type Rich } from '../model/richText';
import type { NoteCard } from '../model/types';
import type { VersionMeta } from '../model/versions';
import { readWorkspace, serializeWorkspace } from '../model/workspace';
import { createStore, type Store } from './store';
import { claimDevice, OWNER_KEY, parkedKey } from './account';
import { baseKey, ownBoardsGuard, sharesKey } from './sharing';
import { ONLINE_LIMIT, startSync, SYNC_DELAY, type Remote, type RemoteDoc } from './sync';

/** A pretend online copy: tests decide when versions arrive. */
function fakeRemote() {
  let listener: ((doc: RemoteDoc | null) => void) | null = null;
  const writes: RemoteDoc[] = [];
  /** When true, uploads fail (as Firestore does past its size limit or when rules refuse). */
  const control = { fail: false };
  const remote: Remote = {
    watch(onChange) {
      listener = onChange;
      return () => {
        listener = null;
      };
    },
    write: (doc) => {
      writes.push(doc);
      return control.fail ? Promise.reject(new Error('refused')) : Promise.resolve();
    },
  };
  return { remote, writes, control, send: (doc: RemoteDoc | null) => listener?.(doc), watching: () => listener !== null };
}

function boardJson(name: string) {
  return serializeBoard({ ...createBoard(), name });
}

/** Lets a finished or failed upload be noticed. */
async function settled() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function setup() {
  const store = createStore(null, (fn) => fn());
  const fake = fakeRemote();
  const onReady = vi.fn();
  const onError = vi.fn();
  const onSaveState = vi.fn();
  const sync = startSync(store, fake.remote, { client: 'me', onReady, onError, onSaveState });
  return { store, fake, onReady, onError, onSaveState, sync };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('board sync', () => {
  it('uses the online board when there is one', () => {
    const { store, fake, onReady } = setup();
    store.renameBoard('Only on this device');
    fake.send({ data: boardJson('From the cloud'), client: 'laptop' });
    expect(store.getState().board.name).toBe('From the cloud');
    expect(onReady).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(fake.writes).toEqual([]);
  });

  it("uploads this device's board when there is no online copy yet", () => {
    const { store, fake, onReady } = setup();
    store.renameBoard('My board');
    fake.send(null);
    expect(onReady).toHaveBeenCalledOnce();
    expect(fake.writes).toHaveLength(1);
    expect(JSON.parse(fake.writes[0].data).boards.home.name).toBe('My board');
    expect(fake.writes[0].client).toBe('me');
  });

  it('uploads changes shortly after they stop, as one write', () => {
    const { store, fake } = setup();
    fake.send({ data: boardJson('Start'), client: 'laptop' });
    store.renameBoard('S');
    store.renameBoard('Sh');
    store.renameBoard('Shop');
    expect(fake.writes).toEqual([]);
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(fake.writes).toHaveLength(1);
    expect(JSON.parse(fake.writes[0].data).boards.home.name).toBe('Shop');
  });

  it('does not upload before the online copy has been checked', () => {
    const { store, fake } = setup();
    store.renameBoard('Too early');
    vi.advanceTimersByTime(SYNC_DELAY * 2);
    expect(fake.writes).toEqual([]);
  });

  it('shows changes made on another device and does not send them back', () => {
    const { store, fake } = setup();
    fake.send({ data: boardJson('Start'), client: 'laptop' });
    fake.send({ data: boardJson('Renamed on laptop'), client: 'laptop' });
    expect(store.getState().board.name).toBe('Renamed on laptop');
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(fake.writes).toEqual([]);
  });

  it('ignores its own uploads coming back', () => {
    const { store, fake } = setup();
    fake.send({ data: boardJson('Start'), client: 'laptop' });
    store.renameBoard('Mine');
    vi.advanceTimersByTime(SYNC_DELAY);
    store.renameBoard('Mine, newer');
    fake.send(fake.writes[0]);
    expect(store.getState().board.name).toBe('Mine, newer');
  });

  it('a change from another device starts undo afresh', () => {
    const { store, fake } = setup();
    fake.send({ data: boardJson('Start'), client: 'laptop' });
    store.renameBoard('Local edit');
    expect(store.getState().ui.canUndo).toBe(true);
    vi.advanceTimersByTime(SYNC_DELAY);
    fake.send({ data: boardJson('From phone'), client: 'phone' });
    expect(store.getState().ui.canUndo).toBe(false);
    store.undo();
    expect(store.getState().board.name).toBe('From phone');
  });

  it('waits until a drag is over before showing a change from another device', () => {
    const { store, fake } = setup();
    fake.send({ data: boardJson('Start'), client: 'laptop' });
    store.addCard('note');
    vi.advanceTimersByTime(SYNC_DELAY);
    const id = store.getState().board.order[0];
    const card = store.getState().board.cards[id];
    store.startDrag('card', id, card.x, card.y);
    fake.send({ data: boardJson('From phone'), client: 'phone' });
    expect(store.getState().board.name).toBe('Start');
    store.cancelDrag();
    expect(store.getState().board.name).toBe('From phone');
  });

  it('flush uploads a waiting change straight away; stop stops everything', () => {
    const { store, fake, sync } = setup();
    fake.send({ data: boardJson('Start'), client: 'laptop' });
    store.renameBoard('Closing the tab');
    sync.flush();
    expect(fake.writes).toHaveLength(1);
    sync.stop();
    expect(fake.watching()).toBe(false);
    store.renameBoard('After stop');
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(fake.writes).toHaveLength(1);
  });
  it('does not send a change from another device back, even when saved with fields in another order', () => {
    const { fake } = setup();
    fake.send({ data: boardJson('Start'), client: 'laptop' });
    // A card recoloured on the laptop: its saved fields are in a different order than a fresh load gives.
    const card = { ...createCard('note', 'n1'), titleColor: 'lavender' as const };
    const board = addCard(createBoard(), card, { type: 'loose', x: 0, y: 0 });
    fake.send({ data: serializeBoard(board), client: 'laptop' });
    vi.advanceTimersByTime(SYNC_DELAY * 2);
    expect(fake.writes).toEqual([]);
  });

  it('a drop made after another device saved wins over that change, and is uploaded', () => {
    const { store, fake } = setup();
    fake.send({ data: boardJson('Start'), client: 'laptop' });
    store.addCard('note');
    vi.advanceTimersByTime(SYNC_DELAY);
    const writesBefore = fake.writes.length;
    const id = store.getState().board.order[0];
    const card = store.getState().board.cards[id];
    store.startDrag('card', id, card.x, card.y);
    store.moveDrag(card.x + 400, card.y + 400, null);
    fake.send({ data: boardJson('From phone'), client: 'phone' });
    store.dropDrag(null);
    const moved = store.getState().board.cards[id];
    expect(moved.x).toBeGreaterThan(card.x + 300);
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(fake.writes.length).toBe(writesBefore + 1);
    expect(JSON.parse(fake.writes.at(-1)!.data).boards.home.cards[id].x).toBe(moved.x);
  });

  it('a change not yet uploaded is kept and sent when another device saves meanwhile', () => {
    const { store, fake } = setup();
    fake.send({ data: boardJson('Start'), client: 'laptop' });
    store.renameBoard('Typed here');
    vi.advanceTimersByTime(SYNC_DELAY / 4);
    fake.send({ data: boardJson('From phone'), client: 'phone' });
    expect(store.getState().board.name).toBe('Typed here');
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(fake.writes).toHaveLength(1);
    expect(JSON.parse(fake.writes[0].data).boards.home.name).toBe('Typed here');
  });

  it('an online board it cannot read is never replaced or overwritten', () => {
    const { store, fake, onError } = setup();
    store.renameBoard('On this device');
    fake.send({ data: '{corrupt', client: 'laptop' });
    expect(onError).toHaveBeenCalledOnce();
    expect(store.getState().board.name).toBe('On this device');
    store.renameBoard('Still typing');
    vi.advanceTimersByTime(SYNC_DELAY * 2);
    expect(fake.writes).toEqual([]);
  });

  it('a newer-version board from another device is not shown or overwritten', () => {
    const { store, fake, onError } = setup();
    fake.send({ data: boardJson('Start'), client: 'laptop' });
    fake.send({ data: JSON.stringify({ version: 99, board: { name: 'Future' } }), client: 'phone' });
    expect(onError).toHaveBeenCalledOnce();
    expect(store.getState().board.name).toBe('Start');
    store.renameBoard('Local edit');
    vi.advanceTimersByTime(SYNC_DELAY * 2);
    expect(fake.writes).toEqual([]);
  });

  it('reports a failed upload, retries with the next change, and clears the report once saved', async () => {
    const { store, fake, onSaveState } = setup();
    fake.send({ data: boardJson('Start'), client: 'laptop' });
    fake.control.fail = true;
    store.renameBoard('Too big');
    vi.advanceTimersByTime(SYNC_DELAY);
    await settled();
    expect(onSaveState).toHaveBeenLastCalledWith('failed');
    fake.control.fail = false;
    store.renameBoard('Smaller');
    vi.advanceTimersByTime(SYNC_DELAY);
    await settled();
    expect(fake.writes).toHaveLength(2);
    expect(JSON.parse(fake.writes[1].data).boards.home.name).toBe('Smaller');
    expect(onSaveState).toHaveBeenLastCalledWith('saved');
  });

  it('while an upload has failed, a version from another device does not replace the unsaved board', async () => {
    const { store, fake } = setup();
    fake.send({ data: boardJson('Start'), client: 'laptop' });
    fake.control.fail = true;
    store.renameBoard('Only here');
    vi.advanceTimersByTime(SYNC_DELAY);
    await settled();
    // Firestore puts its copy back after a refused write; that must not wipe this device's board.
    fake.send({ data: boardJson('Start'), client: 'laptop' });
    expect(store.getState().board.name).toBe('Only here');
  });

  it('reports saving while a change waits to upload, and saved once it is online', async () => {
    const { store, fake, onSaveState } = setup();
    fake.send({ data: boardJson('Start'), client: 'laptop' });
    store.renameBoard('Typing');
    expect(onSaveState).toHaveBeenLastCalledWith('saving');
    vi.advanceTimersByTime(SYNC_DELAY);
    await settled();
    expect(onSaveState).toHaveBeenLastCalledWith('saved');
  });
});

describe('syncing several boards (owner request)', () => {
  it('uploads every board together, and opening another board uploads nothing', () => {
    const { store, fake, onSaveState } = setup();
    fake.send(null);
    const home = store.getState().boards.open;
    const id = store.newBoard();
    store.renameBoard('Second');
    vi.advanceTimersByTime(SYNC_DELAY);
    const sent = JSON.parse(fake.writes[fake.writes.length - 1].data);
    expect(sent.version).toBe(3);
    expect(Object.keys(sent.boards).sort()).toEqual([home, id].sort());
    const writes = fake.writes.length;
    onSaveState.mockClear();
    store.openBoard(home);
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(fake.writes).toHaveLength(writes);
    expect(onSaveState).not.toHaveBeenCalledWith('saving');
  });

  it('boards from another device replace these, keeping the open board open', () => {
    const { store, fake } = setup();
    fake.send(null);
    const home = store.getState().boards.open;
    const id = store.newBoard();
    store.renameBoard('Mine');
    vi.advanceTimersByTime(SYNC_DELAY);
    fake.send({ data: serializeWorkspace({ home, boards: { [home]: createBoard(), [id]: { ...createBoard(), name: 'Renamed on the phone' } } }), client: 'phone' });
    expect(store.getState().boards.open).toBe(id);
    expect(store.getState().board.name).toBe('Renamed on the phone');
  });

  it('a single board from an older version of the app only replaces the home board; other boards are kept', () => {
    const { store, fake } = setup();
    fake.send(null);
    const home = store.getState().boards.open;
    const id = store.newBoard();
    store.renameBoard('Kept');
    vi.advanceTimersByTime(SYNC_DELAY);
    fake.send({ data: boardJson('Old app'), client: 'old phone' });
    expect(store.boardName(home)).toBe('Old app');
    expect(store.boardName(id)).toBe('Kept');
    expect(store.getState().boards.open).toBe(id);
  });
});

describe('review fixes: several boards (2026-10-05)', () => {
  it("on first sign-in an older single online board replaces this device's boards (another account's boards aren't taken along)", () => {
    const { store, fake } = setup();
    store.newBoard();
    store.renameBoard('Someone else’s');
    fake.send({ data: boardJson('Mine online'), client: 'laptop' });
    expect(Object.keys(store.getState().boards.others)).toHaveLength(0);
    expect(store.getState().board.name).toBe('Mine online');
  });
});

describe('shared boards (owner request: editing together)', () => {
  function sharedSetup() {
    const store = createStore(null, (fn) => fn());
    const fake = fakeRemote();
    const shared = new Set<string>();
    startSync(store, fake.remote, { client: 'me', onReady: vi.fn(), onError: vi.fn(), isShared: (id) => shared.has(id) });
    fake.send(null);
    return { store, fake, shared };
  }

  it('a shared board is not uploaded with the person’s own boards', () => {
    const { store, fake, shared } = sharedSetup();
    const trip = store.newBoard();
    store.renameBoard('Trip');
    shared.add(trip);
    store.newBoard();
    store.renameBoard('Diary');
    vi.advanceTimersByTime(SYNC_DELAY);
    const sent = JSON.parse(fake.writes.at(-1)!.data);
    expect(Object.keys(sent.boards)).not.toContain(trip);
    expect(Object.values(sent.boards).map((b) => (b as { name: string }).name)).toContain('Diary');
  });

  it('the person’s boards arriving from another device leave the shared boards as they are', () => {
    const { store, fake, shared } = sharedSetup();
    const home = store.getState().boards.open;
    const trip = store.newBoard();
    store.renameBoard('Trip');
    shared.add(trip);
    vi.advanceTimersByTime(SYNC_DELAY);
    // The other device still has an old copy of Trip among its own boards: it is ignored.
    fake.send({ data: serializeWorkspace({ home, boards: { [home]: { ...createBoard(), name: 'Home on phone' }, [trip]: { ...createBoard(), name: 'Old trip' } } }), client: 'phone' });
    expect(store.boardName(home)).toBe('Home on phone');
    expect(store.boardName(trip)).toBe('Trip');
    expect(store.getState().boards.open).toBe(trip);
  });
});

describe('review fixes: shared boards (2026-10-05)', () => {
  it('a board just shared is taken out of the person’s own online copy straight away', () => {
    const store = createStore(null, (fn) => fn());
    const fake = fakeRemote();
    const shared = new Set<string>();
    startSync(store, fake.remote, { client: 'me', onReady: vi.fn(), onError: vi.fn(), isShared: (id) => shared.has(id) });
    fake.send(null);
    const trip = store.newBoard();
    store.renameBoard('Trip');
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(Object.keys(JSON.parse(fake.writes.at(-1)!.data).boards)).toContain(trip);
    // Shared now: nothing else changes on the person's boards.
    shared.add(trip);
    store.setShares([{ id: 's1', root: trip, boards: [trip], owner: true, ownerUid: 'me', people: [], link: 'k' }], true);
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(Object.keys(JSON.parse(fake.writes.at(-1)!.data).boards)).not.toContain(trip);
  });
});

describe('code review fixes: shared boards and a drag (2026-10-06)', () => {
  it('a change in which boards are shared, mid-drag, doesn’t send this device’s older boards over a newer version', () => {
    const { store, fake } = setup();
    fake.send({ data: boardJson('Start'), client: 'laptop' });
    store.addCard('note');
    vi.advanceTimersByTime(SYNC_DELAY);
    const sent = fake.writes.length;
    const id = store.getState().board.order[0];
    const card = store.getState().board.cards[id];
    store.startDrag('card', id, card.x, card.y);
    fake.send({ data: boardJson('From phone'), client: 'phone' });
    store.setShares([{ id: 's1', root: 'x', boards: [], owner: true, ownerUid: 'me', people: [], link: 'k' }], true);
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(fake.writes.length).toBe(sent);
    store.cancelDrag();
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(store.getState().board.name).toBe('From phone');
    expect(fake.writes.slice(sent).every((w) => w.data.includes('From phone'))).toBe(true);
  });
});

describe('main session check fixes (2026-10-06)', () => {
  it('a change made mid-drag while a newer version waits is kept and uploaded, and the note settles', async () => {
    const { store, fake, onSaveState } = setup();
    fake.send({ data: boardJson('Start'), client: 'laptop' });
    store.addCard('note');
    vi.advanceTimersByTime(SYNC_DELAY);
    await settled();
    const id = store.getState().board.order[0];
    const card = store.getState().board.cards[id];
    store.startDrag('card', id, card.x, card.y);
    fake.send({ data: boardJson('From phone'), client: 'phone' });
    // A change that lands while the drag goes on (as a resize or an item drag can make).
    store.renameBoard('Changed mid-drag');
    expect(store.getState().ui.drag).not.toBeNull();
    vi.advanceTimersByTime(SYNC_DELAY);
    store.cancelDrag();
    vi.advanceTimersByTime(SYNC_DELAY);
    await settled();
    expect(store.getState().board.name).toBe('Changed mid-drag');
    expect(JSON.parse(fake.writes.at(-1)!.data).boards.home.name).toBe('Changed mid-drag');
    expect(onSaveState).toHaveBeenLastCalledWith('saved');
  });

  it('a new list of people on a shared board isn’t a change to upload', () => {
    const { store, fake, onSaveState } = setup();
    fake.send({ data: boardJson('Start'), client: 'laptop' });
    const share = { id: 's1', root: 'x', boards: ['x'], owner: true, ownerUid: 'me', people: [], link: 'k' };
    store.setShares([share], true);
    vi.advanceTimersByTime(SYNC_DELAY);
    const writes = fake.writes.length;
    onSaveState.mockClear();
    store.setShares([{ ...share, people: [{ uid: 'bob', name: 'Bob', photo: null }] }], true);
    store.setShares([{ ...share, link: null }], true);
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(onSaveState).not.toHaveBeenCalledWith('saving');
    expect(fake.writes.length).toBe(writes);
  });

  describe('before the shared boards are known', () => {
    /** A board kept here that came with a share (in a share's data kept on the device), and one that didn't. */
    function unknownSetup() {
      const store = createStore(null, (fn) => fn());
      const home = store.getState().boards.home;
      const fake = fakeRemote();
      const shared = new Set<string>();
      const local = store.newBoard();
      store.renameBoard('Maybe shared');
      const stray = store.newBoard();
      store.renameBoard('Left on this device');
      store.openBoard(home);
      // The sharing module tells sync which boards may be shared (src/store/sharing.ts).
      const guard = ownBoardsGuard(store, fake.remote, (id) => shared.has(id), new Set([local]));
      const own = startSync(store, guard.remote, { client: 'me', onReady: vi.fn(), onError: vi.fn(), isShared: guard.isShared });
      const sync = {
        sharesKnown() {
          guard.known();
          own.sharedChanged();
        },
      };
      return { store, home, fake, shared, local, stray, sync };
    }
    const sentIds = (fake: ReturnType<typeof fakeRemote>) => Object.keys(JSON.parse(fake.writes.at(-1)!.data).boards).sort();

    it('a board that came with a share is neither dropped nor uploaded as the person’s own; the online copy still wins over other boards', () => {
      const { store, home, fake, local, stray } = unknownSetup();
      fake.send({ data: serializeWorkspace({ home, boards: { [home]: { ...createBoard(), name: 'Home online' } } }), client: 'phone' });
      expect(store.boardName(local)).toBe('Maybe shared');
      expect(store.workspace().boards[stray]).toBeUndefined();
      store.renameBoard('Home edited');
      vi.advanceTimersByTime(SYNC_DELAY);
      expect(sentIds(fake)).toEqual([home]);
    });

    it('with no online copy yet, this device’s boards are uploaded, but not one that came with a share', () => {
      const { fake, home, stray } = unknownSetup();
      fake.send(null);
      expect(sentIds(fake)).toEqual([home, stray].sort());
    });

    it('a board made here meanwhile is held back until the shares are known', () => {
      const { store, fake, home } = unknownSetup();
      fake.send({ data: serializeWorkspace({ home, boards: { [home]: createBoard() } }), client: 'phone' });
      const fresh = store.newBoard();
      store.renameBoard('Fresh');
      vi.advanceTimersByTime(SYNC_DELAY);
      expect(fake.writes.length ? sentIds(fake) : []).not.toContain(fresh);
    });

    it('once known: uploaded if it is the person’s own, kept apart if shared', () => {
      const a = unknownSetup();
      a.fake.send(null);
      a.sync.sharesKnown();
      vi.advanceTimersByTime(SYNC_DELAY);
      expect(sentIds(a.fake)).toContain(a.local);

      const b = unknownSetup();
      b.fake.send(null);
      b.shared.add(b.local);
      b.sync.sharesKnown();
      b.store.renameBoard('Home edited');
      vi.advanceTimersByTime(SYNC_DELAY);
      expect(sentIds(b.fake)).not.toContain(b.local);
      expect(b.store.boardName(b.local)).toBe('Maybe shared');
    });

    it('a board in the online copy that another device deleted still goes from here', () => {
      const { store, home, fake } = unknownSetup();
      const diary = { ...createBoard(), name: 'Diary' };
      fake.send({ data: serializeWorkspace({ home, boards: { [home]: createBoard(), d1: diary } }), client: 'phone' });
      expect(store.boardName('d1')).toBe('Diary');
      fake.send({ data: serializeWorkspace({ home, boards: { [home]: createBoard() } }), client: 'phone' });
      expect(store.workspace().boards.d1).toBeUndefined();
    });
  });

  it('a drop that changes only a shared board doesn’t throw away a newer version of the person’s own boards', () => {
    const store = createStore(null, (fn) => fn());
    const fake = fakeRemote();
    const home = store.getState().boards.home;
    const trip = store.newBoard();
    store.renameBoard('Trip');
    store.addCard('note');
    const shared = new Set([trip]);
    startSync(store, fake.remote, { client: 'me', onReady: vi.fn(), onError: vi.fn(), isShared: (id) => shared.has(id) });
    fake.send({ data: serializeWorkspace({ home, boards: { [home]: { ...createBoard(), name: 'Home' } } }), client: 'phone' });
    vi.advanceTimersByTime(SYNC_DELAY);
    const id = store.getState().board.order[0];
    const card = store.getState().board.cards[id];
    store.startDrag('card', id, card.x, card.y);
    store.moveDrag(card.x + 400, card.y + 400, null);
    fake.send({ data: serializeWorkspace({ home, boards: { [home]: { ...createBoard(), name: 'Home from phone' } } }), client: 'phone' });
    store.dropDrag(null);
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(store.boardName(home)).toBe('Home from phone');
    expect(fake.writes.every((w) => !w.data.includes('"Home"') || w.data.includes('Home from phone'))).toBe(true);
  });
});

// Job #63: an account deleted on another device. Its online boards vanish; this device must not
// put them back (its sign-in may stay valid for up to an hour), so it stops and says so.
describe('the account deleted on another device', () => {
  it('once the online boards that were there are gone, it stops syncing, uploads nothing more and reports it', () => {
    const store = createStore(null, (fn) => fn());
    const fake = fakeRemote();
    const onGone = vi.fn();
    startSync(store, fake.remote, { client: 'me', onReady: vi.fn(), onError: vi.fn(), onGone });
    fake.send({ data: boardJson('Mine'), client: 'laptop' });
    fake.send(null);
    expect(onGone).toHaveBeenCalledOnce();
    store.renameBoard('Typed after');
    vi.advanceTimersByTime(SYNC_DELAY * 2);
    expect(fake.writes).toEqual([]);
  });

  it('a first visit with no online boards yet, or an upload that was refused, is not taken for a deleted account', async () => {
    const store = createStore(null, (fn) => fn());
    const fake = fakeRemote();
    fake.control.fail = true;
    const onGone = vi.fn();
    startSync(store, fake.remote, { client: 'me', onReady: vi.fn(), onError: vi.fn(), onGone });
    fake.send(null);
    await settled();
    fake.send(null);
    expect(onGone).not.toHaveBeenCalled();
  });
});

// Job 92 (whole-app review, H1): signed in, the page was closed before its last saves reached the
// server, and it is opened again (offline, say). The online copy then exists only as those unsent
// saves ("pending"): the board opens from them; the server gets them once they arrive.
describe('opening from saves a closed page never sent (job 92)', () => {
  function opened() {
    const store = createStore(null, (fn) => fn());
    const fake = fakeRemote();
    const onReady = vi.fn();
    const onGone = vi.fn();
    const onSaveState = vi.fn();
    const sync = startSync(store, fake.remote, { client: 'me', onReady, onError: vi.fn(), onGone, onSaveState });
    const data = boardJson('Made offline');
    fake.send({ data, client: 'old-page', pending: true });
    return { store, fake, onReady, onGone, onSaveState, sync, data };
  }

  it('opens the board from them, sending nothing (they are on their way already)', () => {
    const { store, fake, onReady, sync } = opened();
    expect(onReady).toHaveBeenCalledOnce();
    expect(store.getState().board.name).toBe('Made offline');
    vi.advanceTimersByTime(SYNC_DELAY * 2);
    expect(fake.writes).toEqual([]);
    sync.stop();
  });

  it('says “Saving…” until the server has them, then “Saved”; nothing is replaced and nothing is sent', () => {
    const { store, fake, onSaveState, sync, data } = opened();
    vi.advanceTimersByTime(SYNC_DELAY * 2);
    expect(onSaveState).toHaveBeenLastCalledWith('saving');
    const before = store.workspace();
    fake.send({ data, client: 'old-page' });
    vi.advanceTimersByTime(SYNC_DELAY * 2);
    expect(onSaveState).toHaveBeenLastCalledWith('saved');
    expect(store.workspace()).toBe(before);
    expect(fake.writes).toEqual([]);
    sync.stop();
  });

  it('edits made after opening are sent as usual', () => {
    const { store, fake, sync } = opened();
    store.renameBoard('Edited offline');
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0].data).toContain('Edited offline');
    sync.stop();
  });

  it('if the server refuses them and has no board, that is not taken for a deleted account: this page uploads its boards, and says so if that is refused too', async () => {
    const { store, fake, onGone, onSaveState, sync } = opened();
    fake.control.fail = true;
    fake.send(null);
    expect(onGone).not.toHaveBeenCalled();
    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0].data).toContain('Made offline');
    await settled();
    expect(onSaveState).toHaveBeenLastCalledWith('failed');
    // Firestore puts "no board" back again after the refusal: not sent again in a loop.
    fake.send(null);
    expect(fake.writes).toHaveLength(1);
    expect(store.getState().board.name).toBe('Made offline');
    sync.stop();
  });

  it('if the server refuses them and has an older board, that board comes back, as before this fix', () => {
    const { store, fake, sync } = opened();
    fake.send({ data: boardJson('Older online'), client: 'laptop' });
    expect(store.getState().board.name).toBe('Older online');
    sync.stop();
  });

  // Job 94 (owner decision 2026-10-18): saves over the online limit (firestore.rules, 900,000
  // characters) will be refused, so the red banner shows as soon as the board opens from them.
  function openedWith(data: string) {
    const store = createStore(null, (fn) => fn());
    const fake = fakeRemote();
    const onSaveState = vi.fn();
    const sync = startSync(store, fake.remote, { client: 'me', onReady: vi.fn(), onError: vi.fn(), onSaveState });
    fake.send({ data, client: 'old-page', pending: true });
    return { store, fake, onSaveState, sync };
  }
  /** A board whose saved text is exactly `size` characters (as the rules count them), `emoji` of them emoji. */
  function boardOfSize(size: number, emoji = 0) {
    const base = boardJson('Too big ').length;
    return boardJson('Too big ' + '😀'.repeat(emoji) + 'x'.repeat(size - base - emoji));
  }

  it('over the online limit: says “Couldn’t save online” straight away, keeps them, sends nothing by itself', async () => {
    const { store, fake, onSaveState, sync } = openedWith(boardOfSize(900_001));
    expect(onSaveState).toHaveBeenLastCalledWith('failed');
    vi.advanceTimersByTime(SYNC_DELAY * 2);
    await settled();
    expect(onSaveState).toHaveBeenLastCalledWith('failed');
    expect(fake.writes).toEqual([]);
    // Firestore then puts the older online copy back: not applied, and never "Saved".
    fake.send({ data: boardJson('Older online'), client: 'laptop' });
    vi.advanceTimersByTime(SYNC_DELAY * 2);
    await settled();
    expect(store.getState().board.name.startsWith('Too big')).toBe(true);
    expect(onSaveState).not.toHaveBeenCalledWith('saved');
    sync.stop();
  });

  it('over the limit: the next change tries again, even one undone back to the same boards', async () => {
    const { store, fake, onSaveState, sync } = openedWith(boardOfSize(900_001));
    vi.advanceTimersByTime(SYNC_DELAY * 2);
    const name = store.getState().board.name;
    store.renameBoard('Smaller');
    store.renameBoard(name);
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(fake.writes).toHaveLength(1);
    fake.control.fail = true;
    store.renameBoard('Smaller');
    vi.advanceTimersByTime(SYNC_DELAY);
    await settled();
    expect(fake.writes).toHaveLength(2);
    expect(onSaveState).toHaveBeenLastCalledWith('failed');
    fake.control.fail = false;
    store.renameBoard('Smaller still');
    vi.advanceTimersByTime(SYNC_DELAY);
    await settled();
    expect(onSaveState).toHaveBeenLastCalledWith('saved');
    sync.stop();
  });

  it('exactly at the limit, counted in characters as the rules do (an emoji is one), is not taken for a refusal', () => {
    const withEmoji = boardOfSize(900_000, 10);
    expect(withEmoji.length).toBeGreaterThan(900_000);
    for (const data of [boardOfSize(900_000), withEmoji]) {
      const { onSaveState, sync } = openedWith(data);
      expect(onSaveState).toHaveBeenLastCalledWith('saving');
      sync.stop();
    }
  });

  it('the limit is the one in firestore.rules', () => {
    const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
    expect(rules).toContain(`text.size() <= ${ONLINE_LIMIT}`);
  });

  it('a version the server has, however big, is not checked here (the rules decide)', () => {
    const store = createStore(null, (fn) => fn());
    const fake = fakeRemote();
    const onSaveState = vi.fn();
    const sync = startSync(store, fake.remote, { client: 'me', onReady: vi.fn(), onError: vi.fn(), onSaveState });
    fake.send({ data: boardOfSize(900_001), client: 'laptop' });
    expect(onSaveState).not.toHaveBeenCalledWith('failed');
    sync.stop();
  });

  it('a pending version after one the server has is never taken for a deleted account', () => {
    const store = createStore(null, (fn) => fn());
    const fake = fakeRemote();
    const onGone = vi.fn();
    const sync = startSync(store, fake.remote, { client: 'me', onReady: vi.fn(), onError: vi.fn(), onGone });
    fake.send({ data: boardJson('Online'), client: 'laptop' });
    fake.send({ data: boardJson('Online'), client: 'laptop', pending: true });
    expect(onGone).not.toHaveBeenCalled();
    sync.stop();
  });
});

describe('Journal formatting edited on two devices at once (job 119)', () => {
  // The person's own boards sync whole, the latest save winning: a Journal note's text and its
  // formatting always travel together, so the formatting is never separated from its words.
  it('the note that wins keeps the formatting it was saved with, on both devices', () => {
    vi.setSystemTime(new Date(2026, 9, 19, 9));
    const device = (client: string) => {
      const store = createStore(null, (fn) => fn());
      const fake = fakeRemote();
      const sync = startSync(store, fake.remote, { client, onReady: () => {}, onError: () => {} });
      return { store, fake, sync };
    };
    const note = (s: ReturnType<typeof createStore>) => {
      const board = s.workspace().boards[s.getState().ui.journalBoard!];
      return Object.values(board.cards).find((c): c is NoteCard => c.kind === 'note')!;
    };
    const bold = (t: string): Rich => [{ type: 'p', runs: [{ text: t, b: true }] }];
    const a = device('laptop');
    a.fake.send(null);
    a.store.openJournal();
    a.store.setJournal(note(a.store).id, bold('hello'), false);
    vi.advanceTimersByTime(SYNC_DELAY);
    const b = device('phone');
    b.fake.send(a.fake.writes.at(-1)!);
    b.store.openJournal();
    expect(note(b.store).rich).toEqual(bold('hello'));

    // At about the same time: the laptop types, the phone changes the formatting; both upload, and
    // the phone's save lands last, so it is the one both devices end up with.
    a.store.setJournal(note(a.store).id, bold('hello there'));
    b.store.setJournal(note(b.store).id, [{ type: 'h1', runs: [{ text: 'hello' }] }], false);
    vi.advanceTimersByTime(SYNC_DELAY);
    a.fake.send(b.fake.writes.at(-1)!);
    for (const s of [a.store, b.store]) {
      const n = note(s);
      expect(n.rich).toEqual([{ type: 'h1', runs: [{ text: 'hello' }] }]);
      expect(journalRich(n.text, n.rich)).toBe(n.rich);
    }
    expect(note(a.store)).toEqual(note(b.store));
    a.sync.stop();
    b.sync.stop();
  });
});

describe('one computer, several accounts (job #145, review 137-A finding H2)', () => {
  /** A browser's storage; `full`: nothing bigger fits; `refuse`: keys that can't be saved; `blocked`: it can't be used at all. */
  function memoryStorage(init: Record<string, string> = {}) {
    const data = new Map<string, string>(Object.entries(init));
    const control = { full: false, blocked: false, refuse: (() => false) as (key: string) => boolean };
    const check = () => {
      if (control.blocked) throw new Error('SecurityError');
    };
    return {
      data,
      control,
      getItem: (k: string) => (check(), data.get(k) ?? null),
      setItem: (k: string, v: string) => {
        check();
        if (control.refuse(k) || (control.full && (data.get(k)?.length ?? 0) < v.length)) throw new Error('QuotaExceededError');
        data.set(k, v);
      },
      removeItem: (k: string) => (check(), void data.delete(k)),
    };
  }
  /** Alice used this browser and signed out: her boards, her private journal among them, are still on it. */
  function aliceLeftHerBoards(owner: string | null = 'alice') {
    let diary = { ...createBoard(), name: 'Alice private journal' };
    diary = addCard(diary, { ...(createCard('note', 'n') as NoteCard), text: 'secret' }, { type: 'loose', x: 0, y: 0 });
    const boards = serializeWorkspace({ home: 'home', boards: { home: { ...createBoard(), name: 'Alice home' }, j: diary } });
    return memoryStorage({ [BOARD_KEY]: boards, ...(owner ? { [OWNER_KEY]: owner } : {}) });
  }
  const names = (ws: { boards: Record<string, { name: string }> }) => Object.values(ws.boards).map((b) => b.name).sort();
  /** Signs `uid` in on `store` as src/sync/session.ts does; the online copy is `online` (null: none yet). */
  async function signIn(store: Store, storage: ReturnType<typeof memoryStorage>, uid: string, online: string | null, held: string | null) {
    claimDevice(store, storage, uid, held);
    const fake = fakeRemote();
    const guard = ownBoardsGuard(store, fake.remote, () => false, new Set());
    guard.known();
    const sync = startSync(store, guard.remote, { client: uid, onReady: () => {}, onError: () => {}, isShared: guard.isShared });
    fake.send(online === null ? null : { data: online, client: `${uid}-laptop` });
    await vi.advanceTimersByTimeAsync(2000);
    return { sync, uploaded: fake.writes.map((w) => names(readWorkspace(w.data)!.ws)) };
  }
  const preview = (store: Store) => store.previewVersion({ id: 'v1', savedAt: 0, label: '' } as unknown as VersionMeta, store.workspace().boards.j);

  it('a new account with nothing online yet never gets, sees or uploads the boards the last account left', async () => {
    const storage = aliceLeftHerBoards();
    const store = createStore(storage, (fn) => fn());
    // She was looking at an old version of her journal when she signed out.
    preview(store);
    const bob = await signIn(store, storage, 'bob', null, 'alice');
    expect(store.getState().ui.preview).toBeNull();
    expect(names(store.workspace())).not.toContain('Alice home');
    expect(names(store.workspace())).not.toContain('Alice private journal');
    expect(bob.uploaded.flat()).not.toContain('Alice home');
    expect(bob.uploaded.flat()).not.toContain('Alice private journal');
    // Undo can't bring them back either.
    expect(store.getState().ui.canUndo).toBe(false);
    // Alice's copy is kept aside on the device, untouched; the device's boards are Bob's now.
    expect(names(readWorkspace(storage.getItem(parkedKey('alice')))!.ws)).toEqual(['Alice home', 'Alice private journal']);
    expect(storage.getItem(OWNER_KEY)).toBe('bob');
    bob.sync.stop();
    store.flush();
    expect(storage.getItem(BOARD_KEY)).not.toContain('Alice');
    // Reloaded, the page opens on Bob's boards, not Alice's.
    expect(names(createStore(storage, (fn) => fn()).workspace())).not.toContain('Alice home');
  });

  it('a new account with boards online gets those, and nothing of the last account’s', async () => {
    const storage = aliceLeftHerBoards();
    const store = createStore(storage, (fn) => fn());
    const bob = await signIn(store, storage, 'bob', serializeWorkspace({ home: 'bh', boards: { bh: { ...createBoard(), name: 'Bob home' } } }), 'alice');
    expect(names(store.workspace())).toEqual(['Bob home']);
    expect(bob.uploaded).toEqual([]);
    bob.sync.stop();
  });

  it('another open tab, still holding the last account’s boards, doesn’t give them to the new account either', async () => {
    const storage = aliceLeftHerBoards();
    const tabA = createStore(storage, (fn) => fn());
    const tabB = createStore(storage, (fn) => fn());
    // Bob signs in; tab B gets there first and keeps Alice's boards aside.
    claimDevice(tabB, storage, 'bob', 'alice');
    tabB.renameBoard('Bob home');
    tabB.flush();
    const a = await signIn(tabA, storage, 'bob', null, 'alice');
    expect(names(tabA.workspace())).toEqual(['Bob home']);
    expect(a.uploaded.flat()).not.toContain('Alice home');
    expect(names(readWorkspace(storage.getItem(parkedKey('alice')))!.ws)).toEqual(['Alice home', 'Alice private journal']);
    a.sync.stop();
  });

  it('the earlier account gets its boards back when it signs in here again', async () => {
    const storage = aliceLeftHerBoards();
    const store = createStore(storage, (fn) => fn());
    const bob = await signIn(store, storage, 'bob', null, 'alice');
    store.renameBoard('Bob home');
    await vi.advanceTimersByTimeAsync(2000);
    bob.sync.stop();
    // Alice is back offline (her online copy hasn't come yet): her boards from this device open.
    claimDevice(store, storage, 'alice', 'bob');
    expect(names(store.workspace())).toEqual(['Alice home', 'Alice private journal']);
    expect(storage.getItem(OWNER_KEY)).toBe('alice');
    expect(storage.getItem(parkedKey('alice'))).toBeNull();
    expect(names(readWorkspace(storage.getItem(parkedKey('bob')))!.ws)).toEqual(['Bob home']);
    // With no online copy, they go to her account (hers, so that is right).
    const fake = fakeRemote();
    const sync = startSync(store, fake.remote, { client: 'alice', onReady: () => {}, onError: () => {} });
    fake.send(null);
    expect(names(readWorkspace(fake.writes[0].data)!.ws)).toEqual(['Alice home', 'Alice private journal']);
    sync.stop();
  });

  it('each account’s last agreed versions of its shared boards go aside and come back with its boards', () => {
    const storage = aliceLeftHerBoards();
    storage.setItem(sharesKey('alice'), JSON.stringify([{ id: 's1', owner: false, ownerUid: 'carol' }]));
    storage.setItem(baseKey('s1'), 'alice-rev-5');
    const store = createStore(storage, (fn) => fn());
    claimDevice(store, storage, 'bob', 'alice');
    // Bob is on the same share; his page moves its agreed version on.
    storage.setItem(sharesKey('bob'), JSON.stringify([{ id: 's1', owner: false, ownerUid: 'carol' }]));
    storage.setItem(baseKey('s1'), 'bob-rev-10');
    claimDevice(store, storage, 'alice', 'bob');
    // Alice's boards come back with the version they were agreed at, so they combine as after a reload.
    expect(storage.getItem(baseKey('s1'))).toBe('alice-rev-5');
    claimDevice(store, storage, 'bob', 'alice');
    expect(storage.getItem(baseKey('s1'))).toBe('bob-rev-10');
  });

  it('a change on this page not saved on the device yet is kept aside too', () => {
    const storage = aliceLeftHerBoards();
    const store = createStore(storage, (fn) => fn());
    store.renameBoard('Alice home, renamed');
    claimDevice(store, storage, 'bob', 'alice');
    expect(names(readWorkspace(storage.getItem(parkedKey('alice')))!.ws)).toContain('Alice home, renamed');
  });

  it('the boards kept aside are the saved text itself, so nothing this page couldn’t read is lost', () => {
    const storage = aliceLeftHerBoards();
    const newer = JSON.stringify({ version: 99, boards: 'from a newer app' });
    storage.setItem(BOARD_KEY, newer);
    const store = createStore(storage, (fn) => fn());
    claimDevice(store, storage, 'bob', 'alice');
    expect(storage.getItem(parkedKey('alice'))).toBe(newer);
  });

  it('boards kept aside that can’t be read (saved by a newer version) are neither opened, emptied nor dropped', () => {
    const storage = aliceLeftHerBoards();
    const newer = JSON.stringify({ version: 99, boards: 'from a newer app' });
    storage.setItem(parkedKey('bob'), newer);
    const store = createStore(storage, (fn) => fn());
    const before = new Map(storage.data);
    expect(() => claimDevice(store, storage, 'bob', 'alice')).toThrow();
    expect(storage.data).toEqual(before);
    expect(names(store.workspace())).toEqual(['Alice home', 'Alice private journal']);
  });

  it('the same account signing in again changes nothing', () => {
    const storage = aliceLeftHerBoards();
    const store = createStore(storage, (fn) => fn());
    const before = new Map(storage.data);
    claimDevice(store, storage, 'alice', 'alice');
    expect(names(store.workspace())).toEqual(['Alice home', 'Alice private journal']);
    expect(storage.data).toEqual(before);
  });

  it('boards saved before this change (no owner kept yet) stay with the first account that signs in, which is then remembered', async () => {
    const storage = aliceLeftHerBoards(null);
    const store = createStore(storage, (fn) => fn());
    const first = await signIn(store, storage, 'alice', null, null);
    expect(first.uploaded[0]).toEqual(['Alice home', 'Alice private journal']);
    expect(storage.getItem(OWNER_KEY)).toBe('alice');
    first.sync.stop();
    // The next account is a different one: Alice's boards are kept aside, not given to it.
    const bob = await signIn(store, storage, 'bob', null, 'alice');
    expect(bob.uploaded.flat()).not.toContain('Alice home');
    bob.sync.stop();
  });

  it('if the earlier account’s boards can’t be kept aside (storage full), nothing changes and it refuses', () => {
    const storage = aliceLeftHerBoards();
    const store = createStore(storage, (fn) => fn());
    preview(store);
    const before = new Map(storage.data);
    storage.control.full = true;
    expect(() => claimDevice(store, storage, 'bob', 'alice')).toThrow();
    expect(storage.data).toEqual(before);
    expect(names(store.workspace())).toEqual(['Alice home', 'Alice private journal']);
    expect(store.getState().ui.preview).not.toBeNull();
  });

  it('if the new account’s boards can’t be saved after Alice’s were kept aside, hers don’t stay as the device’s boards', () => {
    const storage = aliceLeftHerBoards();
    const store = createStore(storage, (fn) => fn());
    storage.control.refuse = (k) => k === BOARD_KEY;
    claimDevice(store, storage, 'bob', 'alice');
    expect(storage.getItem(BOARD_KEY)).toBeNull();
    expect(names(readWorkspace(storage.getItem(parkedKey('alice')))!.ws)).toEqual(['Alice home', 'Alice private journal']);
    expect(names(createStore(storage, (fn) => fn()).workspace())).not.toContain('Alice home');
  });

  it('with no owner kept and storage full, the first account still signs in', () => {
    const storage = aliceLeftHerBoards(null);
    const store = createStore(storage, (fn) => fn());
    storage.control.full = true;
    expect(() => claimDevice(store, storage, 'alice', null)).not.toThrow();
    expect(names(store.workspace())).toEqual(['Alice home', 'Alice private journal']);
  });

  it('with the browser’s storage blocked, it can’t tell whose the boards are, so it refuses', () => {
    const storage = aliceLeftHerBoards();
    const store = createStore(storage, (fn) => fn());
    storage.control.blocked = true;
    expect(() => claimDevice(store, storage, 'bob', 'alice')).toThrow();
  });
});
