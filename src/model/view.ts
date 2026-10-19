import { DEFAULT_HOTKEYS } from './hotkeys';
import { CARD_MAX_W, CARD_MIN_W, GRID, MAX_ZOOM, MIN_ZOOM, PHONE_MARGIN, WHEEL_PAN_SPEED, WHEEL_ZOOM_SPEED } from './constants';
import type { Point, Rect, Size, View } from './types';

export function createView(): View {
  return { panX: 0, panY: 0, zoom: 1, tool: 'hand', theme: 'light', colorTheme: 'honey', fontSize: 'normal', hotkeys: DEFAULT_HOTKEYS };
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

/**
 * How far to move the board (screen pixels) so `box` sits inside `area` with `margin` to spare:
 * just enough, and none if it already does. A box too big to fit shows its top and left edge.
 */
export function panToShow(
  box: { left: number; top: number; right: number; bottom: number },
  area: { left: number; top: number; right: number; bottom: number },
  margin: number,
): Point {
  const fit = (lo: number, hi: number, from: number, to: number) => {
    const move = Math.max(Math.min(0, hi - margin - to), lo + margin - from);
    return move || 0; // never -0
  };
  return { x: fit(area.left, area.right, box.left, box.right), y: fit(area.top, area.bottom, box.top, box.bottom) };
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

/** Space kept around the blocks when the board opens, in screen pixels. */
const OPEN_MARGIN = 40;
/** The board never opens zoomed out further than this, so card text stays readable. */
const OPEN_MIN_ZOOM = 0.5;

/**
 * The view to open the board with (owner request): the blocks in `rects` in view. Keeps the
 * remembered zoom when they fit at it, else zooms out just enough (not below 50%). Each direction
 * that fits is centred; one that still doesn't fit shows the start (top / left) of the board.
 */
export function viewShowing(rects: Rect[], size: Size, view: View, minZoom = OPEN_MIN_ZOOM): View {
  if (!rects.length) return view;
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const w = Math.max(...rects.map((r) => r.x + r.w)) - left;
  const h = Math.max(...rects.map((r) => r.y + r.h)) - top;
  const roomW = Math.max(1, size.width - 2 * OPEN_MARGIN);
  const roomH = Math.max(1, size.height - 2 * OPEN_MARGIN);
  const zoom = clampZoom(Math.min(view.zoom, Math.max(minZoom, Math.min(roomW / w, roomH / h))));
  const place = (start: number, length: number, screen: number, room: number) =>
    length * zoom <= room ? (screen - length * zoom) / 2 - start * zoom : OPEN_MARGIN - start * zoom;
  return { ...view, zoom, panX: Math.round(place(left, w, size.width, roomW)), panY: Math.round(place(top, h, size.height, roomH)) };
}

type WheelDelta = { deltaX: number; deltaY: number; deltaMode: number };

/** Wheel deltas can be in pixels, lines or pages; turn them into pixels. */
export function wheelPixels(e: WheelDelta, pageHeight: number) {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? pageHeight : 1;
  return { dx: e.deltaX * unit, dy: e.deltaY * unit };
}

/** How far one scroll / swipe moves the board: the opposite way, at WHEEL_PAN_SPEED. */
export function wheelPan(e: WheelDelta, pageHeight: number) {
  const { dx, dy } = wheelPixels(e, pageHeight);
  return { x: -dx * WHEEL_PAN_SPEED, y: -dy * WHEEL_PAN_SPEED };
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

/**
 * Fit to screen (owner request): every block in `rects` in view and as large as fits, centred,
 * zooming in up to 100% or out as far as needed (to the smallest zoom).
 */
export function viewFitting(rects: Rect[], size: Size, view: View): View {
  return viewShowing(rects, size, { ...view, zoom: 1 }, MIN_ZOOM);
}

/** Phone (owner request): the width, in board pixels, that fills a screen `screenW` wide at `zoom` less a margin each side, within the card size limits. */
export function phoneCardWidth(screenW: number, zoom: number): number {
  return Math.min(CARD_MAX_W, Math.max(CARD_MIN_W, Math.round((screenW - 2 * PHONE_MARGIN) / zoom)));
}

/**
 * Phone (owner request): the view that fills the screen's width with the block `rect` (within the
 * zoom limits), its left edge at the margin (centred when it is narrower even at 250%). The board
 * point at screen point `at` (the line being tapped) stays at the same height, or is brought back
 * on screen when it was off it.
 */
export function viewFillingWidth(view: View, size: Size, rect: Rect, at: Point): View {
  const zoomed = zoomTo(view, at, (size.width - 2 * PHONE_MARGIN) / rect.w);
  const left = Math.max(PHONE_MARGIN, (size.width - rect.w * zoomed.zoom) / 2);
  const top = Math.min(size.height - PHONE_MARGIN, Math.max(PHONE_MARGIN, at.y));
  return panBy(zoomed, Math.round(left - rect.x * zoomed.zoom) - zoomed.panX, Math.round(top - at.y));
}
