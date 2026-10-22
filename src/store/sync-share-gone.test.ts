import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCard } from '../model/board';
import { createCard } from '../model/cards';
import type { NoteCard } from '../model/types';
import { readWorkspace, serializeWorkspace } from '../model/workspace';
import { memoryServer } from './collab';
import { boardsInKeptShares, ownBoardsGuard, startSharing } from './sharing';
import { createStore } from './store';
import { startSync, SYNC_DELAY, type Remote, type RemoteDoc } from './sync';

// Review 137-A M3 (owner: "m3 yes", job 175): a board that comes back from a deleted share is one
// of the person's own again. When the online copy of their own boards already holds it (the device
// that deleted the share made it theirs there, and may have changed it since), that copy wins over
// this device's older copy, unless the board was changed here after that copy arrived.

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function fakeRemote() {
  let listener: ((doc: RemoteDoc | null) => void) | null = null;
  const writes: RemoteDoc[] = [];
  const remote: Remote = {
    watch(onChange) {
      listener = onChange;
      return () => (listener = null);
    },
    write: (doc) => (writes.push(doc), Promise.resolve()),
  };
  return { remote, writes, send: (doc: RemoteDoc | null) => listener?.(doc) };
}

const note = (id: string, text: string) => ({ ...createCard('note', id), text }) as NoteCard;

/** A page whose board "Trip" is shared, and the other device's own boards online, with Trip changed there. */
function setup() {
  const store = createStore(null, (fn) => fn());
  const fake = fakeRemote();
  const { home } = store.getState().boards;
  const trip = store.newBoard();
  store.renameBoard('Trip');
  store.openBoard(home);
  const shared = new Set([trip]);
  const sync = startSync(store, fake.remote, { client: 'me', onReady: () => {}, onError: () => {}, isShared: (id) => shared.has(id) });
  const tripThere = addCard(store.workspace().boards[trip], note('fromB', 'Written on the other device'), { type: 'loose', x: 0, y: 0 });
  const online = serializeWorkspace({ home, boards: { [home]: store.workspace().boards[home], [trip]: tripThere } });
  return { store, fake, home, trip, shared, sync, online };
}

const sent = (doc: RemoteDoc | undefined) => (doc ? readWorkspace(doc.data)!.ws : null);

describe('a board back from a deleted share (review 137-A M3)', () => {
  it('takes the online copy of it when the share turns out to be gone, and uploads nothing', () => {
    const { store, fake, trip, shared, sync, online } = setup();
    fake.send({ data: online, client: 'other-device' });
    // While it still counts as shared, this device's copy stays.
    expect(store.workspace().boards[trip].cards.fromB).toBeUndefined();
    shared.delete(trip);
    sync.sharedChanged();
    expect(store.workspace().boards[trip].cards.fromB).toBeDefined();
    vi.advanceTimersByTime(SYNC_DELAY * 3);
    expect(fake.writes).toEqual([]);
  });

  it('also when the list of shares changing on screen is what says so', () => {
    const { store, fake, trip, shared, online } = setup();
    store.setShares([{ id: 's1', root: trip, boards: [trip], owner: true, ownerUid: 'me', people: [], link: null }], true);
    fake.send({ data: online, client: 'other-device' });
    shared.delete(trip);
    store.setShares([], true);
    expect(store.workspace().boards[trip].cards.fromB).toBeDefined();
    vi.advanceTimersByTime(SYNC_DELAY * 3);
    expect(fake.writes).toEqual([]);
  });

  it('a later change to the person’s boards uploads the online copy of it, not the old one', () => {
    const { store, fake, home, trip, shared, sync, online } = setup();
    fake.send({ data: online, client: 'other-device' });
    shared.delete(trip);
    sync.sharedChanged();
    store.openBoard(home);
    store.renameBoard('Home, renamed');
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(sent(fake.writes.at(-1))!.boards[trip].cards.fromB).toBeDefined();
  });

  it('keeps this device’s copy when it was changed here after the online copy came (the most recent change wins)', () => {
    const { store, fake, trip, shared, sync, online } = setup();
    fake.send({ data: online, client: 'other-device' });
    store.openBoard(trip);
    store.renameBoard('Trip, renamed here');
    shared.delete(trip);
    sync.sharedChanged();
    expect(store.boardName(trip)).toBe('Trip, renamed here');
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(sent(fake.writes.at(-1))!.boards[trip].name).toBe('Trip, renamed here');
  });

  it('uploads this device’s copy, as before, when the online copy doesn’t have it', () => {
    const { store, fake, home, trip, shared, sync } = setup();
    fake.send({ data: serializeWorkspace({ home, boards: { [home]: store.workspace().boards[home] } }), client: 'other-device' });
    shared.delete(trip);
    sync.sharedChanged();
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(sent(fake.writes.at(-1))!.boards[trip].name).toBe('Trip');
  });

  it('after an upload from this page without the board, the online copy no longer has it: this device’s copy goes up', () => {
    const { store, fake, home, trip, shared, sync, online } = setup();
    fake.send({ data: online, client: 'other-device' });
    store.openBoard(home);
    store.renameBoard('Home, renamed');
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(sent(fake.writes.at(-1))!.boards[trip]).toBeUndefined();
    shared.delete(trip);
    sync.sharedChanged();
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(sent(fake.writes.at(-1))!.boards[trip].name).toBe('Trip');
    expect(sent(fake.writes.at(-1))!.boards[trip].cards.fromB).toBeUndefined();
  });
});

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
  };
}
async function settle() {
  for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(1000);
}

