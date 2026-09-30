import { BLOCK_GAP, CARD_W, GRID, NEW_BLOCK_H } from './constants';
import { freeSpot, snapToGrid } from './geometry';
import type { Board, Point, Rect } from './types';

/** Height of a block as last drawn on screen, in board pixels (undefined if not drawn yet). */
export type MeasuredHeight = (id: string) => number | undefined;

/** The rectangle a top-level block (column or loose card) covers on the board. */
export function blockRect(board: Board, id: string, measured: MeasuredHeight): Rect | null {
  const col = board.columns[id];
  if (col) return { x: col.x, y: col.y, w: col.w, h: measured(id) ?? NEW_BLOCK_H.column };
  const card = board.cards[id];
  if (card) return { x: card.x, y: card.y, w: CARD_W, h: measured(id) ?? NEW_BLOCK_H[card.kind] };
  return null;
}

export function topLevelRects(board: Board, measured: MeasuredHeight): Rect[] {
  return board.order.flatMap((id) => {
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
  return freeSpot({ ...start, w, h }, topLevelRects(board, measured), BLOCK_GAP, board.snap ? GRID : 10);
}
