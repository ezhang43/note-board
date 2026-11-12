import { describe, expect, it } from 'vitest';
import { BEAM_RISE, INNER, MAX_LABEL_CHARS, OUTER, beamPoint, beamStart, beamTail, cellArea, cellCentre, fitLabel, pillarLevel, project, STRIKE, warpAt, warpPhase, wedgeSpan } from './vizGeometry';

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

// Light warping into the middle (owner request, 2026-11-12): a beam drops onto the item's cell, the cell
// lights, a comet runs along an arc from the cell into the core, and the core flares as it arrives.

describe('warpAt', () => {
  const cell = { x: 100, y: 300 };
  const core = { x: 400, y: 260 };

  it('runs from the cell to the core, rising along an arc on the way', () => {
    expect(warpAt(cell, core, 0)).toEqual(cell);
    const end = warpAt(cell, core, 1);
    expect(end.x).toBeCloseTo(core.x);
    expect(end.y).toBeCloseTo(core.y);
    const mid = warpAt(cell, core, 0.5);
    expect(mid.y).toBeLessThan(Math.min(cell.y, core.y) - 10); // above both ends
  });

  it('speeds up as it nears the core', () => {
    const early = warpAt(cell, core, 0.2).x - warpAt(cell, core, 0.1).x;
    const late = warpAt(cell, core, 0.9).x - warpAt(cell, core, 0.8).x;
    expect(late).toBeGreaterThan(early * 2);
  });
});

describe('warpPhase', () => {
  it('drops the beam first: it starts at the top and reaches the cell at STRIKE', () => {
    expect(warpPhase(0).beam).toBe(0);
    expect(warpPhase(STRIKE / 2).beam).toBeGreaterThan(0);
    expect(warpPhase(STRIKE / 2).beam).toBeLessThan(1);
    expect(warpPhase(STRIKE).beam).toBe(1);
    expect(warpPhase(0.1).beamAlpha).toBe(1);
    expect(warpPhase(STRIKE + 0.2).beamAlpha).toBe(0); // gone soon after it lands
  });

  it('rings a ping on the cell when the beam lands, then lets it go', () => {
    expect(warpPhase(STRIKE - 0.01).ping).toBeNull();
    expect(warpPhase(STRIKE).ping).toBe(0);
    const mid = warpPhase(STRIKE + 0.1).ping!;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(warpPhase(0.9).ping).toBeNull();
  });

  it('sends the comet only after the beam has landed, along the whole arc, and fades it into the core', () => {
    expect(warpPhase(STRIKE - 0.01).comet).toBeNull();
    expect(warpPhase(STRIKE).comet).toBe(0);
    expect(warpPhase((STRIKE + 1) / 2).comet).toBeCloseTo(0.5);
    expect(warpPhase(0.999).comet).toBeGreaterThan(0.99);
    expect(warpPhase(STRIKE + 0.1).cometAlpha).toBe(1);
    expect(warpPhase(0.999).cometAlpha).toBeLessThan(0.1);
  });

  it('flares the core as the comet arrives, not before', () => {
    expect(warpPhase(0).flare).toBe(0);
    expect(warpPhase(0.5).flare).toBe(0);
    expect(warpPhase(0.9).flare).toBeGreaterThan(0.9);
    expect(warpPhase(0.999).flare).toBeLessThan(warpPhase(0.9).flare);
  });

  it('has finished flaring by the time the trip ends, so the core does not pop back', () => {
    expect(warpPhase(1).flare).toBeCloseTo(0, 9);
    expect(warpPhase(0.9).flare).toBeGreaterThan(0.9);
  });

  it('keeps its numbers inside 0 to 1 whatever progress it is given', () => {
    for (const p of [-1, 0, 0.3, 1, 5]) {
      const w = warpPhase(p);
      for (const v of [w.beam, w.beamAlpha, w.cometAlpha, w.flare, w.flash]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

// The incoming beam and the light pillar (owner request, 2026-11-12): each item's beam starts off the top
// of the canvas and shoots into its cell with a flash; a pillar runs through the core and swells with the flare.

describe('beamStart and beamPoint', () => {
  const cell = { x: 120, y: 260 };

  it('starts the beam above the top edge of the canvas, whatever cell it is for', () => {
    for (const to of [cell, { x: 10, y: 5 }, { x: 600, y: 400 }]) {
      expect(beamStart(to, 300).y).toBeLessThan(0);
      expect(beamStart(to, 300).y).toBe(-BEAM_RISE);
    }
  });

  it('leans outwards, so the light comes in from beyond the ring and a cell in the middle gets a straight beam', () => {
    expect(beamStart(cell, 300).x).toBeLessThan(cell.x); // left of the middle: starts further left
    expect(beamStart({ x: 480, y: 260 }, 300).x).toBeGreaterThan(480);
    expect(beamStart({ x: 300, y: 260 }, 300).x).toBe(300);
  });

  it('runs from the start to the cell as the beam falls', () => {
    const from = beamStart(cell, 300);
    expect(beamPoint(from, cell, 0)).toEqual(from);
    expect(beamPoint(from, cell, 1)).toEqual(cell);
    const mid = beamPoint(from, cell, 0.5);
    expect(mid.y).toBeGreaterThan(from.y);
    expect(mid.y).toBeLessThan(cell.y);
  });

  it('keeps a tail behind the head that never goes before the start', () => {
    expect(beamTail(0)).toBe(0);
    expect(beamTail(0.1)).toBe(0);
    expect(beamTail(1)).toBeGreaterThan(0);
    expect(beamTail(1)).toBeLessThan(1);
    for (const head of [0, 0.2, 0.7, 1]) expect(beamTail(head)).toBeLessThanOrEqual(head);
  });
});

describe('warpPhase impact flash', () => {
  it('flashes as the beam lands, brightest at the strike, and is spent soon after', () => {
    expect(warpPhase(STRIKE - 0.01).flash).toBe(0);
    expect(warpPhase(STRIKE).flash).toBe(1);
    expect(warpPhase(STRIKE + 0.03).flash).toBeGreaterThan(0);
    expect(warpPhase(STRIKE + 0.03).flash).toBeLessThan(1);
    expect(warpPhase(STRIKE + 0.3).flash).toBe(0);
  });
});

describe('pillarLevel', () => {
  it('is always faintly there, even with no comet', () => {
    const rest = pillarLevel(0);
    expect(rest.alpha).toBeGreaterThan(0);
    expect(rest.alpha).toBeLessThan(0.5);
    expect(rest.width).toBeGreaterThan(0);
  });

  it('swells wider and brighter with the flare, up to full', () => {
    const rest = pillarLevel(0);
    const half = pillarLevel(0.5);
    const full = pillarLevel(1);
    expect(half.width).toBeGreaterThan(rest.width);
    expect(full.width).toBeGreaterThan(half.width);
    expect(half.alpha).toBeGreaterThan(rest.alpha);
    expect(full.alpha).toBeGreaterThan(half.alpha);
    expect(full.alpha).toBeLessThanOrEqual(1);
  });

  it('stays in range for any flare it is given', () => {
    expect(pillarLevel(-3)).toEqual(pillarLevel(0));
    expect(pillarLevel(7)).toEqual(pillarLevel(1));
  });
});
