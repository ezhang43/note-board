process.env.TZ = 'Australia/Sydney';

import { describe, expect, it } from 'vitest';
import { addCard, createBoard } from './board';
import { createCard } from './cards';
import { HABITS_NAME } from './habits';
import { JOURNAL_NAME } from './journal';
import type { CalEvent } from './calendar';
import type { Board, NoteCard, TodoCard, TodoItem } from './types';
import { weekReview } from './weekReview';
import type { Workspace } from './workspace';

// The weekly review's data (job 7, no screen yet). Weeks run Monday to Sunday, as in the calendar.
// Run in Sydney's time zone, which changes its clocks on Sunday 4 Oct 2026, so the week of 28 Sep
// has that change inside it.

type DoneItem = TodoItem & { doneOn?: string };
const item = (text: string, done: boolean, doneOn?: string, children: DoneItem[] = []): DoneItem => ({ id: `i-${text}`, text, done, children, ...(doneOn ? { doneOn } : {}) });
const list = (title: string, items: DoneItem[]): TodoCard => ({ ...(createCard('todo') as TodoCard), title, items });
const boardWith = (name: string, ...cards: Board['cards'][string][]): Board => cards.reduce((b, c) => addCard(b, c, { type: 'loose', x: 0, y: 0 }), { ...createBoard(), name });
const ws = (...boards: Board[]): Workspace => ({ home: 'b0', boards: Object.fromEntries(boards.map((b, n) => [`b${n}`, b])) });
const event = (id: string, start: string, end: string, allDay = false): CalEvent => ({ id, title: id, allDay, start, end, editable: true, link: '', series: null, guests: [], timeZone: null, moved: false });
const note = (text: string): NoteCard => ({ ...(createCard('note') as NoteCard), text });

const MON = '2026-10-12'; // a Monday

