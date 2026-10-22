import { describe, expect, it } from 'vitest';
import { DEFAULT_HOTKEYS, HOTKEYS_KEY } from '../model/hotkeys';
import { createStore } from './store';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('custom hotkeys', () => {
  it('start as the defaults when none (or a broken value) is saved, and without any storage', () => {
    expect(createStore(memoryStorage()).getState().view.hotkeys).toEqual(DEFAULT_HOTKEYS);
    expect(createStore(memoryStorage({ [HOTKEYS_KEY]: '{oops' })).getState().view.hotkeys).toEqual(DEFAULT_HOTKEYS);
    expect(createStore(null).getState().view.hotkeys).toEqual(DEFAULT_HOTKEYS);
  });

  it('changing one switches it, saves it on this device and keeps it for next time', () => {
    const storage = memoryStorage();
    const s = createStore(storage);
    expect(s.setHotkey('delete', { key: 'g', mod: false, shift: false })).toBeNull();
    expect(s.getState().view.hotkeys.delete.key).toBe('g');
    expect(s.getState().view.hotkeys.duplicate).toEqual(DEFAULT_HOTKEYS.duplicate);
    expect(createStore(storage).getState().view.hotkeys.delete.key).toBe('g');
  });

  it('refuses a key another action has, naming it, and changes nothing', () => {
    const storage = memoryStorage();
    const s = createStore(storage);
    expect(s.setHotkey('delete', { key: 'd', mod: true, shift: false })).toBe('Ctrl+D is already used by Duplicate.');
    expect(s.setHotkey('delete', { key: 'z', mod: true, shift: false })).toMatch(/already used by the app/);
    expect(s.getState().view.hotkeys).toEqual(DEFAULT_HOTKEYS);
    expect(storage.data.has(HOTKEYS_KEY)).toBe(false);
  });

  it('can swap two keys by moving one out of the way first, and reset puts every default back', () => {
    const storage = memoryStorage();
    const s = createStore(storage);
    s.setHotkey('delete', { key: 'g', mod: false, shift: false });
    s.setHotkey('selectAll', { key: 'h', mod: false, shift: false });
    expect(s.getState().view.hotkeys.selectAll.key).toBe('h');
    s.resetHotkeys();
    expect(s.getState().view.hotkeys).toEqual(DEFAULT_HOTKEYS);
    expect(createStore(storage).getState().view.hotkeys).toEqual(DEFAULT_HOTKEYS);
  });

  it('are not part of the board: not undoable, and nothing is saved with the board', () => {
    const storage = memoryStorage();
    const s = createStore(storage);
    const board = s.getState().board;
    s.setHotkey('duplicate', { key: 'k', mod: true, shift: false });
    expect(s.getState().board).toBe(board);
    expect(s.getState().ui.canUndo).toBe(false);
    s.undo();
    expect(s.getState().view.hotkeys.duplicate.key).toBe('k');
    expect([...storage.data.keys()]).toEqual([HOTKEYS_KEY]);
  });
});
