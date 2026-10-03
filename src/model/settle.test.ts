import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard, createColumn } from './cards';
import { BLOCK_GAP } from './constants';
import { overlaps } from './geometry';
import { landingSpot, settle, snapAll, topLevelRects, type MeasuredHeight } from './layout';
import type { Board } from './types';

const heights: Record<string, number> = {};
const measured: MeasuredHeight = (id) => heights[id];

function noOverlaps(b: Board) {
  const rects = topLevelRects(b, measured);
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j], BLOCK_GAP - 1), `blocks ${i} and ${j}`).toBe(false);
}

function loose(b: Board, id: string, x: number, y: number, h = 100) {
  heights[id] = h;
  return B.addCard(b, createCard('note', id), { type: 'loose', x, y });
}

describe('settle (no overlap, ever)', () => {
  it('leaves a tidy board alone', () => {
    let b = loose(B.createBoard(), 'a', 0, 0);
    b = loose(b, 'b', 300, 0);
    expect(settle(b, measured)).toBe(b);
  });

  it('moves a block out of the way of the anchor, keeping the 10px gap', () => {
    let b = loose(B.createBoard(), 'a', 0, 0);
    b = loose(b, 'b', 100, 40);
    const s = settle(b, measured, ['b']);
    expect(s.cards.b).toMatchObject({ x: 100, y: 40 }); // the anchor stays put
    expect(s.cards.a).not.toMatchObject({ x: 0, y: 0 });
    noOverlaps(s);
  });

  it('when two anchored blocks are in each other\'s way, the first-listed (most recent) stays put', () => {
    let b = loose(B.createBoard(), 'older', 0, 0);
    b = loose(b, 'newer', 40, 40);
    const s = settle(b, measured, ['newer', 'older']);
    expect(s.cards.newer).toMatchObject({ x: 40, y: 40 });
    expect(s.cards.older).not.toMatchObject({ x: 0, y: 0 });
    noOverlaps(s);
  });

  it('a column that grows pushes the card below it further down', () => {
    let b = B.addColumn(B.createBoard(), { ...createColumn('col'), x: 0, y: 0 });
    heights.col = 220;
    b = loose(b, 'under', 20, 240);
    expect(settle(b, measured, ['col'])).toBe(b);
    heights.col = 400; // cards were added and the column is now taller
    const s = settle(b, measured, ['col']);
    expect(s.columns.col).toMatchObject({ x: 0, y: 0 });
    noOverlaps(s);
  });

  it('untangles a pile of overlapping blocks, landing on the grid', () => {
    let b = B.createBoard();
    for (let i = 0; i < 8; i++) b = loose(b, `p${i}`, 40, 40);
    const s = settle(b, measured);
    noOverlaps(s);
    for (const id of s.order) {
      expect(Math.abs(s.cards[id].x % 20)).toBe(0);
      expect(Math.abs(s.cards[id].y % 20)).toBe(0);
    }
  });

  it('uses resized widths', () => {
    let b = loose(B.createBoard(), 'wide', 0, 0);
    b = B.resizeCard(b, 'wide', 600, 100);
    b = loose(b, 'right', 400, 0);
    noOverlaps(settle(b, measured, ['wide']));
  });
});

describe('landing spot while dragging', () => {
  it('is where the block is when that spot is free', () => {
    const b = loose(B.createBoard(), 'a', 0, 0);
    expect(landingSpot(b, 'x', 500, 0, { w: 240, h: 100 }, measured)).toEqual({ x: 500, y: 0 });
  });

  it('is the nearest free spot when hovering over another block', () => {
    const b = loose(B.createBoard(), 'a', 0, 0);
    const spot = landingSpot(b, 'x', 40, 20, { w: 240, h: 100 }, measured);
    expect(overlaps({ ...spot, w: 240, h: 100 }, { x: 0, y: 0, w: 240, h: 100 }, BLOCK_GAP)).toBe(false);
  });

  it('ignores the dragged block itself', () => {
    const b = loose(B.createBoard(), 'self', 0, 0);
    expect(landingSpot(b, 'self', 20, 20, { w: 240, h: 100 }, measured)).toEqual({ x: 20, y: 20 });
  });
});

describe('snap back on', () => {
  it('moves every position and resized size to the nearest grid point', () => {
    let b = { ...B.createBoard(), snap: false };
    b = B.addColumn(b, { ...createColumn('c'), x: 33, y: 47, w: 297, h: 251 });
    b = B.addCard(b, { ...createCard('note', 'n'), w: 263, h: 109 }, { type: 'loose', x: 101, y: 9 });
    b = B.addCard(b, createCard('note', 'plain'), { type: 'loose', x: 555, y: 555 });
    const s = snapAll(b);
    expect(s.columns.c).toMatchObject({ x: 40, y: 40, w: 300, h: 260 });
    expect(s.cards.n).toMatchObject({ x: 100, y: 0, w: 260, h: 100 });
    expect(s.cards.plain).toMatchObject({ x: 560, y: 560, w: null, h: null });
  });
});

describe('resizing data', () => {
  it('sets a card width and minimum height, and a column width with or without height', () => {
    let b = loose(B.createBoard(), 'n', 0, 0);
    b = B.addColumn(b, createColumn('c'));
    b = B.resizeCard(b, 'n', 320, 160);
    b = B.resizeColumn(b, 'c', 360);
    expect(b.cards.n).toMatchObject({ w: 320, h: 160 });
    expect(b.columns.c).toMatchObject({ w: 360, h: null });
    b = B.resizeColumn(b, 'c', 380, 400);
    expect(b.columns.c).toMatchObject({ w: 380, h: 400 });
    expect(B.resizeColumn(b, 'c', 380, 400)).toBe(b);
  });
});

describe('growing blocks push what is below them straight down (owner request)', () => {
  it('a block below goes straight down, and so does the one below that', () => {
    let b = loose(B.createBoard(), 'top', 0, 0, 400); // grew to 400 tall
    b = loose(b, 'mid', 20, 200, 100);
    b = loose(b, 'low', 0, 320, 100);
    const out = settle(b, measured, ['top'], true);
    expect(out.cards.mid).toMatchObject({ x: 20, y: 420 });
    expect(out.cards.low).toMatchObject({ x: 0, y: 540 });
    noOverlaps(out);
  });

  it('a block beside it still takes the nearest free spot', () => {
    let b = loose(B.createBoard(), 'top', 0, 100, 300);
    b = loose(b, 'side', 200, 0, 200); // starts above the grown block's top
    const out = settle(b, measured, ['top'], true);
    expect(out.cards.side.y).toBeLessThan(100);
    noOverlaps(out);
  });

  it('without pushDown, the nearest free spot is used as before', () => {
    let b = loose(B.createBoard(), 'top', 0, 0, 400);
    b = loose(b, 'mid', 200, 200, 100);
    expect(settle(b, measured, ['top']).cards.mid.y).toBe(200); // moved sideways, not down
  });
});
