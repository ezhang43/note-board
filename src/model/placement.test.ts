import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard, createColumn } from './cards';
import type { MeasuredHeight } from './layout';
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
