import type { Rect } from './types';

// Alignment guides while dragging a block (owner request, like Google Slides): when an edge or the
// middle of the dragged block comes within reach of the same edge or middle of another block, it
// snaps onto it and a thin guide line shows. Guides win over the grid.

/** How close (board pixels) an edge or middle must come to snap onto another's. */
export const ALIGN_REACH = 8;

/** A guide line: vertical (`axis: 'x'`, at that x, from y `from` to `to`) or horizontal (`axis: 'y'`). */
export interface Guide {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

const xs = (r: Rect) => [r.x, r.x + r.w / 2, r.x + r.w];
const ys = (r: Rect) => [r.y, r.y + r.h / 2, r.y + r.h];

/** The smallest move (within reach) that puts one of `mine` onto the same kind of line in `theirs`. */
function nearestShift(mine: number[], others: number[][], reach: number): number | null {
  let best: number | null = null;
  for (const theirs of others)
    for (let k = 0; k < 3; k++) {
      const d = theirs[k] - mine[k];
      if (Math.abs(d) <= reach && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  return best;
}

/**
 * Where a block being dragged to `rect` lands once lined up with `others`, whether each axis was
 * lined up, and the guide lines to show (one per line it now shares with another block).
 */
export function alignTo(rect: Rect, others: Rect[], reach = ALIGN_REACH): { x: number; y: number; alignedX: boolean; alignedY: boolean; guides: Guide[] } {
  const dx = nearestShift(xs(rect), others.map(xs), reach);
  const dy = nearestShift(ys(rect), others.map(ys), reach);
  const r = { ...rect, x: rect.x + (dx ?? 0), y: rect.y + (dy ?? 0) };
  const guides: Guide[] = [];
  for (const o of others) {
    if (dx !== null)
      for (let k = 0; k < 3; k++)
        if (xs(o)[k] === xs(r)[k]) guides.push({ axis: 'x', at: xs(r)[k], from: Math.min(o.y, r.y), to: Math.max(o.y + o.h, r.y + r.h) });
    if (dy !== null)
      for (let k = 0; k < 3; k++)
        if (ys(o)[k] === ys(r)[k]) guides.push({ axis: 'y', at: ys(r)[k], from: Math.min(o.x, r.x), to: Math.max(o.x + o.w, r.x + r.w) });
  }
  return { x: r.x, y: r.y, alignedX: dx !== null, alignedY: dy !== null, guides };
}
