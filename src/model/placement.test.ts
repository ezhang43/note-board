import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard, createColumn } from './cards';
import { BLOCK_GAP } from './constants';
import { overlaps } from './geometry';
import { blockRect, settle, shiftRow, type MeasuredHeight } from './layout';
import { dropBoard, movedBlocks, recordPushes, returnPushes } from './placement';
import type { Board } from './types';

const heights: Record<string, number> = {};
const measured: MeasuredHeight = (id) => heights[id];

function loose(b: Board, id: string, x: number, y: number, h = 100) {
  heights[id] = h;
  return B.addCard(b, createCard('note', id), { type: 'loose', x, y });
}

describe('which blocks moved', () => {
  it('lists top-level blocks whose position changed, with where they were and went', () => {
    const before = loose(loose(B.createBoard(), 'a', 0, 0), 'b', 400, 0);
    const after = B.moveCard(before, 'b', { type: 'loose', x: 400, y: 200 });
    expect([...movedBlocks(before, after)]).toEqual([['b', { from: { x: 400, y: 0 }, to: { x: 400, y: 200 } }]]);
    expect(movedBlocks(before, after, ['b']).size).toBe(0);
  });
});

describe('remembering pushes from an expanding block', () => {
  it('keeps where a block first was, and where it went last', () => {
    const b0 = loose(B.createBoard(), 'b', 0, 0);
    const b1 = B.moveCard(b0, 'b', { type: 'loose', x: 0, y: 100 });
    const b2 = B.moveCard(b1, 'b', { type: 'loose', x: 0, y: 200 });
    const pushes = recordPushes(recordPushes(undefined, b0, b1), b1, b2);
    expect(pushes.get('b')).toEqual({ from: { x: 0, y: 0 }, to: { x: 0, y: 200 } });
  });
});

describe('collapsing returns pushed blocks', () => {
  const pushed = () => {
    let b = loose(B.createBoard(), 'big', 0, 0, 100);
    b = loose(b, 'b', 0, 300);
    const pushes = new Map([['b', { from: { x: 0, y: 120 }, to: { x: 0, y: 300 } }]]);
    return { b, pushes };
  };

  it('moves a block back to its old spot when that spot is free', () => {
    const { b, pushes } = pushed();
    expect(returnPushes(b, pushes, 'big', measured).cards.b).toMatchObject({ x: 0, y: 120 });
  });

  it('leaves a block that was moved since', () => {
    const { b, pushes } = pushed();
    const moved = B.moveCard(b, 'b', { type: 'loose', x: 500, y: 300 });
    expect(returnPushes(moved, pushes, 'big', measured)).toBe(moved);
  });

  it('leaves a block whose old spot is now taken', () => {
    const { b, pushes } = pushed();
    const taken = loose(b, 'c', 0, 120);
    expect(returnPushes(taken, pushes, 'big', measured).cards.b).toMatchObject({ x: 0, y: 300 });
  });
});

describe('where a dragged block lands', () => {
  const drag = (id: string, kind: 'card' | 'column', x: number, y: number, group: string[] = []) => ({ id, kind, x, y, startX: 0, startY: 0, group });

  it('lands on the grid spot under the pointer and pushes what is in the way (it takes priority)', () => {
    let b = loose(B.createBoard(), 'a', 0, 0);
    b = loose(b, 'b', 400, 0);
    const r = dropBoard(b, drag('a', 'card', 405, 3), measured);
    expect(r.at).toEqual({ x: 400, y: 0 });
    expect(r.board.cards.a).toMatchObject({ x: 400, y: 0 });
    expect(r.bumped.b).toBeDefined();
    expect(r.bumped.a).toBeUndefined();
  });

  it('a single card never pushes a column: it takes the nearest free spot instead', () => {
    let b = loose(B.createBoard(), 'a', 0, 0);
    b = B.addColumn(b, { ...createColumn('col'), x: 400, y: 0 });
    heights.col = 220;
    const r = dropBoard(b, drag('a', 'card', 400, 0), measured);
    expect(r.board.columns.col).toMatchObject({ x: 400, y: 0 });
    expect(r.at).not.toEqual({ x: 400, y: 0 });
    expect(r.bumped).toEqual({});
  });

  it('a group moves together by the same amount', () => {
    let b = loose(B.createBoard(), 'a', 0, 0);
    b = loose(b, 'b', 300, 0);
    const r = dropBoard(b, drag('a', 'card', 0, 400, ['b']), measured);
    expect(r.ids).toEqual(['a', 'b']);
    expect(r.board.cards.b).toMatchObject({ x: 300, y: 400 });
  });
});

