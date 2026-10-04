import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM } from './constants';
import { clampZoom, createView, gridStyle, panBy, resetZoom, screenToBoard, wheelZoomFactor, zoomBy, zoomLabel, viewShowing, viewFitting, zoomTo } from './view';

describe('pan', () => {
  it('moves the board by the drag distance', () => {
    const v = panBy(createView(), 30, -15);
    expect(v.panX).toBe(30);
    expect(v.panY).toBe(-15);
  });

  it('returns the same view when nothing moves', () => {
    const v = createView();
    expect(panBy(v, 0, 0)).toBe(v);
  });
});

describe('zoom', () => {
  it('keeps the board point under the cursor in place', () => {
    const start = { ...createView(), panX: 100, panY: 50 };
    const cursor = { x: 400, y: 300 };
    const before = screenToBoard(start, cursor);
    const after = zoomBy(start, cursor, 1.5);
    expect(after.zoom).toBeCloseTo(1.5);
    const p = screenToBoard(after, cursor);
    expect(p.x).toBeCloseTo(before.x);
    expect(p.y).toBeCloseTo(before.y);
  });

  it('stays between 30% and 250%', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(10)).toBe(MAX_ZOOM);
    let v = createView();
    for (let i = 0; i < 50; i++) v = zoomBy(v, { x: 0, y: 0 }, 1.2);
    expect(v.zoom).toBe(MAX_ZOOM);
    for (let i = 0; i < 50; i++) v = zoomBy(v, { x: 0, y: 0 }, 1 / 1.2);
    expect(v.zoom).toBe(MIN_ZOOM);
  });

  it('does not move the board when already at a limit', () => {
    const v = { ...createView(), zoom: MAX_ZOOM, panX: 7 };
    expect(zoomTo(v, { x: 500, y: 500 }, 3)).toBe(v);
  });

  it('reset goes back to exactly 100% around the centre of the screen', () => {
    const size = { width: 1000, height: 600 };
    const centre = { x: 500, y: 300 };
    const zoomed = zoomBy({ ...createView(), panX: -240, panY: 80 }, { x: 123, y: 456 }, 1.73);
    const middleBefore = screenToBoard(zoomed, centre);
    const reset = resetZoom(zoomed, size);
    expect(reset.zoom).toBe(1);
    const middleAfter = screenToBoard(reset, centre);
    expect(middleAfter.x).toBeCloseTo(middleBefore.x);
    expect(middleAfter.y).toBeCloseTo(middleBefore.y);
  });

  it('scrolling up zooms in, scrolling down zooms out', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(0)).toBe(1);
  });

  it('shows zoom as a whole percentage', () => {
    expect(zoomLabel(1)).toBe('100%');
    expect(zoomLabel(1.2)).toBe('120%');
    expect(zoomLabel(0.3)).toBe('30%');
    expect(zoomLabel(1 / 1.2)).toBe('83%');
  });
});

describe('grid', () => {
  it('puts a dot on board point 0,0 wherever the board is panned or zoomed', () => {
    for (const v of [createView(), { ...createView(), panX: 37, panY: -12, zoom: 1.7 }]) {
      const g = gridStyle(v);
      // Dots are drawn in the middle of each background tile.
      expect(g.offsetX + g.size / 2).toBeCloseTo(v.panX);
      expect(g.offsetY + g.size / 2).toBeCloseTo(v.panY);
      expect(g.size).toBeCloseTo(20 * v.zoom);
    }
  });
});

describe('viewShowing (the view on opening the board, owner request)', () => {
  const size = { width: 1000, height: 800 };
  const at = (v: ReturnType<typeof createView>, p: { x: number; y: number }) => ({ x: p.x * v.zoom + v.panX, y: p.y * v.zoom + v.panY });

  it('leaves an empty board as it is', () => {
    const v = { ...createView(), panX: 123, panY: -45 };
    expect(viewShowing([], size, v)).toBe(v);
  });

  it('centres the blocks when they fit, keeping the zoom', () => {
    const v = { ...createView(), panX: -5000, panY: 3000 };
    const out = viewShowing([{ x: 2000, y: 1000, w: 200, h: 100 }, { x: 2400, y: 1300, w: 200, h: 100 }], size, v);
    expect(out.zoom).toBe(1);
    const mid = at(out, { x: 2300, y: 1200 }); // middle of everything
    expect(mid.x).toBeCloseTo(500);
    expect(mid.y).toBeCloseTo(400);
  });

  it('zooms out just enough to fit everything, never zooming in past the remembered zoom', () => {
    const wide = [{ x: 0, y: 0, w: 1600, h: 200 }];
    const out = viewShowing(wide, size, createView());
    expect(out.zoom).toBeLessThan(1);
    expect(at(out, { x: 0, y: 0 }).x).toBeGreaterThanOrEqual(0);
    expect(at(out, { x: 1600, y: 0 }).x).toBeLessThanOrEqual(1000);
    expect(viewShowing([{ x: 0, y: 0, w: 100, h: 100 }], size, { ...createView(), zoom: 0.8 }).zoom).toBe(0.8);
  });

  it('never zooms out below 50%; a board still too big shows its top-left corner', () => {
    const huge = [{ x: 100, y: 200, w: 5000, h: 4000 }];
    const out = viewShowing(huge, size, createView());
    expect(out.zoom).toBe(0.5);
    const tl = at(out, { x: 100, y: 200 });
    expect(tl.x).toBeGreaterThan(0);
    expect(tl.x).toBeLessThan(100);
    expect(tl.y).toBeGreaterThan(0);
    expect(tl.y).toBeLessThan(100);
  });
});

describe('viewFitting (Fit to screen, owner request)', () => {
  const size = { width: 1000, height: 600 };
  it('zooms in up to 100% to fill the screen with a small board, centred', () => {
    const v = { ...createView(), zoom: 0.5 };
    const fit = viewFitting([{ x: 0, y: 0, w: 200, h: 100 }], size, v);
    expect(fit.zoom).toBe(1);
    expect(fit.panX).toBe(400);
    expect(fit.panY).toBe(250);
  });
  it('zooms out as far as needed (down to the smallest zoom) to show a big board', () => {
    const fit = viewFitting([{ x: 0, y: 0, w: 3000, h: 400 }], size, createView());
    expect(fit.zoom).toBeCloseTo((1000 - 80) / 3000, 3);
    const huge = viewFitting([{ x: 0, y: 0, w: 30000, h: 400 }], size, createView());
    expect(huge.zoom).toBe(0.3);
  });
});
