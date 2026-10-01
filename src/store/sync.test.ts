import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCard, createBoard } from '../model/board';
import { createCard } from '../model/cards';
import { serializeBoard } from '../model/persist';
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
  const onSaveFailed = vi.fn();
  const sync = startSync(store, fake.remote, { client: 'me', onReady, onError, onSaveFailed });
  return { store, fake, onReady, onError, onSaveFailed, sync };
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
    expect(JSON.parse(fake.writes[0].data).board.name).toBe('My board');
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
    expect(JSON.parse(fake.writes[0].data).board.name).toBe('Shop');
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
    expect(JSON.parse(fake.writes.at(-1)!.data).board.cards[id].x).toBe(moved.x);
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
    expect(JSON.parse(fake.writes[0].data).board.name).toBe('Typed here');
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
    const { store, fake, onSaveFailed } = setup();
    fake.send({ data: boardJson('Start'), client: 'laptop' });
    fake.control.fail = true;
    store.renameBoard('Too big');
    vi.advanceTimersByTime(SYNC_DELAY);
    await settled();
    expect(onSaveFailed).toHaveBeenLastCalledWith(true);
    fake.control.fail = false;
    store.renameBoard('Smaller');
    vi.advanceTimersByTime(SYNC_DELAY);
    await settled();
    expect(fake.writes).toHaveLength(2);
    expect(JSON.parse(fake.writes[1].data).board.name).toBe('Smaller');
    expect(onSaveFailed).toHaveBeenLastCalledWith(false);
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
});
