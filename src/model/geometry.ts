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

const BUCKET = 256;
const bucketKey = (cx: number, cy: number) => cx * 65536 + cy;

/** A rectangle's range of buckets, so a rectangle can only touch ones that share a bucket with it. */
function bucketsOf(r: Rect, pad: number): number[] {
  const keys: number[] = [];
  for (let cx = Math.floor((r.x - pad) / BUCKET); cx <= Math.floor((r.x + r.w + pad) / BUCKET); cx++)
    for (let cy = Math.floor((r.y - pad) / BUCKET); cy <= Math.floor((r.y + r.h + pad) / BUCKET); cy++) keys.push(bucketKey(cx, cy));
  return keys;
}

/**
 * The nearest position to `rect` where it doesn't overlap (or come within `gap` of) any of `others`.
 * Searches outward in rings of `step` pixels, so with step = GRID the answer is on the grid.
 * Only each ring's edge is walked, a spot that hits a block skips along the edge to past that block,
 * and `others` are sorted into buckets so a spot only meets its neighbors (job 183: a pile of 300
 * blocks took seconds). Ties go to the first found, left to right then top to bottom.
 */
export function freeSpot(rect: Rect, others: Rect[], gap: number, step: number): Point {
  const near = new Map<number, Rect[]>();
  for (const o of others) {
    for (const k of bucketsOf(o, gap)) {
      const list = near.get(k);
      if (list) list.push(o);
      else near.set(k, [o]);
    }
  }
  /** The block that `r` hits, if any. */
  const hit = (r: Rect) => {
    for (const k of bucketsOf(r, 0)) {
      const o = near.get(k)?.find((o) => overlaps(r, o, gap));
      if (o) return o;
    }
    return null;
  };
  if (!hit(rect)) return { x: rect.x, y: rect.y };
  for (let ring = 1; ring <= 400; ring++) {
    const best = { x: rect.x, y: rect.y, d: Infinity };
    const found = (dx: number, dy: number) => {
      const d = (dx * step) ** 2 + (dy * step) ** 2;
      if (d < best.d) Object.assign(best, { x: rect.x + dx * step, y: rect.y + dy * step, d });
    };
    // In the top and bottom rows `rowFrom` is how far a block already hit reaches: skip past it.
    const rowFrom = [-ring, -ring];
    const rows = [-ring, ring];
    for (let dx = -ring; dx <= ring; dx++) {
      if (Math.abs(dx) === ring) {
        // The left and right columns, top to bottom.
        for (let dy = -ring; dy <= ring; ) {
          const o = hit({ ...rect, x: rect.x + dx * step, y: rect.y + dy * step });
          if (!o) found(dx, dy++);
          else dy = Math.max(dy + 1, Math.ceil((o.y + o.h + gap - rect.y) / step));
        }
      } else {
        for (const [i, dy] of rows.entries()) {
          if (dx < rowFrom[i]) continue;
          const o = hit({ ...rect, x: rect.x + dx * step, y: rect.y + dy * step });
          if (!o) found(dx, dy);
          else rowFrom[i] = Math.max(dx + 1, Math.ceil((o.x + o.w + gap - rect.x) / step));
        }
      }
    }
    if (best.d < Infinity) return { x: best.x, y: best.y };
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
