import type { Point } from './types';

// Moving the board while a drag reaches the edge of the board area (owner request): the closer the
// pointer is to an edge, the faster the board moves to show what is beyond it.

/** How close to an edge (screen pixels) the pointer must be for the board to start moving. */
export const EDGE_ZONE = 48;
/** Fastest the board moves, in screen pixels per frame. */
export const EDGE_MAX_SPEED = 18;

const speed = (distance: number) => (distance >= EDGE_ZONE ? 0 : Math.round(EDGE_MAX_SPEED * Math.min(1, 1 - distance / EDGE_ZONE)));

/**
 * How far to move the board this frame for a pointer at `p` inside `area` (the board area on screen):
 * near the left / top it moves right / down, near the right / bottom it moves left / up.
 */
export function edgePanStep(p: Point, area: { left: number; top: number; right: number; bottom: number }): { dx: number; dy: number } {
  return {
    dx: speed(p.x - area.left) - speed(area.right - p.x),
    dy: speed(p.y - area.top) - speed(area.bottom - p.y),
  };
}
