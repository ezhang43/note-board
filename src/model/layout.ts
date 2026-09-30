import { BLOCK_GAP, BLOCK_MIN_H, CARD_W, COLUMN_MIN_W, GRID, NEW_BLOCK_H } from './constants';
import { freeSpot, overlaps, snapToGrid } from './geometry';
import type { Board, Point, Rect } from './types';

/** Height of a block as last drawn on screen, in board pixels (undefined if not drawn yet). */
export type MeasuredHeight = (id: string) => number | undefined;

/** Search step for free spots: whole grid steps when snapping, finer otherwise. */
const stepFor = (board: Board) => (board.snap ? GRID : 10);

/** The rectangle a top-level block (column or loose card) covers on the board. */
export function blockRect(board: Board, id: string, measured: MeasuredHeight): Rect | null {
  const col = board.columns[id];
  if (col) return { x: col.x, y: col.y, w: col.w, h: measured(id) ?? NEW_BLOCK_H.column };
  const card = board.cards[id];
  if (card) return { x: card.x, y: card.y, w: card.w ?? CARD_W, h: measured(id) ?? card.h ?? NEW_BLOCK_H[card.kind] };
  return null;
}

export function topLevelRects(board: Board, measured: MeasuredHeight, except: string[] = []): Rect[] {
  return board.order.flatMap((id) => {
    if (except.includes(id)) return [];
    const r = blockRect(board, id, measured);
    return r ? [r] : [];
  });
}

/**
 * Where a new block of size w × h goes: as close as possible to `centre` (normally the middle of
 * the screen) without covering or touching any existing block. On the grid when snapping is on.
 */
export function spotForNewBlock(board: Board, w: number, h: number, centre: Point, measured: MeasuredHeight): Point {
  const x = centre.x - w / 2;
  const y = centre.y - h / 2;
  const start = board.snap ? { x: snapToGrid(x), y: snapToGrid(y) } : { x: Math.round(x), y: Math.round(y) };
  return freeSpot({ ...start, w, h }, topLevelRects(board, measured), BLOCK_GAP, stepFor(board));
}

/**
 * Where a dragged block would land if dropped with its top-left at x,y: the nearest spot that keeps
 * the 10px gap from every other block. Returns the same x,y when that spot is already free.
 */
export function landingSpot(board: Board, id: string, x: number, y: number, size: { w: number; h: number }, measured: MeasuredHeight): Point {
  return freeSpot({ x, y, ...size }, topLevelRects(board, measured, [id]), BLOCK_GAP, stepFor(board));
}

/**
 * Makes sure no two loose blocks overlap or come within 10px of each other.
 * `anchors` (the block just moved, resized, grown or dropped into) stay put; everything else that
 * is in the way moves to the nearest free spot. Columns are moved before loose cards.
 * Returns the same board when nothing needs to move.
 */
export function settle(board: Board, measured: MeasuredHeight, anchors: string[] = []): Board {
  const rank = (id: string) => (anchors.includes(id) ? 0 : board.columns[id] ? 1 : 2);
  const blocks = board.order
    .map((id, i) => ({ id, i, rect: blockRect(board, id, measured)! }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.i - b.i);

  const placed: Rect[] = [];
  const moves = new Map<string, Point>();
  for (const b of blocks) {
    let rect = b.rect;
    // One pixel of slack so rounding never makes blocks exactly 10px apart look "too close".
    if (placed.some((o) => overlaps(rect, o, BLOCK_GAP - 1))) {
      const spot = freeSpot(rect, placed, BLOCK_GAP, stepFor(board));
      moves.set(b.id, spot);
      rect = { ...rect, ...spot };
    }
    placed.push(rect);
  }
  if (!moves.size) return board;

  const cards = { ...board.cards };
  const columns = { ...board.columns };
  for (const [id, p] of moves) {
    if (columns[id]) columns[id] = { ...columns[id], ...p };
    else cards[id] = { ...cards[id], ...p };
  }
  return { ...board, cards, columns };
}

const snapSize = (v: number | null, min: number) => (v == null ? v : Math.max(min, snapToGrid(v)));

/** Turning snapping back on: every block's position and resized size moves to the nearest grid point. */
export function snapAll(board: Board): Board {
  const cards = Object.fromEntries(
    Object.entries(board.cards).map(([id, c]) => [
      id,
      { ...c, x: snapToGrid(c.x), y: snapToGrid(c.y), w: snapSize(c.w, BLOCK_MIN_H), h: snapSize(c.h, BLOCK_MIN_H) },
    ]),
  );
  const columns = Object.fromEntries(
    Object.entries(board.columns).map(([id, c]) => [
      id,
      { ...c, x: snapToGrid(c.x), y: snapToGrid(c.y), w: Math.max(COLUMN_MIN_W, snapToGrid(c.w)), h: snapSize(c.h, BLOCK_MIN_H) },
    ]),
  );
  return { ...board, cards, columns };
}
