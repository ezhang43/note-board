import { describe, expect, it } from 'vitest';
import { addCard, createBoard } from './board';
import { createBoardCard, createCard } from './cards';
import { CARD_W, NEW_BLOCK_H } from './constants';
import { findJournalBoard, groupJournal, hiddenJournal, isGroupOpen, journalBody, journalDateLine, journalDayKey, journalEntries, journalSpot, openToday, parseJournalOpen, todaysNote, toggleGroup, withJournalBody } from './journal';
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

// Entries grouped Year > Month > Week, shut by default except where today is (owner request, 2026-10-19).

const line = (date: string) => ({ id: date, date });
const WED = '2026-10-14'; // a Wednesday: its week is Mon 12 to Sun 18 Oct

describe('journalDayKey', () => {
  it('reads the day from a date line, with or without a title after it', () => {
    expect(journalDayKey('Wed 14 Oct 2026')).toBe('2026-10-14');
    expect(journalDayKey('Thu 1 Jan 2026 - new year')).toBe('2026-01-01');
    expect(journalDayKey('shopping')).toBeNull();
  });
});

describe('groupJournal', () => {
  it('groups by year, then month, then Monday-to-Sunday week, newest first', () => {
    const years = groupJournal(['Wed 14 Oct 2026', 'Tue 13 Oct 2026', 'Fri 9 Oct 2026', 'Thu 1 Jan 2026', 'Wed 31 Dec 2025'].map(line));
    expect(years.map((y) => y.label)).toEqual(['2026', '2025']);
    expect(years[0].months.map((m) => m.label)).toEqual(['October', 'January']);
    const oct = years[0].months[0].weeks;
    expect(oct.map((w) => [w.label, w.entries.map((e) => e.date)])).toEqual([
      ['12–18 Oct', ['Wed 14 Oct 2026', 'Tue 13 Oct 2026']],
      ['5–11 Oct', ['Fri 9 Oct 2026']],
    ]);
  });

  it('splits a week that spans two months, each month listing its own days', () => {
    // Mon 28 Sep to Sun 4 Oct 2026.
    const years = groupJournal(['Sun 4 Oct 2026', 'Wed 30 Sep 2026', 'Mon 28 Sep 2026'].map(line));
    const [oct, sep] = years[0].months;
    expect([oct.label, oct.weeks.map((w) => [w.label, w.entries.map((e) => e.date)])]).toEqual(['October', [['1–4 Oct', ['Sun 4 Oct 2026']]]]);
    expect([sep.label, sep.weeks.map((w) => [w.label, w.entries.map((e) => e.date)])]).toEqual(['September', [['28–30 Sep', ['Wed 30 Sep 2026', 'Mon 28 Sep 2026']]]]);
    expect(oct.weeks[0].id).not.toBe(sep.weeks[0].id);
  });

  it('splits a week across New Year between two years', () => {
    // Mon 29 Dec 2025 to Sun 4 Jan 2026.
    const years = groupJournal(['Sun 4 Jan 2026', 'Wed 31 Dec 2025'].map(line));
    expect(years.map((y) => [y.label, y.months[0].label, y.months[0].weeks[0].label])).toEqual([
      ['2026', 'January', '1–4 Jan'],
      ['2025', 'December', '29–31 Dec'],
    ]);
  });

  it('keeps one group per month and week however the entries are ordered, and never drops one', () => {
    // Today first, a day written ahead next (as journalEntries lists them), then the past.
    const entries = ['Wed 14 Oct 2026', 'Mon 2 Nov 2026', 'Tue 13 Oct 2026', 'Fri 1 Jan 2100', 'Tue 13 Oct 2026'].map((d, i) => ({ id: `${i}`, date: d }));
    const years = groupJournal(entries);
    expect(years.map((y) => y.label)).toEqual(['2100', '2026']);
    expect(years[1].months.map((m) => m.label)).toEqual(['November', 'October']);
    expect(years[1].months[1].weeks[0].entries.map((e) => e.id)).toEqual(['0', '2', '4']);
  });

  it('names a week by one day when only one of its days is in the month', () => {
    // Mon 26 Oct to Sun 1 Nov 2026.
    const [y] = groupJournal(['Sun 1 Nov 2026', 'Mon 26 Oct 2026'].map(line));
    expect(y.months.map((m) => m.weeks.map((w) => w.label))).toEqual([['1 Nov'], ['26\u201331 Oct']]);
  });

  it("puts today's year, month, week and day first even when days are written ahead; the rest stay newest first", () => {
    // Today is Wed 14 Oct 2026. Ahead: the same week, a later week, a later month, a later year.
    const days = ['Fri 1 Jan 2100', 'Mon 2 Nov 2026', 'Mon 26 Oct 2026', 'Sun 18 Oct 2026', 'Wed 14 Oct 2026', 'Tue 13 Oct 2026', 'Fri 9 Oct 2026', 'Thu 1 Jan 2026', 'Wed 31 Dec 2025'];
    const years = groupJournal(days.map(line), WED);
    expect(years.map((y) => y.label)).toEqual(['2026', '2100', '2025']);
    expect(years[0].months.map((m) => m.label)).toEqual(['October', 'November', 'January']);
    expect(years[0].months[0].weeks.map((w) => w.label)).toEqual(['12–18 Oct', '26–31 Oct', '5–11 Oct']);
    expect(years[0].months[0].weeks[0].entries.map((e) => e.date)).toEqual(['Wed 14 Oct 2026', 'Sun 18 Oct 2026', 'Tue 13 Oct 2026']);
  });

  it('keeps newest first without today, or when today has no entry', () => {
    const days = ['Mon 2 Nov 2026', 'Fri 9 Oct 2026', 'Thu 1 Jan 2026'];
    expect(groupJournal(days.map(line)).map((y) => y.months.map((m) => m.label))).toEqual([['November', 'October', 'January']]);
    expect(groupJournal(days.map(line), '2027-03-03').map((y) => y.label)).toEqual(['2026']);
  });

  it('is empty with no entries', () => {
    expect(groupJournal([])).toEqual([]);
  });
});

