import { describe, expect, it } from 'vitest';
import { addCard, createBoard } from './board';
import { createBoardCard, createCard } from './cards';
import { HABITS_NAME, habitList, hiddenHabits, isHabit, streak, thisWeek, tickedDays, withDay } from './habits';
import type { Board, TodoCard } from './types';
import type { Workspace } from './workspace';

// Habits (owner request, 2026-10-19): daily habits kept on a board called "Habits", one checklist
// card per habit, one item per ticked day ("YYYY-MM-DD", local).

const habit = (title: string, days: string[] = []): TodoCard => ({
  ...(createCard('todo') as TodoCard),
  title,
  items: days.map((d, i) => ({ id: `i${i}${d}`, text: d, done: true, children: [] })),
});
const boardWith = (...cards: TodoCard[]): Board => cards.reduce((b, c) => addCard(b, c, { type: 'loose', x: 0, y: 0 }), { ...createBoard(), name: HABITS_NAME });

describe('habits', () => {
  it('a habit is a checklist whose items are all ticked days', () => {
    expect(isHabit(habit('Walk'))).toBe(true);
    expect(isHabit(habit('Walk', ['2026-10-19']))).toBe(true);
    // A checklist loads with one blank item when it has none, so a habit with no ticks comes back so.
    const blank = { id: 'b', text: '', done: false, children: [] };
    const loaded = { ...habit('Walk', ['2026-10-19']), items: [blank, ...habit('', ['2026-10-19']).items] };
    expect(isHabit(loaded)).toBe(true);
    expect([...tickedDays(loaded)]).toEqual(['2026-10-19']);
    expect(withDay(withDay(loaded, '2026-10-19', false), '2026-10-18', true).items.map((i) => i.text)).toEqual(['', '2026-10-18']);
    // A day unticked on the board itself (open the Habits board, untick an item) is not a tick, but still a habit.
    const unticked = { ...habit('Walk', ['2026-10-19']), items: [{ id: 'u', text: '2026-10-18', done: false, children: [] }, ...habit('', ['2026-10-19']).items] };
    expect(isHabit(unticked)).toBe(true);
    expect([...tickedDays(unticked)]).toEqual(['2026-10-19']);
    expect([...tickedDays(withDay(unticked, '2026-10-18', true))].sort()).toEqual(['2026-10-18', '2026-10-19']);
    // Ticking it again ticks that same item rather than adding a second one.
    expect(withDay(unticked, '2026-10-18', true).items.filter((i) => i.text === '2026-10-18')).toEqual([{ id: 'u', text: '2026-10-18', done: true, children: [] }]);
    expect(withDay(unticked, '2026-10-18', false)).toBe(unticked); // not ticked: unchanged
    const other = createCard('todo') as TodoCard;
    expect(isHabit({ ...other, items: [{ ...other.items[0], text: 'buy milk' }] })).toBe(false);
    expect(isHabit(createCard('note'))).toBe(false);
  });

  it('lists the habits in board order, leaving other cards out', () => {
    const a = habit('A');
    const b = habit('B');
    const board = addCard(boardWith(a, b), createCard('note'), { type: 'loose', x: 0, y: 0 });
    expect(habitList(board).map((h) => h.title)).toEqual(['A', 'B']);
  });

  it('ticked days are counted once, even when two devices ticked the same day', () => {
    expect([...tickedDays(habit('A', ['2026-10-19', '2026-10-19', '2026-10-18']))].sort()).toEqual(['2026-10-18', '2026-10-19']);
  });

  it('ticking adds one day; unticking removes every copy of it', () => {
    const h = habit('A', ['2026-10-19', '2026-10-19']);
    const off = withDay(h, '2026-10-19', false);
    expect(off.items).toEqual([]);
    const on = withDay(off, '2026-10-17', true);
    expect(on.items.map((i) => [i.text, i.done, i.children])).toEqual([['2026-10-17', true, []]]);
    expect(withDay(on, '2026-10-17', true)).toBe(on); // already ticked: unchanged
  });

  it('this week is Monday to Sunday', () => {
    expect(thisWeek('2026-10-19')).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    expect(thisWeek('2026-10-25')[0]).toBe('2026-10-19');
    expect(thisWeek('2026-11-01')[0]).toBe('2026-10-26');
  });

  it('the streak counts days in a row up to today, or up to yesterday while today is not ticked yet', () => {
    const days = (...d: string[]) => new Set(d);
    expect(streak(days(), '2026-10-19')).toBe(0);
    expect(streak(days('2026-10-19'), '2026-10-19')).toBe(1);
    expect(streak(days('2026-10-17', '2026-10-18', '2026-10-19'), '2026-10-19')).toBe(3);
    expect(streak(days('2026-10-17', '2026-10-18'), '2026-10-19')).toBe(2); // today not yet ticked
    expect(streak(days('2026-10-16', '2026-10-18', '2026-10-19'), '2026-10-19')).toBe(2); // a gap ends it
    expect(streak(days('2026-10-17'), '2026-10-19')).toBe(0); // missed yesterday
    expect(streak(days('2026-10-20'), '2026-10-19')).toBe(0); // a day ahead doesn't count
    // Across a month end and the clocks going back (25 Oct 2026 in Europe).
    expect(streak(days('2026-09-30', '2026-10-01'), '2026-10-01')).toBe(2);
    expect(streak(days('2026-10-24', '2026-10-25', '2026-10-26'), '2026-10-26')).toBe(3);
  });

  it('the Habits board is hidden only while it holds nothing but habits and no card opens it', () => {
    const board = boardWith(habit('A'));
    const ws: Workspace = { home: 'home', boards: { home: createBoard(), h: board } };
    expect(hiddenHabits(ws, [])).toBe('h');
    expect(hiddenHabits(ws, ['h'])).toBeNull(); // a share holds it
    expect(hiddenHabits({ ...ws, boards: { ...ws.boards, h: addCard(board, createCard('note'), { type: 'loose', x: 0, y: 0 }) } }, [])).toBeNull();
    const opened = addCard(createBoard(), createBoardCard('h'), { type: 'loose', x: 0, y: 0 });
    expect(hiddenHabits({ ...ws, boards: { ...ws.boards, home: opened } }, [])).toBeNull();
    expect(hiddenHabits({ home: 'h', boards: { h: board } }, [])).toBeNull(); // never the home board
  });
});
