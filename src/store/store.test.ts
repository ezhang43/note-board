import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD_KEY, VIEW_KEY, type StorageLike } from '../model/persist';
import { screenToBoard } from '../model/view';
import { createStore, VIEW_SAVE_DELAY } from './store';

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
  it('saves board changes straight away and loads them in a new session', () => {
    const storage = memoryStorage();
    const a = createStore(storage);
    a.renameBoard('Trip');
    a.toggleSnap();
    expect(storage.data[BOARD_KEY]).toBeDefined();
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