describe('blocks in the same row slide sideways and spring back (owner decision 2026-10-19)', () => {
  const drag = (id: string, kind: 'card' | 'column', x: number, y: number, startX = 0, startY = 0) => ({ id, kind, x, y, startX, startY, group: [] });
  /** Four containers in a row, 280 wide and 220 tall, 20 apart: a, b, c, d. */
  function row() {
    let b = B.createBoard();
    for (const [i, id] of ['a', 'b', 'c', 'd'].entries()) {
      b = B.addColumn(b, { ...createColumn(id), x: i * 300, y: 0 });
      heights[id] = 220;
    }
    return b;
  }
  const xs = (b: Board, ids: string[]) => ids.map((id) => B.blockOf(b, id)!.x);
  const ys = (b: Board, ids: string[]) => ids.map((id) => B.blockOf(b, id)!.y);
  function expectNoOverlap(b: Board) {
    const rects = b.order.map((id) => blockRect(b, id, measured)!);
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j], BLOCK_GAP - 1), `${b.order[i]} and ${b.order[j]}`).toBe(false);
  }

  it('a block dragged onto its neighbour swaps places with it, and the row stays a row', () => {
    const r = dropBoard(row(), drag('a', 'column', 300, 0), measured);
    expect(xs(r.board, ['b', 'a', 'c', 'd'])).toEqual([0, 300, 600, 900]);
    expect(ys(r.board, ['a', 'b', 'c', 'd'])).toEqual([0, 0, 0, 0]);
  });

  it('dragged across the row step by step, the others keep their left-to-right order and stay in the row', () => {
    const start = row();
    for (let x = 20; x <= 900; x += 20) {
      const { board } = dropBoard(start, drag('a', 'column', x, 0), measured);
      expect(ys(board, ['a', 'b', 'c', 'd']), `at ${x}`).toEqual([0, 0, 0, 0]);
      const others = xs(board, ['b', 'c', 'd']);
      expect(others, `at ${x}`).toEqual([...others].sort((p, q) => p - q));
      expectNoOverlap(board);
    }
    const end = dropBoard(start, drag('a', 'column', 900, 0), measured).board;
    expect(xs(end, ['b', 'c', 'd', 'a'])).toEqual([0, 300, 600, 900]);
  });

  it('blocks spring back to their own spot once the dragged block has moved past them', () => {
    const start = row();
    const over = dropBoard(start, drag('d', 'column', 600, 0, 900, 0), measured);
    expect(over.bumped.c).toEqual({ x: 900, y: 0 });
    const away = dropBoard(start, drag('d', 'column', 900, 600, 900, 0), measured);
    expect(away.bumped).toEqual({});
    expect(xs(away.board, ['a', 'b', 'c'])).toEqual([0, 300, 600]);
  });

  it('a block below the dragged one (not in its row) still just moves out of the way', () => {
    let b = row();
    b = loose(b, 'n', 0, 540, 300);
    // a now covers only the top 40px of n: not the same row.
    const r = dropBoard(b, drag('a', 'column', 0, 360), measured);
    expect(r.board.cards.n.x).toBe(0);
    expect(r.board.cards.n.y).toBeGreaterThan(540);
    expectNoOverlap(r.board);
  });

  it('widening a card pushes its row neighbours sideways, keeping their order, not down', () => {
    let b = loose(B.createBoard(), 'tuesday', 0, 0, 160);
    b = loose(b, 'notes', 260, 0, 160);
    b = loose(b, 'later', 520, 20, 160);
    const wide = shiftRow(B.resizeCard(b, 'tuesday', 400), 'tuesday', measured);
    expect(xs(wide, ['tuesday', 'notes', 'later'])).toEqual([0, 420, 680]);
    expect(ys(wide, ['tuesday', 'notes', 'later'])).toEqual([0, 0, 20]);
    expectNoOverlap(settle(wide, measured, ['tuesday']));
    // Shrinking it back before letting go: nothing was moved yet, so they stay where they were.
    const same = B.resizeCard(b, 'tuesday', 240);
    expect(shiftRow(same, 'tuesday', measured)).toBe(same);
  });

  it('widening a card past its neighbour’s middle still pushes the neighbour right, never to its left', () => {
    let b = loose(B.createBoard(), 'tuesday', 0, 0, 160);
    b = loose(b, 'notes', 260, 0, 160);
    const wide = shiftRow(B.resizeCard(b, 'tuesday', 800), 'tuesday', measured);
    expect(wide.cards.notes).toMatchObject({ x: 820, y: 0 });
  });

  describe('widening one card in a row of wide cards', () => {
    // Three loose cards, 20px apart, plus one more on the right (owner report, job 125).
    const wideRow = () => {
      let b = loose(B.createBoard(), 'home', 0, 0, 300);
      b = loose(b, 'tuesday', 460, 0, 300);
      b = loose(b, 'mid', 880, 0, 300);
      b = loose(b, 'returns', 1380, 0, 300);
      return B.resizeCard(B.resizeCard(B.resizeCard(B.resizeCard(b, 'home', 440), 'tuesday', 400), 'mid', 480), 'returns', 380);
    };
    const ids = ['home', 'tuesday', 'mid', 'returns'];
    const after = (id: string, w: number) => settle(shiftRow(B.resizeCard(wideRow(), id, w), id, measured), measured, [id]);

    it('the middle card keeps its place; blocks to its left stay, the one it covers slides right, in order', () => {
      const b = after('tuesday', 560);
      expect(xs(b, ['home', 'tuesday'])).toEqual([0, 460]);
      expect(b.cards.mid.x).toBeGreaterThanOrEqual(460 + 560 + BLOCK_GAP);
      expect(b.cards.returns.x).toBeGreaterThanOrEqual(b.cards.mid.x + 480 + BLOCK_GAP);
      expect(ys(b, ids)).toEqual([0, 0, 0, 0]);
      const order = [...ids].sort((p, q) => b.cards[p].x - b.cards[q].x);
      expect(order).toEqual(ids);
      expectNoOverlap(b);
    });

    it('the leftmost card keeps its place and pushes everything it covers right, in order', () => {
      const b = after('home', 800);
      expect(b.cards.home.x).toBe(0);
      const order = [...ids].sort((p, q) => b.cards[p].x - b.cards[q].x);
      expect(order).toEqual(ids);
      expect(b.cards.tuesday.x).toBeGreaterThanOrEqual(800 + BLOCK_GAP);
      expectNoOverlap(b);
    });

    it('the rightmost card grows to the right and nothing else moves', () => {
      const before = wideRow();
      const b = after('returns', 700);
      expect(xs(b, ids)).toEqual(xs(before, ids));
      expect(b.cards.returns.w).toBe(700);
    });

    it('widening across two neighbours pushes both right, keeping their order; the left one stays', () => {
      const b = after('tuesday', 1000);
      expect(xs(b, ['home', 'tuesday'])).toEqual([0, 460]);
      expect(b.cards.mid.x).toBeGreaterThanOrEqual(460 + 1000 + BLOCK_GAP);
      expect(b.cards.returns.x).toBeGreaterThanOrEqual(b.cards.mid.x + 480 + BLOCK_GAP);
      const order = [...ids].sort((p, q) => b.cards[p].x - b.cards[q].x);
      expect(order).toEqual(ids);
      expectNoOverlap(b);
    });

    it('a container resized in a row of cards behaves the same', () => {
      let b = loose(B.createBoard(), 'left', 0, 0, 300);
      b = B.addColumn(b, { ...createColumn('col'), x: 460, y: 0 });
      heights.col = 300;
      b = loose(b, 'right', 800, 0, 300);
      const wide = shiftRow(B.resizeColumn(b, 'col', 600), 'col', measured);
      expect(wide.cards.left.x).toBe(0);
      expect(wide.columns.col.x).toBe(460);
      expect(wide.cards.right.x).toBeGreaterThanOrEqual(460 + 600 + BLOCK_GAP);
    });
  });

  it('blocks stacked beside the dragged block move over together, not spread out', () => {
    let b = B.addColumn(B.createBoard(), { ...createColumn('a'), x: 0, y: 0 });
    heights.a = 600;
    b = loose(b, 'n1', 300, 0, 160);
    b = loose(b, 'n2', 300, 200, 160);
    const r = dropBoard(b, drag('a', 'column', 100, 0), measured);
    expect(xs(r.board, ['n1', 'n2'])).toEqual([400, 400]);
    expect(ys(r.board, ['n1', 'n2'])).toEqual([0, 200]);
  });

  it('a dragged card that will be moved off a container does not shift its row first', () => {
    let b = B.addColumn(B.createBoard(), { ...createColumn('col'), x: 0, y: 0 });
    heights.col = 220;
    b = loose(b, 'n', 300, 0, 160);
    b = loose(b, 'm', 0, 600, 160);
    // m dropped over the container's right edge and touching n: m is moved off the container, so n
    // is not slid sideways for a spot m never takes (where m then lands is the old nearest-free-spot rule).
    const r = dropBoard(b, drag('m', 'card', 240, 0, 0, 600), measured);
    expect(r.board.cards.n.x).toBe(300);
    expectNoOverlap(r.board);
  });

  it('a single dragged card still never pushes a container sideways', () => {
    let b = row();
    b = loose(b, 'n', 0, 300, 100);
    const r = dropBoard(b, drag('n', 'card', 300, 0, 0, 300), measured);
    expect(xs(r.board, ['a', 'b', 'c', 'd'])).toEqual([0, 300, 600, 900]);
    expectNoOverlap(r.board);
  });
});