describe('which groups are open', () => {
  it('opens only the current year, month and week by default', () => {
    const [year] = groupJournal(['Wed 14 Oct 2026', 'Fri 9 Oct 2026', 'Thu 1 Jan 2026', 'Wed 31 Dec 2025'].map(line));
    const [oct, jan] = year.months;
    const open = (id: string) => isGroupOpen({}, id, WED);
    expect([year.id, oct.id, oct.weeks[0].id].map(open)).toEqual([true, true, true]);
    expect(open(oct.weeks[1].id)).toBe(false);
    expect(open(jan.id)).toBe(false);
    expect(open(groupJournal([line('Wed 31 Dec 2025')])[0].id)).toBe(false);
  });

  it('on a split week, only the month holding today opens (today is visible)', () => {
    // Today is Thu 1 Oct 2026: its week began Mon 28 Sep, so September holds the other part of it.
    const years = groupJournal(['Thu 1 Oct 2026', 'Tue 29 Sep 2026'].map(line));
    const [oct, sep] = years[0].months;
    expect(isGroupOpen({}, oct.weeks[0].id, '2026-10-01')).toBe(true);
    expect(isGroupOpen({}, oct.id, '2026-10-01')).toBe(true);
    expect(isGroupOpen({}, sep.id, '2026-10-01')).toBe(false);
    expect(isGroupOpen({}, sep.weeks[0].id, '2026-10-01')).toBe(false);
  });

  it("on New Year's Day, the new year, month and week are open and the old year is shut", () => {
    const [y26, y25] = groupJournal(['Thu 1 Jan 2026', 'Wed 31 Dec 2025'].map(line));
    expect([y26.id, y26.months[0].id, y26.months[0].weeks[0].id].map((id) => isGroupOpen({}, id, '2026-01-01'))).toEqual([true, true, true]);
    expect([y25.id, y25.months[0].id, y25.months[0].weeks[0].id].map((id) => isGroupOpen({}, id, '2026-01-01'))).toEqual([false, false, false]);
  });

  it('a remembered choice beats the default, either way', () => {
    const [year] = groupJournal(['Wed 14 Oct 2026', 'Thu 1 Jan 2026'].map(line));
    const [oct, jan] = year.months;
    expect(isGroupOpen({ [oct.id]: false }, oct.id, WED)).toBe(false);
    expect(isGroupOpen({ [jan.id]: true }, jan.id, WED)).toBe(true);
  });

  it('toggling flips a group and keeps only the choices that differ from the default', () => {
    const [year] = groupJournal(['Wed 14 Oct 2026', 'Thu 1 Jan 2026'].map(line));
    const [oct, jan] = year.months;
    const opened = toggleGroup({}, jan.id, WED);
    expect(opened).toEqual({ [jan.id]: true });
    expect(toggleGroup(opened, jan.id, WED)).toEqual({});
    const shut = toggleGroup(opened, oct.id, WED);
    expect(shut).toEqual({ [jan.id]: true, [oct.id]: false });
    expect(toggleGroup(shut, oct.id, WED)).toEqual({ [jan.id]: true });
    // The input is not changed.
    expect(opened).toEqual({ [jan.id]: true });
  });

  it("opening the panel opens today's groups again, and leaves other choices alone", () => {
    const [year] = groupJournal(['Wed 14 Oct 2026', 'Thu 1 Jan 2026'].map(line));
    const [oct, jan] = year.months;
    const saved = { [year.id]: false, [oct.id]: false, [oct.weeks[0].id]: false, [jan.id]: true };
    expect(openToday(saved, WED)).toEqual({ [jan.id]: true });
  });
});

describe('parseJournalOpen', () => {
  it('reads what was saved', () => {
    expect(parseJournalOpen('{"2026":true,"2026-10":false,"2026-10/2026-10-12":true}')).toEqual({ '2026': true, '2026-10': false, '2026-10/2026-10-12': true });
  });

  it('falls back to no choices (the defaults) for missing or bad data', () => {
    for (const raw of [null, '', 'nope', '[]', '"x"', '5', 'null', '{"a":1}', '{"2026":"yes"}']) expect(parseJournalOpen(raw)).toEqual({});
  });

  it('keeps the good choices and drops the bad ones', () => {
    expect(parseJournalOpen('{"2026":true,"2026-10":"yes","junk":true,"__proto__":true,"2025-01/x":false}')).toEqual({ '2026': true });
  });
});
