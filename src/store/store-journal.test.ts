import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generalNotes, journalDateLine } from '../model/journal';
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
    s.setShares([{ id: 's1', root: shared, boards: [shared], owner: false, ownerUid: 'alice', people: [], links: { edit: null, comment: null, view: null, roles: false } }], true);
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
    s.setShares([{ id: 's1', root: id, boards: [id], owner: true, ownerUid: 'me', people: [], links: { edit: null, comment: null, view: null, roles: false } }], true);
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

// General notes (owner request, 2026-10-29): one note on the Journal board for notes not tied to a day.
describe('Journal general notes', () => {
  const general = (s: Store) => journalNotes(s).filter((n) => n.text.startsWith('General notes'));

  it('opening the panel adds nothing for them; the first typing adds one note, which is never a day', () => {
    const s = setup();
    s.openJournal();
    expect(general(s)).toEqual([]);
    s.setJournalNotes(fromPlain('')); // nothing typed: still nothing
    expect(general(s)).toEqual([]);
    const edits = s.edits();
    s.setJournalNotes(fromPlain('Call the plumber'));
    expect(general(s).map((n) => n.text)).toEqual(['General notes\n\nCall the plumber']);
    expect(s.edits()).toBeGreaterThan(edits);
    s.setJournalNotes(fromPlain('Call the plumber\nBuy stamps'));
    expect(general(s).map((n) => n.text)).toEqual(['General notes\n\nCall the plumber\nBuy stamps']);
    expect(journalNotes(s)).toHaveLength(2); // today's note and the general notes
  });

  it('typing in them does nothing (and does not crash) once the Journal board is gone', () => {
    const s = setup();
    s.openJournal();
    const id = s.getState().ui.journalBoard!;
    const ws = s.workspace();
    const boards = { ...ws.boards };
    delete boards[id];
    s.replaceWorkspace({ ...ws, boards });
    expect(() => s.setJournalNotes(fromPlain('lost?'))).not.toThrow();
    expect(s.workspace().boards[id]).toBeUndefined();
  });

  it('keeps the Journal board hidden, and sits clear of today’s note', () => {
    const s = setup();
    s.openJournal();
    const id = s.getState().ui.journalBoard!;
    s.setJournalNotes(fromPlain('list'));
    expect(s.hiddenBoards()).toEqual([id]);
    const [g] = general(s);
    const day = journalNotes(s).find((n) => n.text.startsWith(today))!;
    expect(g.x).toBeGreaterThan(day.x);
  });

  it('saves its formatting like a day does', () => {
    const s = setup();
    s.openJournal();
    const rich: Rich = [{ type: 'p', runs: [{ text: 'bold', b: true }] }];
    s.setJournalNotes(rich, false);
    expect(general(s)[0].rich).toEqual(rich);
    expect(general(s)[0].text).toBe('General notes\n\nbold');
  });

  it('undo in the panel takes the typing and the note away in one step, and redo brings them back', () => {
    const s = setup();
    s.openJournal();
    s.setJournalNotes(fromPlain('a'));
    s.setJournalNotes(fromPlain('ab'));
    s.undoJournal();
    expect(general(s)).toEqual([]);
    expect(journalNotes(s)).toHaveLength(1); // today's note stays
    s.redoJournal();
    expect(general(s).map((n) => n.text)).toEqual(['General notes\n\nab']);
  });

  it('is kept after a reload, and the next day leaves it as it is', () => {
    const storage = memoryStorage();
    const s = createStore(storage, later);
    s.openJournal();
    s.setJournalNotes(fromPlain('kept'));
    s.flush();
    const again = createStore(storage, later);
    vi.setSystemTime(new Date(2026, 9, 19, 9, 0));
    again.openJournal();
    expect(general(again).map((n) => n.text)).toEqual(['General notes\n\nkept']);
    again.setJournalNotes(fromPlain('kept, more'));
    expect(general(again)).toHaveLength(1);
  });

  it('writes nothing once a share holds the Journal board', () => {
    const s = setup();
    s.openJournal();
    const id = s.getState().ui.journalBoard!;
    s.setShares([{ id: 's1', root: id, boards: [id], owner: true, ownerUid: 'me', people: [], links: { edit: null, comment: null, view: null, roles: false } }], true);
    s.setJournalNotes(fromPlain('secret'));
    expect(general(s)).toEqual([]);
  });
});

