import type { Point, View } from './types';
import { clampZoom } from './view';

// Two-finger pinch on a touch screen (owner request): fingers spreading apart or closing in zoom,
// and both fingers moving together pan the board. The board point that was between the fingers when
// the pinch began stays between them.

const middle = ([a, b]: [Point, Point]): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const gap = ([a, b]: [Point, Point]) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * The view for fingers now at `to`, given the view and finger positions when the pinch began
 * (screen points relative to the canvas area). Worked out from the start each time, since fingers
 * report their moves one at a time, and small steps would add up to drift.
 */
export function pinchView(start: View, from: [Point, Point], to: [Point, Point]): View {
  const before = gap(from);
  const zoom = clampZoom(before > 0 ? (start.zoom * gap(to)) / before : start.zoom);
  const m0 = middle(from);
  const m1 = middle(to);
  const board = { x: (m0.x - start.panX) / start.zoom, y: (m0.y - start.panY) / start.zoom };
  return { ...start, zoom, panX: m1.x - board.x * zoom, panY: m1.y - board.y * zoom };
}
