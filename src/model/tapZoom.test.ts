import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from './constants';
import { DOUBLE_TAP_MS, DOUBLE_TAP_PX, isDoubleTap, pressKind } from './tapZoom';
import { createView, screenToBoard, zoomBy } from './view';

const HOLD = 450;
const at = (x: number, y: number, t: number) => ({ x, y, t });

describe('pressKind', () => {
  it('a quick press that stays put is a tap', () => {
    expect(pressKind(at(10, 10, 0), at(12, 11, 120), false, HOLD)).toBe('tap');
  });
  it('a press that rests for the hold time without moving is a long tap', () => {
    expect(pressKind(at(10, 10, 0), at(10, 10, HOLD), false, HOLD)).toBe('long');
    expect(pressKind(at(10, 10, 0), at(10, 10, HOLD - 1), false, HOLD)).toBe('tap');
  });
  it('a finger that moved, even if it came back, is neither', () => {
    expect(pressKind(at(10, 10, 0), at(10, 10, 900), true, HOLD)).toBeNull();
    expect(pressKind(at(10, 10, 0), at(40, 10, 900), false, HOLD)).toBeNull();
  });
});

describe('isDoubleTap', () => {
  const first = at(100, 100, 1000);
  it('needs a tap before it', () => {
    expect(isDoubleTap(null, at(100, 100, 1100))).toBe(false);
  });
  it('is a second tap soon after and close to the first', () => {
    expect(isDoubleTap(first, at(110, 105, 1000 + 150))).toBe(true);
    expect(isDoubleTap(first, at(100, 100, 1000 + DOUBLE_TAP_MS))).toBe(true);
  });
  it('is not when too slow or too far', () => {
    expect(isDoubleTap(first, at(100, 100, 1000 + DOUBLE_TAP_MS + 1))).toBe(false);
    expect(isDoubleTap(first, at(100 + DOUBLE_TAP_PX + 1, 100, 1100))).toBe(false);
  });
});

describe('one zoom step around the finger', () => {
  const finger = { x: 300, y: 250 };
  it('zooms in by the button step and keeps the board point under the finger', () => {
    const start = { ...createView(), panX: 40, panY: -20 };
    const next = zoomBy(start, finger, ZOOM_STEP);
    expect(next.zoom).toBeCloseTo(start.zoom * ZOOM_STEP);
    const before = screenToBoard(start, finger);
    const after = screenToBoard(next, finger);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
  it('zooms out by the same step, and stops at 30% and 250%', () => {
    expect(zoomBy(createView(), finger, 1 / ZOOM_STEP).zoom).toBeCloseTo(1 / ZOOM_STEP);
    expect(zoomBy({ ...createView(), zoom: MAX_ZOOM }, finger, ZOOM_STEP).zoom).toBe(MAX_ZOOM);
    expect(zoomBy({ ...createView(), zoom: MIN_ZOOM }, finger, 1 / ZOOM_STEP).zoom).toBe(MIN_ZOOM);
  });
});
