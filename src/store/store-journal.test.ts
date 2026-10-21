import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { journalDateLine } from '../model/journal';
import { fromPlain, type Rich } from '../model/richText';
import type { NoteCard } from '../model/types';
import type { StorageLike } from '../model/persist';
import { createStore } from './store';

// Daily journal (owner request, 2026-10-18): the Journal button opens a side panel, like the focus
// timer, that writes into the Journal board without opening it.

const memoryStorage = (): StorageLike => {
  const data: Record<string, string> = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = v) };
};
const later = (fn: () => void) => fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 18, 10, 0));
});
afterEach(() => vi.useRealTimers());

type Store = ReturnType<typeof setup>;
function setup() {
  const s = createStore(memoryStorage(), later);
  s.setViewportSize({ width: 1000, height: 800 });
  return s;
}
const today = journalDateLine(new Date(2026, 9, 18));
const journalIds = (s: Store) => Object.entries(s.workspace().boards).filter(([, b]) => b.name === 'Journal').map(([id]) => id);
const journalNotes = (s: Store) => {
  const id = s.getState().ui.journalBoard!;
  return Object.values(s.workspace().boards[id].cards).flatMap((c) => (c.kind === 'note' ? [c] : []));
};

describe('Journal panel', () => {
  it('opens beside the board you are on, and makes a hidden Journal board with today’s note', () => {
    const s = setup();
    const { home, open } = s.getState().boards;
    const homeBoard = s.getState().board;
    expect(s.openJournal()).toBeNull();
    const { ui, boards } = s.getState();
    expect(ui.sidePanel).toBe('journal');
    expect(boards.open).toBe(open); // no navigation
    expect(s.getState().board).toBe(homeBoard); // Home is untouched: no Journal card on it
    expect(journalIds(s)).toEqual([ui.journalBoard]);
    expect(ui.journalBoard).not.toBe(home);
    expect(journalNotes(s).map((n) => n.text)).toEqual([`${today}\n\n`]);
  });

  it('adds today’s note only once', () => {
    const s = setup();
    s.openJournal();
    s.openJournal(); // closes
    expect(s.getState().ui.sidePanel).toBeNull();
    s.openJournal();
    expect(journalIds(s)).toHaveLength(1);
    expect(journalNotes(s)).toHaveLength(1);
  });

  it('typing saves to the Journal board, as an edit (for saving and version history)', () => {
    const s = setup();
    s.openJournal();
    const [note] = journalNotes(s);
    const edits = s.edits();
    s.setJournal(note.id, fromPlain('Went for a walk'));
    expect(journalNotes(s)[0].text).toBe(`${today}\n\nWent for a walk`);
    expect(s.edits()).toBeGreaterThan(edits);
  });

  it('is kept after a reload', () => {
    const storage = memoryStorage();
    const s = createStore(storage, later);
    s.openJournal();
    const [note] = journalNotes(s);
    s.setJournal(note.id, fromPlain('kept'));
    s.flush();
    const again = createStore(storage, later);
    const boards = Object.values(again.workspace().boards).filter((b) => b.name === 'Journal');
    expect(boards).toHaveLength(1);
    expect(Object.values(boards[0].cards).map((c) => (c.kind === 'note' ? c.text : ''))).toEqual([`${today}\n\nkept`]);
  });

  it('the next day adds a new note above the old one, which stays', () => {
    const s = setup();
    s.openJournal();
    s.openJournal();
    vi.setSystemTime(new Date(2026, 9, 19, 9, 0));
    s.openJournal();
    const found = journalNotes(s);
    expect(found).toHaveLength(2);
    const fresh = found.find((c) => c.text.startsWith('Mon 19 Oct 2026'))!;
    const old = found.find((c) => c.text.startsWith('Sun 18 Oct 2026'))!;
    expect(fresh.y).toBeLessThan(old.y);
  });

  it('changing the date line of today’s note makes it another day’s, and the next opening adds a new note for today (job #156)', () => {
    const s = setup();
    s.openJournal();
    const [note] = journalNotes(s);
    s.openBoard(s.getState().ui.journalBoard!);
    s.setNoteText(note.id, 'Sat 17 Oct 2026\n\nwrote it the day before'); // the date line is edited on the board itself
    s.openJournal(); // closes the panel
    expect(s.getState().ui.sidePanel).toBeNull();
    s.openJournal();
    const found = journalNotes(s);
    expect(found).toHaveLength(2);
    expect(found.some((c) => c.text.startsWith('Sun 18 Oct 2026'))).toBe(true);
    expect(found.some((c) => c.text.startsWith('Sat 17 Oct 2026'))).toBe(true);
  });

  it('undo in the panel undoes journal typing, and leaves the board you are on and its undo alone', () => {
    const s = setup();
    s.addCard('note'); // something to undo on Home
    const homeBoard = s.getState().board;
    s.openJournal();
    const [note] = journalNotes(s);
    s.setJournal(note.id, fromPlain('first'));
    vi.advanceTimersByTime(5000);
    s.setJournal(note.id, fromPlain('first, second'));
    s.undoJournal();
    expect(journalNotes(s)[0].text).toBe(`${today}\n\nfirst`);
    s.undoJournal();
    expect(journalNotes(s)[0].text).toBe(`${today}\n\n`);
    s.redoJournal();
    expect(journalNotes(s)[0].text).toBe(`${today}\n\nfirst`);
    expect(s.getState().board).toBe(homeBoard);
    expect(s.getState().ui.canUndo).toBe(true); // Home's own undo is still there
    // Undo all the way removes today's note (one step), and no further.
    s.undoJournal();
    s.undoJournal();
    s.undoJournal();
    expect(journalNotes(s)).toHaveLength(0);
    expect(journalIds(s)).toHaveLength(1);
    expect(s.getState().board).toBe(homeBoard);
    // Home's undo still undoes Home.
    s.undo();
    expect(Object.keys(s.getState().board.cards)).toHaveLength(0);
  });

  it('typing in the panel is in the Journal board’s own undo when that board is opened', () => {
    const s = setup();
    s.openJournal();
    const id = s.getState().ui.journalBoard!;
    const [note] = journalNotes(s);
    s.setJournal(note.id, fromPlain('hi'));
    s.openBoard(id);
    s.undo();
    expect(journalNotes(s)[0].text).toBe(`${today}\n\n`);
    // And with the Journal board open, the panel's undo is the same history.
    s.redoJournal();
    expect(journalNotes(s)[0].text).toBe(`${today}\n\nhi`);
  });

  it('reuses an existing Journal board with its Home card, adding nothing to Home', () => {
    const s = setup();
    const home = s.getState().boards.home;
    const id = s.addBoardCard(); // a sub-board, as the old Journal button made
    s.openBoard(id);
    s.renameBoard('Journal');
    s.addCard('todo'); // other things on it stay
    s.openBoard(home);
    const homeBoard = s.getState().board;
    s.openJournal();
    expect(s.getState().ui.journalBoard).toBe(id);
    expect(s.getState().board).toBe(homeBoard);
    expect(journalIds(s)).toEqual([id]);
    const cards = Object.values(s.workspace().boards[id].cards);
    expect(cards.map((c) => c.kind).sort()).toEqual(['note', 'todo']);
  });

  it('never uses a board that a share holds', () => {
    const s = setup();
    const home = s.getState().boards.home;
    const shared = s.newBoard();
    s.renameBoard('Journal');
    s.openBoard(home);
    s.setShares([{ id: 's1', root: shared, boards: [shared], owner: false, ownerUid: 'alice', people: [], link: null }], true);
    s.openJournal();
    expect(s.getState().ui.journalBoard).not.toBe(shared);
    expect(s.workspace().boards[shared].cards).toEqual({});
    expect(journalIds(s)).toHaveLength(2);
  });

  it('waits (changing nothing) until it is known which boards are shared', () => {
    const s = setup();
    s.setShares([], false);
    expect(s.openJournal()).toBe('loading');
    expect(Object.keys(s.workspace().boards)).toHaveLength(1);
    expect(s.getState().ui.sidePanel).toBeNull();
  });

  it('takes the place of the other side panels and history, and puts an old version away', () => {
    const s = setup();
    s.toggleSidePanel('pomodoro');
    s.previewVersion({ savedAt: 0 } as never, s.getState().board);
    s.openJournal();
    expect(s.getState().ui.preview).toBeNull();
    expect(s.getState().ui.sidePanel).toBe('journal');
    expect(journalNotes(s)).toHaveLength(1);
    s.toggleHistory();
    expect(s.getState().ui.sidePanel).toBeNull();
  });

  it('Ctrl+arrows skip the hidden Journal board', () => {
    const s = setup();
    const home = s.getState().boards.home;
    s.openJournal();
    const other = s.newBoard();
    s.renameBoard('Recipes');
    s.openBoard(home);
    expect(s.moveBoard('next')).toBe(other);
    expect(s.moveBoard('previous')).toBe(home);
  });

  it('stops writing to the Journal board once a share holds it (review of job 99)', () => {
    const s = setup();
    s.openJournal();
    const id = s.getState().ui.journalBoard!;
    const note = journalNotes(s)[0];
    s.setShares([{ id: 's1', root: id, boards: [id], owner: true, ownerUid: 'me', people: [], link: null }], true);
    s.undoJournal(); // would take today's note away
    expect(journalNotes(s)).toEqual([note]);
    s.setJournal(note.id, fromPlain('secret'));
    expect(journalNotes(s)).toEqual([note]);
  });

  it('only one place says which board is hidden: none until shares are known, never the open board (review of job 99)', () => {
    const s = setup();
    const home = s.getState().boards.home;
    s.openJournal();
    const id = s.getState().ui.journalBoard!;
    expect(s.hiddenBoards()).toEqual([id]);
    s.setShares([], false);
    expect(s.hiddenBoards()).toEqual([]);
    s.setShares([], true);
    s.openBoard(id);
    expect(s.hiddenBoards()).toEqual([]);
    s.openBoard(home);
    expect(s.hiddenBoards()).toEqual([id]);
  });

  it('restoring a version brings back the hidden Journal board’s writing too, and undo in the panel takes it back (check of PR #94)', () => {
    const s = setup();
    s.openJournal();
    const [note] = journalNotes(s);
    s.setJournal(note.id, fromPlain('old words'));
    const then = s.workspace();
    vi.advanceTimersByTime(5000);
    s.setJournal(note.id, fromPlain('new words'));
    expect(s.restoreVersion(then)).toEqual([]);
    expect(journalNotes(s)[0].text).toBe(`${today}\n\nold words`);
    s.undoJournal();
    expect(journalNotes(s)[0].text).toBe(`${today}\n\nnew words`);
  });

  it('a version from before the Journal board existed leaves it as it is', () => {
    const s = setup();
    const then = s.workspace();
    s.openJournal();
    const [note] = journalNotes(s);
    s.setJournal(note.id, fromPlain('kept'));
    s.restoreVersion(then);
    expect(journalNotes(s)[0].text).toBe(`${today}\n\nkept`);
  });

  it('opening the panel clears the selection on the board behind it, so Delete can’t remove it (check of PR #94)', () => {
    const s = setup();
    s.addCard('note');
    expect(s.getState().ui.selection).toHaveLength(1);
    s.openJournal();
    expect(s.getState().ui.selection).toEqual([]);
    expect(s.getState().ui.itemSel).toBeNull();
  });

  it('makes the hidden Journal board standalone, not inside the board that is open', () => {
    const s = setup();
    const sub = s.addBoardCard();
    s.openBoard(sub);
    s.openJournal();
    const id = s.getState().ui.journalBoard!;
    for (const b of Object.values(s.workspace().boards)) expect(Object.values(b.cards).some((c) => c.kind === 'board' && c.boardId === id)).toBe(false);
  });
});

