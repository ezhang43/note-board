import { describe, expect, it } from 'vitest';
import { addArrow, arrowCurve, connectorDots, curveMid, curvePath, pruneArrows, removeArrow } from './arrows';
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

describe('where an arrow is drawn (Miro style, owner request)', () => {
  const a = { x: 0, y: 0, w: 100, h: 100 };

  it('joins the middles of the two sides that face each other, a small gap clear of each', () => {
    const right = arrowCurve(a, { x: 300, y: 0, w: 100, h: 100 }, 6)!;
    expect([right.fromSide, right.toSide]).toEqual(['right', 'left']);
    expect(right.from).toEqual({ x: 106, y: 50 });
    expect(right.to).toEqual({ x: 294, y: 50 });
    const left = arrowCurve(a, { x: -300, y: 0, w: 100, h: 100 }, 0)!;
    expect([left.fromSide, left.toSide, left.from, left.to]).toEqual(['left', 'right', { x: 0, y: 50 }, { x: -200, y: 50 }]);
    const down = arrowCurve(a, { x: 0, y: 300, w: 100, h: 100 }, 0)!;
    expect([down.fromSide, down.toSide, down.from, down.to]).toEqual(['bottom', 'top', { x: 50, y: 100 }, { x: 50, y: 300 }]);
    const up = arrowCurve(a, { x: 0, y: -300, w: 100, h: 100 }, 0)!;
    expect([up.fromSide, up.toSide]).toEqual(['top', 'bottom']);
  });

  it('picks the sides by the bigger gap between the blocks, and still meets each side in its middle', () => {
    // Far to the right, a little lower: left / right sides.
    const r = arrowCurve({ x: 0, y: 0, w: 200, h: 100 }, { x: 500, y: 150, w: 200, h: 100 }, 0)!;
    expect([r.fromSide, r.toSide, r.from, r.to]).toEqual(['right', 'left', { x: 200, y: 50 }, { x: 500, y: 200 }]);
    // Far below, a little to the right: top / bottom sides.
    const d = arrowCurve({ x: 0, y: 0, w: 200, h: 100 }, { x: 250, y: 400, w: 200, h: 100 }, 0)!;
    expect([d.fromSide, d.toSide, d.from, d.to]).toEqual(['bottom', 'top', { x: 100, y: 100 }, { x: 350, y: 400 }]);
  });

  it('is a smooth curve that leaves and arrives square to each side', () => {
    const r = arrowCurve({ x: 0, y: 0, w: 200, h: 100 }, { x: 500, y: 150, w: 200, h: 100 }, 0)!;
    // Handles straight out of each side, half the way across.
    expect(r.c1).toEqual({ x: 350, y: 50 });
    expect(r.c2).toEqual({ x: 350, y: 200 });
    expect(curvePath(r)).toBe('M 200 50 C 350 50 350 200 500 200');
    expect(curveMid(r)).toEqual({ x: 350, y: 125 });
  });

  it('is not drawn when the blocks overlap or nearly touch', () => {
    expect(arrowCurve(a, { x: 50, y: 50, w: 100, h: 100 }, 6)).toBeNull();
    expect(arrowCurve(a, { x: 105, y: 0, w: 100, h: 100 }, 6)).toBeNull();
  });
});

describe('connection dots', () => {
  it('sit just outside the middle of each side', () => {
    expect(connectorDots({ x: 0, y: 0, w: 200, h: 100 }, 14)).toEqual([
      { side: 'top', x: 100, y: -14 },
      { side: 'right', x: 214, y: 50 },
      { side: 'bottom', x: 100, y: 114 },
      { side: 'left', x: -14, y: 50 },
    ]);
  });
});
