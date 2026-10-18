import { describe, expect, it } from 'vitest';
import { addCard, createBoard } from './board';
import { createCard } from './cards';
import { CARD_W, NEW_BLOCK_H } from './constants';
import { findJournalBoard, journalDateLine, journalSpot, todaysNote } from './journal';
import { overlaps } from './geometry';
import type { Board } from './types';
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
