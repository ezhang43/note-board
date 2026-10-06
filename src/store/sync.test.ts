import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCard, createBoard } from '../model/board';
import { createCard } from '../model/cards';
import { serializeBoard } from '../model/persist';
import { serializeWorkspace } from '../model/workspace';
import { createStore } from './store';
import { startSync, SYNC_DELAY, type Remote, type RemoteDoc } from './sync';

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
    store.setShares([{ id: 's1', root: trip, boards: [trip], owner: true, ownerUid: 'me', people: [], link: 'k' }]);
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
    store.setShares([{ id: 's1', root: 'x', boards: [], owner: true, ownerUid: 'me', people: [], link: 'k' }]);
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
    store.setShares([share]);
    vi.advanceTimersByTime(SYNC_DELAY);
    const writes = fake.writes.length;
    onSaveState.mockClear();
    store.setShares([{ ...share, people: [{ uid: 'bob', name: 'Bob', photo: null }] }]);
    store.setShares([{ ...share, link: null }]);
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(onSaveState).not.toHaveBeenCalledWith('saving');
    expect(fake.writes.length).toBe(writes);
  });

  describe('before the shared boards are known', () => {
    function unknownSetup() {
      const store = createStore(null, (fn) => fn());
      const home = store.getState().boards.home;
      const fake = fakeRemote();
      const shared = new Set<string>();
      const local = store.newBoard();
      store.renameBoard('Maybe shared');
      store.openBoard(home);
      const sync = startSync(store, fake.remote, { client: 'me', onReady: vi.fn(), onError: vi.fn(), isShared: (id) => shared.has(id), sharesKnown: false });
      return { store, home, fake, shared, local, sync };
    }
    const sentIds = (fake: ReturnType<typeof fakeRemote>) => Object.keys(JSON.parse(fake.writes.at(-1)!.data).boards);

    it('a board here that isn’t in the online copy is neither dropped nor uploaded as the person’s own', () => {
      const { store, home, fake, local } = unknownSetup();
      fake.send({ data: serializeWorkspace({ home, boards: { [home]: { ...createBoard(), name: 'Home online' } } }), client: 'phone' });
      expect(store.boardName(local)).toBe('Maybe shared');
      store.renameBoard('Home edited');
      vi.advanceTimersByTime(SYNC_DELAY);
      expect(sentIds(fake)).toEqual([home]);
    });

    it('with no online copy yet, it isn’t uploaded either', () => {
      const { fake, home } = unknownSetup();
      fake.send(null);
      expect(sentIds(fake)).toEqual([home]);
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
      expect(sentIds(b.fake)).toEqual([b.home]);
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
});
