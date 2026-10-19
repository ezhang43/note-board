import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { habitList, tickedDays } from '../model/habits';
import type { StorageLike } from '../model/persist';
import { fromPlain } from '../model/richText';
import { createStore } from './store';

// Habits (owner request, 2026-10-19): a Habits side panel, like the Journal one, that keeps daily
// habits on a hidden board called "Habits" without opening it.

const memoryStorage = (): StorageLike => {
  const data: Record<string, string> = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = v) };
};
const later = (fn: () => void) => fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 19, 10, 0));
});
afterEach(() => vi.useRealTimers());

type Store = ReturnType<typeof setup>;
function setup(storage = memoryStorage()) {
  const s = createStore(storage, later);
  s.setViewportSize({ width: 1000, height: 800 });
  return s;
}
const habitsIds = (s: Store) => Object.entries(s.workspace().boards).filter(([, b]) => b.name === 'Habits').map(([id]) => id);
const habits = (s: Store) => {
  const id = s.habitsBoard();
  return id ? habitList(s.workspace().boards[id]) : [];
};

describe('Habits panel', () => {
  it('opens beside the board you are on and changes nothing until a habit is added', () => {
    const s = setup();
    const before = s.workspace();
    expect(s.openHabits()).toBeNull();
    expect(s.getState().ui.sidePanel).toBe('habits');
    expect(s.workspace()).toEqual(before);
    s.openHabits(); // closes
    expect(s.getState().ui.sidePanel).toBeNull();
  });

  it('adding a habit makes one hidden Habits board, on its own, and leaves the open board alone', () => {
    const s = setup();
    const homeBoard = s.getState().board;
    s.openHabits();
    s.addHabit('Walk');
    s.addHabit('  Read  ');
    s.addHabit('   '); // nothing
    expect(habitsIds(s)).toHaveLength(1);
    expect(habits(s).map((h) => h.title)).toEqual(['Walk', 'Read']);
    expect(s.getState().board).toBe(homeBoard);
    expect(s.hiddenBoards()).toEqual([habitsIds(s)[0]]);
  });

  it('a new habit is a checklist like any other (one blank item), the same before and after a reload', () => {
    const storage = memoryStorage();
    const s = setup(storage);
    s.openHabits();
    const id = s.addHabit('Walk')!;
    expect(habits(s)[0].items.map((i) => [i.text, i.done])).toEqual([['', false]]);
    s.toggleHabitDay(id, '2026-10-19');
    s.flush();
    expect(setup(storage).workspace()).toEqual(s.workspace());
  });

  it('a Habits board that arrives from another device while the panel is open is the one shown and used', () => {
    const s = setup();
    s.openHabits();
    const theirs = setup();
    theirs.openHabits();
    theirs.addHabit('Walk');
    s.replaceWorkspace({ ...s.workspace(), boards: { ...s.workspace().boards, ...theirs.workspace().boards, [s.workspace().home]: s.workspace().boards[s.workspace().home] } });
    expect(habits(s).map((h) => h.title)).toEqual(['Walk']);
    s.addHabit('Read');
    expect(habitsIds(s)).toHaveLength(1);
    expect(habits(s).map((h) => h.title)).toEqual(['Walk', 'Read']);
  });

  it('ticks and unticks a day, renames and deletes, all saved and kept after a reload', () => {
    const storage = memoryStorage();
    const s = setup(storage);
    s.openHabits();
    const id = s.addHabit('Walk')!;
    s.toggleHabitDay(id, '2026-10-19');
    s.toggleHabitDay(id, '2026-10-18');
    s.toggleHabitDay(id, '2026-10-18'); // off again
    s.renameHabit(id, 'Walk the dog');
    const gone = s.addHabit('Gone')!;
    s.deleteHabit(gone);
    const read = s.addHabit('Read')!;
    s.toggleHabitDay(read, '2026-10-18');
    s.renameHabit(id, 'Walk the dog!');
    s.addHabit('Not ticked yet');
    s.flush();
    const again = setup(storage);
    again.openHabits();
    // In the order they were added, whatever was changed last; one never ticked comes back too.
    expect(habits(again).map((h) => [h.title, [...tickedDays(h)]])).toEqual([
      ['Walk the dog!', ['2026-10-19']],
      ['Read', ['2026-10-18']],
      ['Not ticked yet', []],
    ]);
  });

  it('Ctrl+Z in the panel brings a deleted habit back, on the Habits board only', () => {
    const s = setup();
    s.addCard('note');
    const homeBoard = s.getState().board;
    s.openHabits();
    const id = s.addHabit('Walk')!;
    s.toggleHabitDay(id, '2026-10-19');
    s.deleteHabit(id);
    expect(habits(s)).toEqual([]);
    s.undoHabits();
    expect(habits(s).map((h) => [h.title, [...tickedDays(h)]])).toEqual([['Walk', ['2026-10-19']]]);
    s.redoHabits();
    expect(habits(s)).toEqual([]);
    expect(s.getState().board).toBe(homeBoard);
    expect(s.getState().ui.canUndo).toBe(true); // Home's own undo is still there
  });

  it('typing a new name is one undo step', () => {
    const s = setup();
    s.openHabits();
    const id = s.addHabit('W')!;
    s.renameHabit(id, 'Wa');
    s.renameHabit(id, 'Wal');
    s.undoHabits();
    expect(habits(s)[0].title).toBe('W');
  });

  it('waits (changing nothing) until it is known which boards are shared, and never uses a shared one', () => {
    const s = setup();
    s.setShares([], false);
    expect(s.openHabits()).toBe('loading');
    expect(s.getState().ui.sidePanel).toBeNull();
    const home = s.getState().boards.home;
    const shared = s.newBoard();
    s.renameBoard('Habits');
    s.openBoard(home);
    s.setShares([{ id: 's1', root: shared, boards: [shared], owner: false, ownerUid: 'alice', people: [], link: null }], true);
    s.openHabits();
    s.addHabit('Walk');
    expect(s.habitsBoard()).not.toBe(shared);
    expect(s.workspace().boards[shared].cards).toEqual({});
  });

  it('stops writing once a share holds the Habits board', () => {
    const s = setup();
    s.openHabits();
    const id = s.addHabit('Walk')!;
    const board = s.habitsBoard()!;
    s.setShares([{ id: 's1', root: board, boards: [board], owner: true, ownerUid: 'me', people: [], link: null }], true);
    const before = s.workspace().boards[board];
    s.toggleHabitDay(id, '2026-10-19');
    s.deleteHabit(id);
    s.undoHabits();
    expect(s.workspace().boards[board]).toBe(before);
  });

  it('the Journal and Habits boards are both hidden, and Ctrl+arrows pass over both', () => {
    const s = setup();
    const home = s.getState().boards.home;
    s.openJournal();
    s.openHabits();
    s.addHabit('Walk');
    const other = s.newBoard();
    s.renameBoard('Recipes');
    s.openBoard(home);
    expect(s.hiddenBoards()).toHaveLength(2);
    expect(s.moveBoard('next')).toBe(other);
    expect(s.moveBoard('previous')).toBe(home);
  });

  it('restoring a version puts the hidden Habits board back too, and undo in the panel takes it back', () => {
    const s = setup();
    s.openHabits();
    const id = s.addHabit('Walk')!;
    const then = s.workspace();
    s.deleteHabit(id);
    expect(s.restoreVersion(then)).toEqual([]);
    expect(habits(s).map((h) => h.title)).toEqual(['Walk']);
    s.undoHabits();
    expect(habits(s)).toEqual([]);
  });

  it('opening the panel takes the place of the Journal panel and clears the selection behind it', () => {
    const s = setup();
    s.addCard('note');
    s.openJournal();
    s.openHabits();
    expect(s.getState().ui.sidePanel).toBe('habits');
    s.addCard('note');
    s.openHabits();
    s.openHabits();
    expect(s.getState().ui.selection).toEqual([]);
  });

  it('boards and a journal saved before Habits existed load unchanged, and opening Habits leaves them so', () => {
    const storage = memoryStorage();
    const first = setup(storage);
    first.addCard('todo');
    first.openJournal();
    const note = Object.values(first.workspace().boards[first.getState().ui.journalBoard!].cards)[0];
    first.setJournal(note.id, fromPlain('kept'));
    first.flush();
    const saved = storage.getItem('note-board:v1');
    const again = setup(storage);
    expect(again.workspace()).toEqual(first.workspace());
    again.openHabits();
    again.openHabits();
    again.flush();
    expect(storage.getItem('note-board:v1')).toBe(saved);
  });
});
