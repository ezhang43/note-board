import { describe, expect, it, vi } from 'vitest';
import { createWidthStore } from './panelWidths';

// Side panel widths kept on this device (owner request, job #127): not board data, so never undone,
// synced or part of an account's data.

const memory = (start: Record<string, string> = {}) => {
  const data = { ...start };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
};
const DEFAULTS = { journal: 420, habits: 300 };

describe('createWidthStore', () => {
  it('starts at the usual widths and remembers each panel’s width separately', () => {
    const storage = memory();
    const w = createWidthStore('note-board:panel-widths', DEFAULTS, storage);
    expect(w.get()).toEqual({ journal: 420, habits: 300 });
    w.set('journal', 600);
    expect(w.get()).toEqual({ journal: 600, habits: 300 });
    expect(JSON.parse(storage.data['note-board:panel-widths'])).toEqual({ journal: 600, habits: 300 });
    // A later visit reads it back.
    expect(createWidthStore('note-board:panel-widths', DEFAULTS, storage).get()).toEqual({ journal: 600, habits: 300 });
  });

  it('reset puts one panel back to its usual width and leaves the others', () => {
    const w = createWidthStore('k', DEFAULTS, memory());
    w.set('journal', 600);
    w.set('habits', 500);
    w.reset('journal');
    expect(w.get()).toEqual({ journal: 420, habits: 500 });
  });

  it('tells listeners when a width changes', () => {
    const w = createWidthStore('k', DEFAULTS, memory());
    const seen = vi.fn();
    const stop = w.subscribe(seen);
    w.set('habits', 340);
    expect(seen).toHaveBeenCalledTimes(1);
    stop();
    w.set('habits', 360);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('bad stored values, blocked storage or no storage at all give the usual widths and nothing breaks', () => {
    expect(createWidthStore('k', DEFAULTS, memory({ k: '{oops' })).get()).toEqual(DEFAULTS);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    for (const storage of [broken, null]) {
      const w = createWidthStore('k', DEFAULTS, storage);
      expect(w.get()).toEqual(DEFAULTS);
      w.set('habits', 480);
      expect(w.get().habits).toBe(480);
    }
  });
});
