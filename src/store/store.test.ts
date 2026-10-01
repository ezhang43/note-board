import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD_KEY, VIEW_KEY, type StorageLike } from '../model/persist';
import { screenToBoard } from '../model/view';
import { BOARD_SAVE_DELAY, createStore, VIEW_SAVE_DELAY } from './store';

function memoryStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('store', () => {
  it('saves board changes a moment after they stop, as one write, and loads them in a new session', () => {
    const storage = memoryStorage();
    const writes = vi.spyOn(storage, 'setItem');
    const a = createStore(storage);
    a.renameBoard('Trip');
    a.toggleSnap();
    expect(storage.data[BOARD_KEY]).toBeUndefined();
    vi.advanceTimersByTime(BOARD_SAVE_DELAY);
    expect(writes.mock.calls.filter(([k]) => k === BOARD_KEY)).toHaveLength(1);
    expect(createStore(storage).getState().board).toMatchObject({ name: 'Trip', snap: false });
  });

  it('saves pan and zoom shortly after they stop changing', () => {
    const storage = memoryStorage();
    const s = createStore(storage);
    s.setViewportSize({ width: 1000, height: 800 });
    s.panBy(10, 10);
    s.zoomAtCentre(1.2);
    expect(storage.data[VIEW_KEY]).toBeUndefined();
    vi.advanceTimersByTime(VIEW_SAVE_DELAY);
    const loaded = createStore(storage).getState().view;
    expect(loaded.zoom).toBeCloseTo(1.2);
    expect(loaded.panX).toBeCloseTo(s.getState().view.panX);
  });

  it('flush saves pending pan and zoom immediately', () => {
    const storage = memoryStorage();
    const s = createStore(storage);
    s.panBy(5, 0);
    s.flush();
    expect(JSON.parse(storage.data[VIEW_KEY]).panX).toBe(5);
  });

  it('does not save when only the tool changes', () => {
    const storage = memoryStorage();
    const s = createStore(storage);
    s.setTool('select');
    vi.advanceTimersByTime(VIEW_SAVE_DELAY * 4);
    expect(storage.data).toEqual({});
  });

  it('tells listeners about changes, and not about non-changes', () => {
    const s = createStore(memoryStorage());
    const listener = vi.fn();
    s.subscribe(listener);
    s.setTool('hand');
    s.renameBoard(s.getState().board.name);
    expect(listener).not.toHaveBeenCalled();
    s.setTool('select');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps working when storage is blocked or full', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    const s = createStore(broken);
    s.renameBoard('Still works');
    expect(s.getState().board.name).toBe('Still works');
  });

  it('zoom buttons and reset work around the middle of the canvas', () => {
    const s = createStore(memoryStorage());
    s.setViewportSize({ width: 1000, height: 800 });
    const middle = { x: 500, y: 400 };
    s.zoomAt({ x: 100, y: 100 }, 2);
    const before = screenToBoard(s.getState().view, middle);
    s.zoomAtCentre(1.2);
    s.resetZoom();
    const after = screenToBoard(s.getState().view, middle);
    expect(s.getState().view.zoom).toBe(1);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
});

describe('saving the board on the way out', () => {
  it('flush saves a waiting board change straight away', () => {
    const storage = memoryStorage();
    const a = createStore(storage);
    a.renameBoard('Closing');
    a.flush();
    expect(JSON.parse(storage.data[BOARD_KEY]).board.name).toBe('Closing');
  });
});

describe('dragging', () => {
  it('moving within the same grid square keeps the same preview (no clean-up rerun)', () => {
    const s = createStore(null, (fn) => fn());
    s.setViewportSize({ width: 1200, height: 800 });
    s.addCard('note');
    s.addCard('note');
    const id = s.getState().ui.selection[0];
    const card = s.getState().board.cards[id];
    s.startDrag('card', id, card.x, card.y);
    s.moveDrag(card.x - 300, card.y, null);
    const before = s.getState().ui.drag!;
    s.moveDrag(card.x - 299, card.y + 1, null);
    const after = s.getState().ui.drag!;
    expect(after.x).toBe(card.x - 299);
    expect(after.bumped).toBe(before.bumped);
  });
});
