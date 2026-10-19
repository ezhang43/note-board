import { describe, expect, it } from 'vitest';
import { addCard, createBoard } from './board';
import { createBoardCard, createCard } from './cards';
import { CARD_W, NEW_BLOCK_H } from './constants';
import { findJournalBoard, hiddenJournal, journalBody, journalDateLine, journalEntries, journalSpot, todaysNote, withJournalBody } from './journal';
import { overlaps } from './geometry';
import type { Board, Card } from './types';
import type { Workspace } from './workspace';

// Daily journal (owner request, 2026-10-18).

const noteAt = (board: Board, text: string, x: number, y: number) => {
  const card = { ...createCard('note'), text, x, y };
  return { board: addCard(board, card, { type: 'loose', x, y }), id: card.id };
};

describe('journalDateLine', () => {
  it('writes the day in the calendar style, with the year', () => {
    expect(journalDateLine(new Date(2026, 9, 18, 23, 59))).toBe('Sun 18 Oct 2026');
    expect(journalDateLine(new Date(2026, 0, 1, 0, 0))).toBe('Thu 1 Jan 2026');
  });
});

describe('findJournalBoard', () => {
  const ws = (names: Record<string, string>): Workspace => ({
    home: 'home',
    boards: Object.fromEntries(Object.entries(names).map(([id, name]) => [id, { ...createBoard(), name }])),
  });

  it('finds a board named exactly Journal, and nothing else', () => {
    expect(findJournalBoard(ws({ home: 'Home', a: 'Journal' }), [])).toBe('a');
    expect(findJournalBoard(ws({ home: 'Home', a: 'journal', b: 'My Journal', c: ' Journal ' }), [])).toBeNull();
    expect(findJournalBoard(ws({ home: 'Home' }), [])).toBeNull();
  });

  it('skips boards that a share holds', () => {
    expect(findJournalBoard(ws({ home: 'Home', a: 'Journal', b: 'Journal' }), ['a'])).toBe('b');
    expect(findJournalBoard(ws({ home: 'Home', a: 'Journal' }), ['a'])).toBeNull();
  });
});

describe('todaysNote', () => {
  it("is the note whose first line is today's date line", () => {
    const day = 'Sun 18 Oct 2026';
    let b = createBoard();
    ({ board: b } = noteAt(b, 'Sat 17 Oct 2026\n\nyesterday', 0, 0));
    expect(todaysNote(b, day)).toBeNull();
    const t = noteAt(b, `${day}\n\nhello`, 300, 0);
    expect(todaysNote(t.board, day)).toBe(t.id);
    // A date line that only starts the same is another day.
    const o = noteAt(b, 'Sun 18 Oct 20261', 300, 0);
    expect(todaysNote(o.board, day)).toBeNull();
    // A title typed after the date, or a trailing space or Windows line end, is still today's note.
    expect(todaysNote(noteAt(b, `${day} - busy day\n\nx`, 300, 0).board, day)).not.toBeNull();
    expect(todaysNote(noteAt(b, `${day}\r\n\nx`, 300, 0).board, day)).not.toBeNull();
    const bare = noteAt(b, day, 300, 0);
    expect(todaysNote(bare.board, day)).toBe(bare.id);
  });

  it('ignores other kinds of card', () => {
    const card = { ...createCard('todo'), title: 'Sun 18 Oct 2026' };
    expect(todaysNote(addCard(createBoard(), card, { type: 'loose', x: 0, y: 0 }), 'Sun 18 Oct 2026')).toBeNull();
  });
});

describe('journalSpot', () => {
  const none = () => undefined;

  it('puts the new note above the top of the existing blocks, level with the leftmost, clear of all of them', () => {
    let b = createBoard();
    ({ board: b } = noteAt(b, 'a', 100, 200));
    ({ board: b } = noteAt(b, 'b', 400, 300));
    const spot = journalSpot(b, none, { x: 0, y: 0 });
    expect(spot.x).toBe(100);
    expect(spot.y).toBeLessThan(200 - NEW_BLOCK_H.note);
    const rect = { ...spot, w: CARD_W, h: NEW_BLOCK_H.note };
    for (const c of Object.values(b.cards)) expect(overlaps(rect, { x: c.x, y: c.y, w: CARD_W, h: NEW_BLOCK_H.note }, 10)).toBe(false);
  });

  it('keeps stacking upward, day after day', () => {
    let b = createBoard();
    let last = Infinity;
    for (let i = 0; i < 4; i++) {
      const spot = journalSpot(b, none, { x: 0, y: 0 });
      expect(spot.y).toBeLessThan(last);
      last = spot.y;
      ({ board: b } = noteAt(b, `day ${i}`, spot.x, spot.y));
    }
  });

  it('uses the middle of the screen on an empty board', () => {
    const spot = journalSpot(createBoard(), none, { x: 500, y: 400 });
    expect(Math.abs(spot.x + CARD_W / 2 - 500)).toBeLessThanOrEqual(10);
    expect(Math.abs(spot.y + NEW_BLOCK_H.note / 2 - 400)).toBeLessThanOrEqual(10);
  });
});