describe('the whole flow, in Firestore’s order (review 137-A M3 repro)', () => {
  it('a share deleted on another device: its sub-board changed there is not overwritten by this device’s old copy', async () => {
    const srv = memoryServer();
    const alice = { uid: 'alice', name: 'Alice', photo: null };
    const storage = memoryStorage();

    // Device A, earlier: Alice shares "Trip" (with "Sub" inside it). Then the page closes.
    {
      const store = createStore(storage, (fn) => fn());
      const sharing = startSharing(store, srv.backendFor(alice), { client: 'a1', storage });
      await settle();
      const trip = store.newBoard();
      store.renameBoard('Trip');
      store.addBoardCard();
      await sharing.share(trip);
      await settle();
      store.flush();
      sharing.stop();
    }
    const ws0 = readWorkspace(storage.getItem('note-board:v1'))!.ws;
    const trip = Object.keys(ws0.boards).find((id) => ws0.boards[id].name === 'Trip')!;
    const sub = Object.keys(ws0.boards).find((id) => id !== trip && id !== ws0.home)!;
    const shareId = [...srv.shares.keys()][0];
    const cachedShare = { ...srv.shares.get(shareId)! };

    // Device B: Alice deletes the share there (Sub stays hers), then writes on Sub.
    await srv.server.deleteShare(alice, shareId);
    const subOnB = addCard(ws0.boards[sub], note('fromB', 'Written on B after the share was deleted'), { type: 'loose', x: 0, y: 0 });
    const onlineOwn = serializeWorkspace({ home: ws0.home, boards: { [ws0.home]: ws0.boards[ws0.home], [sub]: subOnB } });

    // Device A opens again: the offline copy first (the list still has the share), the server's answers later.
    const real = srv.backendFor(alice);
    const backend: typeof real = {
      ...real,
      watchMyShares: (onChange, onError) => {
        let stop = () => {};
        setTimeout(() => onChange([shareId], false), 0);
        const t = setTimeout(() => (stop = real.watchMyShares(onChange, onError)), 2000);
        return () => (clearTimeout(t), stop());
      },
      watchShare: (id, onChange, onError) => {
        let stop = () => {};
        setTimeout(() => onChange({ ...cachedShare, owner: 'alice' }), 0);
        const t = setTimeout(() => (stop = real.watchShare(id, onChange, onError)), 2000);
        return () => (clearTimeout(t), stop());
      },
    };
    const store = createStore(storage, (fn) => fn());
    let send: ((doc: RemoteDoc | null) => void) | null = null;
    const writes: RemoteDoc[] = [];
    const online: Remote = { watch: (onChange) => ((send = onChange), () => {}), write: (doc) => (writes.push(doc), Promise.resolve()) };
    const sharingRef: { current: ReturnType<typeof startSharing> | null } = { current: null };
    const guard = ownBoardsGuard(store, online, (id) => sharingRef.current!.isShared(id), boardsInKeptShares(storage, 'alice'));
    let sync: ReturnType<typeof startSync> | null = null;
    const startOwn = () => {
      if (!sync) sync = startSync(store, guard.remote, { client: 'a2', onReady: () => {}, onError: () => {}, isShared: guard.isShared });
    };
    sharingRef.current = startSharing(store, backend, {
      client: 'a2',
      storage,
      onReady: () => {
        guard.known();
        if (sync) sync.sharedChanged();
        else startOwn();
      },
    });
    setTimeout(startOwn, 5000);
    await vi.advanceTimersByTimeAsync(50);
    send!({ data: onlineOwn, client: 'b-page' });
    await settle();
    await settle();

    expect(store.workspace().boards[sub]?.cards.fromB).toBeDefined();
    for (const w of writes) expect(readWorkspace(w.data)!.ws.boards[sub]?.cards.fromB).toBeDefined();
  });
});
