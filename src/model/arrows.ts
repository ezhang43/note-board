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

// Drawn as in Miro (owner request, 2026-10-05): a curve from the middle of one side of a block to
// the middle of the facing side of the other, leaving and arriving square to each side.

export type Side = 'top' | 'right' | 'bottom' | 'left';
type Point = { x: number; y: number };
/** A curve (cubic Bézier) from `from` to `to`, pulled by the handles `c1` and `c2`. */
export type Curve = { from: Point; c1: Point; c2: Point; to: Point; fromSide: Side; toSide: Side };

const OUT: Record<Side, Point> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

/** The middle of side `side` of `r`, pushed `gap` further out. */
function sideMiddle(r: Rect, side: Side, gap: number): Point {
  const o = OUT[side];
  return { x: r.x + r.w / 2 + o.x * (r.w / 2 + gap), y: r.y + r.h / 2 + o.y * (r.h / 2 + gap) };
}

/** The connection dots of a block: just outside the middle of each side, `offset` pixels out. */
export function connectorDots(r: Rect, offset: number): { side: Side; x: number; y: number }[] {
  return (['top', 'right', 'bottom', 'left'] as const).map((side) => ({ side, ...sideMiddle(r, side, offset) }));
}

/**
 * The dots that don't lie over any of `blocks`, each dot a circle of `radius` round its point, so a
 * dot never covers another block's text (owner request, 2026-10-05). When every dot would, the one
 * least covered is kept, so an arrow can still be drawn from a block boxed in by others.
 */
export function clearDots<D extends Point>(dots: D[], radius: number, blocks: Rect[]): D[] {
  // How much of the square round a dot lies over the blocks.
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

/**
 * The curve drawn for an arrow from block `a` to block `b`, `gap` pixels clear of each. It joins the
 * two sides that face each other: left / right when the blocks are further apart side to side than
 * up and down, otherwise top / bottom. null when the blocks overlap or nearly touch.
 */
export function arrowCurve(a: Rect, b: Rect, gap = 6): Curve | null {
  const across = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const down = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  if (across < 0 && down < 0) return null; // overlapping
  const sideways = across >= down;
  const fromSide: Side = sideways ? (b.x + b.w / 2 >= a.x + a.w / 2 ? 'right' : 'left') : b.y + b.h / 2 >= a.y + a.h / 2 ? 'bottom' : 'top';
  const toSide: Side = ({ right: 'left', left: 'right', bottom: 'top', top: 'bottom' } as const)[fromSide];
  const from = sideMiddle(a, fromSide, gap);
  const to = sideMiddle(b, toSide, gap);
  // How far the ends are apart the way the arrow leaves; none or less: too close to draw.
  const o = OUT[fromSide];
  const reach = (to.x - from.x) * o.x + (to.y - from.y) * o.y;
  if (reach <= 0) return null;
  const pull = reach / 2;
  const c1 = { x: from.x + o.x * pull, y: from.y + o.y * pull };
  const c2 = { x: to.x - o.x * pull, y: to.y - o.y * pull };
  return { from, c1, c2, to, fromSide, toSide };
}

/** The curve as an SVG path. */
export function curvePath(c: Curve): string {
  return `M ${c.from.x} ${c.from.y} C ${c.c1.x} ${c.c1.y} ${c.c2.x} ${c.c2.y} ${c.to.x} ${c.to.y}`;
}

/** The point halfway along the curve (where a selected arrow's × sits). */
export function curveMid(c: Curve): Point {
  return { x: (c.from.x + 3 * c.c1.x + 3 * c.c2.x + c.to.x) / 8, y: (c.from.y + 3 * c.c1.y + 3 * c.c2.y + c.to.y) / 8 };
}
