import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard, createColumn } from './cards';
import { BLOCK_GAP } from './constants';
import { overlaps } from './geometry';
import { edgePanStep } from './edgePan';
import { pushUp, settle, shiftRow, topLevelRects, type MeasuredHeight } from './layout';
import { columnLists, multiAsText, rangeAcross } from './multiSelect';
import { dropBoard } from './placement';
import type { Board, TodoCard } from './types';

// Guards for layout branches that no other test reached (review pass, job 156). They pass today.

const heights: Record<string, number> = {};
const measured: MeasuredHeight = (id) => heights[id];

function loose(b: Board, id: string, x: number, y: number, h = 100) {
  heights[id] = h;
  return B.addCard(b, createCard('note', id), { type: 'loose', x, y });
}

function noOverlaps(b: Board) {
  const rects = topLevelRects(b, measured);
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j], BLOCK_GAP - 1), `blocks ${i} and ${j}`).toBe(false);
}

describe('layout guards', () => {
  it('settle moves a container out of the way of an anchored card', () => {
    let b = B.addColumn(B.createBoard(), { ...createColumn('col'), x: 0, y: 0 });
    heights.col = 220;
    b = loose(b, 'n', 40, 40);
    const s = settle(b, measured, ['n']);
    expect(s.cards.n).toMatchObject({ x: 40, y: 40 });
    expect(s.columns.col).toMatchObject({ x: 0, y: 160 });
    noOverlaps(s);
  });

  it('shiftRow with snapping off lands exactly 10px from the block that grew (right edge)', () => {
    const b0 = { ...loose(B.createBoard(), 'a', 0, 0), snap: false };
    const b = loose(b0, 'b', 253, 0);
    const grown = B.resizeCard(b, 'a', 333);
    expect(shiftRow(grown, 'a', measured).cards.b.x).toBe(343);
  });

  it('shiftRow with snapping off lands exactly 10px from the block that grew (left edge)', () => {
    const b0 = { ...loose(B.createBoard(), 'a', 0, 0), snap: false };
    const b = loose(b0, 'b', 253, 0);
    const grown = B.resizeBlock(b, 'b', { x: 197, y: 0, w: 296, h: null });
    expect(shiftRow(grown, 'b', measured, undefined, 'left').cards.a.x).toBe(-53);
  });

  it('pushUp with snapping off moves a container up to exactly 10px above the block that grew', () => {
    let b = { ...B.createBoard(), snap: false };
    b = B.addColumn(b, { ...createColumn('col'), x: 0, y: 0 });
    heights.col = 220;
    b = loose(b, 'low', 0, 240, 100);
    heights.low = 233;
    const r = pushUp(B.resizeBlock(b, 'low', { x: 0, y: 107, w: 240, h: 233 }), 'low', measured, 240);
    expect(r.columns.col.y).toBe(-123); // 107 - 10 - 220
    expect(r.cards.low.y).toBe(107);
  });

  it('a straight-down drag onto a row neighbor sends the neighbor right', () => {
    let b = loose(B.createBoard(), 'a', 0, -300);
    b = loose(b, 'b', 0, 0);
    const r = dropBoard(b, { id: 'a', kind: 'card', x: 0, y: 0, startX: 0, startY: -300, group: [] }, measured);
    expect(r.board.cards.b).toMatchObject({ x: 260, y: 0 });
    expect(r.at).toEqual({ x: 0, y: 0 });
  });

  it('a block growing taller with snapping off pushes the block below straight down to exactly 10px below', () => {
    let b = { ...B.createBoard(), snap: false };
    b = loose(b, 'top', 0, 0, 400);
    b = loose(b, 'mid', 20, 200, 100);
    expect(settle(b, measured, ['top'], true).cards.mid).toMatchObject({ x: 20, y: 410 });
  });
});

describe('edge panning', () => {
  const area = { left: 0, top: 0, right: 1000, bottom: 800 };

  it('near a corner both axes pan', () => {
    expect(edgePanStep({ x: 5, y: 5 }, area)).toEqual({ dx: 16, dy: 16 });
  });

  it('in a tiny area both sides pull equally, so nothing moves', () => {
    expect(edgePanStep({ x: 30, y: 30 }, { left: 0, top: 0, right: 60, bottom: 60 })).toEqual({ dx: 0, dy: 0 });
  });
});

describe('selecting items across lists with odd input', () => {
  const list = (id: string, texts: string[], extra: Partial<TodoCard> = {}): TodoCard => ({
    ...(createCard('todo', id) as TodoCard),
    title: id,
    items: texts.map((t) => ({ id: `${id}-${t}`, text: t, done: false, children: [] })),
    ...extra,
  });
  const boardWith = () => {
    let b = B.addColumn(B.createBoard(), { ...createColumn('col'), x: 0, y: 0 });
    b = B.addCard(b, createCard('note', 'note'), { type: 'column', columnId: 'col', index: 0 });
    b = B.addCard(b, list('L1', ['a', 'b']), { type: 'column', columnId: 'col', index: 1 });
    b = B.addCard(b, list('L2', ['c']), { type: 'column', columnId: 'col', index: 2 });
    b = B.addCard(b, list('Empty', []), { type: 'column', columnId: 'col', index: 3 });
    b = B.addCard(b, list('Shut', ['z'], { collapsed: true }), { type: 'column', columnId: 'col', index: 4 });
    return b;
  };

  it('rangeAcross with an item that is not in the column gives nothing', () => {
    const b = boardWith();
    expect(rangeAcross(b, 'col', { cardId: 'L1', itemId: 'L1-a' }, { cardId: 'L2', itemId: 'nope' })).toEqual([]);
  });

  it('columnLists skips notes, empty lists and collapsed lists', () => {
    expect(columnLists(boardWith(), 'col').map((l) => l.cardId)).toEqual(['L1', 'L2']);
  });

  it('multiAsText skips a card that is no longer a list, and gives only what still exists', () => {
    const b = boardWith();
    expect(multiAsText(b, [{ cardId: 'note', ids: ['x'] }])).toBe('');
    expect(multiAsText(b, [{ cardId: 'L1', ids: ['L1-a', 'L1-b'] }, { cardId: 'L2', ids: ['L2-c'] }])).toBe('L1\n  a\n  b\nL2\n  c');
  });
});
