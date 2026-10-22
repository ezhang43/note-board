import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as B from '../model/board';
import { weightCard, weightEntries } from '../model/habits';
import type { StorageLike } from '../model/persist';
import { serializeShare } from '../model/sharing';
import type { TodoCard } from '../model/types';
import { serializeWorkspace } from '../model/workspace';
import { memoryServer, type CollabBackend, type Person } from './collab';
import { startSharing } from './sharing';
import { createStore } from './store';
import { startSync, SYNC_DELAY, type Remote, type RemoteDoc, type SaveState } from './sync';

// Review 137-A, the rest (job 150): saving and sharing, medium and low findings.

function memoryStorage(): StorageLike & { length: number; key(i: number): string | null } {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
  };
}
const person = (uid: string): Person => ({ uid, name: uid, photo: null });
const now = (fn: () => void) => fn();

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function settle() {
  for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(1000);
}

describe('"Couldn’t save online" clears once a save gets through (M5)', () => {
  it('even when a change was typed and taken back while that save was on its way', async () => {
    let listener: ((d: RemoteDoc | null) => void) | null = null;
    let mode: 'fail' | 'wait' = 'fail';
    let release = () => {};
    const remote: Remote = {
      watch: (onChange) => ((listener = onChange), () => {}),
      write: () => (mode === 'fail' ? Promise.reject(new Error('refused')) : new Promise<void>((done) => (release = done))),
    };
    const states: SaveState[] = [];
    const store = createStore(null, now);
    startSync(store, remote, { client: 'me', onReady: () => {}, onError: () => {}, onSaveState: (s) => states.push(s) });
    listener!({ data: serializeWorkspace({ home: 'home', boards: { home: { ...B.createBoard(), name: 'Start' } } }), client: 'laptop' });

    store.renameBoard('A');
    await vi.advanceTimersByTimeAsync(SYNC_DELAY + 10);
    expect(states.at(-1)).toBe('failed');
    mode = 'wait';
    store.renameBoard('B');
    await vi.advanceTimersByTimeAsync(SYNC_DELAY + 10);
    store.renameBoard('BC');
    release(); // "B" is saved online
    await vi.advanceTimersByTimeAsync(10);
    expect(states.at(-1)).toBe('saving'); // the red note goes as soon as a save gets through
    store.renameBoard('B'); // the boards are what is online again
    await vi.advanceTimersByTimeAsync(SYNC_DELAY + 10);
    expect(states.at(-1)).toBe('saved');

    // So another device's change is shown again.
    listener!({ data: serializeWorkspace({ home: 'home', boards: { home: { ...B.createBoard(), name: 'From the laptop' } } }), client: 'laptop' });
    await vi.advanceTimersByTimeAsync(10);
    expect(store.getState().board.name).toBe('From the laptop');
  });
});

/** A page signed in as `uid`, sharing through `backend`. */
function page(backend: CollabBackend) {
  const storage = memoryStorage();
  const store = createStore(storage, now);
  const states: SaveState[] = [];
  const sharing = startSharing(store, backend, { client: `${backend.me.uid}-${Math.random()}`, storage, onSaveState: (s) => states.push(s) });
  return { store, sharing, states };
}

describe('opening a share link whose share goes before it arrives (M8)', () => {
  it('fails with the usual note instead of waiting for ever', async () => {
    const srv = memoryServer();
    const mallory = person('mallory');
    await srv.server.createShare(mallory, 'sx', 'r1', 'k', serializeShare('r1', { r1: { ...B.createBoard(), name: 'Trip' } }), 'm');
    const bob = page(srv.backendFor(person('bob')));
    await settle();
    let outcome = 'waiting';
    void bob.sharing.join('sx', 'k').then(
      () => (outcome = 'opened'),
      () => (outcome = 'failed'),
    );
    await Promise.resolve();
    await Promise.resolve();
    await srv.server.deleteShare(mallory, 'sx');
    await settle();
    expect(outcome).toBe('failed');
  });

  it('signing out while it waits doesn’t take the person off it', async () => {
    const srv = memoryServer();
    const mallory = person('mallory');
    await srv.server.createShare(mallory, 'sx', 'r1', 'k', serializeShare('r1', { r1: { ...B.createBoard(), name: 'Trip' } }), 'm');
    const real = srv.backendFor(person('bob'));
    const left: string[] = [];
    const bob = page({ ...real, watchShare: () => () => {}, leave: (id) => (left.push(id), real.leave(id)) });
    await settle();
    const joined = bob.sharing.join('sx', 'k').catch(() => 'failed');
    await settle();
    bob.sharing.stop();
    expect(await joined).toBe('failed');
    expect(left).toEqual([]);
  });
});

