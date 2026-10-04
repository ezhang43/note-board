import { describe, expect, it } from 'vitest';
import { addArrow, arrowLine, pruneArrows, removeArrow } from './arrows';
import { addCard, addColumn, createBoard, deleteBlocks } from './board';
import { createCard, createColumn } from './cards';
import { parseBoard, serializeBoard } from './persist';
import type { Board } from './types';

// Arrows between cards and columns (owner request, 2026-10-05).

function board(): Board {
  let b = createBoard();
  b = addCard(b, createCard('note', 'n1'), { type: 'loose', x: 0, y: 0 });
  b = addCard(b, createCard('note', 'n2'), { type: 'loose', x: 400, y: 0 });
  b = addColumn(b, { ...createColumn('c1'), x: 0, y: 400 });
  b = addCard(b, createCard('todo', 't1'), { type: 'column', columnId: 'c1', index: 0 });
  return b;
}

describe('arrows', () => {
  it('joins two cards or columns, cards in columns included', () => {
    const b = addArrow(board(), 'n1', 'n2', 'a1')!;
    expect(b.arrows).toEqual([{ id: 'a1', from: 'n1', to: 'n2' }]);
    expect(addArrow(b, 'n2', 't1', 'a2')!.arrows).toHaveLength(2);
    expect(addArrow(b, 'c1', 'n1', 'a3')!.arrows).toHaveLength(2);
  });

  it('never joins a block to itself, to something missing, or twice the same two (either way round)', () => {
    const b = addArrow(board(), 'n1', 'n2', 'a1')!;
    expect(addArrow(b, 'n1', 'n1', 'x')).toBeNull();
    expect(addArrow(b, 'n1', 'gone', 'x')).toBeNull();
    expect(addArrow(b, 'n1', 'n2', 'x')).toBeNull();
    expect(addArrow(b, 'n2', 'n1', 'x')).toBeNull();
  });

  it('a column and a card inside it are not joined', () => {
    expect(addArrow(board(), 'c1', 't1', 'x')).toBeNull();
    expect(addArrow(board(), 't1', 'c1', 'x')).toBeNull();
  });

  it('removes one arrow; null when it is not there', () => {
    const b = addArrow(board(), 'n1', 'n2', 'a1')!;
    expect(removeArrow(b, 'a1')!.arrows).toEqual([]);
    expect(removeArrow(b, 'zz')).toBeNull();
  });

  it('deleting a card or column deletes its arrows, and those of the cards inside the column', () => {
    let b = addArrow(board(), 'n1', 'n2', 'a1')!;
    b = addArrow(b, 'n2', 't1', 'a2')!;
    expect(deleteBlocks(b, ['n1']).arrows!.map((a) => a.id)).toEqual(['a2']);
    expect(deleteBlocks(b, ['c1']).arrows!.map((a) => a.id)).toEqual(['a1']);
  });

  it('prunes arrows whose ends are gone; the same board when nothing changes', () => {
    const b = { ...board(), arrows: [{ id: 'a1', from: 'n1', to: 'n2' }, { id: 'a2', from: 'n1', to: 'zz' }] };
    expect(pruneArrows(b).arrows).toEqual([{ id: 'a1', from: 'n1', to: 'n2' }]);
    const clean = pruneArrows(b);
    expect(pruneArrows(clean)).toBe(clean);
  });

  it('is saved and read back; unreadable or dangling arrows are dropped', () => {
    const b = addArrow(board(), 'n1', 'n2', 'a1')!;
    expect(parseBoard(serializeBoard(b)).arrows).toEqual([{ id: 'a1', from: 'n1', to: 'n2' }]);
    const raw = JSON.parse(serializeBoard(b));
    raw.board.arrows.push({ id: 'a2', from: 'n1', to: 'nope' }, { id: 3, from: 'n1', to: 'n2' }, 'junk');
    expect(parseBoard(JSON.stringify(raw)).arrows).toEqual([{ id: 'a1', from: 'n1', to: 'n2' }]);
    expect(parseBoard(serializeBoard(board())).arrows).toBeUndefined();
  });
});

describe('where an arrow is drawn', () => {
  it('runs between the two blocks’ edges, along the line joining their middles, leaving a small gap', () => {
    const line = arrowLine({ x: 0, y: 0, w: 100, h: 100 }, { x: 300, y: 0, w: 100, h: 100 }, 6)!;
    expect(line).toEqual({ x1: 106, y1: 50, x2: 294, y2: 50 });
    const down = arrowLine({ x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 300, w: 100, h: 100 }, 0)!;
    expect(down).toEqual({ x1: 50, y1: 100, x2: 50, y2: 300 });
  });

  it('leaves a slanted line at the edge it crosses', () => {
    const l = arrowLine({ x: 0, y: 0, w: 200, h: 100 }, { x: 400, y: 200, w: 200, h: 100 }, 0)!;
    // middles (100,50) → (500,250): leaves through the bottom edge at x = 200
    expect(l.x1).toBeCloseTo(200);
    expect(l.y1).toBeCloseTo(100);
    expect(l.x2).toBeCloseTo(400);
    expect(l.y2).toBeCloseTo(200);
  });

  it('is not drawn when the blocks overlap', () => {
    expect(arrowLine({ x: 0, y: 0, w: 100, h: 100 }, { x: 50, y: 50, w: 100, h: 100 }, 6)).toBeNull();
  });
});
