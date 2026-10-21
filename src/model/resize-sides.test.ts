import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard, createColumn } from './cards';
import { BLOCK_GAP, COLLAPSED_MIN_H } from './constants';
import { overlaps } from './geometry';
import { pushUp, settle, shiftRow, type MeasuredHeight } from './layout';
import { resizeFrom } from './sizing';
import type { Board } from './types';

// Resizing from any side or corner (owner request 2026-10-21, job 135).

describe('resizeFrom: which edge moves', () => {
  const start = { x: 200, y: 100, w: 300, h: 200 };

  it('the right edge or bottom edge keeps the top-left corner where it is', () => {
    expect(resizeFrom('card', 'e', start, { x: 100, y: 50 }, [], true)).toMatchObject({ x: 200, y: 100, w: 400, h: null });
    expect(resizeFrom('card', 's', start, { x: 100, y: 60 }, [], true)).toMatchObject({ x: 200, y: 100, w: 300, h: 260 });
    expect(resizeFrom('card', 'se', start, { x: 100, y: 60 }, [], true)).toMatchObject({ x: 200, y: 100, w: 400, h: 260 });
  });

  it('the left edge keeps the right edge where it is: dragging out (left) widens and moves x', () => {
    const r = resizeFrom('card', 'w', start, { x: -100, y: 40 }, [], true);
    expect(r).toMatchObject({ x: 100, y: 100, w: 400, h: null });
    expect(r.x + r.w).toBe(500);
  });

  it('dragging the left edge in narrows it and moves x the other way', () => {
    expect(resizeFrom('card', 'w', start, { x: 40, y: 0 }, [], true)).toMatchObject({ x: 240, w: 260 });
  });

  it('the top edge keeps the bottom edge where it is', () => {
    const r = resizeFrom('card', 'n', start, { x: 30, y: -80 }, [], true);
    expect(r).toMatchObject({ x: 200, y: 20, w: 300, h: 280 });
    expect(r.y + (r.h ?? 0)).toBe(300);
  });

  it('a corner moves both of its edges', () => {
    expect(resizeFrom('card', 'nw', start, { x: -60, y: -40 }, [], true)).toMatchObject({ x: 140, y: 60, w: 360, h: 240 });
    expect(resizeFrom('card', 'ne', start, { x: 60, y: -40 }, [], true)).toMatchObject({ x: 200, y: 60, w: 360, h: 240 });
    expect(resizeFrom('card', 'sw', start, { x: -60, y: 40 }, [], true)).toMatchObject({ x: 140, y: 100, w: 360, h: 240 });
  });

  it('while dragging the drawn edge follows the pointer; on release it lands on the grid', () => {
    const r = resizeFrom('card', 'w', start, { x: -63, y: 0 }, [], true);
    expect([r.liveX, r.liveW]).toEqual([137, 363]);
    expect([r.x, r.w]).toEqual([140, 360]);
    const t = resizeFrom('card', 'n', start, { x: 0, y: -33 }, [], true);
    expect([t.liveY, t.liveH]).toEqual([67, 233]);
    expect([t.y, t.h]).toEqual([60, 240]);
  });

  it('the left and top edges land on the grid even when the opposite edge is not on it', () => {
    // Right edge at 347 (a width matched earlier), bottom edge at 434 (a card that fits its text).
    const off = { x: 100, y: 300, w: 247, h: 134 };
    const w = resizeFrom('card', 'w', off, { x: -53, y: 0 }, [], true);
    expect(w.x % 20).toBe(0);
    expect(w.x + w.w).toBe(347);
    expect(w.label).toBe(`${w.w} wide`);
    const n = resizeFrom('card', 'n', off, { x: 0, y: -57 }, [], true);
    expect(n.y % 20).toBe(0);
    expect(n.y + (n.h ?? 0)).toBe(434);
    expect(n.label).toBe(`${n.w} × ${n.h}`);
    // The right and bottom edges still snap the size, as before.
    expect(resizeFrom('card', 'se', off, { x: 53, y: 57 }, [], true)).toMatchObject({ x: 100, y: 300, w: 300, h: 200 });
  });

  it('keeps exact sizes when snapping is off', () => {
    expect(resizeFrom('card', 'w', start, { x: -63, y: 0 }, [], false)).toMatchObject({ x: 137, w: 363 });
  });

  it('size limits hold, and the opposite edge stays put when a limit stops the drag', () => {
    expect(resizeFrom('card', 'w', start, { x: 250, y: 0 }, [], true)).toMatchObject({ w: 200, x: 300 });
    expect(resizeFrom('card', 'w', start, { x: -5000, y: 0 }, [], true)).toMatchObject({ w: 1280, x: 500 - 1280 });
    expect(resizeFrom('card', 'n', start, { x: 0, y: 500 }, [], true)).toMatchObject({ h: 100, y: 200 });
    expect(resizeFrom('card', 'n', start, { x: 0, y: -5000 }, [], true)).toMatchObject({ h: 700, y: 300 - 700 });
    expect(resizeFrom('column', 'w', start, { x: 250, y: 0 }, [], true)).toMatchObject({ w: 240, x: 260 });
  });

  it('a collapsed card can be as short as its header', () => {
    const r = resizeFrom('card', 'n', { x: 0, y: 0, w: 300, h: 60 }, { x: 0, y: 40 }, [], true, COLLAPSED_MIN_H);
    expect(r).toMatchObject({ h: COLLAPSED_MIN_H, y: 20 });
  });

  it('matches another block’s size when close, and the edge that moves follows the matched size', () => {
    const r = resizeFrom('card', 'w', start, { x: -97, y: 0 }, [{ id: 'o', w: 400, h: 90 }], true);
    expect(r).toMatchObject({ w: 400, x: 100, liveW: 400, liveX: 100, matchIds: ['o'] });
    expect(r.label).toContain('same width');
  });
});

