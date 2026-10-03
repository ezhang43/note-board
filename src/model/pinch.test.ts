import { describe, expect, it } from 'vitest';
import { pinchView } from './pinch';
import type { View } from './types';

const start = { panX: 0, panY: 0, zoom: 1 } as View;

describe('two-finger pinch on a touch screen', () => {
  it('fingers spreading apart zoom in, keeping the board point between them in place', () => {
    const v = pinchView(start, [{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 50, y: 100 }, { x: 250, y: 100 }]);
    expect(v.zoom).toBeCloseTo(2);
    // Board point (150, 100) was between the fingers; it still is.
    expect(150 * v.zoom + v.panX).toBeCloseTo(150);
    expect(100 * v.zoom + v.panY).toBeCloseTo(100);
  });

  it('both fingers moving together pan without zooming', () => {
    const v = pinchView(start, [{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 130, y: 80 }, { x: 230, y: 80 }]);
    expect(v).toMatchObject({ zoom: 1, panX: 30, panY: -20 });
  });

  it('is worked out from where the pinch began, so one finger moving at a time leaves no drift', () => {
    const from: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 100, y: 100 }, { x: 200, y: 100 }];
    const half = pinchView(start, from, [{ x: 100, y: 180 }, { x: 200, y: 100 }]);
    expect(half.zoom).not.toBe(1);
    expect(pinchView(start, from, [{ x: 100, y: 180 }, { x: 200, y: 180 }])).toMatchObject({ zoom: 1, panX: 0, panY: 80 });
  });

  it('stays within the zoom limits, and fingers on the same spot never divide by zero', () => {
    expect(pinchView(start, [{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 0 }, { x: 1000, y: 0 }]).zoom).toBe(2.5);
    expect(pinchView(start, [{ x: 50, y: 50 }, { x: 50, y: 50 }], [{ x: 60, y: 50 }, { x: 40, y: 50 }]).zoom).toBe(1);
  });
});
