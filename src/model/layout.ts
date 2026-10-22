import { BLOCK_GAP, BLOCK_MIN_H, CARD_MIN_W, CARD_W, COLLAPSED_MIN_H, COLUMN_MIN_W, GRID, NEW_BLOCK_H } from './constants';
import { freeSpot, overlaps, snapIf, snapToGrid } from './geometry';
import type { Board, Point, Rect } from './types';

/** Height of a block as last drawn on screen, in board pixels (undefined if not drawn yet). */
export type MeasuredHeight = (id: string) => number | undefined;

/** Search step for free spots: whole grid steps when snapping, finer otherwise. */
const stepFor = (board: Board) => (board.snap ? GRID : 10);

/**
 * The rectangle a top-level block (column or loose card) covers on the board. The Completed record
 * isn't drawn (it shows in the Completed panel), so it covers nothing.
 */
export function blockRect(board: Board, id: string, measured: MeasuredHeight): Rect | null {
  const col = board.columns[id];
  if (col) return { x: col.x, y: col.y, w: col.w, h: measured(id) ?? NEW_BLOCK_H.column };
  const card = board.cards[id];
  if (card && card.kind !== 'completed') return { x: card.x, y: card.y, w: card.w ?? CARD_W, h: measured(id) ?? card.h ?? NEW_BLOCK_H[card.kind] };
  return null;
}

export function topLevelRects(board: Board, measured: MeasuredHeight, except: string[] = []): Rect[] {
  return board.order.flatMap((id) => {
    if (except.includes(id)) return [];
    const r = blockRect(board, id, measured);
    return r ? [r] : [];
  });
}

/** Top-level blocks (columns and loose cards) that the rectangle touches, for the selection box. */
export function blocksTouching(board: Board, rect: Rect, measured: MeasuredHeight): string[] {
  return board.order.filter((id) => {
    const r = blockRect(board, id, measured);
    return r ? overlaps(rect, r) : false;
  });
}

/**
 * Where a new block of size w × h goes: as close as possible to `centre` (normally the middle of
 * the screen) without covering or touching any existing block. On the grid when snapping is on.
 */