// Several general notes, with names (owner request, 2026-11-10).
describe('several Journal general notes', () => {
  const generals = (s: Store) => {
    const id = s.getState().ui.journalBoard!;
    const b = s.workspace().boards[id];
    return generalNotes(b).map((k) => b.cards[k] as NoteCard);
  };
  const names = (s: Store) => generals(s).map((n) => n.text.split('\n')[0]);

  it('+ on the one note not yet written makes it and an "Untitled note" below it, in one undo step', () => {
    const s = setup();
    s.openJournal();
    const id = s.addJournalNote('kFirst');
    expect(id).toBeTruthy();
    expect(names(s)).toEqual(['General notes', 'Untitled note']);
    expect(generals(s)[1].id).toBe(id);
    expect(s.hiddenBoards()).toEqual([s.getState().ui.journalBoard]);
    s.undoJournal();
    expect(generals(s)).toEqual([]);
    expect(journalNotes(s)).toHaveLength(1); // today's note stays
  });

  it('+ adds right below the note it is on; typing goes into the note named', () => {
    const s = setup();
    s.openJournal();
    s.setJournalNotes(fromPlain('first'));
    const [first] = generals(s);
    const b = s.addJournalNote(first.id)!;
    const c = s.addJournalNote(first.id)!;
    expect(generals(s).map((n) => n.id)).toEqual([first.id, c, b]);
    s.setJournalNotes(fromPlain('in b'), true, b);
    expect(generals(s).find((n) => n.id === b)!.text).toBe('Untitled note\n\nin b');
    expect(generals(s)[0].text).toBe('General notes\n\nfirst');
  });

  it('renames a note as one undo step; the existing note keeps its text; an empty name is "Untitled note"', () => {
    const s = setup();
    s.openJournal();
    s.setJournalNotes(fromPlain('keep me'));
    const [first] = generals(s);
    s.renameJournalNote(first.id, 'Ideas');
    expect(generals(s)[0].text).toBe('Ideas\n\nkeep me');
    s.renameJournalNote(first.id, '');
    expect(names(s)).toEqual(['Untitled note']);
    s.undoJournal();
    expect(names(s)).toEqual(['Ideas']);
    s.undoJournal();
    expect(generals(s)[0].text).toBe('General notes\n\nkeep me');
  });

  it('renaming the note not yet written makes it with that name; the same name makes nothing', () => {
    const s = setup();
    s.openJournal();
    s.renameJournalNote('kFirst', 'General notes');
    expect(generals(s)).toEqual([]);
    s.renameJournalNote('kFirst', 'To do');
    expect(names(s)).toEqual(['To do']);
  });

  it('deletes a note with the Undo message, Undo brings it back in one step, and the last one is never deleted', () => {
    const s = setup();
    s.openJournal();
    s.setJournalNotes(fromPlain('first'));
    const [first] = generals(s);
    const b = s.addJournalNote(first.id)!;
    s.setJournalNotes(fromPlain('second'), true, b);
    s.deleteJournalNote(b);
    expect(generals(s).map((n) => n.id)).toEqual([first.id]);
    expect(s.getState().ui.undoToast?.text).toBe('Deleted 1 note');
    s.undoJournal();
    expect(generals(s).map((n) => n.text)).toEqual(['General notes\n\nfirst', 'Untitled note\n\nsecond']);
    s.deleteJournalNote(b);
    s.deleteJournalNote(first.id); // the last: kept
    expect(generals(s).map((n) => n.id)).toEqual([first.id]);
  });

  it('several notes are kept after a reload, in order, with their names', () => {
    const storage = memoryStorage();
    const s = createStore(storage, later);
    s.openJournal();
    s.setJournalNotes(fromPlain('a'));
    const b = s.addJournalNote(generals(s)[0].id)!;
    s.renameJournalNote(b, 'Recipes');
    s.flush();
    const again = createStore(storage, later);
    again.openJournal();
    expect(names(again)).toEqual(['General notes', 'Recipes']);
  });

  it('a Journal saved before there could be several (no place saved) shows its one note, and + or rename then numbers it', () => {
    const storage = memoryStorage();
    const s = createStore(storage, later);
    s.openJournal();
    s.setJournalNotes(fromPlain('old words'));
    s.flush();
    // As an older copy of the app saved it: no `general`.
    const saved = JSON.parse(storage.getItem('note-board:v1')!);
    const jid = s.getState().ui.journalBoard!;
    for (const c of Object.values(saved.boards[jid].cards) as { general?: number }[]) delete c.general;
    storage.setItem('note-board:v1', JSON.stringify(saved));
    const again = createStore(storage, later);
    again.openJournal();
    expect(generals(again).map((n) => n.text)).toEqual(['General notes\n\nold words']);
    expect(generals(again)[0].general).toBeUndefined();
    const b = again.addJournalNote(generals(again)[0].id)!;
    expect(generals(again).map((n) => [n.general, n.text.split('\n')[0]])).toEqual([[1, 'General notes'], [2, 'Untitled note']]);
    expect(generals(again)[1].id).toBe(b);
    expect(generals(again)[0].text).toBe('General notes\n\nold words');
  });

  it('a Journal saved before this, with its one General notes note, loads unchanged', () => {
    const storage = memoryStorage();
    const s = createStore(storage, later);
    s.openJournal();
    s.setJournalNotes(fromPlain('old text'));
    s.flush();
    const saved = JSON.parse(storage.getItem('note-board:v1')!);
    const again = createStore(storage, later);
    again.openJournal();
    expect(generals(again).map((n) => n.text)).toEqual(['General notes\n\nold text']);
    again.flush();
    const id = again.getState().ui.journalBoard!;
    expect(JSON.parse(storage.getItem('note-board:v1')!).boards[id].cards).toEqual(saved.boards[id].cards);
  });
// An older copy of the app drops the general notes' places (2026-11-10 follow-up): this device
// remembers which notes were general notes, finds them again, and the next change writes the places back.
describe('Journal general notes after an older app saved them', () => {
  const strip = (s: Store) => {
    const ws = s.workspace();
    const id = s.getState().ui.journalBoard!;
    const b = ws.boards[id];
    const cards = Object.fromEntries(
      Object.entries(b.cards).map(([k, c]) => {
        if (c.kind !== 'note') return [k, c];
        const { general: _g, ...rest } = c;
        return [k, rest];
      }),
    );
    s.replaceWorkspace({ ...ws, boards: { ...ws.boards, [id]: { ...b, cards } } });
  };
  const text = (s: Store, k: string) => (s.workspace().boards[s.getState().ui.journalBoard!].cards[k] as NoteCard).text;
  const three = (storage = memoryStorage()) => {
    const s = createStore(storage, later);
    s.setViewportSize({ width: 1000, height: 800 });
    s.openJournal();
    s.setJournalNotes(fromPlain('list'));
    const first = s.journalGeneralNotes()[0];
    const b = s.addJournalNote(first)!;
    s.renameJournalNote(b, 'Recipes');
    const c = s.addJournalNote(b)!;
    s.renameJournalNote(c, 'Tue 10 Nov 2026');
    s.rememberJournalNotes();
    return { s, ids: [first, b, c], storage };
  };

  it('finds every one again, in order, with its words, and the next rename writes the places back', () => {
    const { s, ids } = three();
    strip(s);
    expect(generalNotes(s.workspace().boards[s.getState().ui.journalBoard!])).toEqual([ids[0]]);
    expect(s.journalGeneralNotes()).toEqual(ids);
    expect(text(s, ids[1])).toBe('Recipes\n\n');
    s.renameJournalNote(ids[1], 'Recipes 2');
    expect(generalNotes(s.workspace().boards[s.getState().ui.journalBoard!])).toEqual(ids);
    expect(text(s, ids[0])).toBe('General notes\n\nlist');
  });

  it('remembers them after the page is opened again (saved on this device)', () => {
    const { s, ids, storage } = three();
    strip(s);
    s.flush();
    const again = createStore(storage, later);
    again.openJournal();
    expect(again.journalGeneralNotes()).toEqual(ids);
  });

  it('deleting one, then Undo, brings it back in its place in the list', () => {
    const { s, ids } = three();
    strip(s);
    s.deleteJournalNote(ids[1]);
    s.rememberJournalNotes();
    expect(s.journalGeneralNotes()).toEqual([ids[0], ids[2]]);
    s.undoJournal();
    expect(s.journalGeneralNotes()).toEqual(ids);
  });

  it('another device that never saw them adds a note: this device still lists the ones it remembers, after those with places', () => {
    const { s, ids } = three();
    strip(s);
    // As another device would: "General notes" and a new note get places, the other two don't.
    const ws = s.workspace();
    const id = s.getState().ui.journalBoard!;
    const b = ws.boards[id];
    const d = { ...(b.cards[ids[1]] as NoteCard), id: 'n-d', text: 'From phone\n\n', general: 2 };
    const first = { ...(b.cards[ids[0]] as NoteCard), general: 1 };
    s.replaceWorkspace({ ...ws, boards: { ...ws.boards, [id]: { ...b, cards: { ...b.cards, [ids[0]]: first, 'n-d': d } } } });
    s.rememberJournalNotes();
    expect(s.journalGeneralNotes()).toEqual([ids[0], 'n-d', ids[1], ids[2]]);
  });

  it('what another tab remembers is read again, not kept from when this page opened', () => {
    const storage = memoryStorage();
    const { s, ids } = three(storage);
    strip(s);
    expect(s.journalGeneralNotes()).toEqual(ids);
    storage.setItem('note-board:journal-notes', JSON.stringify([ids[0], ids[2]]));
    expect(s.journalGeneralNotes()).toEqual([ids[0], ids[2]]);
  });

  it('typing and deleting find them too; one named like a date is never taken for that day', () => {
    const { s, ids } = three();
    strip(s);
    s.setJournalNotes(fromPlain('more'), true, ids[2]);
    expect(text(s, ids[2])).toBe('Tue 10 Nov 2026\n\nmore');
    s.deleteJournalNote(ids[1]);
    expect(s.journalGeneralNotes()).toEqual([ids[0], ids[2]]);
  });
});

describe('placing general notes on the open Journal board', () => {
  it('+ on the note not yet written puts the two notes clear of each other', () => {
    const s = setup();
    s.openJournal();
    const jid = s.getState().ui.journalBoard!;
    s.openBoard(jid);
    const added = s.addJournalNote('kFirst')!;
    const b = s.getState().board;
    const [first] = generalNotes(b).filter((k) => k !== added);
    const r = (k: string) => {
      const c = b.cards[k] as NoteCard;
      return { x: c.x, y: c.y, w: c.w ?? 280, h: c.h ?? 160 }; // not drawn here: a new note's height
    };
    const a = r(first);
    const n = r(added);
    expect(n.y).toBeGreaterThanOrEqual(a.y + a.h);
  });
});
});
