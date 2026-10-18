import { DRAG_THRESHOLD } from './constants';
import type { Point } from './types';

// Zoom taps on the empty board of a touch screen (owner request, 2026-10-18): a double tap zooms in
// one step and a long tap (a finger resting without moving) zooms out one step.

/** Two taps count as a double tap when the second starts this soon after the first lifts... */
export const DOUBLE_TAP_MS = 300;
/** ...and this close (screen pixels) to where the first one was. simple: fixed values; widen if fingers miss. */
export const DOUBLE_TAP_PX = 30;

/** A finger touching the board: where and when. */
export type Touch = Point & { t: number };

/**
 * What a finger did, from where it went down to where it lifted: a `tap` (quick, not moved), a
 * `long` tap (rested for `holdMs` or more, not moved) or `null` (it moved, so it was a pan or a box).
 * `moved` is true if the finger was ever `DRAG_THRESHOLD` away from where it went down.
 */
export function pressKind(down: Touch, up: Touch, moved: boolean, holdMs: number): 'tap' | 'long' | null {
  if (moved || Math.hypot(up.x - down.x, up.y - down.y) >= DRAG_THRESHOLD) return null;
  return up.t - down.t >= holdMs ? 'long' : 'tap';
}

/** Is this tap (when and where it went down) the second of a double tap, after `prev` (when and where the last one lifted)? */
export function isDoubleTap(prev: Touch | null, next: Touch): boolean {
  return !!prev && next.t - prev.t <= DOUBLE_TAP_MS && Math.hypot(next.x - prev.x, next.y - prev.y) <= DOUBLE_TAP_PX;
}
