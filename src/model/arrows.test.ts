import { describe, expect, it } from 'vitest';
import { addArrow, arrowLine, arrowsAmong, clearDots, connectorDots, pruneArrows, readArrows, removeArrow } from './arrows';
import { addCard, addColumn, createBoard, deleteBlocks, moveCard, problems } from './board';
import { createCard, createColumn } from './cards';
import { pourList } from './checklist';
import type { Board, CompletedCard } from './types';

// Arrows between cards and containers (owner request, 2026-11-03, job card-arrows).

function board(): Board {
  let b = createBoard();
  b = addCard(b, createCard('note', 'n1'), { type: 'loose', x: 0, y: 0 });
  b = addCard(b, createCard('note', 'n2'), { type: 'loose', x: 400, y: 0 });
  b = addColumn(b, { ...createColumn('c1'), x: 0, y: 400 });
  b = addCard(b, createCard('todo', 't1'), { type: 'column', columnId: 'c1', index: 0 });
  return b;
}

describe('drawing and deleting arrows', () => {
  it('joins two cards or containers, cards in containers included', () => {
    const b = addArrow(board(), 'n1', 'n2', 'a1')!;
    expect(b.arrows).toEqual([{ id: 'a1', from: 'n1', to: 'n2' }]);
    expect(addArrow(b, 'n2', 't1', 'a2')!.arrows).toHaveLength(2);
    expect(addArrow(b, 'c1', 'n1', 'a3')!.arrows).toHaveLength(2);
  });

  it('never joins a block to itself, to something missing, or the same two twice (either way round)', () => {
    const b = addArrow(board(), 'n1', 'n2', 'a1')!;
    expect(addArrow(b, 'n1', 'n1', 'x')).toBeNull();
    expect(addArrow(b, 'n1', 'gone', 'x')).toBeNull();
    expect(addArrow(b, 'n1', 'n2', 'x')).toBeNull();
    expect(addArrow(b, 'n2', 'n1', 'x')).toBeNull();
  });

  it('a container and a card inside it are not joined', () => {
    expect(addArrow(board(), 'c1', 't1', 'x')).toBeNull();
    expect(addArrow(board(), 't1', 'c1', 'x')).toBeNull();
  });

  it('the Completed record (not drawn on the board) is never joined', () => {
    let b = board();
    const record: CompletedCard = { id: 'k', kind: 'completed', groups: [], color: 'stone', collapsed: false, x: 0, y: 900, w: null, h: null };
    b = addCard(b, record, { type: 'loose', x: 0, y: 900 });
    expect(addArrow(b, 'n1', 'k', 'x')).toBeNull();
  });

  it('removes one arrow; the field goes when the last one does; null when it is not there', () => {
    const b = addArrow(board(), 'n1', 'n2', 'a1')!;
    const gone = removeArrow(b, 'a1')!;
    expect('arrows' in gone).toBe(false);
    expect(removeArrow(b, 'zz')).toBeNull();
  });

  it('deleting a card or container deletes its arrows, and those of the cards inside the container', () => {
    let b = addArrow(board(), 'n1', 'n2', 'a1')!;
    b = addArrow(b, 'n2', 't1', 'a2')!;
    expect(deleteBlocks(b, ['n1']).arrows!.map((a) => a.id)).toEqual(['a2']);
    expect(deleteBlocks(b, ['c1']).arrows!.map((a) => a.id)).toEqual(['a1']);
    expect('arrows' in deleteBlocks(b, ['n2'])).toBe(false);
  });

  it('pouring a list into another deletes the poured list’s arrows', () => {
    let b = board();
    b = addCard(b, createCard('todo', 't2'), { type: 'loose', x: 800, y: 0 });
    b = addArrow(b, 't2', 'n1', 'a1')!;
    expect('arrows' in pourList(b, 't2', 't1')).toBe(false);
  });

  it('a card moved into a container it points at keeps the arrow (drawn hidden), and moved out again shows it', () => {
    let b = addArrow(board(), 'n1', 'c1', 'a1')!;
    b = moveCard(b, 'n1', { type: 'column', columnId: 'c1', index: 0 });
    expect(b.arrows).toEqual([{ id: 'a1', from: 'n1', to: 'c1' }]);
    expect(problems(b)).toEqual([]);
  });

  it('prunes arrows whose ends are gone; the same board when nothing changes', () => {
    const b = { ...board(), arrows: [{ id: 'a1', from: 'n1', to: 'n2' }, { id: 'a2', from: 'n1', to: 'zz' }] };
    expect(pruneArrows(b).arrows).toEqual([{ id: 'a1', from: 'n1', to: 'n2' }]);
    const clean = pruneArrows(b);
    expect(pruneArrows(clean)).toBe(clean);
  });

  it('a board check finds an arrow to a missing block', () => {
    const b = { ...board(), arrows: [{ id: 'a2', from: 'n1', to: 'zz' }] };
    expect(problems(b)).toEqual(['arrow a2 joins a missing block']);
  });
});

