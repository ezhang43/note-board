import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD_KEY } from '../model/persist';
import { createStore } from './store';
import { startSync, SYNC_DELAY, type Remote, type RemoteDoc } from './sync';

// Arrows between cards and containers were removed (owner, 2026-10-16): boards saved with arrows
// load without them, keep everything else, and the next save drops them.

function savedWithArrows() {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1000, height: 800 });
  s.addCard('note');
  s.addCard('note');
  const ws = s.workspace();
  const [a, b] = ws.boards[ws.home].order;
  const data = JSON.parse(JSON.stringify({ version: 3, home: ws.home, boards: ws.boards }));
  data.boards[ws.home].arrows = [{ id: 'r1', from: a, to: b }];
  return { raw: JSON.stringify(data), board: ws.boards[ws.home] };
}

function memoryStorage(init: Record<string, string>) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('boards saved with arrows (owner, 2026-10-16)', () => {
  it('load from this device without them; the next save drops them', () => {
    const { raw, board } = savedWithArrows();
    const storage = memoryStorage({ [BOARD_KEY]: raw });
    const s = createStore(storage, (fn) => fn());
    expect(s.getState().board).toEqual(board);
    s.renameBoard('Renamed');
    vi.runAllTimers();
    const saved = storage.m.get(BOARD_KEY)!;
    expect(saved).not.toContain('arrows');
    expect(saved).toContain('Renamed');
  });

  it('arriving from the online copy, they are not shown and the next upload drops them', () => {
    const { raw, board } = savedWithArrows();
    let listener: ((doc: RemoteDoc | null) => void) | null = null;
    const writes: RemoteDoc[] = [];
    const remote: Remote = {
      watch: (fn) => {
        listener = fn;
        return () => (listener = null);
      },
      write: (doc) => {
        writes.push(doc);
        return Promise.resolve();
      },
    };
    const s = createStore(null, (fn) => fn());
    startSync(s, remote, { client: 'me', onReady: () => {}, onError: () => {}, onSaveState: () => {} });
    listener!({ data: raw, client: 'laptop' });
    expect(s.getState().board).toEqual(board);
    s.renameBoard('Renamed');
    vi.advanceTimersByTime(SYNC_DELAY);
    expect(writes.at(-1)!.data).not.toContain('arrows');
  });

  it('a backup file with arrows restores everything but them', () => {
    const { raw, board } = savedWithArrows();
    const s = createStore(null, (fn) => fn());
    expect(s.restoreBackup(raw)).not.toBe(false);
    expect(s.getState().board).toEqual(board);
  });
});