describe('resizeBlock', () => {
  it('sets size and position together, without bringing the block to the front', () => {
    let b = B.addCard(B.createBoard(), createCard('note', 'a'), { type: 'loose', x: 200, y: 100 });
    b = B.addCard(b, createCard('note', 'z'), { type: 'loose', x: 900, y: 100 });
    const r = B.resizeBlock(b, 'a', { x: 100, y: 40, w: 400, h: 260 });
    expect(r.cards.a).toMatchObject({ x: 100, y: 40, w: 400, h: 260 });
    expect(r.order).toEqual(b.order);
    expect(B.resizeBlock(r, 'a', { x: 100, y: 40, w: 400, h: 260 })).toBe(r);
  });

  it('a collapsed card keeps its open height apart', () => {
    let b = B.addCard(B.createBoard(), createCard('note', 'a'), { type: 'loose', x: 200, y: 100 });
    b = B.resizeBlock(b, 'a', { x: 200, y: 100, w: 300, h: 220 });
    b = B.updateCard(b, 'a', (c) => ({ ...c, collapsed: true }));
    const r = B.resizeBlock(b, 'a', { x: 200, y: 60, w: 300, h: 100 });
    expect(r.cards.a).toMatchObject({ y: 60, h: 220, collapsedH: 100 });
  });

  it('a container takes width and position; its height only when asked', () => {
    const b = B.addColumn(B.createBoard(), { ...createColumn('c'), x: 300, y: 100 });
    const r = B.resizeBlock(b, 'c', { x: 200, y: 100, w: 400, h: null });
    expect(r.columns.c).toMatchObject({ x: 200, w: 400, h: b.columns.c.h });
    const t = B.resizeBlock(b, 'c', { x: 300, y: 40, w: 300, h: 400 });
    expect(t.columns.c).toMatchObject({ y: 40, h: 400 });
  });
});

