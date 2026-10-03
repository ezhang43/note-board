import * as B from './board';
import { BLOCK_GAP } from './constants';
import { overlaps, snapIf } from './geometry';
import { blockRect, settle, type MeasuredHeight } from './layout';
import type { Board, Point } from './types';

// Where blocks go when one is dragged, or when an expanded block collapses again.
// The rules (owner decisions, see CLAUDE.md): a dragged block takes priority and lands on the grid
// spot under the pointer; a single dragged card never pushes a column; collapsing a block returns
// the blocks its expansion pushed aside, if they haven't moved since and their old spot is free.

/** A block's move: where it was and where it went. */
export interface Move {
  from: Point;
  to: Point;
}

/** Blocks pushed aside by one expanded block, by id. */
export type Pushes = Map<string, Move>;

/** Top-level blocks whose position differs between two boards (leaving out `except`). */
export function movedBlocks(before: Board, after: Board, except: string[] = []): Map<string, Move> {
  const moved = new Map<string, Move>();
  for (const id of after.order) {
    if (except.includes(id)) continue;
    const was = B.blockOf(before, id);
    const now = B.blockOf(after, id);
    if (!was || !now || (was.x === now.x && was.y === now.y)) continue;
    moved.set(id, { from: { x: was.x, y: was.y }, to: { x: now.x, y: now.y } });
  }
  return moved;
}

/** Adds the moves between two boards to `pushes`: each block keeps where it first was. */
export function recordPushes(pushes: Pushes | undefined, before: Board, after: Board): Pushes {
  const next: Pushes = new Map(pushes);
  for (const [id, m] of movedBlocks(before, after)) next.set(id, { from: next.get(id)?.from ?? m.from, to: m.to });
  return next;
}

/**
 * Collapsing a block: blocks it pushed aside go back to where they were, if they haven't been
 * moved since and their old spot is free. `top` is the collapsing block's column (or itself).
 */
export function returnPushes(board: Board, pushes: Pushes, top: string, measured: MeasuredHeight): Board {
  const back = [...pushes].filter(([id, p]) => {
    const blk = B.blockOf(board, id);
    return blk && board.order.includes(id) && blk.x === p.to.x && blk.y === p.to.y;
  });
  const going = new Set([top, ...back.map(([id]) => id)]);
  const others = board.order.filter((id) => !going.has(id)).map((id) => blockRect(board, id, measured)!);
  const cards = { ...board.cards };
  const columns = { ...board.columns };
  let moved = false;
  for (const [id, p] of back) {
    const r = blockRect(board, id, measured)!;
    if (others.some((o) => overlaps({ ...r, ...p.from }, o, BLOCK_GAP - 1))) continue;
    if (columns[id]) columns[id] = { ...columns[id], ...p.from };
    else cards[id] = { ...cards[id], ...p.from };
    moved = true;
  }
  return moved ? { ...board, cards, columns } : board;
}

/** A block (with any other selected blocks) being dragged, its top-left now at x, y. */
export interface DraggedBlocks {
  kind: 'card' | 'column';
  id: string;
  x: number;
  y: number;
  startX: number;
  startY: number;
  group: string[];
  /** Axes lined up with another block by an alignment guide: they land exactly there, not on the grid. */
  exactX?: boolean;
  exactY?: boolean;
}

/**
 * The board as it would be if the dragged block(s) were dropped now: placed on the grid spot
 * under the pointer (moving a group by the same amount), with every other block that is in the
 * way moved to the nearest free spot, so the dragged blocks take priority.
 * One exception: a single dragged card never pushes a column (dropping a card on a column puts it
 * inside, and a column sliding away would make that impossible). Where it would cover a column,
 * the card takes the nearest free spot instead. `at` is where the dragged block ends up, and
 * `bumped` the other blocks that moved, with where they went.
 */
export function dropBoard(
  from: Board,
  d: DraggedBlocks,
  measured: MeasuredHeight,
): { board: Board; ids: string[]; at: Point; bumped: Record<string, Point> } {
  const target = { x: d.exactX ? d.x : snapIf(from.snap, d.x), y: d.exactY ? d.y : snapIf(from.snap, d.y) };
  const ids = [d.id, ...d.group];
  let b = from;
  let anchors = ids;
  if (d.group.length) b = B.moveBlocksBy(b, ids, target.x - d.startX, target.y - d.startY);
  else if (d.kind === 'column') b = B.moveColumn(b, d.id, target.x, target.y);
  else {
    b = B.moveCard(b, d.id, { type: 'loose', ...target });
    anchors = [...b.order.filter((id) => b.columns[id]), d.id];
  }
  const board = settle(b, measured, anchors);
  const self = B.blockOf(board, d.id)!;
  const bumped = Object.fromEntries([...movedBlocks(from, board, ids)].map(([id, m]) => [id, m.to]));
  return { board, ids, at: { x: self.x, y: self.y }, bumped };
}
