import { describe, expect, it } from 'vitest';
import { INNER, MAX_LABEL_CHARS, OUTER, cellArea, cellCentre, fitLabel, project, sparkAt, wedgeSpan } from './vizGeometry';

// The disc's shape (Visualizer, owner request 2026-11-12): wedges around, cells in rings inside each wedge.

describe('cellArea', () => {
  it('keeps every cell of every wedge apart and inside the ring', () => {
    for (const wedges of [1, 3, 16]) {
      for (const cells of [1, 4, 5, 12, 13, 18]) {
        const areas = [];
        for (let w = 0; w < wedges; w++) for (let c = 0; c < cells; c++) areas.push({ w, c, ...cellArea(w, wedges, c, cells) });
        for (const a of areas) {
          expect(a.r0).toBeGreaterThanOrEqual(INNER - 1e-9);
          expect(a.r1).toBeLessThanOrEqual(OUTER + 1e-9);
          expect(a.r0).toBeLessThan(a.r1);
          expect(a.a1 - a.a0).toBeGreaterThan(0);
          const span = wedgeSpan(a.w, wedges);
          expect(a.a0).toBeGreaterThanOrEqual(span.a0 - 1e-9);
          expect(a.a1).toBeLessThanOrEqual(span.a1 + 1e-9);
        }
        for (let i = 0; i < areas.length; i++)
          for (let j = i + 1; j < areas.length; j++) {
            const p = areas[i];
            const q = areas[j];
            const apart = p.a1 <= q.a0 + 1e-9 || q.a1 <= p.a0 + 1e-9 || p.r1 <= q.r0 + 1e-9 || q.r1 <= p.r0 + 1e-9;
            expect(apart).toBe(true);
          }
      }
    }
  });

  it('puts the first (busiest) cell on the outside', () => {
    expect(cellArea(0, 4, 0, 3).r1).toBeGreaterThan(cellArea(0, 4, 2, 3).r1);
  });
});

describe('project', () => {
  it('squashes the disc to a tilted ellipse and turns it with the spin', () => {
    const right = project(0, 1, 0, 100, 50, 80);
    expect(right.x).toBeCloseTo(180);
    expect(right.y).toBeCloseTo(50);
    const front = project(Math.PI / 2, 1, 0, 100, 50, 80);
    expect(front.x).toBeCloseTo(100);
    expect(front.y).toBeGreaterThan(50);
    expect(front.y - 50).toBeLessThan(80); // squashed
    const turned = project(0, 1, Math.PI / 2, 100, 50, 80);
    expect(turned.x).toBeCloseTo(front.x);
    expect(turned.y).toBeCloseTo(front.y);
  });

  it('puts the middle of the disc at the centre', () => {
    expect(project(1.234, 0, 2, 10, 20, 100)).toEqual({ x: 10, y: 20 });
  });
});

describe('cellCentre', () => {
  it('is inside its cell', () => {
    const a = cellArea(2, 5, 3, 7);
    const c = cellCentre(2, 5, 3, 7);
    expect(c.a).toBeGreaterThan(a.a0);
    expect(c.a).toBeLessThan(a.a1);
    expect(c.r).toBeGreaterThan(a.r0);
    expect(c.r).toBeLessThan(a.r1);
  });
});

describe('sparkAt', () => {
  const from = { x: 0, y: 0 };
  const to = { x: 100, y: 0 };
  it('starts at the core, ends in the cell, and arcs up in between', () => {
    expect(sparkAt(from, to, 0)).toEqual({ x: 0, y: 0 });
    const end = sparkAt(from, to, 1);
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(0);
    expect(sparkAt(from, to, 0.5).y).toBeLessThan(-10); // up the screen
  });
});

describe('fitLabel', () => {
  // A stand-in for measureText: 10 pixels a character, recording what it was asked to measure.
  const ruler = () => {
    const calls: string[] = [];
    return { calls, measure: (s: string) => (calls.push(s), s.length * 10) };
  };

  it('keeps a name that fits, and measures it once', () => {
    const r = ruler();
    expect(fitLabel('Home', 100, r.measure)).toBe('Home');
    expect(r.calls).toHaveLength(1);
  });

  it('cuts a long name to the longest start that fits, with an ellipsis', () => {
    const text = fitLabel('Kitchen renovation', 100, ruler().measure);
    expect(text).toBe('Kitchen r…');
    expect(text.length * 10).toBeLessThanOrEqual(100);
  });

  it('cuts a huge name to the character cap first, then asks the ruler only a handful of times', () => {
    const r = ruler();
    const text = fitLabel('x'.repeat(100000), 200, r.measure);
    expect(text).toBe(`${'x'.repeat(19)}…`);
    expect(r.calls.length).toBeLessThanOrEqual(10);
    expect(Math.max(...r.calls.map((c) => c.length))).toBeLessThanOrEqual(MAX_LABEL_CHARS + 1);
  });

  it('never returns more than the cap, even with room for it all', () => {
    expect(fitLabel('y'.repeat(500), 100000, ruler().measure).length).toBeLessThanOrEqual(MAX_LABEL_CHARS + 1);
  });

  it('gives just an ellipsis when nothing fits, and an empty name stays empty', () => {
    expect(fitLabel('Garage', 5, ruler().measure)).toBe('…');
    expect(fitLabel('', 100, ruler().measure)).toBe('');
  });
});
