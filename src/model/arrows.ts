import type { Arrow, Board, Rect } from './types';

// Arrows between cards and columns (owner request, 2026-10-05). An arrow joins two blocks by id;
// where it is drawn is worked out from where the blocks are on screen (arrowLine).

const exists = (board: Board, id: string) => !!(board.cards[id] || board.columns[id]);

/** A column and a card inside it. */
const nested = (board: Board, a: string, b: string) => !!board.columns[a]?.cardIds.includes(b) || !!board.columns[b]?.cardIds.includes(a);

/**
 * The board with an arrow from block `from` to block `to`; null when it can't be drawn: the same
 * block, a block that isn't there, a column and a card inside it, or two blocks already joined.
 */
export function addArrow(board: Board, from: string, to: string, id: string): Board | null {
  if (from === to || !exists(board, from) || !exists(board, to) || nested(board, from, to)) return null;
  const arrows = board.arrows ?? [];
  if (arrows.some((a) => (a.from === from && a.to === to) || (a.from === to && a.to === from))) return null;
  return { ...board, arrows: [...arrows, { id, from, to }] };
}

/** The board without arrow `id`; null when there is no such arrow. */
export function removeArrow(board: Board, id: string): Board | null {
  const arrows = board.arrows ?? [];
  if (!arrows.some((a) => a.id === id)) return null;
  return { ...board, arrows: arrows.filter((a) => a.id !== id) };
}

/** Drops arrows whose blocks are gone (deleted cards and columns). The same board when none are. */
export function pruneArrows(board: Board): Board {
  if (!board.arrows) return board;
  const kept = board.arrows.filter((a) => exists(board, a.from) && exists(board, a.to));
  return kept.length === board.arrows.length ? board : { ...board, arrows: kept };
}

/** Saved arrows as read back: only well-formed ones between blocks that are on the board, no repeats. */
export function readArrows(v: unknown, board: Board): Arrow[] | undefined {
  if (!Array.isArray(v)) return undefined;
  let b: Board = { ...board, arrows: [] };
  for (const a of v) {
    if (typeof a !== 'object' || a === null) continue;
    const { id, from, to } = a as Record<string, unknown>;
    if (typeof id !== 'string' || typeof from !== 'string' || typeof to !== 'string') continue;
    b = addArrow(b, from, to, id) ?? b;
  }
  return b.arrows;
}

/** Where the line from the middle of `r` towards `toward` leaves `r`, pushed `gap` further out. */
function exit(r: Rect, toward: { x: number; y: number }, gap: number) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  // How far along (dx, dy) the edge is: the nearer of the side and the top / bottom.
  const t = Math.min(dx ? r.w / 2 / Math.abs(dx) : Infinity, dy ? r.h / 2 / Math.abs(dy) : Infinity);
  const len = Math.hypot(dx, dy);
  const extra = len ? gap / len : 0;
  return { x: cx + dx * (t + extra), y: cy + dy * (t + extra) };
}

/**
 * The line drawn for an arrow from block `a` to block `b`: along the line joining their middles,
 * from `a`'s edge to `b`'s edge, `gap` pixels clear of each. null when the blocks overlap.
 */
export function arrowLine(a: Rect, b: Rect, gap = 6): { x1: number; y1: number; x2: number; y2: number } | null {
  if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return null;
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const s = exit(a, cb, gap);
  const e = exit(b, ca, gap);
  // Blocks closer together than the gaps: nothing sensible to draw.
  if ((e.x - s.x) * (cb.x - ca.x) + (e.y - s.y) * (cb.y - ca.y) <= 0) return null;
  return { x1: s.x, y1: s.y, x2: e.x, y2: e.y };
}