describe('journalEntries', () => {
  it('lists the dated notes, newest first, with the date line apart from what is written under it', () => {
    let b = createBoard();
    ({ board: b } = noteAt(b, 'Sat 17 Oct 2026\n\nyesterday', 0, 0));
    const today = noteAt(b, 'Sun 18 Oct 2026 - busy\n\nhello', 0, -300);
    b = today.board;
    ({ board: b } = noteAt(b, 'Wed 30 Sep 2026\n\nlast month', 0, 300));
    ({ board: b } = noteAt(b, 'Thu 31 Dec 2025\n\nlast year', 0, 600));
    ({ board: b } = noteAt(b, 'shopping list', 0, 900)); // not a journal entry
    b = addCard(b, { ...createCard('todo'), title: 'Mon 19 Oct 2026' } as Card, { type: 'loose', x: 400, y: 0 });
    const entries = journalEntries(b);
    expect(entries.map((e) => e.date)).toEqual(['Sun 18 Oct 2026 - busy', 'Sat 17 Oct 2026', 'Wed 30 Sep 2026', 'Thu 31 Dec 2025']);
    expect(entries[0]).toEqual({ id: today.id, date: 'Sun 18 Oct 2026 - busy', body: 'hello' });
    // Today's note comes first even when a later day was written ahead (review of job 99).
    expect(journalEntries(b, 'Sat 17 Oct 2026').map((e) => e.date)).toEqual(['Sat 17 Oct 2026', 'Sun 18 Oct 2026 - busy', 'Wed 30 Sep 2026', 'Thu 31 Dec 2025']);
    expect(journalEntries(b, 'Sun 18 Oct 2026')[0].id).toBe(today.id);
  });
});

describe('journalBody / withJournalBody', () => {
  it('splits a note into its date line and the rest, and puts it back the same way', () => {
    for (const [text, body] of [
      ['Sun 18 Oct 2026\n\n', ''],
      ['Sun 18 Oct 2026\n\nhello\nthere', 'hello\nthere'],
      ['Sun 18 Oct 2026\nhello', 'hello'],
      ['Sun 18 Oct 2026', ''],
    ]) {
      expect(journalBody(text)).toBe(body);
      expect(withJournalBody(text, body)).toBe(`Sun 18 Oct 2026\n\n${body}`);
    }
    expect(withJournalBody('Sun 18 Oct 2026\n\n', 'Went for a walk')).toBe('Sun 18 Oct 2026\n\nWent for a walk');
    expect(withJournalBody('Sun 18 Oct 2026 - busy\nold', 'new')).toBe('Sun 18 Oct 2026 - busy\n\nnew');
    expect(journalBody('Sun 18 Oct 2026\r\n\r\nfrom Windows')).toBe('from Windows');
  });

  it('reads back exactly what was written, whatever the note looked like before (review of job 99)', () => {
    for (const text of ['Sun 18 Oct 2026\n\nhi', 'Sun 18 Oct 2026\nfoo', 'Sun 18 Oct 2026', 'Sun 18 Oct 2026\r\n\r\nx', 'Sun 18 Oct 2026 - title\n\n\nspaced']) {
      for (const body of ['', 'new', '\nfoo', '\n\n', 'a\nb', '\r\nx']) {
        const written = withJournalBody(text, body);
        expect(journalBody(written)).toBe(body);
        expect(written.split('\n')[0].trimEnd()).toBe(text.split('\n')[0].trimEnd());
      }
    }
  });
});

describe('hiddenJournal', () => {
  const journal = (extra: (b: Board) => Board = (b) => b): Workspace => {
    const j = noteAt({ ...createBoard(), name: 'Journal' }, 'Sun 18 Oct 2026\n\nhi', 0, 0).board;
    return { home: 'home', boards: { home: createBoard(), j: extra(j) } };
  };

  it('is a Journal board on its own that only holds dated notes', () => {
    expect(hiddenJournal(journal(), [])).toBe('j');
    expect(hiddenJournal({ home: 'home', boards: { home: createBoard(), j: { ...createBoard(), name: 'Journal' } } }, [])).toBe('j');
  });

  it('is not hidden when a card opens it (as Home’s Journal card did), or when it holds anything else', () => {
    const ws = journal();
    const linked: Workspace = { ...ws, boards: { ...ws.boards, home: addCard(createBoard(), createBoardCard('j'), { type: 'loose', x: 0, y: 0 }) } };
    expect(hiddenJournal(linked, [])).toBeNull();
    expect(hiddenJournal(journal((b) => noteAt(b, 'shopping list', 0, 300).board), [])).toBeNull();
    expect(hiddenJournal(journal((b) => addCard(b, createCard('todo'), { type: 'loose', x: 0, y: 300 })), [])).toBeNull();
    expect(hiddenJournal(journal((b) => addCard(b, createBoardCard('home'), { type: 'loose', x: 0, y: 300 })), [])).toBeNull();
  });

  it('is never the home board, nor a shared board', () => {
    expect(hiddenJournal({ home: 'j', boards: { j: { ...createBoard(), name: 'Journal' } } }, [])).toBeNull();
    expect(hiddenJournal(journal(), ['j'])).toBeNull();
  });
});
