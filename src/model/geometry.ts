import { GRID } from './constants';
import type { Point, Rect } from './types';

export function snapToGrid(v: number): number {
  return Math.round(v / GRID) * GRID;
}

/** On the grid when snapping is on; otherwise just whole pixels. */
export function snapIf(on: boolean, v: number): number {
  return on ? snapToGrid(v) : Math.round(v);
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

export type Direction = 'up' | 'down' | 'left' | 'right';

/** Whether one list of numbers sorts before another (the first difference decides). */
function comesFirst(a: number[], b: number[]): boolean {
  const i = a.findIndex((v, j) => v !== b[j]);
  return i >= 0 && a[i] < b[i];
}

/** Blocks may touch or overlap by a pixel or two (rounding on screen) and still count as "past" an edge. */
const EDGE_SLACK = 2;

/**
 * The block nearest to `from` in a direction (for Alt+arrow keys). A candidate must lie wholly past
 * `from`'s edge in that direction (a card mostly below is "down", never "right"). Blocks straight
 * ahead (sharing some of `from`'s height for left / right, or width for up / down) come first; then
 * closest wins, where sideways distance counts double; then the one sharing more.
 */
export function nearestInDirection(from: Rect, candidates: { id: string; rect: Rect }[], dir: Direction): string | null {
  const midX = from.x + from.w / 2;
  const midY = from.y + from.h / 2;
  const gap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, b0 - a1, a0 - b1);
  const shared = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  let best: { id: string; key: number[] } | null = null;
  for (const { id, rect: r } of candidates) {
    const vertical = dir === 'up' || dir === 'down';
    let ahead: number;
    if (dir === 'down') ahead = r.y - (from.y + from.h);
    else if (dir === 'up') ahead = from.y - (r.y + r.h);
    else if (dir === 'right') ahead = r.x - (from.x + from.w);
    else ahead = from.x - (r.x + r.w);
    if (ahead < -EDGE_SLACK) continue;
    const side = vertical ? gap(from.x, from.x + from.w, r.x, r.x + r.w) : gap(from.y, from.y + from.h, r.y, r.y + r.h);
    const overlap = vertical ? shared(from.x, from.x + from.w, r.x, r.x + r.w) : shared(from.y, from.y + from.h, r.y, r.y + r.h);
    const score = Math.max(0, ahead) + 2 * side;
    const d = Math.hypot(r.x + r.w / 2 - midX, r.y + r.h / 2 - midY);
    const key = [overlap > 0 ? 0 : 1, score, -overlap, d];
    if (!best || comesFirst(key, best.key)) best = { id, key };
  }
  return best?.id ?? null;
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