describe('Journal formatting (owner request, 2026-10-19)', () => {
  const list: Rich = [{ type: 'bullet', runs: [{ text: 'milk', b: true }] }, { type: 'bullet', runs: [{ text: 'eggs' }] }];

  it('saves the formatting with the plain text beside it, which everything else reads', () => {
    const s = setup();
    s.openJournal();
    const [note] = journalNotes(s);
    s.setJournal(note.id, list, false);
    const [saved] = journalNotes(s);
    expect(saved.text).toBe(`${today}\n\n• milk\n• eggs`);
    expect(saved.rich).toEqual(list);
  });

  it('plain typing saves no formatting at all, the shape notes had before', () => {
    const s = setup();
    s.openJournal();
    const [note] = journalNotes(s);
    s.setJournal(note.id, fromPlain('just words'));
    expect('rich' in journalNotes(s)[0]).toBe(false);
    // Taking every format off removes it again.
    s.setJournal(note.id, list, false);
    s.setJournal(note.id, fromPlain('plain again'), false);
    expect('rich' in journalNotes(s)[0]).toBe(false);
  });

  it('is kept after a reload', () => {
    const storage = memoryStorage();
    const s = createStore(storage, later);
    s.openJournal();
    const [note] = journalNotes(s);
    s.setJournal(note.id, list, false);
    s.flush();
    const again = createStore(storage, later);
    const board = Object.values(again.workspace().boards).find((b) => b.name === 'Journal')!;
    expect((Object.values(board.cards)[0] as NoteCard).rich).toEqual(list);
  });

  it('a formatting change is its own undo step; typing still merges', () => {
    const s = setup();
    s.openJournal();
    const [note] = journalNotes(s);
    s.setJournal(note.id, fromPlain('milk'));
    s.setJournal(note.id, fromPlain('milk and eggs'));
    vi.advanceTimersByTime(5000);
    s.setJournal(note.id, [{ type: 'p', runs: [{ text: 'milk and eggs', u: true }] }], false);
    expect(journalNotes(s)[0].rich).toBeDefined();
    s.undoJournal();
    expect(journalNotes(s)[0].text).toBe(`${today}\n\nmilk and eggs`);
    expect('rich' in journalNotes(s)[0]).toBe(false);
    s.redoJournal();
    expect(journalNotes(s)[0].rich).toEqual([{ type: 'p', runs: [{ text: 'milk and eggs', u: true }] }]);
  });

  it('a Journal note saved before formatting existed is left exactly as it was by opening the panel', () => {
    const storage = memoryStorage();
    const s = createStore(storage, later);
    s.openJournal();
    const [note] = journalNotes(s);
    s.setJournal(note.id, fromPlain('line one\r\nline two'));
    s.flush();
    const again = createStore(storage, later);
    again.setViewportSize({ width: 1000, height: 800 });
    const before = again.workspace();
    again.openJournal();
    expect(again.workspace().boards).toEqual(before.boards);
  });

  it('editing the note as a plain card on the Journal board drops its formatting, and undo brings it back', () => {
    const s = setup();
    s.openJournal();
    const [note] = journalNotes(s);
    s.setJournal(note.id, list, false);
    s.openBoard(s.getState().ui.journalBoard!);
    s.setNoteText(note.id, `${today}\n\n• milk\n• eggs!`);
    expect('rich' in journalNotes(s)[0]).toBe(false);
    s.undo();
    expect(journalNotes(s)[0].rich).toEqual(list);
  });

  it('a note too big for its formatting to load back is saved as plain text at once, not lost on a reload', () => {
    const s = setup();
    s.openJournal();
    const [note] = journalNotes(s);
    const huge: Rich = Array.from({ length: 20001 }, () => ({ type: 'bullet' as const, runs: [{ text: 'x' }] }));
    s.setJournal(note.id, huge, false);
    const [saved] = journalNotes(s);
    expect('rich' in saved).toBe(false);
    expect(saved.text.split('\n')).toHaveLength(20003);
  });
});
