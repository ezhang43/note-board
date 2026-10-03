import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createColumn } from './cards';
import { boardLists, columnLists, multiAsText, rangeAcross, setDoneAcross, deleteAcross, visibleItems } from './multiSelect';
import type { Board, TodoCard, TodoItem } from './types';

const it_ = (id: string, children: TodoItem[] = [], done = false): TodoItem => ({ id, text: id, done, children });
const list = (id: string, title: string, items: TodoItem[], more: Partial<TodoCard> = {}): TodoCard => ({
  id,
  kind: 'todo',
  color: 'mint',
  collapsed: false,
  x: 0,
  y: 0,
  w: null,
  h: null,
  title,
  items,
  completedOpen: true,
  ...more,
});

/**
 * Column "Week" at x 400 holding lists A (a1, a2(a2x)) and B (b1, +b2 done); column "Later" at x 0
 * holding C (c1); loose lists L1 at (900, 100) and L2 at (900, 0) (L2 is higher, so comes first).
 */
function board(): Board {
  let b = B.createBoard();
  b = B.addColumn(b, { ...createColumn('week'), title: 'Week', x: 400 });
  b = B.addColumn(b, { ...createColumn('later'), title: 'Later', x: 0 });
  b = B.addCard(b, list('A', 'Groceries', [it_('a1'), it_('a2', [it_('a2x')])]), { type: 'column', columnId: 'week', index: 0 });
  b = B.addCard(b, list('B', 'Chores', [it_('b1'), it_('b2', [], true)]), { type: 'column', columnId: 'week', index: 1 });
  b = B.addCard(b, list('C', 'Ideas', [it_('c1')]), { type: 'column', columnId: 'later', index: 0 });
  b = B.addCard(b, list('L1', 'Loose one', [it_('l1')]), { type: 'loose', x: 900, y: 100 });
  b = B.addCard(b, list('L2', 'Loose two', [it_('l2')]), { type: 'loose', x: 900, y: 0 });
  return b;
}

describe('items you can see', () => {
  it('skips collapsed cards and a closed Completed section', () => {
    const b = board();
    expect(visibleItems(b.cards.B as TodoCard)).toEqual(['b1', 'b2']);
    expect(visibleItems({ ...(b.cards.B as TodoCard), completedOpen: false })).toEqual(['b1']);
    expect(visibleItems({ ...(b.cards.A as TodoCard), collapsed: true })).toEqual([]);
  });
});

describe('Ctrl+A steps 3 and 4', () => {
  it('step 3: every item in every list in the same column', () => {
    expect(columnLists(board(), 'week')).toEqual([
      { cardId: 'A', ids: ['a1', 'a2', 'a2x'] },
      { cardId: 'B', ids: ['b1', 'b2'] },
    ]);
  });

  it('step 4: every visible item on the board, columns left to right, then loose lists top to bottom', () => {
    expect(boardLists(board()).map((l) => l.cardId)).toEqual(['C', 'A', 'B', 'L2', 'L1']);
  });

  it('a collapsed column gives nothing', () => {
    const b = B.toggleCollapsed(board(), 'later');
    expect(boardLists(b).map((l) => l.cardId)).toEqual(['A', 'B', 'L2', 'L1']);
  });
});

describe('selecting by dragging across cards in a column', () => {
  it('from an item in one list to an item in a later list takes everything between', () => {
    expect(rangeAcross(board(), 'week', { cardId: 'A', itemId: 'a2' }, { cardId: 'B', itemId: 'b1' })).toEqual([
      { cardId: 'A', ids: ['a2', 'a2x'] },
      { cardId: 'B', ids: ['b1'] },
    ]);
  });

  it('works upwards too', () => {
    expect(rangeAcross(board(), 'week', { cardId: 'B', itemId: 'b1' }, { cardId: 'A', itemId: 'a2x' })).toEqual([
      { cardId: 'A', ids: ['a2x'] },
      { cardId: 'B', ids: ['b1'] },
    ]);
  });
});

describe('copying, deleting and ticking across lists', () => {
  it('copies each list title on its own line with its items indented under it', () => {
    const b = board();
    expect(multiAsText(b, [{ cardId: 'A', ids: ['a2', 'a2x'] }, { cardId: 'B', ids: ['b1'] }])).toBe('Groceries\n  a2\n    a2x\nChores\n  b1');
  });

  it('deletes the selected items in every list (an emptied list keeps one blank item)', () => {
    let n = 0;
    const out = deleteAcross(board(), [{ cardId: 'A', ids: ['a1'] }, { cardId: 'C', ids: ['c1'] }], () => `new${++n}`);
    expect((out.cards.A as TodoCard).items.map((i) => i.id)).toEqual(['a2']);
    expect((out.cards.C as TodoCard).items).toMatchObject([{ text: '' }]);
  });

  it('ticks (or unticks) the selected items in every list', () => {
    const out = setDoneAcross(board(), [{ cardId: 'A', ids: ['a1'] }, { cardId: 'B', ids: ['b1'] }], true);
    expect((out.cards.A as TodoCard).items[0].done).toBe(true);
    expect((out.cards.B as TodoCard).items[0].done).toBe(true);
  });
});