describe('sharing a board (L1)', () => {
  async function aliceMakesTrip(backend: CollabBackend) {
    const alice = page(backend);
    await settle();
    const trip = alice.store.newBoard();
    alice.store.renameBoard('Trip');
    alice.store.addCard('note');
    const id = Object.keys(alice.store.getState().board.cards)[0];
    alice.store.setNoteText(id, 'hello');
    return { ...alice, trip, id };
  }

  it('keeps the board’s undo history when the server answers before the share is made', async () => {
    // Firestore raises a local write's snapshots before the write resolves.
    const srv = memoryServer(now);
    const a = await aliceMakesTrip(srv.backendFor(person('alice')));
    await a.sharing.share(a.trip);
    await settle();
    expect(a.store.getState().ui.canUndo).toBe(true);
    expect(a.store.getState().ui.shares[0]).toMatchObject({ owner: true, people: [{ uid: 'alice' }] });
  });

  it('keeps text typed straight after Share, before the share’s first version arrives', async () => {
    const srv = memoryServer(now);
    const inner = srv.backendFor(person('alice'));
    // The share's own watch answers a moment later (Firestore refuses the first listen until the member record is online).
    const backend: CollabBackend = {
      ...inner,
      watchShare: (id, onChange, onError) => {
        let stop = () => {};
        const t = setTimeout(() => (stop = inner.watchShare(id, onChange, onError)), 500);
        return () => (clearTimeout(t), stop());
      },
    };
    const a = await aliceMakesTrip(backend);
    await a.sharing.share(a.trip);
    a.store.setNoteText(a.id, 'hello world');
    await settle();
    expect((a.store.workspace().boards[a.trip].cards[a.id] as { text: string }).text).toBe('hello world');
  });
});

describe('a shared board’s save refused for a reason other than permission (L3)', () => {
  it('shows "Couldn’t save online" instead of "Saving…" for ever', async () => {
    const srv = memoryServer();
    const inner = srv.backendFor(person('alice'));
    let refuse = false;
    const backend: CollabBackend = {
      ...inner,
      updateShare: (...args) => (refuse ? Promise.reject(Object.assign(new Error('too big'), { code: 'invalid-argument' })) : inner.updateShare(...args)),
    };
    const a = page(backend);
    await settle();
    const trip = a.store.newBoard();
    await a.sharing.share(trip);
    await settle();
    refuse = true;
    a.store.renameBoard('Trip, renamed');
    await settle();
    expect(a.states.at(-1)).toBe('failed');
  });
});

describe('a shared board’s save that clashes too often (L3)', () => {
  it('tries again quietly, without the red note', async () => {
    const srv = memoryServer();
    const inner = srv.backendFor(person('alice'));
    let clash = false;
    const backend: CollabBackend = {
      ...inner,
      updateShare: (...args) => (clash ? Promise.reject(Object.assign(new Error('base version'), { code: 'failed-precondition' })) : inner.updateShare(...args)),
    };
    const a = page(backend);
    await settle();
    const trip = a.store.newBoard();
    await a.sharing.share(trip);
    await settle();
    clash = true;
    a.store.renameBoard('Trip, renamed');
    await settle();
    expect(a.states.at(-1)).toBe('saving');
  });
});

describe('removing the last weight (L4)', () => {
  it('keeps the Weight card when something else was typed on it', () => {
    const store = createStore(memoryStorage(), now);
    store.setViewportSize({ width: 1000, height: 800 });
    store.openHabits();
    store.saveWeight('72.4', '2026-10-19');
    const id = store.habitsBoard()!;
    const board = store.workspace().boards[id];
    const card = weightCard(board)!;
    const note = { id: 'note', text: 'Scale at the gym', done: false, children: [] };
    store.replaceBoards({ [id]: B.updateCard(board, card.id, (c) => ({ ...(c as TodoCard), items: [...(c as TodoCard).items, note] })) });
    store.removeWeight('2026-10-19');
    const left = store.workspace().boards[id].cards[card.id] as TodoCard | undefined;
    expect(left?.items.map((i) => i.text)).toContain('Scale at the gym');
    expect(weightEntries(left)).toEqual([]);
  });
});