export function spotForNewBlock(board: Board, w: number, h: number, centre: Point, measured: MeasuredHeight): Point {
  const x = centre.x - w / 2;
  const y = centre.y - h / 2;
  const start = { x: snapIf(board.snap, x), y: snapIf(board.snap, y) };
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
 * `anchors` (the blocks just moved, resized, grown, pasted or dropped into, most important first)
 * stay put; everything else that is in the way moves to the nearest free spot. Columns are moved
 * before loose cards. Returns the same board when nothing needs to move.
 * With `pushDown` (used when blocks grow), a block that is below the one in its way (its top is
 * level with or lower than that block's top) is pushed straight down instead, never sideways.
 */
export function settle(board: Board, measured: MeasuredHeight, anchors: string[] = [], pushDown = false): Board {
  const rank = (id: string) => {
    const a = anchors.indexOf(id);
    return a >= 0 ? a : anchors.length + (board.columns[id] ? 0 : 1);
  };
  const blocks = board.order
    .flatMap((id, i) => {
      const rect = blockRect(board, id, measured);
      return rect ? [{ id, i, rect }] : [];
    })
    .sort((a, b) => rank(a.id) - rank(b.id) || a.i - b.i);

  const placed: Rect[] = [];
  const moves = new Map<string, Point>();
  for (const b of blocks) {
    let rect = b.rect;
    // One pixel of slack so rounding never makes blocks exactly 10px apart look "too close".
    const hit = placed.filter((o) => overlaps(rect, o, BLOCK_GAP - 1));
    if (hit.length) {
      const spot = pushDown && hit.every((o) => rect.y >= o.y) ? pushedDown(board, rect, placed) : freeSpot(rect, placed, BLOCK_GAP, stepFor(board));
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

/**
 * Blocks in the same row as `id` (they overlap it by at least half the shorter one's height) that it
 * now covers slide sideways out of its way, keeping their left-to-right order, and push the blocks
 * beside them along too (owner decision 2026-10-19). After a resize (no `drag`) the blocks that start
 * at or right of it go right, and those starting left of it stay (a block only grows to the right).
 * After a resize from the left edge (`side` 'left', owner request 2026-10-21) it is the other way
 * round: the blocks that end at or left of it go left, keeping their order, and those to its right stay.
 * For a drag, blocks whose middle is left of its middle go left,
 * the others right; on a tie they go the way it came from (`movedX` > 0: it moved right, so they go
 * left). Blocks in `fixed` never move; when one of them is in the way the dragged block itself will
 * move instead, so nothing shifts. Returns the same board when nothing moves.
 * After a resize, `was` is the block's rectangle before it: its row is the blocks level with that,
 * so growing downwards over a block below never makes that one a row mate (job #142).
 */
export function shiftRow(board: Board, id: string, measured: MeasuredHeight, drag?: { movedX: number; fixed: string[] }, side: 'right' | 'left' = 'right', was?: Rect): Board {
  const a = blockRect(board, id, measured);
  if (!a) return board;
  const fixed = new Set(drag?.fixed);
  const rects = board.order.flatMap((o) => {
    const r = o === id ? null : blockRect(board, o, measured);
    return r ? [{ id: o, r }] : [];
  });
  if (rects.some((m) => fixed.has(m.id) && overlaps(a, m.r, BLOCK_GAP - 1))) return board;
  // After a resize the block keeps its far edge and only grows towards the dragged one, so blocks on
  // the other side of it are never touched (they would otherwise be moved to its far side, as "in the way").
  const grewOver = (r: Rect) => (side === 'left' ? r.x + r.w <= a.x + a.w : r.x >= a.x);
  const row = was ?? a;
  const mates = rects.filter(({ id: o, r }) => !fixed.has(o) && (drag || grewOver(r)) && Math.min(row.y + row.h, r.y + r.h) - Math.max(row.y, r.y) >= Math.min(row.h, r.h) / 2);
  const mid = (r: Rect) => r.x + r.w / 2;
  const goesLeft = (r: Rect) => (!drag && side === 'left') || (!!drag && (mid(r) < mid(a) || (mid(r) === mid(a) && drag.movedX > 0)));
  // Each block only has to clear the blocks already placed beside it (level with it, give or take the gap).
  const level = (p: Rect, r: Rect) => p.y < r.y + r.h + BLOCK_GAP - 1 && r.y < p.y + p.h + BLOCK_GAP - 1;
  const moves = new Map<string, number>();
  let placed = [a];
  for (const { id: o, r } of mates.filter((m) => !goesLeft(m.r)).sort((p, q) => p.r.x - q.r.x)) {
    const edge = Math.max(-Infinity, ...placed.filter((p) => level(p, r)).map((p) => p.x + p.w + BLOCK_GAP));
    const x = r.x < edge ? (board.snap ? Math.ceil(edge / GRID) * GRID : edge) : r.x;
    if (x !== r.x) moves.set(o, x);
    placed.push({ ...r, x });
  }
  placed = [a];
  for (const { id: o, r } of mates.filter((m) => goesLeft(m.r)).sort((p, q) => q.r.x - p.r.x)) {
    const edge = Math.min(Infinity, ...placed.filter((p) => level(p, r)).map((p) => p.x - BLOCK_GAP));
    const x = r.x + r.w > edge ? (board.snap ? Math.floor((edge - r.w) / GRID) * GRID : edge - r.w) : r.x;
    if (x !== r.x) moves.set(o, x);
    placed.push({ ...r, x });
  }
  if (!moves.size) return board;
  const cards = { ...board.cards };
  const columns = { ...board.columns };
  for (const [o, x] of moves) {
    if (columns[o]) columns[o] = { ...columns[o], x };
    else cards[o] = { ...cards[o], x };
  }
  return { ...board, cards, columns };
}

/**
 * After a resize from the top edge (owner request 2026-10-21): blocks above `id` that it now covers
 * (or comes within 10px of) move straight up out of its way, and so do the blocks above those.
 * "Above" means ending at or above the block's top edge as it was before the drag (`wasTop`, give or
 * take the gap's slack), so blocks beside it (even a taller one that starts a little higher, job 183) and
 * below it stay even when a corner drag now covers them (job #142). On the grid when
 * snapping is on. Returns the same board when nothing moves.
 */
export function pushUp(board: Board, id: string, measured: MeasuredHeight, wasTop: number): Board {
  const a = blockRect(board, id, measured);
  if (!a) return board;
  const above = board.order.flatMap((o) => {
    const r = o === id ? null : blockRect(board, o, measured);
    return r && r.y < wasTop && r.y + r.h <= wasTop + BLOCK_GAP - 1 ? [{ id: o, r }] : [];
  });
  above.sort((p, q) => q.r.y + q.r.h - (p.r.y + p.r.h));
  const placed = [a];
  const moves = new Map<string, number>();
  for (const { id: o, r } of above) {
    const hit = placed.filter((p) => overlaps(r, p, BLOCK_GAP - 1));
    let y = r.y;
    if (hit.length) {
      const top = Math.min(...hit.map((p) => p.y)) - BLOCK_GAP - r.h;
      y = Math.min(r.y, board.snap ? Math.floor(top / GRID) * GRID : top);
      if (y !== r.y) moves.set(o, y);
    }
    placed.push({ ...r, y });
  }
  if (!moves.size) return board;
  const cards = { ...board.cards };
  const columns = { ...board.columns };
  for (const [o, y] of moves) {
    if (columns[o]) columns[o] = { ...columns[o], y };
    else cards[o] = { ...cards[o], y };
  }
  return { ...board, cards, columns };
}

/** Straight down from `rect` to the first spot clear of every placed block (on the grid when snapping). */
function pushedDown(board: Board, rect: Rect, placed: Rect[]): Point {
  let y = rect.y;
  for (;;) {
    const r = { ...rect, y };
    const hit = placed.filter((o) => overlaps(r, o, BLOCK_GAP - 1));
    if (!hit.length) return { x: rect.x, y };
    const below = Math.max(...hit.map((o) => o.y + o.h)) + BLOCK_GAP;
    y = board.snap ? Math.ceil(below / GRID) * GRID : below;
  }
}

const snapSize = (v: number | null, min: number) => (v == null ? v : Math.max(min, snapToGrid(v)));

/** Turning snapping back on: every block's position and resized size moves to the nearest grid point. */
export function snapAll(board: Board): Board {
  const cards = Object.fromEntries(
    Object.entries(board.cards).map(([id, c]) => [
      id,
      { ...c, x: snapToGrid(c.x), y: snapToGrid(c.y), w: snapSize(c.w, CARD_MIN_W), h: snapSize(c.h, BLOCK_MIN_H), ...(c.collapsedH != null && { collapsedH: snapSize(c.collapsedH, COLLAPSED_MIN_H) }) },
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

/**
 * Collapsing closes the gaps (owner request), the mirror of growth pushing blocks straight down:
 * each block moves straight up by as much as the block above it shrank, so it keeps the spacing it
 * had under that block when it was open. Worked out from where blocks were before collapsing
 * (`before`) and their open heights (`openH`), with their heights now (`measured`), so it can run
 * again as heights arrive. Only blocks that `canMove` are moved; nothing ever moves down.
 */
export function closeGaps(
  board: Board,
  before: Record<string, Point>,
  openH: Record<string, number>,
  measured: MeasuredHeight,
  canMove: (id: string) => boolean = () => true,
): Board {
  const blocks = board.order.flatMap((id) => {
    const at = before[id];
    const r = blockRect(board, id, measured);
    return at && r ? [{ id, x: at.x, y: at.y, w: r.w, openH: openH[id] ?? r.h, nowH: r.h }] : [];
  });
  blocks.sort((a, b) => a.y - b.y);
  const newY = new Map<string, number>();
  for (const b of blocks) {
    let y = b.y;
    if (canMove(b.id)) {
      // The blocks right above it (with no other block in between), as it was before collapsing.
      const above = blocks.filter((a) => a.y + a.openH <= b.y && a.x < b.x + b.w && b.x < a.x + a.w);
      const direct = above.filter((a) => !above.some((c) => c !== a && c.y >= a.y + a.openH));
      let reach = -Infinity;
      for (const a of direct) {
        if (newY.has(a.id)) reach = Math.max(reach, newY.get(a.id)! + a.nowH + (b.y - (a.y + a.openH)));
      }
      if (reach > -Infinity) y = Math.min(b.y, reach);
    } else {
      y = board.cards[b.id]?.y ?? board.columns[b.id]?.y ?? b.y;
    }
    newY.set(b.id, y);
  }
  let out = board;
  for (const [id, y] of newY) {
    if (!canMove(id)) continue;
    const col = out.columns[id];
    if (col && col.y !== y) out = { ...out, columns: { ...out.columns, [id]: { ...col, x: before[id].x, y } } };
    const card = out.cards[id];
    if (card && card.y !== y) out = { ...out, cards: { ...out.cards, [id]: { ...card, x: before[id].x, y } } };
  }
  return out;
}
