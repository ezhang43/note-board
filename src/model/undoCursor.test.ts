import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createColumn } from './cards';
import { cursorAfterStep, drawnItems } from './undoCursor';
import type { Board, TodoCard, TodoItem } from './types';

// Where the cursor goes after undo or redo while typing in a checklist item (job undo-keeps-cursor, 2026-11-09).

const it_ = (id: string, children: TodoItem[] = []): TodoItem => ({ id, text: id, done: false, children });
const list = (id: string, items: TodoItem[]): TodoCard => ({
  id,
  kind: 'todo',
  color: 'mint',
  collapsed: false,
  x: 0,
  y: 0,
  w: null,
  h: null,
  title: id,
  items,
  completedOpen: true,
});

/** List A (a1, a2 (a2x), a3) in container "week"; loose list L (l1). */
function board(a: TodoItem[] = [it_('a1'), it_('a2', [it_('a2x')]), it_('a3')], l: TodoItem[] = [it_('l1')]): Board {
  let b = B.createBoard();
  b = B.addColumn(b, { ...createColumn('week'), title: 'Week' });
  b = B.addCard(b, list('A', a), { type: 'column', columnId: 'week', index: 0 });
  return B.addCard(b, list('L', l), { type: 'loose', x: 900, y: 0 });
}
const collapse = (b: Board, cardId: string): Board => ({ ...b, cards: { ...b.cards, [cardId]: { ...b.cards[cardId], collapsed: true } } });

describe('the rows a list draws', () => {
  it('are its items, sub-items included; none for a collapsed card or one in a collapsed container', () => {
    const b = board();
    expect(drawnItems(b, 'A')).toEqual(['a1', 'a2', 'a2x', 'a3']);
    expect(drawnItems(collapse(b, 'A'), 'A')).toEqual([]);
    expect(drawnItems({ ...b, columns: { ...b.columns, week: { ...b.columns.week, collapsed: true } } }, 'A')).toEqual([]);
    expect(drawnItems(b, 'nope')).toEqual([]);
  });
});

describe('the cursor after undo or redo', () => {
  it('stays in an item still drawn', () => {
    expect(cursorAfterStep(board(), board(), { cardId: 'A', itemId: 'a2x' })).toEqual({ cardId: 'A', itemId: 'a2x' });
  });
  it('goes to the nearest item above that is still drawn, else the one below', () => {
    const before = board();
    expect(cursorAfterStep(before, board([it_('a1'), it_('a3')]), { cardId: 'A', itemId: 'a2x' })).toEqual({ cardId: 'A', itemId: 'a1' });
    expect(cursorAfterStep(before, board([it_('a2'), it_('a3')]), { cardId: 'A', itemId: 'a1' })).toEqual({ cardId: 'A', itemId: 'a2' });
  });
  it('follows an item the change moved to another list', () => {
    const after = board([it_('a1'), it_('a3')], [it_('l1'), it_('a2', [it_('a2x')])]);
    expect(cursorAfterStep(board(), after, { cardId: 'A', itemId: 'a2' })).toEqual({ cardId: 'L', itemId: 'a2' });
  });
  it('is nowhere when the list draws no item any more (collapsed) or is gone', () => {
    expect(cursorAfterStep(board(), collapse(board(), 'A'), { cardId: 'A', itemId: 'a1' })).toBeNull();
    const b = board();
    expect(cursorAfterStep(b, B.deleteCard(b, 'L'), { cardId: 'L', itemId: 'l1' })).toBeNull();
  });
});
