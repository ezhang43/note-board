import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoard } from '../model/board';
import { serializeBoard } from '../model/persist';
import { createStore } from './store';
import { startSync, SYNC_DELAY, type Remote, type RemoteDoc } from './sync';

/** A pretend online copy: tests decide when versions arrive. */
function fakeRemote() {
  let listener: ((doc: RemoteDoc | null) => void) | null = null;
  const writes: RemoteDoc[] = [];
  const remote: Remote = {
    watch(onChange) {
      listener = onChange;
      return () => {
        listener = null;
      };
    },
    write: (doc) => writes.push(doc),
  };
  return { remote, writes, send: (doc: RemoteDoc | null) => listener?.(doc), watching: () => listener !== null };
}

function boardJson(name: string) {
  return serializeBoard({ ...createBoard(), name });
}

function setup() {
  const store = createStore(null, (fn) => fn());
  const fake = fakeRemote();
  const onReady = vi.fn();
  const sync = startSync(store, fake.remote, { client: 'me', onReady, onError: () => {} });
  return { store, fake, onReady, sync };
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
    fake.send({ data: boardJson('From phone'), client: 'phone' });
    expect(store.getState().ui.canUndo).toBe(false);
    store.undo();
    expect(store.getState().board.name).toBe('From phone');
  });

  it('waits until a drag is over before showing a change from another device', () => {
    const { store, fake } = setup();
    fake.send({ data: boardJson('Start'), client: 'laptop' });
    store.addCard('note');
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
});
