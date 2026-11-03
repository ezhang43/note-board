import { isPermanent } from './cards';
import type { Arrow, Board, Point, Rect } from './types';

// Arrows between cards and containers (owner request, 2026-11-03, job card-arrows). An arrow joins
// two blocks by id; where it is drawn is worked out from where the blocks are on screen (arrowLine).
// A board with no arrows has no `arrows` field at all, so its saved text is the same as before.

/** A card or container drawn on the board (the Completed record isn't drawn, so it can't be joined). */
const exists = (board: Board, id: string) => !!board.columns[id] || (!!board.cards[id] && !isPermanent(board.cards[id]));

/** A container and a card inside it. */
const nested = (board: Board, a: string, b: string) => !!board.columns[a]?.cardIds.includes(b) || !!board.columns[b]?.cardIds.includes(a);

/** Whether two arrows join the same two blocks, either way round. */
const samePair = (a: Arrow, from: string, to: string) => (a.from === from && a.to === to) || (a.from === to && a.to === from);

/** The board with `arrows`, the field left out when there are none. */
function withArrows(board: Board, arrows: Arrow[]): Board {
  if (arrows.length) return { ...board, arrows };
  const { arrows: _gone, ...rest } = board;
  return rest;
}

/**
 * The board with an arrow from block `from` to block `to`; null when it can't be drawn: the same
 * block, a block that isn't there, a container and a card inside it, or two blocks already joined.
 */
export function addArrow(board: Board, from: string, to: string, id: string): Board | null {
  if (from === to || !exists(board, from) || !exists(board, to) || nested(board, from, to)) return null;
  const arrows = board.arrows ?? [];
  if (arrows.some((a) => a.id === id || samePair(a, from, to))) return null;
  return { ...board, arrows: [...arrows, { id, from, to }] };
}

/** The board without arrow `id`; null when there is no such arrow. */
export function removeArrow(board: Board, id: string): Board | null {
  const arrows = board.arrows ?? [];
  if (!arrows.some((a) => a.id === id)) return null;
  return withArrows(board, arrows.filter((a) => a.id !== id));
}

/** Drops arrows whose blocks are gone (deleted cards and containers). The same board when none are. */
export function pruneArrows(board: Board): Board {
  if (!board.arrows) return board;
  const kept = board.arrows.filter((a) => exists(board, a.from) && exists(board, a.to));
  return kept.length === board.arrows.length ? board : withArrows(board, kept);
}

/**
 * Saved arrows as read back: only well-formed ones between blocks on the board, never a block to
 * itself, no id or pair of blocks twice. Undefined when none are left. (A card and the container it
 * is in can be joined here: the card was moved in after the arrow was drawn.)
 */
export function readArrows(v: unknown, board: Board): Arrow[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: Arrow[] = [];
  for (const a of v) {
    if (typeof a !== 'object' || a === null) continue;
    const { id, from, to } = a as Record<string, unknown>;
    if (typeof id !== 'string' || typeof from !== 'string' || typeof to !== 'string' || !id) continue;
    if (from === to || !exists(board, from) || !exists(board, to)) continue;
    if (out.some((x) => x.id === id || samePair(x, from, to))) continue;
    out.push({ id, from, to });
  }
  return out.length ? out : undefined;
}

/** The arrows that join two of `ids` (a container's cards count as given with it), for copying. */
export function arrowsAmong(board: Board, ids: string[]): Arrow[] {
  const inside = new Set(ids.flatMap((id) => [id, ...(board.columns[id]?.cardIds ?? [])]));
  return (board.arrows ?? []).filter((a) => inside.has(a.from) && inside.has(a.to));
}

// Drawn as a thin straight line from the edge of one block to the edge of the other, along the
// line between their middles, with an arrowhead at the block it points to.

/** How far from `c`, along (dx, dy), the line leaves rect `r` (centred on `c`), plus `gap`. */
function edgeOffset(r: Rect, dx: number, dy: number, gap: number): number {
  const len = Math.hypot(dx, dy);
  const tx = dx === 0 ? Infinity : r.w / 2 / Math.abs(dx);
  const ty = dy === 0 ? Infinity : r.h / 2 / Math.abs(dy);
  return Math.min(tx, ty) * len + gap;
}

/**
 * The straight line drawn for an arrow from block `a` to block `b`, `gap` pixels clear of each.
 * null when the blocks overlap or are too close for a line between them.
 */
export function arrowLine(a: Rect, b: Rect, gap = 6): { from: Point; to: Point } | null {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const start = edgeOffset(a, dx, dy, gap);
  const end = len - edgeOffset(b, dx, dy, gap);
  if (end - start <= 0) return null;
  const at = (t: number) => ({ x: round(ca.x + (dx * t) / len), y: round(ca.y + (dy * t) / len) });
  return { from: at(start), to: at(end) };
}

const round = (n: number) => Math.round(n * 100) / 100;

export type Side = 'top' | 'right' | 'bottom' | 'left';
const OUT: Record<Side, Point> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

/** The connection dots of a block: just outside the middle of each side, `offset` pixels out. */
export function connectorDots(r: Rect, offset: number): { side: Side; x: number; y: number }[] {
  return (['top', 'right', 'bottom', 'left'] as const).map((side) => {
    const o = OUT[side];
    return { side, x: r.x + r.w / 2 + o.x * (r.w / 2 + offset), y: r.y + r.h / 2 + o.y * (r.h / 2 + offset) };
  });
}

/**
 * The dots that don't lie over any of `blocks`, each dot a circle of `radius` round its point, so a
 * dot never covers another block's text. When every dot would, the one least covered is kept, so an
 * arrow can still be drawn from a block boxed in by others.
 */
export function clearDots<D extends Point>(dots: D[], radius: number, blocks: Rect[]): D[] {
  const covered = (d: D) =>
    blocks.reduce((sum, b) => {
      const w = Math.min(d.x + radius, b.x + b.w) - Math.max(d.x - radius, b.x);
      const h = Math.min(d.y + radius, b.y + b.h) - Math.max(d.y - radius, b.y);
      return w > 0 && h > 0 ? sum + w * h : sum;
    }, 0);
  const clear = dots.filter((d) => covered(d) === 0);
  if (clear.length || !dots.length) return clear;
  return [dots.reduce((best, d) => (covered(d) < covered(best) ? d : best))];
}
