import { describe, expect, it } from 'vitest';
import { COLOR_THEME_KEY, THEME_KEY } from '../model/theme';
import { createStore } from './store';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('light / dark toggle', () => {
  it('starts in the saved choice, and the toggle flips it and saves it on this device', () => {
    const storage = memoryStorage({ [THEME_KEY]: 'dark' });
    const s = createStore(storage);
    expect(s.getState().view.theme).toBe('dark');
    s.toggleTheme();
    expect(s.getState().view.theme).toBe('light');
    expect(storage.data.get(THEME_KEY)).toBe('light');
    s.toggleTheme();
    expect(createStore(storage).getState().view.theme).toBe('dark');
  });

  it('is not part of the board: not undoable and not saved with the board', () => {
    const storage = memoryStorage({ [THEME_KEY]: 'light' });
    const s = createStore(storage);
    const board = s.getState().board;
    s.toggleTheme();
    expect(s.getState().board).toBe(board);
    expect(s.getState().ui.canUndo).toBe(false);
    s.undo();
    expect(s.getState().view.theme).toBe('dark');
  });

  it('with nothing saved and no browser setting to follow, starts light', () => {
    expect(createStore(memoryStorage()).getState().view.theme).toBe('light');
    expect(createStore(null).getState().view.theme).toBe('light');
  });
});

describe('colour theme', () => {
  it('starts in the saved theme, Honey when none (or a broken one) is saved', () => {
    expect(createStore(memoryStorage()).getState().view.colorTheme).toBe('honey');
    expect(createStore(memoryStorage({ [COLOR_THEME_KEY]: 'ocean' })).getState().view.colorTheme).toBe('ocean');
    expect(createStore(memoryStorage({ [COLOR_THEME_KEY]: 'neon' })).getState().view.colorTheme).toBe('honey');
    expect(createStore(null).getState().view.colorTheme).toBe('honey');
  });

  it('picking one switches it and saves it on this device, apart from light / dark', () => {
    const storage = memoryStorage({ [THEME_KEY]: 'dark' });
    const s = createStore(storage);
    s.setColorTheme('rose');
    expect(s.getState().view.colorTheme).toBe('rose');
    expect(s.getState().view.theme).toBe('dark');
    expect(storage.data.get(COLOR_THEME_KEY)).toBe('rose');
    expect(storage.data.get(THEME_KEY)).toBe('dark');
    s.toggleTheme();
    expect(s.getState().view.colorTheme).toBe('rose');
    expect(createStore(storage).getState().view.colorTheme).toBe('rose');
  });

  it('is not part of the board: not undoable, and nothing is saved with the board', () => {
    const storage = memoryStorage();
    const s = createStore(storage);
    const board = s.getState().board;
    s.setColorTheme('forest');
    expect(s.getState().board).toBe(board);
    expect(s.getState().ui.canUndo).toBe(false);
    s.undo();
    expect(s.getState().view.colorTheme).toBe('forest');
    expect([...storage.data.keys()]).toEqual([COLOR_THEME_KEY]);
  });
});