describe('reading saved arrows (load validation)', () => {
  it('keeps well-formed arrows between blocks on the board', () => {
    const arrows = [{ id: 'a1', from: 'n1', to: 'n2' }, { id: 'a2', from: 'c1', to: 'n2' }];
    expect(readArrows(arrows, board())).toEqual(arrows);
  });

  it('drops just the bad ones: missing ids, wrong types, missing blocks, self, repeats, duplicate ids', () => {
    const raw = [
      { id: 'a1', from: 'n1', to: 'n2' },
      { from: 'n1', to: 'c1' },
      { id: 3, from: 'n1', to: 'c1' },
      { id: 'a3', from: 'n1', to: 'nope' },
      { id: 'a4', from: 'n2', to: 'n2' },
      { id: 'a5', from: 'n2', to: 'n1' },
      { id: 'a1', from: 'n2', to: 'c1' },
      'junk',
      null,
      { id: 'a6', from: 'n2', to: 'c1' },
    ];
    expect(readArrows(raw, board())).toEqual([{ id: 'a1', from: 'n1', to: 'n2' }, { id: 'a6', from: 'n2', to: 'c1' }]);
  });

  it('anything that is not a list, or a list with none left, gives no arrows', () => {
    for (const v of [undefined, null, 7, 'x', { a: 1 }, [], [null]]) expect(readArrows(v, board())).toBeUndefined();
  });
});

describe('copying arrows with the blocks', () => {
  it('only the arrows between the given blocks, cards inside given containers counted', () => {
    let b = addArrow(board(), 'n1', 'n2', 'a1')!;
    b = addArrow(b, 'n2', 't1', 'a2')!;
    b = addArrow(b, 'n1', 'c1', 'a3')!;
    expect(arrowsAmong(b, ['n1', 'n2']).map((a) => a.id)).toEqual(['a1']);
    expect(arrowsAmong(b, ['n2', 'c1']).map((a) => a.id)).toEqual(['a2']);
    expect(arrowsAmong(b, ['n1'])).toEqual([]);
  });
});

describe('where an arrow is drawn: a straight line between the edges of the two blocks', () => {
  const a = { x: 0, y: 0, w: 100, h: 100 };

  it('runs from the edge of one to the edge of the other, along the line between their middles', () => {
    expect(arrowLine(a, { x: 300, y: 0, w: 100, h: 100 }, 0)).toEqual({ from: { x: 100, y: 50 }, to: { x: 300, y: 50 } });
    expect(arrowLine(a, { x: 0, y: 300, w: 100, h: 100 }, 0)).toEqual({ from: { x: 50, y: 100 }, to: { x: 50, y: 300 } });
    // Diagonal: leaves through the corner.
    expect(arrowLine(a, { x: 300, y: 300, w: 100, h: 100 }, 0)).toEqual({ from: { x: 100, y: 100 }, to: { x: 300, y: 300 } });
  });

  it('stays a small gap clear of each block', () => {
    expect(arrowLine(a, { x: 300, y: 0, w: 100, h: 100 }, 6)).toEqual({ from: { x: 106, y: 50 }, to: { x: 294, y: 50 } });
  });

  it('is not drawn when the blocks overlap or nearly touch', () => {
    expect(arrowLine(a, { x: 50, y: 50, w: 100, h: 100 }, 6)).toBeNull();
    expect(arrowLine(a, { x: 105, y: 0, w: 100, h: 100 }, 6)).toBeNull();
    expect(arrowLine(a, a, 0)).toBeNull();
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

  it('leave out a dot that would lie over another block, so it never covers its text', () => {
    const dots = connectorDots({ x: 0, y: 0, w: 200, h: 100 }, 14);
    expect(clearDots(dots, 5, [{ x: 0, y: -110, w: 200, h: 100 }]).map((d) => d.side)).toEqual(['right', 'bottom', 'left']);
    expect(clearDots(dots, 5, [{ x: 220, y: 0, w: 100, h: 100 }])).toHaveLength(4);
    expect(clearDots(dots, 5, [])).toEqual(dots);
  });

  it('keep the least covered dot when every dot would lie over something', () => {
    const dots = connectorDots({ x: 0, y: 0, w: 200, h: 100 }, 14);
    const around = [
      { x: 0, y: -110, w: 200, h: 100 },
      { x: 0, y: 110, w: 200, h: 100 },
      { x: -110, y: 0, w: 100, h: 100 },
      { x: 218, y: 0, w: 100, h: 100 },
    ];
    expect(clearDots(dots, 5, around).map((d) => d.side)).toEqual(['right']);
  });
});