describe('after letting go of the left or top edge', () => {
  const heights: Record<string, number> = {};
  const measured: MeasuredHeight = (id) => heights[id];
  function loose(b: Board, id: string, x: number, y: number, w = 200, h = 100) {
    heights[id] = h;
    return B.resizeCard(B.addCard(b, createCard('note', id), { type: 'loose', x, y }), id, w, h);
  }
  const xs = (b: Board, ids: string[]) => ids.map((id) => B.blockOf(b, id)!.x);
  const ys = (b: Board, ids: string[]) => ids.map((id) => B.blockOf(b, id)!.y);
  function expectNoOverlap(b: Board) {
    const rects = b.order.map((id) => {
      const blk = B.blockOf(b, id)!;
      return { id, x: blk.x, y: blk.y, w: (blk as { w: number }).w, h: heights[id] };
    });
    for (const [i, a] of rects.entries()) for (const c of rects.slice(i + 1)) expect(overlaps(a, c, BLOCK_GAP - 1), `${a.id} / ${c.id}`).toBe(false);
  }

  describe('the left edge', () => {
    // a b c in a row, 20px apart: b is the one resized.
    const row = () => {
      let b = loose(B.createBoard(), 'a', 0, 0);
      b = loose(b, 'b', 220, 0);
      b = loose(b, 'c', 440, 0);
      return b;
    };
    // b dragged out to the left: x 220 -> 100, width 200 -> 320.
    const wider = (b: Board) => B.resizeBlock(b, 'b', { x: 100, y: 0, w: 320, h: 100 });

    it('blocks in its row that end at or left of it slide left, keeping their order', () => {
      const b = shiftRow(wider(row()), 'b', measured, undefined, 'left');
      expect(xs(b, ['a', 'b', 'c'])).toEqual([-120, 100, 440]);
      expectNoOverlap(b);
    });

    it('blocks to its right do not move', () => {
      const b = shiftRow(wider(row()), 'b', measured, undefined, 'left');
      expect(b.cards.c.x).toBe(440);
    });

    it('pushes several blocks along, one after the other', () => {
      let b = loose(B.createBoard(), 'a', 0, 0);
      b = loose(b, 'a2', -220, 0);
      b = loose(b, 'b', 220, 0);
      b = shiftRow(wider(b), 'b', measured, undefined, 'left');
      expect(xs(b, ['a2', 'a', 'b'])).toEqual([-340, -120, 100]);
      expectNoOverlap(b);
    });

    it('nothing moves when the edge is still clear of its neighbour', () => {
      const clear = B.resizeBlock(row(), 'b', { x: 210, y: 0, w: 210, h: 100 });
      expect(shiftRow(clear, 'b', measured, undefined, 'left')).toBe(clear);
    });

    it('shrinking it back before letting go leaves them where they were', () => {
      const same = B.resizeBlock(row(), 'b', { x: 220, y: 0, w: 200, h: 100 });
      expect(shiftRow(same, 'b', measured, undefined, 'left')).toBe(same);
    });

    it('lands on the grid when snapping is on', () => {
      const b = shiftRow(B.resizeBlock(row(), 'b', { x: 90, y: 0, w: 330, h: 100 }), 'b', measured, undefined, 'left');
      expect(Math.abs(b.cards.a.x % 20)).toBe(0);
      expect(b.cards.a.x + 200 + BLOCK_GAP).toBeLessThanOrEqual(90);
    });

    it('blocks not in its row are left alone', () => {
      const b = loose(row(), 'low', 0, 400);
      expect(shiftRow(wider(b), 'b', measured, undefined, 'left').cards.low.x).toBe(0);
    });

    it('a container resized from its left edge pushes its row the same way', () => {
      let b = loose(B.createBoard(), 'a', 0, 0, 200, 300);
      b = B.addColumn(b, { ...createColumn('col'), x: 220, y: 0 });
      heights.col = 300;
      const r = shiftRow(B.resizeBlock(b, 'col', { x: 100, y: 0, w: 360, h: null }), 'col', measured, undefined, 'left');
      expect(r.cards.a.x).toBe(-120);
    });
  });

  describe('the top edge', () => {
    // A stack: a over b over c; b is dragged up.
    const stack = () => {
      let b = loose(B.createBoard(), 'a', 0, 0);
      b = loose(b, 'b', 0, 120);
      b = loose(b, 'c', 0, 300);
      return b;
    };
    const taller = (b: Board) => {
      heights.b = 220;
      return B.resizeBlock(b, 'b', { x: 0, y: 20, w: 200, h: 220 });
    };

    it('blocks above it in its column move up, keeping their order', () => {
      const b = pushUp(taller(stack()), 'b', measured);
      // b now starts at 20: a (100 tall) must end 10px above, on the grid: y = -100.
      expect(ys(b, ['a', 'b', 'c'])).toEqual([-100, 20, 300]);
      expectNoOverlap(b);
    });

    it('blocks below it do not move', () => {
      expect(pushUp(taller(stack()), 'b', measured).cards.c.y).toBe(300);
    });

    it('pushes a pile of blocks up one after the other', () => {
      let b = loose(B.createBoard(), 'a0', 0, -120);
      b = loose(b, 'a', 0, 0);
      b = loose(b, 'b', 0, 120);
      const r = pushUp(taller(b), 'b', measured);
      expect(r.cards.a.y).toBeLessThanOrEqual(20 - BLOCK_GAP - 100);
      expect(r.cards.a0.y).toBeLessThanOrEqual(r.cards.a.y - BLOCK_GAP - 100);
      expectNoOverlap(r);
    });

    it('blocks beside it (not over it) stay put', () => {
      const b = loose(stack(), 'side', 400, 0);
      expect(pushUp(taller(b), 'b', measured).cards.side.y).toBe(0);
    });

    it('nothing moves when the edge is still clear', () => {
      const clear = B.resizeBlock(stack(), 'b', { x: 0, y: 120, w: 200, h: 100 });
      expect(pushUp(clear, 'b', measured)).toBe(clear);
    });

    it('the grown block itself never moves', () => {
      const b = pushUp(taller(stack()), 'b', measured);
      expect(b.cards.b.y).toBe(20);
      expectNoOverlap(settle(b, measured, ['b']));
    });
  });
});
