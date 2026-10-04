import { describe, expect, it } from 'vitest';
import { addCard, addColumn, createBoard } from './board';
import { createCard, createColumn } from './cards';
import { parseBoard, serializeBoard } from './persist';
import type { Board, TodoCard, TodoItem } from './types';
import { addDays, dueItems, dueLabel, dueState, isDueDate, withDue } from './due';

// Due dates on checklist items, and the Due today / Overdue list (owner request, 2026-10-05).

const item = (id: string, text: string, due?: string, extra: Partial<TodoItem> = {}): TodoItem => ({ id, text, done: false, children: [], ...(due ? { due } : {}), ...extra });
const list = (id: string, title: string, items: TodoItem[]): TodoCard => ({ ...(createCard('todo', id) as TodoCard), title, items });

describe('due dates', () => {
  it('a due date is a real calendar day written YYYY-MM-DD', () => {
    expect(isDueDate('2026-10-05')).toBe(true);
    expect(isDueDate('2026-02-30')).toBe(false);
    expect(isDueDate('5 Oct')).toBe(false);
    expect(isDueDate(20261005)).toBe(false);
  });

  it('counts days across months and years', () => {
    expect(addDays('2026-10-05', 1)).toBe('2026-10-06');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-10-05', 7)).toBe('2026-10-12');
  });

  it('is overdue before today, due today, or later', () => {
    expect(dueState('2026-10-04', '2026-10-05')).toBe('overdue');
    expect(dueState('2026-10-05', '2026-10-05')).toBe('today');
    expect(dueState('2026-10-06', '2026-10-05')).toBe('later');
  });

  it('reads as a short label: Today, Tomorrow, Yesterday, a weekday this week, else the date', () => {
    const today = '2026-10-05'; // a Monday
    expect(dueLabel('2026-10-05', today)).toBe('Today');
    expect(dueLabel('2026-10-06', today)).toBe('Tomorrow');
    expect(dueLabel('2026-10-04', today)).toBe('Yesterday');
    expect(dueLabel('2026-10-09', today)).toBe('Fri');
    expect(dueLabel('2026-10-20', today)).toBe('Tue 20 Oct');
    expect(dueLabel('2026-09-28', today)).toBe('Mon 28 Sep');
    expect(dueLabel('2027-01-04', today)).toBe('Mon 4 Jan 2027');
  });

  it('sets or clears one item’s date, sub-items included; null when nothing changes', () => {
    const items = [item('a', 'A', undefined, { children: [item('b', 'B')] })];
    const set = withDue(items, 'b', '2026-10-07')!;
    expect(set[0].children[0].due).toBe('2026-10-07');
    expect(withDue(set, 'b', '2026-10-07')).toBeNull();
    const cleared = withDue(set, 'b', null)!;
    expect('due' in cleared[0].children[0]).toBe(false);
    expect(withDue(items, 'zz', '2026-10-07')).toBeNull();
  });

  it('is saved and read back; an unreadable date is dropped', () => {
    let b: Board = addCard(createBoard(), list('t1', 'Jobs', [item('a', 'Pay rent', '2026-10-05')]), { type: 'loose', x: 0, y: 0 });
    expect((parseBoard(serializeBoard(b)).cards.t1 as TodoCard).items[0].due).toBe('2026-10-05');
    b = addCard(b, list('t2', 'Bad', [item('x', 'x', 'soon')]), { type: 'loose', x: 0, y: 300 });
    expect('due' in (parseBoard(serializeBoard(b)).cards.t2 as TodoCard).items[0]).toBe(false);
  });
});

describe('the Due today / Overdue list', () => {
  it('lists unticked items due today or before, from every board, overdue first (oldest first), with where they are', () => {
    const today = '2026-10-05';
    let home = addColumn(createBoard(), { ...createColumn('c1'), x: 0, y: 0 });
    home = addCard(
      home,
      list('t1', 'Jobs', [
        item('a', 'Pay rent', '2026-10-05'),
        item('b', 'Done already', '2026-10-01', { done: true }),
        item('c', 'Later', '2026-10-09'),
        item('d', 'Parent', undefined, { children: [item('e', 'Sub-item', '2026-10-03')] }),
      ]),
      { type: 'column', columnId: 'c1', index: 0 },
    );
    const other = addCard({ ...createBoard(), name: 'Trips' }, list('t9', '', [item('f', 'Book hotel', '2026-10-04')]), { type: 'loose', x: 0, y: 0 });
    const got = dueItems({ home: 'h', boards: { h: { ...home, name: 'Home' }, b2: other } }, today);
    expect(got.map((d) => [d.itemId, d.state, d.boardId, d.boardName, d.listTitle, d.text])).toEqual([
      ['e', 'overdue', 'h', 'Home', 'Jobs', 'Sub-item'],
      ['f', 'overdue', 'b2', 'Trips', '', 'Book hotel'],
      ['a', 'today', 'h', 'Home', 'Jobs', 'Pay rent'],
    ]);
  });

  it('a ticked parent hides its sub-items too', () => {
    const b = addCard(createBoard(), list('t1', 'L', [item('a', 'A', undefined, { done: true, children: [item('b', 'B', '2026-10-01')] })]), { type: 'loose', x: 0, y: 0 });
    expect(dueItems({ home: 'h', boards: { h: b } }, '2026-10-05')).toEqual([]);
  });
});
