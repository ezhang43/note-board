import { describe, expect, it } from 'vitest';
import { BEAM_RISE, COMET_START, CORE_LIFT, INNER, MAX_LABEL_CHARS, OUTER, PARTICLES, PARTICLE_DELAY, TILT, beamPoint, beamStart, cellArea, cellCentre, coreAt, discRadius, fitLabel, LABEL_RADIUS, particleAt, particleSeed, pillarLevel, project, STRIKE, tailPoints, tailSpan, warpPhase, wedgeSpan } from './vizGeometry';

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

  it('never gives an empty name or a lone ellipsis for a real name: it keeps at least the first word', () => {
    expect(fitLabel('Garage', 5, ruler().measure)).toBe('Garage');
    expect(fitLabel('Errands & shopping', 5, ruler().measure)).toBe('Errands…');
    expect(fitLabel('Learning', 30, ruler().measure)).toBe('Learning');
    expect(fitLabel('', 100, ruler().measure)).toBe('');
    for (const name of ['A', 'Calls & messages', 'Money & admin', 'x'.repeat(500), 'Social & family']) {
      for (const room of [0, 5, 20, 60, 100, 400]) {
        const t = fitLabel(name, room, ruler().measure);
        expect(t.replace('…', '').trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps a long first word short rather than keeping all of it', () => {
    expect(fitLabel('x'.repeat(500), 5, ruler().measure)).toBe(`${'x'.repeat(8)}…`);
  });

  it('shows the whole name whenever it fits, and cuts from the end when it does not', () => {
    expect(fitLabel('Errands & shopping', 180, ruler().measure)).toBe('Errands & shopping');
    expect(fitLabel('Errands & shopping', 120, ruler().measure)).toBe('Errands & s…');
  });
});

// Light warping into the middle (owner request, 2026-11-12): a beam drops onto the item's cell, the cell
// lights, a comet runs along an arc from the cell into the core, and the core flares as it arrives.

describe('coreAt', () => {
  it('floats the core above the middle of the disc, a share of the disc width, so the pillar runs through it down to the hub', () => {
    const core = coreAt(400, 300, 200);
    expect(core.x).toBe(400);
    expect(core.y).toBeCloseTo(300 - CORE_LIFT * 200);
    expect(core.y).toBeLessThan(300);
  });
});

describe('the disc is seen from a low angle, wide and fairly flat, with a clear hub', () => {
  it('is wider than tall but not a sliver, and leaves room for the hub', () => {
    expect(TILT).toBeGreaterThan(0.45);
    expect(TILT).toBeLessThan(0.7);
    expect(INNER).toBeGreaterThan(0.2);
    expect(INNER).toBeLessThan(0.4);
  });
});

describe('particleSeed', () => {
  it('is the same every time for the same item and particle (nothing random at draw time)', () => {
    for (let item = 0; item < 5; item++) for (let k = 0; k < PARTICLES; k++) expect(particleSeed(item, k)).toEqual(particleSeed(item, k));
  });

  it('keeps every spread within -1 to 1 and every delay within its limit, and sends the first particle straight and first', () => {
    for (let item = 0; item < 40; item++) {
      for (let k = 0; k < PARTICLES; k++) {
        const s = particleSeed(item, k);
        expect(Math.abs(s.spread)).toBeLessThanOrEqual(1);
        expect(s.delay).toBeGreaterThanOrEqual(0);
        expect(s.delay).toBeLessThanOrEqual(PARTICLE_DELAY);
      }
      expect(particleSeed(item, 0).delay).toBe(0);
      expect(Math.abs(particleSeed(item, 0).spread)).toBeLessThanOrEqual(0.25);
    }
  });

  it('fans the particles of one item out, each on its own path', () => {
    const spreads = new Set(Array.from({ length: PARTICLES }, (_, k) => particleSeed(3, k).spread));
    expect(spreads.size).toBe(PARTICLES);
  });
});

describe('particleAt', () => {
  const cell = { x: 100, y: 300 };
  const core = { x: 400, y: 260 };

  it('runs from the cell to the core, rising along an arc on the way', () => {
    expect(particleAt(cell, core, 0, 0)).toEqual(cell);
    const end = particleAt(cell, core, 0.2, 1);
    expect(end.x).toBeCloseTo(core.x);
    expect(end.y).toBeCloseTo(core.y);
    const mid = particleAt(cell, core, 0, 0.5);
    expect(mid.y).toBeLessThan(Math.min(cell.y, core.y) - 10); // above both ends
  });

  it('speeds up as it nears the core', () => {
    const early = particleAt(cell, core, 0, 0.2).x - particleAt(cell, core, 0, 0.1).x;
    const late = particleAt(cell, core, 0, 0.9).x - particleAt(cell, core, 0, 0.8).x;
    expect(late).toBeGreaterThan(early * 2);
  });

  it('bends further to one side or the other with the spread, but meets at the same two ends', () => {
    const left = particleAt(cell, core, -1, 0.5);
    const right = particleAt(cell, core, 1, 0.5);
    expect(Math.hypot(left.x - right.x, left.y - right.y)).toBeGreaterThan(40);
    for (const spread of [-1, 1]) {
      expect(particleAt(cell, core, spread, 0)).toEqual(cell);
      expect(particleAt(cell, core, spread, 1).x).toBeCloseTo(core.x);
    }
  });

  it('stays put at the ends for any progress it is given', () => {
    expect(particleAt(cell, core, 0.5, -3)).toEqual(cell);
    expect(particleAt(cell, core, 0.5, 4).x).toBeCloseTo(core.x);
  });
});

describe('tailSpan', () => {
  it('is never zero or more than the whole run, and grows as the particle speeds up', () => {
    for (let q = 0; q <= 1.0001; q += 0.05) {
      expect(tailSpan(q)).toBeGreaterThan(0);
      expect(tailSpan(q)).toBeLessThanOrEqual(0.5);
    }
    expect(tailSpan(0.9)).toBeGreaterThan(tailSpan(0.3));
    expect(tailSpan(0.3)).toBeGreaterThan(tailSpan(0.02));
  });

  it('gives a tail several times as long as the head is wide once the particle is moving (a streak, not a dot)', () => {
    const cell = { x: 100, y: 300 };
    const core = { x: 400, y: 260 };
    const pts = tailPoints(cell, core, 0, 0.6, 4);
    const length = pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
    expect(length).toBeGreaterThan(60);
  });
});

describe('tailPoints', () => {
  const cell = { x: 100, y: 300 };
  const core = { x: 400, y: 260 };

  it('runs from the tail to the head along the particle\'s own path, with the head where the particle is', () => {
    const pts = tailPoints(cell, core, 0.4, 0.7, 3);
    expect(pts).toHaveLength(4);
    expect(pts[3]).toEqual(particleAt(cell, core, 0.4, 0.7));
    expect(pts[0]).toEqual(particleAt(cell, core, 0.4, 0.7 - tailSpan(0.7)));
    for (let i = 1; i < pts.length; i++) expect(pts[i]).not.toEqual(pts[i - 1]);
  });

  it('starts on the cell at the beginning, so the tail grows out of it', () => {
    const pts = tailPoints(cell, core, 0.4, 0.05, 3);
    expect(pts[0]).toEqual(cell);
    expect(Math.hypot(pts[3].x - cell.x, pts[3].y - cell.y)).toBeLessThan(25);
  });

  it('keeps the tail short when it is slow and long when it is fast', () => {
    const len = (q: number) => {
      const pts = tailPoints(cell, core, 0, q, 3);
      return Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y);
    };
    expect(len(0.9)).toBeGreaterThan(len(0.25) * 1.5);
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

  it('lets the beam and its ring linger on the cell a moment, then sends the particles along the whole arc and fades them into the core', () => {
    expect(COMET_START).toBeGreaterThan(STRIKE);
    expect(warpPhase(COMET_START - 0.01).comet).toBeNull();
    expect(warpPhase(STRIKE + 0.01).beamAlpha).toBeGreaterThan(0.5); // still there after landing
    expect(warpPhase(COMET_START).comet).toBe(0);
    expect(warpPhase((COMET_START + 1) / 2).comet).toBeCloseTo(0.5);
    expect(warpPhase(0.999).comet).toBeGreaterThan(0.99);
  });

  it('flares the core as the comet arrives, not before', () => {
    expect(warpPhase(0).flare).toBe(0);
    expect(warpPhase(0.5).flare).toBe(0);
    expect(warpPhase(0.95).flare).toBeGreaterThan(0.9);
    expect(warpPhase(0.999).flare).toBeLessThan(warpPhase(0.95).flare);
  });

  it('peaks late, when the particles are nearly in the core, not before they get there', () => {
    expect(warpPhase(0.95).flare).toBeGreaterThan(warpPhase(0.9).flare);
    expect(warpPhase(0.95).flare).toBeGreaterThan(warpPhase(0.75).flare);
  });

  it('has finished flaring by the time the trip ends, so the core does not pop back', () => {
    expect(warpPhase(1).flare).toBeCloseTo(0, 9);
    expect(warpPhase(0.95).flare).toBeGreaterThan(0.9);
  });

  it('keeps its numbers inside 0 to 1 whatever progress it is given', () => {
    for (const p of [-1, 0, 0.3, 1, 5]) {
      const w = warpPhase(p);
      for (const v of [w.beam, w.beamAlpha, w.flare, w.flash]) {
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

  it('is a thin line from the start all the way to its head: no short comet tail, so a landed beam reads as a line from outside the picture', () => {
    const from = beamStart(cell, 300);
    // the part of the line drawn is always from the start (0) to the head (p)
    for (const head of [0.1, 0.5, 1]) expect(beamPoint(from, cell, head).y).toBeGreaterThan(from.y);
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
    expect(rest.alpha).toBeGreaterThanOrEqual(0.5); // the core stays bright between arrivals
    expect(rest.alpha).toBeLessThan(0.8);
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

describe('discRadius', () => {
  it('leaves room beside the disc for the longest label, outside the dashed ring', () => {
    const rx = discRadius(700, 600, 120);
    expect(700 / 2 - LABEL_RADIUS * rx).toBeGreaterThanOrEqual(120 + 14 - 1e-9);
  });

  it('gives a bigger disc to a shorter label, never more than the height allows, never under 40', () => {
    expect(discRadius(700, 600, 60)).toBeGreaterThan(discRadius(700, 600, 120));
    expect(discRadius(2000, 300, 60)).toBeLessThanOrEqual((300 - 60) / 1.3);
    expect(discRadius(100, 600, 120)).toBe(40);
  });

  it('reserves at most a fifth of the width for the label, so a phone keeps a usable disc', () => {
    expect(discRadius(390, 780, 400)).toBeCloseTo(discRadius(390, 780, 390 * 0.2), 9);
    expect(discRadius(390, 780, 400)).toBeGreaterThan(70);
  });
});
