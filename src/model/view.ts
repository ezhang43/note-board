import { GRID, MAX_ZOOM, MIN_ZOOM, WHEEL_ZOOM_SPEED } from './constants';
import type { Point, Size, View } from './types';

export function createView(): View {
  return { panX: 0, panY: 0, zoom: 1, tool: 'hand', theme: 'light' };
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Screen point (relative to the canvas area) → board point. */
export function screenToBoard(view: View, p: Point): Point {
  return { x: (p.x - view.panX) / view.zoom, y: (p.y - view.panY) / view.zoom };
}

export function panBy(view: View, dx: number, dy: number): View {
  if (dx === 0 && dy === 0) return view;
  return { ...view, panX: view.panX + dx, panY: view.panY + dy };
}

/** Zoom to `zoom` (clamped) while keeping the board point under screen point `at` in place. */
export function zoomTo(view: View, at: Point, zoom: number): View {
  const next = clampZoom(zoom);
  if (next === view.zoom) return view;
  const k = next / view.zoom;
  return {
    ...view,
    zoom: next,
    panX: at.x - (at.x - view.panX) * k,
    panY: at.y - (at.y - view.panY) * k,
  };
}

export function zoomBy(view: View, at: Point, factor: number): View {
  return zoomTo(view, at, view.zoom * factor);
}

export function centreOf(size: Size): Point {
  return { x: size.width / 2, y: size.height / 2 };
}

/** Back to 100%, keeping whatever is in the middle of the screen in the middle. */
export function resetZoom(view: View, size: Size): View {
  return zoomTo(view, centreOf(size), 1);
}

/** Zoom factor for one wheel / pinch event. Scrolling up (negative deltaY) zooms in. */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * WHEEL_ZOOM_SPEED);
}

export function zoomLabel(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

/**
 * CSS values for the dotted grid, so the dots sit exactly on board multiples of GRID
 * and move and scale with the board.
 */
export function gridStyle(view: View): { size: number; offsetX: number; offsetY: number; dotRadius: number } {
  const size = GRID * view.zoom;
  return {
    size,
    offsetX: view.panX - size / 2,
    offsetY: view.panY - size / 2,
    dotRadius: Math.max(0.6, view.zoom),
  };
}
