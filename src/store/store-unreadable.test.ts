import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as B from '../model/board';
import { createCard } from '../model/cards';
import { BOARD_KEY, UNREADABLE_KEY, type StorageLike } from '../model/persist';
import { serializeWorkspace } from '../model/workspace';
import { BOARD_SAVE_DELAY, createStore } from './store';

// Job #160 (fragile-store F5): a save on this device that can't be read is kept, not overwritten.

function memoryStorage(init: Record<string, string> = {}, full = false): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = { ...init };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      if (full && !(k in data)) throw new Error('QuotaExceededError');
      data[k] = v;
    },
  };
}

const newer = JSON.stringify({ version: 99, home: 'home', boards: { home: { x: 1 } } });
const damaged = '{"version":3,"home":"home","boards":{"home":{"na';

function edit(s: ReturnType<typeof createStore>) {
  s.setViewportSize({ width: 1000, height: 800 });
  s.addCard('note');
  vi.advanceTimersByTime(BOARD_SAVE_DELAY);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('a saved board that cannot be read', () => {
  it('damaged: is kept as a copy, a note says so, and the fresh board is saved as usual', () => {
    const st = memoryStorage({ [BOARD_KEY]: damaged });
    const s = createStore(st, (fn) => fn());
    expect(st.data[UNREADABLE_KEY]).toBe(damaged);
    expect(s.startNote).toBe('Your saved boards couldn’t be read, so this is a fresh board. A copy was kept on this device.');
    edit(s);
    expect(st.data[BOARD_KEY]).not.toBe(damaged);
    expect(st.data[UNREADABLE_KEY]).toBe(damaged);
  });

  it('saved by a newer version: never overwritten, so the updated app opens it; a note says to reload', () => {
    const st = memoryStorage({ [BOARD_KEY]: newer });
    const s = createStore(st, (fn) => fn());
    expect(s.startNote).toMatch(/newer version.*Reload/);
    edit(s);
    s.flush();
    expect(st.data[BOARD_KEY]).toBe(newer);
    expect(st.data[UNREADABLE_KEY]).toBeUndefined();
  });

  it('does not replace an earlier kept copy: the next one goes beside it', () => {
    const st = memoryStorage({ [BOARD_KEY]: damaged, [UNREADABLE_KEY]: 'older' });
    createStore(st, (fn) => fn());
    expect(st.data[UNREADABLE_KEY]).toBe('older');
    expect(st.data[`${UNREADABLE_KEY}-2`]).toBe(damaged);
  });

  it('is kept only once when the page is opened again before any change', () => {
    const st = memoryStorage({ [BOARD_KEY]: damaged });
    createStore(st, (fn) => fn());
    createStore(st, (fn) => fn());
    expect(st.data[UNREADABLE_KEY]).toBe(damaged);
    expect(st.data[`${UNREADABLE_KEY}-2`]).toBeUndefined();
  });

  it('is never overwritten when no copy can be kept (storage full)', () => {
    const st = memoryStorage({ [BOARD_KEY]: damaged }, true);
    const s = createStore(st, (fn) => fn());
    expect(s.startNote).toMatch(/couldn’t be read.*aren’t saved on this device/);
    edit(s);
    s.flush();
    expect(st.data[BOARD_KEY]).toBe(damaged);
  });

  it('saving starts again once something else replaced the unreadable save (another account signed in)', () => {
    const st = memoryStorage({ [BOARD_KEY]: newer });
    const s = createStore(st, (fn) => fn());
    const other = serializeWorkspace({ home: 'home', boards: { home: { ...B.createBoard(), name: 'Theirs' } } });
    st.data[BOARD_KEY] = other;
    edit(s);
    expect(st.data[BOARD_KEY]).not.toBe(other);
    expect(JSON.parse(st.data[BOARD_KEY]).boards.home.order).toHaveLength(1);
  });
});

describe('a readable save', () => {
  it('is loaded and saved as usual, with no copy and no note', () => {
    const home = B.addCard({ ...B.createBoard(), name: 'Home' }, createCard('note', 'k_a'), { type: 'loose', x: 0, y: 0 });
    const raw = serializeWorkspace({ home: 'home', boards: { home } });
    const st = memoryStorage({ [BOARD_KEY]: raw });
    const s = createStore(st, (fn) => fn());
    expect(s.getState().board.name).toBe('Home');
    expect(s.startNote).toBeNull();
    edit(s);
    expect(Object.keys(st.data).filter((k) => k.startsWith(UNREADABLE_KEY))).toEqual([]);
    expect(JSON.parse(st.data[BOARD_KEY]).boards.home.order).toHaveLength(2);
  });

  it('nothing saved yet: no copy and no note', () => {
    const st = memoryStorage();
    const s = createStore(st, (fn) => fn());
    expect(s.startNote).toBeNull();
    edit(s);
    expect(Object.keys(st.data).filter((k) => k.startsWith(UNREADABLE_KEY))).toEqual([]);
  });
});
