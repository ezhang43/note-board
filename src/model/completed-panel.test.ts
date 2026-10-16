import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard, createColumn } from './cards';
import { cleanUp } from './completed';
import { blockRect, blocksTouching, settle, spotForNewBlock, topLevelRects } from './layout';
import { findMatches } from './search';
import type { Board, CompletedCard, TodoCard } from './types';

// Completed panel (Job #51): the board's Completed record stays in board data but isn't drawn,
// so it takes no space on the board and Find lists its matches last, pointing at the panel.

const none = () => undefined;

/** A board with a list "eggs" ticked, cleaned up into a Completed record placed at `at`. */
function withRecord(at: { x: number; y: number }): { board: Board; doneId: string } {
  const list: TodoCard = { ...(createCard('todo', 'l') as TodoCard), title: 'Shop', items: [{ id: 'i', text: 'eggs', done: true, children: [] }] };
  let b = B.addCard(B.createBoard(), list, { type: 'loose', x: 400, y: 400 });
  const r = cleanUp(b, '2026-10-16', { type: 'loose', ...at }, (p) => `${p}1`);
  b = r.board;
  return { board: b, doneId: r.cardId! };
}

describe('the Completed record takes no space on the board', () => {
  it('has no rectangle, so it is never in the way, never selected by the box and never fitted to', () => {
    const { board, doneId } = withRecord({ x: 0, y: 0 });
    expect(blockRect(board, doneId, none)).toBeNull();
    expect(topLevelRects(board, none)).toHaveLength(1); // only the list
    expect(blocksTouching(board, { x: -50, y: -50, w: 100, h: 100 }, none)).toEqual([]);
  });

  it('a new block can go where it sits, and settling moves nothing because of it', () => {
    const { board, doneId } = withRecord({ x: -140, y: -60 });
    expect(spotForNewBlock(board, 280, 120, { x: 0, y: 0 }, none)).toEqual({ x: -140, y: -60 });
    // A note dropped right on top of it stays put, and so does the record.
    const note = createCard('note', 'n');
    const b = B.addCard(board, note, { type: 'loose', x: -140, y: -60 });
    const after = settle(b, none, ['n']);
    expect(after.cards.n).toMatchObject({ x: -140, y: -60 });
    expect(after.cards[doneId]).toMatchObject({ x: -140, y: -60 });
  });
});

describe('Find and the Completed record', () => {
  it('lists its matches after everything on the board, pointing at the record', () => {
    // The record sits top-left, before the list in board order, and it still comes last.
    const { board, doneId } = withRecord({ x: -1000, y: -1000 });
    const b = B.updateCard(board, 'l', (c) => ({ ...(c as TodoCard), title: 'eggs to buy' }));
    const m = findMatches(b, 'eggs');
    expect(m.map((x) => x.key)).toEqual(['title:l', `done:${doneId}:i`]);
    expect(m[1].showInstead).toBe(doneId);
  });

  it('a record kept in a column (an old saved board) is still found last', () => {
    const { board, doneId } = withRecord({ x: 0, y: 0 });
    let b = B.addColumn(board, { ...createColumn('col'), title: 'eggs', x: 2000, y: 0 });
    b = B.moveCard(b, doneId, { type: 'column', columnId: 'col', index: 0 });
    expect((b.cards[doneId] as CompletedCard).groups).toHaveLength(1);
    const m = findMatches(b, 'eggs');
    expect(m.map((x) => x.key)).toEqual(['column:col', `done:${doneId}:i`]);
    expect(m[1].showInstead).toBe(doneId);
  });
});

describe('moving a card up or down in a column steps over a hidden Completed record', () => {
  /** An old board: column [a, record, b]. */
  function column(): { board: Board; doneId: string } {
    const { board, doneId } = withRecord({ x: 0, y: 0 });
    let b = B.addColumn(board, { ...createColumn('col'), x: 2000, y: 0 });
    b = B.addCard(b, createCard('note', 'a'), { type: 'column', columnId: 'col', index: 0 });
    b = B.moveCard(b, doneId, { type: 'column', columnId: 'col', index: 1 });
    b = B.addCard(b, createCard('note', 'b'), { type: 'column', columnId: 'col', index: 2 });
    return { board: b, doneId };
  }

  it('up: b goes above a in one step', () => {
    const { board, doneId } = column();
    expect(board.columns.col.cardIds).toEqual(['a', doneId, 'b']);
    expect(B.shiftInColumn(board, 'b', -1).columns.col.cardIds.filter((id) => id !== doneId)).toEqual(['b', 'a']);
  });

  it('down: a goes below b in one step', () => {
    const { board, doneId } = column();
    expect(B.shiftInColumn(board, 'a', 1).columns.col.cardIds.filter((id) => id !== doneId)).toEqual(['b', 'a']);
  });

  it('at the shown top or bottom nothing changes', () => {
    const { board } = column();
    expect(B.shiftInColumn(board, 'a', -1)).toBe(board);
    expect(B.shiftInColumn(board, 'b', 1)).toBe(board);
  });
});
