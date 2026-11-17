import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarFirst, tick } from './undoClock';
import { createStore } from './store';

// Ctrl+Z with the calendar panel open (owner request 2026-11-17, job calendar-hotkeys): the board's and the
// calendar's undo steps share one counter, so the newer one is undone first.

beforeEach(() => vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) }));
afterEach(() => vi.unstubAllGlobals());

const none = { undo: 0, redo: 0, changed: 0 };

describe('which history Ctrl+Z and Ctrl+Y step', () => {
  it('undo: the calendar only when its newest step is newer than the board’s', () => {
    expect(calendarFirst('undo', none, { undo: 0, redo: 0 })).toBe(false);
    expect(calendarFirst('undo', none, { undo: 3, redo: 0 })).toBe(true);
    expect(calendarFirst('undo', { ...none, undo: 5, changed: 5 }, { undo: 3, redo: 0 })).toBe(false);
    expect(calendarFirst('undo', { ...none, undo: 2, changed: 2 }, { undo: 3, redo: 0 })).toBe(true);
  });

  it('redo: the most recently undone, and a calendar redo only while the board hasn’t changed since', () => {
    expect(calendarFirst('redo', none, { undo: 0, redo: 0 })).toBe(false);
    expect(calendarFirst('redo', { ...none, changed: 1 }, { undo: 0, redo: 4 })).toBe(true);
    // The board's undo came after the calendar's: the board's redo goes first.
    expect(calendarFirst('redo', { ...none, redo: 6, changed: 1 }, { undo: 0, redo: 4 })).toBe(false);
    // A new board change after the calendar's undo: that calendar redo is left behind.
    expect(calendarFirst('redo', { undo: 7, redo: 0, changed: 7 }, { undo: 0, redo: 4 })).toBe(false);
    // A board redo after it is not a new change: the calendar's redo still comes next.
    expect(calendarFirst('redo', { undo: 7, redo: 0, changed: 2 }, { undo: 0, redo: 4 })).toBe(true);
  });
});

describe('the board’s marks on the shared counter', () => {
  function setup() {
    const s = createStore(null, (fn) => fn());
    s.setViewportSize({ width: 1200, height: 800 });
    return s;
  }

  it('a change, a burst of typing, an undo and a redo each take a newer number; a fresh board has none', () => {
    const s = setup();
    expect(s.undoMarks()).toEqual({ undo: 0, redo: 0, changed: 0 });
    s.addCard('note');
    const added = s.undoMarks();
    expect(added.undo).toBeGreaterThan(0);
    expect(added.changed).toBe(added.undo);
    const cal = tick(); // a calendar change in between
    const id = s.getState().ui.selection[0];
    s.setNoteText(id, 'a');
    s.setNoteText(id, 'ab'); // the same burst of typing: one step, now newer
    const typed = s.undoMarks();
    expect(typed.undo).toBeGreaterThan(cal);
    expect(typed.changed).toBe(typed.undo);
    s.undo();
    const undone = s.undoMarks();
    expect(undone.redo).toBeGreaterThan(typed.undo);
    expect(undone.undo).toBe(added.undo); // the add is the newest step left
    s.redo();
    const redone = s.undoMarks();
    expect(redone.undo).toBeGreaterThan(undone.redo);
    expect(redone.changed).toBe(typed.changed); // a redo is not a new change
    expect(redone.redo).toBe(0);
  });
});
