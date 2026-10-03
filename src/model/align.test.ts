import { describe, expect, it } from 'vitest';
import { ALIGN_REACH, alignTo } from './align';

const box = (x: number, y: number, w = 100, h = 60) => ({ x, y, w, h });

describe('alignment guides while dragging (owner request)', () => {
  it('snaps an edge onto a nearby block\'s edge within reach, with a guide line', () => {
    const r = alignTo(box(205, 300), [box(200, 0)]);
    expect(r.x).toBe(200);
    expect(r.alignedX).toBe(true);
    expect(r.guides).toContainEqual({ axis: 'x', at: 200, from: 0, to: 360 });
  });

  it('also lines up centres, and right edges with right edges', () => {
    expect(alignTo(box(146, 300), [box(100, 0, 200)]).x).toBe(150); // centres at 200
    expect(alignTo(box(203, 300, 100), [box(0, 0, 300)]).x).toBe(200); // right edges at 300
  });

  it('lines up tops and middles too', () => {
    const r = alignTo(box(600, 6), [box(0, 0)]);
    expect(r.y).toBe(0);
    expect(r.alignedY).toBe(true);
    expect(r.guides.some((g) => g.axis === 'y' && g.at === 0)).toBe(true);
  });

  it('does nothing beyond reach', () => {
    const r = alignTo(box(200 + ALIGN_REACH + 1, 300), [box(0, 0, 200)]);
    expect(r).toMatchObject({ x: 200 + ALIGN_REACH + 1, alignedX: false });
  });
});
