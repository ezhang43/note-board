import { describe, expect, it } from 'vitest';
import { addCard, createBoard } from './board';
import { createBoardCard, createCard } from './cards';
import { CARD_W, NEW_BLOCK_H } from './constants';
import { JOURNAL_NOTES, UNTITLED_NOTE, addGeneralNote, cleanNoteName, deleteGeneralNote, findJournalBoard, generalNotes, generalSpot, generalSpotBelow, noteName, readsAsDay, renameGeneralNote, groupJournal, hiddenJournal, isGroupOpen, journalBody, journalDateLine, journalDayKey, isoWeek, journalEntries, journalLongDate, journalPeek, journalWords, journalSpot, openToday, parseJournalOpen, todaysNote, toggleGroup, withJournalBody } from './journal';
import { dayKey as calendarDayKey } from './calendar';
import { dayKey as completedDayKey } from './completed';
import { overlaps } from './geometry';
import type { Board, Card, NoteCard } from './types';
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

describe('the saved date line (job #156 guard)', () => {
  // The Journal's saved first line is made by the calendar's day label and read back by journal.ts's
  // own pattern. If either changes alone, every saved note stops being found, so pin both ends.
  it('is exactly this text, with no padding or comma', () => {
    expect(journalDateLine(new Date(2026, 9, 18, 12))).toBe('Sun 18 Oct 2026');
    expect(journalDateLine(new Date(2026, 0, 1, 12))).toBe('Thu 1 Jan 2026');
    expect(journalDateLine(new Date(2028, 1, 29, 12))).toBe('Tue 29 Feb 2028');
  });

  it('is read back as the same day, and kept as an entry, for every day from 2024 to 2030', () => {
    let n = 0;
    for (let d = new Date(2024, 0, 1, 12); d.getFullYear() < 2031; d.setDate(d.getDate() + 1), n++) {
      const line = journalDateLine(d);
      expect(journalDayKey(line)).toBe(calendarDayKey(d));
      expect(completedDayKey(d)).toBe(calendarDayKey(d)); // the two copies of dayKey agree
      const { board } = noteAt(createBoard(), `${line}\n\nx`, 0, 0);
      expect(journalEntries(board).length).toBe(1);
    }
    expect(n).toBe(2557);
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

describe('journalPeek', () => {
  it('is the first line with words in what is written under the date, trimmed', () => {
    expect(journalPeek('Went for a walk\nthen lunch')).toBe('Went for a walk');
    expect(journalPeek('  Went for a walk  \r\nthen lunch')).toBe('Went for a walk');
    expect(journalPeek('\n\n  • first item\n• second')).toBe('• first item');
    // A divider line is not words (review of the divider).
    expect(journalPeek('---\nWent for a walk')).toBe('Went for a walk');
  });
  it('is empty when nothing is written', () => {
    expect(journalPeek('')).toBe('');
    expect(journalPeek(' \n\t\n ')).toBe('');
  });
});

// Journal redesign (owner pick, 2026-10-22, jobs 166 + 167): the heading, week number and word count of today's page.
describe('journal page heading', () => {
  it('writes the day as a heading, weekday first', () => {
    expect(journalLongDate('2026-10-21')).toBe('Wednesday, 21 October');
    expect(journalLongDate('2026-01-05')).toBe('Monday, 5 January');
    expect(journalLongDate('2028-02-29')).toBe('Tuesday, 29 February');
  });

  it('numbers the week the ISO way: Monday first, week 1 holds the first Thursday', () => {
    expect(isoWeek('2026-10-21')).toBe(43);
    expect(isoWeek('2026-10-19')).toBe(43);
    expect(isoWeek('2026-10-18')).toBe(42);
    expect(isoWeek('2026-01-01')).toBe(1);
    expect(isoWeek('2027-01-01')).toBe(53); // still 2026's last week
    expect(isoWeek('2027-01-04')).toBe(1);
    expect(isoWeek('2024-12-30')).toBe(1); // already 2025's first week
  });

  it('counts the words in what is written, not the date line', () => {
    expect(journalWords('')).toBe(0);
    expect(journalWords('  \n ')).toBe(0);
    expect(journalWords('Quiet start.\n\n• Sam’s soup\n1.  Ten  quiet minutes')).toBe(7);
    // A divider's line (---) is not a word (owner decision 2026-10-31).
    expect(journalWords('one\n---\ntwo -- three')).toBe(4);
  });
});

// General notes (owner request, 2026-10-29): one note on the Journal board, first line "General notes", never a day.

/** The first general note, or null. */
const firstGeneral = (b: Board): string | null => generalNotes(b)[0] ?? null;

describe('the first general note', () => {
  it('is the note whose first line is exactly "General notes"', () => {
    let b = createBoard();
    ({ board: b } = noteAt(b, 'Sun 18 Oct 2026\n\nhi', 0, 0));
    expect(firstGeneral(b)).toBeNull();
    const g = noteAt(b, `${JOURNAL_NOTES}\n\nmy list`, 300, 0);
    expect(firstGeneral(g.board)).toBe(g.id);
    expect(firstGeneral(noteAt(b, 'General notes\r\n\nx', 300, 0).board)).not.toBeNull();
    // Anything else on the first line is an ordinary note.
    expect(firstGeneral(noteAt(b, 'General notes about cats', 300, 0).board)).toBeNull();
    expect(firstGeneral(noteAt(b, 'general notes', 300, 0).board)).toBeNull();
    expect(firstGeneral(addCard(b, { ...createCard('todo'), title: JOURNAL_NOTES } as Card, { type: 'loose', x: 300, y: 0 }))).toBeNull();
  });

  it('is never a day, and a day is never it', () => {
    const g = noteAt(createBoard(), `${JOURNAL_NOTES}\n\nSun 18 Oct 2026`, 0, 0);
    expect(journalEntries(g.board)).toEqual([]);
    expect(groupJournal(journalEntries(g.board), '2026-10-18')).toEqual([]);
    const d = noteAt(createBoard(), 'Sun 18 Oct 2026\n\nGeneral notes', 0, 0);
    expect(firstGeneral(d.board)).toBeNull();
  });

  it('with two (two devices, or a copy), the same one everywhere: the smaller id', () => {
    let b = createBoard();
    b = addCard(b, { ...createCard('note', 'k-b'), text: `${JOURNAL_NOTES}\n\nb` } as Card, { type: 'loose', x: 0, y: 0 });
    b = addCard(b, { ...createCard('note', 'k-a'), text: `${JOURNAL_NOTES}\n\na` } as Card, { type: 'loose', x: 0, y: 300 });
    expect(firstGeneral(b)).toBe('k-a');
  });
});

describe('the general notes and the Journal board', () => {
  const journal = (extra: (b: Board) => Board = (b) => b): Workspace => {
    const j = noteAt({ ...createBoard(), name: 'Journal' }, 'Sun 18 Oct 2026\n\nhi', 0, 0).board;
    return { home: 'home', boards: { home: createBoard(), j: extra(j) } };
  };

  it('keeps the Journal board hidden', () => {
    expect(hiddenJournal(journal((b) => noteAt(b, `${JOURNAL_NOTES}\n\nlist`, 400, 0).board), [])).toBe('j');
    expect(hiddenJournal({ home: 'home', boards: { home: createBoard(), j: noteAt({ ...createBoard(), name: 'Journal' }, `${JOURNAL_NOTES}\n\n`, 0, 0).board } }, [])).toBe('j');
  });

  it('a second general notes card is something else on it, so the board is listed (nothing is out of sight)', () => {
    const two = journal((b) => noteAt(noteAt(b, `${JOURNAL_NOTES}\n\none`, 400, 0).board, `${JOURNAL_NOTES}\n\ntwo`, 400, 300).board);
    expect(hiddenJournal(two, [])).toBeNull();
  });

  it("today's note still goes straight above the dated notes, level with the leftmost, wherever the general notes are", () => {
    const none = () => undefined;
    let b = createBoard();
    ({ board: b } = noteAt(b, 'Sat 17 Oct 2026\n\nx', 100, 200));
    ({ board: b } = noteAt(b, `${JOURNAL_NOTES}\n\nlist`, -400, -600));
    const spot = journalSpot(b, none, { x: 0, y: 0 });
    expect(spot.x).toBe(100);
    expect(spot.y).toBeLessThan(200 - NEW_BLOCK_H.note);
    expect(spot.y).toBeGreaterThan(-200);
  });

  it('goes to the right of everything, level with the top, clear of all of it', () => {
    const none = () => undefined;
    let b = createBoard();
    ({ board: b } = noteAt(b, 'Sat 17 Oct 2026\n\nx', 100, 200));
    ({ board: b } = noteAt(b, 'Sun 18 Oct 2026\n\ny', 100, 40));
    const spot = generalSpot(b, none, { x: 0, y: 0 });
    expect(spot.x).toBeGreaterThan(100 + CARD_W);
    expect(spot.y).toBe(40);
    const rect = { ...spot, w: CARD_W, h: NEW_BLOCK_H.note };
    for (const c of Object.values(b.cards)) expect(overlaps(rect, { x: c.x, y: c.y, w: CARD_W, h: NEW_BLOCK_H.note }, 10)).toBe(false);
  });
});

// Several general notes, each with a name (owner request, 2026-11-10). The first line is the name; a
// note added or renamed in the panel carries `general` (its place in the list), so a renamed note is
// still known. A board saved before this has one "General notes" note and no `general` field.
describe('several general notes', () => {
  const none = () => undefined;
  const legacy = () => {
    let b = createBoard();
    ({ board: b } = noteAt(b, 'Sun 18 Oct 2026\n\nday', 0, 0));
    const g = noteAt(b, `${JOURNAL_NOTES}\n\nmy list`, 400, 0);
    return { board: g.board, id: g.id };
  };
  const untitled = (id: string) => ({ ...createCard('note', id), text: `${UNTITLED_NOTE}\n\n` }) as NoteCard;
  const names = (b: Board) => generalNotes(b).map((id) => noteName((b.cards[id] as NoteCard).text));

  it('a board saved before this loads with its one "General notes" note, unchanged, and nothing else', () => {
    const { board, id } = legacy();
    expect(generalNotes(board)).toEqual([id]);
    expect(firstGeneral(board)).toBe(id);
    expect(board.cards[id]).not.toHaveProperty('general');
    expect(noteName((board.cards[id] as NoteCard).text)).toBe('General notes');
  });

  it('once they have places, another note named "General notes" (a stray copy) stays an ordinary note', () => {
    const { board, id } = legacy();
    const stray = noteAt(board, `${JOURNAL_NOTES}\n\nstray`, 800, 0);
    // Before: the smaller id is the general note, as before.
    expect(generalNotes(stray.board)).toHaveLength(1);
    const first = generalNotes(stray.board)[0];
    const renamed = renameGeneralNote(stray.board, first, 'Ideas');
    expect(generalNotes(renamed)).toEqual([first]);
    expect(names(renamed)).toEqual(['Ideas']);
    expect([id, stray.id]).toContain(first);
  });

  it('adds "Untitled note" right below the one it is added from, numbering them all in order', () => {
    const { board, id } = legacy();
    const one = addGeneralNote(board, id, untitled('n-z'), { x: 400, y: 300 });
    expect(generalNotes(one)).toEqual([id, 'n-z']);
    expect(names(one)).toEqual(['General notes', 'Untitled note']);
    // The first keeps its text; both now carry their place.
    expect((one.cards[id] as NoteCard).text).toBe(`${JOURNAL_NOTES}\n\nmy list`);
    expect((one.cards[id] as NoteCard).general).toBe(1);
    expect((one.cards['n-z'] as NoteCard).general).toBe(2);
    // Added from the first again: between the two, whatever the ids.
    const two = addGeneralNote(one, id, untitled('n-a'), { x: 400, y: 600 });
    expect(generalNotes(two)).toEqual([id, 'n-a', 'n-z']);
    expect(two.order).toContain('n-a');
    // From one that isn't a general note: nothing.
    expect(addGeneralNote(one, 'nope', untitled('n-b'), { x: 0, y: 0 })).toBe(one);
  });

  it('renames a note: only its first line changes; an empty name is "Untitled note"; the same name changes nothing', () => {
    const { board, id } = legacy();
    const renamed = renameGeneralNote(board, id, '  Recipes  ');
    expect((renamed.cards[id] as NoteCard).text).toBe('Recipes\n\nmy list');
    // Still a general note after its first line changed.
    expect(generalNotes(renamed)).toEqual([id]);
    expect(names(renameGeneralNote(board, id, '   '))).toEqual(['Untitled note']);
    expect(names(renameGeneralNote(board, id, 'two\nlines'))).toEqual(['two lines']);
    expect(renameGeneralNote(board, id, 'General notes')).toBe(board);
    expect(renameGeneralNote(board, 'nope', 'x')).toBe(board);
  });

  it('keeps the formatting of what is written when renamed', () => {
    const { board, id } = legacy();
    const rich = [{ type: 'p' as const, runs: [{ text: 'my list', b: true as const }] }];
    const withRich = { ...board, cards: { ...board.cards, [id]: { ...(board.cards[id] as NoteCard), rich } } };
    expect((renameGeneralNote(withRich, id, 'Ideas').cards[id] as NoteCard).rich).toEqual(rich);
  });

  it('deletes one, but never the last', () => {
    const { board, id } = legacy();
    expect(deleteGeneralNote(board, id)).toBe(board);
    const two = addGeneralNote(board, id, untitled('n-z'), { x: 400, y: 300 });
    const gone = deleteGeneralNote(two, id);
    expect(generalNotes(gone)).toEqual(['n-z']);
    expect(gone.cards[id]).toBeUndefined();
    expect(gone.order).not.toContain(id);
    expect(deleteGeneralNote(gone, 'n-z')).toBe(gone);
    // Only general notes: a day is never deleted this way.
    const day = Object.keys(two.cards).find((k) => !generalNotes(two).includes(k))!;
    expect(deleteGeneralNote(two, day)).toBe(two);
  });

  it("a general note is never a day, even named like one, and is left out where today's note goes", () => {
    const { board, id } = legacy();
    const dated = renameGeneralNote(board, id, 'Sun 18 Oct 2026');
    expect(journalEntries(dated).map((e) => e.body)).toEqual(['day']);
    expect(todaysNote(dated, 'Sun 18 Oct 2026')).not.toBe(id);
    const two = addGeneralNote(board, id, untitled('n-z'), { x: -800, y: -900 });
    const spot = journalSpot(two, none, { x: 0, y: 0 });
    expect(spot.x).toBe(0);
  });

  it('keeps the Journal board hidden with several, and an ordinary note still lists it', () => {
    const { board, id } = legacy();
    const ws = (b: Board): Workspace => ({ home: 'home', boards: { home: createBoard(), j: { ...b, name: 'Journal' } } });
    const two = addGeneralNote(board, id, untitled('n-z'), { x: 400, y: 300 });
    expect(hiddenJournal(ws(two), [])).toBe('j');
    expect(hiddenJournal(ws(noteAt(two, 'Ordinary note', 900, 0).board), [])).toBeNull();
  });

  it('an older app, which drops the field, keeps every note and its text: the extra ones become ordinary notes on the board', () => {
    const { board, id } = legacy();
    const two = renameGeneralNote(addGeneralNote(board, id, untitled('n-z'), { x: 400, y: 300 }), 'n-z', 'Recipes');
    const strip = (b: Board): Board => ({
      ...b,
      cards: Object.fromEntries(
        Object.entries(b.cards).map(([k, c]) => {
          if (c.kind !== 'note') return [k, c];
          const { general: _g, ...rest } = c;
          return [k, rest];
        }),
      ),
    });
    const old = strip(two);
    expect(Object.keys(old.cards).sort()).toEqual(Object.keys(two.cards).sort());
    expect((old.cards['n-z'] as NoteCard).text).toBe('Recipes\n\n');
    // The note still named "General notes" is found again; the other is an ordinary note.
    expect(generalNotes(old)).toEqual([id]);
  });

  it('places a new one below the one given or, without it, beside everything', () => {
    const { board, id } = legacy();
    const below = generalSpotBelow(board, id, none, { x: 0, y: 0 });
    expect(below.x).toBe(400);
    expect(below.y).toBeGreaterThan(NEW_BLOCK_H.note);
    expect(generalSpotBelow(board, 'missing', none, { x: 0, y: 0 })).toEqual(generalSpot(board, none, { x: 0, y: 0 }));
  });

  it('cleanNoteName: one line, trimmed, never empty', () => {
    expect(cleanNoteName('')).toBe(UNTITLED_NOTE);
    expect(cleanNoteName(' a\r\n b ')).toBe('a b');
  });
  // An older app drops the places (2026-11-10 follow-up): the ids this device saw as general notes
  // (`known`) find them again, in their order, and the next add, rename or delete writes the places back.
  const stripped = () => {
    const { board, id } = legacy();
    let b = addGeneralNote(board, id, untitled('n-b'), { x: 400, y: 300 });
    b = addGeneralNote(b, 'n-b', untitled('n-c'), { x: 400, y: 600 });
    b = renameGeneralNote(renameGeneralNote(b, 'n-b', 'Recipes'), 'n-c', 'Tue 10 Nov 2026');
    const ids = generalNotes(b);
    const drop = (c: Card): Card => {
      if (c.kind !== 'note') return c;
      const { general: _g, ...rest } = c;
      return rest;
    };
    const old: Board = { ...b, cards: Object.fromEntries(Object.entries(b.cards).map(([k, c]) => [k, drop(c)])) };
    return { old, ids, id };
  };

  it('an older save without places: the notes this device knew are general notes again, in their order, words untouched', () => {
    const { old, ids, id } = stripped();
    expect(ids).toEqual([id, 'n-b', 'n-c']);
    expect(generalNotes(old)).toEqual([id]);
    expect(generalNotes(old, ids)).toEqual(ids);
    // Known ids that are gone are skipped.
    expect(generalNotes(old, ['gone', ...ids])).toEqual(ids);
    // A "General notes" note it didn't know comes first.
    expect(generalNotes(old, ['n-b'])).toEqual([id, 'n-b']);
    // Once any note has a place again, what was known doesn't matter.
    const placed = renameGeneralNote(old, 'n-b', 'Recipes 2', ids);
    expect(generalNotes(placed)).toEqual(ids);
    expect(ids.map((k) => (placed.cards[k] as NoteCard).general)).toEqual([1, 2, 3]);
    expect((placed.cards[id] as NoteCard).text).toBe(`${JOURNAL_NOTES}\n\nmy list`);
    expect((placed.cards['n-c'] as NoteCard).text).toBe(`Tue 10 Nov 2026\n\n`);
  });

  it('adding and deleting with what was known write the places back too', () => {
    const { old, ids, id } = stripped();
    const added = addGeneralNote(old, 'n-c', untitled('n-d'), { x: 400, y: 900 }, ids);
    expect(generalNotes(added)).toEqual([...ids, 'n-d']);
    const gone = deleteGeneralNote(old, 'n-b', ids);
    expect(gone.cards['n-b']).toBeUndefined();
    expect(generalNotes(gone, ids)).toEqual([id, 'n-c']);
  });

  it('a general note named like a date line is never taken for that day, with its place or once it has lost it', () => {
    const { old, ids } = stripped();
    const withPlaces = renameGeneralNote(old, 'n-b', 'Recipes!', ids);
    const day = noteAt(withPlaces, 'Tue 10 Nov 2026\n\nreal day', 0, 900);
    expect(journalEntries(day.board).map((e) => e.id)).not.toContain('n-c');
    expect(todaysNote(day.board, 'Tue 10 Nov 2026')).toBe(day.id);
    // Without places, what was known keeps it out of the days.
    const oldDay = noteAt(old, 'Tue 10 Nov 2026\n\nreal day', 0, 900);
    expect(journalEntries(oldDay.board, '', ids).map((e) => e.id)).not.toContain('n-c');
    expect(todaysNote(oldDay.board, 'Tue 10 Nov 2026', ids)).toBe(oldDay.id);
  });

  it('readsAsDay: a first line the panel would take for a day', () => {
    expect(readsAsDay('Tue 10 Nov 2026')).toBe(true);
    expect(readsAsDay('Tue 10 Nov 2026 trip\n\nx')).toBe(true);
    expect(readsAsDay('Recipes')).toBe(false);
    expect(readsAsDay(`${JOURNAL_NOTES}\n\n`)).toBe(false);
  });
});