describe('weekReview: the week', () => {
  it('runs Monday to Sunday, whichever day of it is given', () => {
    for (const day of ['2026-10-12', '2026-10-15', '2026-10-18']) {
      expect(weekReview(ws(createBoard()), null, day).week).toEqual({ from: '2026-10-12', to: '2026-10-18' });
    }
    // Sunday belongs to the week that ends on it, not the one that starts after it.
    expect(weekReview(ws(createBoard()), null, '2026-10-19').week).toEqual({ from: '2026-10-19', to: '2026-10-25' });
  });

  it('is seven days in the week the clocks change (Sydney, 4 Oct 2026)', () => {
    const r = weekReview(ws(createBoard()), [], '2026-10-01');
    expect(r.week).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(r.nextWeek!.map((d) => d.day)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  });

  it('is seven days across a year end', () => {
    const r = weekReview(ws(createBoard()), [], '2026-12-30');
    expect(r.week).toEqual({ from: '2026-12-28', to: '2027-01-03' });
    expect(r.nextWeek!.map((d) => d.day)).toEqual(['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08', '2027-01-09', '2027-01-10']);
  });
});

describe('weekReview: done this week', () => {
  const shop = list('Shop', [
    item('before', true, '2026-10-11'), // Sunday of the week before
    item('monday', true, '2026-10-12'),
    item('sunday', true, '2026-10-18'),
    item('after', true, '2026-10-19'), // Monday of the next week
    item('no date', true), // ticked before doneOn existed: not counted
    item('open', false, '2026-10-14'), // unticked later, a stale date: not counted
    item('junk', true, 'last tuesday'),
    item('parent', false, undefined, [item('child', true, '2026-10-15')]),
  ]);

  it('counts ticked items whose doneOn falls in the week, and no others', () => {
    const r = weekReview(ws(boardWith('Home', shop)), null, MON);
    expect(r.done).toHaveLength(1);
    expect(r.done[0].items.map((i) => i.text)).toEqual(['monday', 'sunday', 'child']);
    expect(r.done[0].items[0]).toMatchObject({ cardId: shop.id, cardTitle: 'Shop', itemId: 'i-monday', doneOn: '2026-10-12' });
  });

  it('groups by board, in the Boards menu order, leaving out boards with nothing', () => {
    const a = boardWith('Home', list('A', [item('a1', true, '2026-10-13')]));
    const b = boardWith('Empty', list('B', [item('b1', true, '2026-10-01')]));
    const c = boardWith('Work', list('C', [item('c1', true, '2026-10-14'), item('c2', true, '2026-10-14')]));
    const r = weekReview(ws(a, b, c), null, MON);
    expect(r.done.map((g) => [g.boardId, g.boardName, g.items.length])).toEqual([['b0', 'Home', 1], ['b2', 'Work', 2]]);
  });

  it('counts nothing when no item has a doneOn yet (the field is not saved yet)', () => {
    expect(weekReview(ws(boardWith('Home', list('A', [item('x', true)]))), null, MON).done).toEqual([]);
  });
});

describe('weekReview: habits', () => {
  const walk = (days: string[]): TodoCard => list('Walk', days.map((d, n) => ({ ...item(d, true), id: `d${n}` })));

  it('lists the days ticked this week for each habit, with no streak', () => {
    const habits = boardWith(HABITS_NAME, walk(['2026-10-10', '2026-10-12', '2026-10-14', '2026-10-18', '2026-10-19']));
    const r = weekReview(ws(createBoard(), habits), null, MON);
    expect(r.habits).toHaveLength(1);
    expect(r.habits![0]).toMatchObject({ title: 'Walk', days: ['2026-10-12', '2026-10-14', '2026-10-18'], count: 3 });
    expect(Object.keys(r.habits![0]).some((k) => /streak/i.test(k))).toBe(false);
  });

  it('counts a day ticked twice (two devices) once', () => {
    const habits = boardWith(HABITS_NAME, walk(['2026-10-13', '2026-10-13', '2026-10-13']));
    const h = weekReview(ws(createBoard(), habits), null, MON).habits![0];
    expect(h.days).toEqual(['2026-10-13']);
    expect(h.count).toBe(1);
  });

  it('shows a habit with no ticks this week as 0', () => {
    const habits = boardWith(HABITS_NAME, walk(['2026-09-01']));
    expect(weekReview(ws(createBoard(), habits), null, MON).habits![0]).toMatchObject({ days: [], count: 0 });
  });

  it('counts the week the clocks change as seven days', () => {
    const habits = boardWith(HABITS_NAME, walk(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']));
    expect(weekReview(ws(createBoard(), habits), null, '2026-10-04').habits![0].count).toBe(7);
  });

  it('is null when there is no Habits board, and not confused by a habit on a shared one', () => {
    expect(weekReview(ws(createBoard()), null, MON).habits).toBeNull();
    const habits = boardWith(HABITS_NAME, walk(['2026-10-12']));
    expect(weekReview(ws(createBoard(), habits), null, MON, ['b1']).habits).toBeNull();
  });

  it('keeps habits out of the done items', () => {
    const habits = boardWith(HABITS_NAME, { ...walk(['2026-10-12']), items: [{ ...item('2026-10-12', true, '2026-10-12') }] });
    expect(weekReview(ws(createBoard(), habits), null, MON).done).toEqual([]);
  });
});

describe('weekReview: next week', () => {
  it('is null when there is no calendar (no access, or not signed in)', () => {
    expect(weekReview(ws(createBoard()), null, MON).nextWeek).toBeNull();
  });

  it('groups next week’s events by day, all-day first, and leaves this week’s out', () => {
    const events = [
      event('this', '2026-10-15T09:00', '2026-10-15T10:00'),
      event('late', '2026-10-20T15:00', '2026-10-20T16:00'),
      event('early', '2026-10-20T08:00', '2026-10-20T09:00'),
      event('trip', '2026-10-21', '2026-10-24', true), // 21st to 23rd
      event('after', '2026-10-26T09:00', '2026-10-26T10:00'),
    ];
    const next = weekReview(ws(createBoard()), events, MON).nextWeek!;
    expect(next.map((d) => d.day)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    expect(next[1].events.map((e) => e.id)).toEqual(['early', 'late']);
    expect(next[2].events.map((e) => e.id)).toEqual(['trip']);
    expect(next[4].events.map((e) => e.id)).toEqual(['trip']);
    expect(next[5].events).toEqual([]);
    expect(next[0].events).toEqual([]);
  });

  it('has seven empty days when the calendar is there but empty', () => {
    const next = weekReview(ws(createBoard()), [], MON).nextWeek!;
    expect(next).toHaveLength(7);
    expect(next.every((d) => d.events.length === 0)).toBe(true);
  });

  it('shows an event on the day the clocks change', () => {
    const next = weekReview(ws(createBoard()), [event('x', '2026-10-04T23:30', '2026-10-05T00:30')], '2026-09-28').nextWeek!;
    expect(next[0].events.map((e) => e.id)).toEqual(['x']);
  });
});

describe('weekReview: journal', () => {
  const journal = boardWith(JOURNAL_NAME, note('Sun 11 Oct 2026\nbefore'), note('Mon 12 Oct 2026\na'), note('Wed 14 Oct 2026\nb'), note('Sun 18 Oct 2026\nc'), note('Mon 19 Oct 2026\nafter'), note('not a day'));

  it('counts this week’s dated notes', () => {
    expect(weekReview(ws(createBoard(), journal), null, MON).journalCount).toBe(3);
  });

  it('is 0 with no Journal board, or when its board is a shared one', () => {
    expect(weekReview(ws(createBoard()), null, MON).journalCount).toBe(0);
    expect(weekReview(ws(createBoard(), journal), null, MON, ['b1']).journalCount).toBe(0);
  });
});
