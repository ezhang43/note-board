import { GRID } from './constants';
import type { Point, Rect } from './types';

export function snapToGrid(v: number): number {
  return Math.round(v / GRID) * GRID;
}

/** True when the rectangles overlap or are closer than `gap` to each other. */
export function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

/**
 * The nearest position to `rect` where it doesn't overlap (or come within `gap` of) any of `others`.
 * Searches outward in rings of `step` pixels, so with step = GRID the answer is on the grid.
 */
export function freeSpot(rect: Rect, others: Rect[], gap: number, step: number): Point {
  const hits = (r: Rect) => others.some((o) => overlaps(r, o, gap));
  if (!hits(rect)) return { x: rect.x, y: rect.y };
  for (let ring = 1; ring <= 400; ring++) {
    let best: { x: number; y: number; d: number } | null = null;
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const c = { ...rect, x: rect.x + dx * step, y: rect.y + dy * step };
        if (hits(c)) continue;
        const d = (dx * step) ** 2 + (dy * step) ** 2;
        if (!best || d < best.d) best = { x: c.x, y: c.y, d };
      }
    }
    if (best) return { x: best.x, y: best.y };
  }
  return { x: rect.x, y: rect.y };
}

/** Which of the given column rectangles (screen coordinates) the pointer is over, if any. */
export function columnAt(p: Point, columns: { id: string; rect: Rect }[], reachBelow: number): string | null {
  let found: string | null = null;
  for (const c of columns) {
    const r = c.rect;
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h + reachBelow) found = c.id;
  }
  return found;
}

/**
 * Where a card dropped at height `y` goes in a column, given the vertical middle of each card
 * already in the column (top to bottom): after every card whose middle is above the pointer.
 */
export function insertIndex(y: number, cardMiddles: number[]): number {
  return cardMiddles.filter((m) => y > m).length;
}
