import { describe, expect, it } from 'vitest';
import { BEAM_RISE, BEAM_ALPHA, beamWidths, BURST_BUDGET, COMET_START, LIFT_MAX, LIFT_MIN, RIPPLES, burstSize,CORE_LIFT, INNER, MAX_LABEL_CHARS, OUTER, PARTICLES, PARTICLE_DELAY, TILT, beamPoint, beamStart, cellArea, cellCentre, coreAt, fitLabel, flowAt, flowTail, particleSeed, pillarLevel, project, STRIKE, TRIP_MS, DROP_MS, FLARE_MAX, pulseAt, PULSE_PEAK, PULSE_RISE_MS, PULSE_FALL_MS, tailSpan, warpPhase, wedgeSpan } from './vizGeometry';

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

const VIEW = { spin: 0.4, cx: 500, cy: 400, rx: 300 };
/** Where a screen point sits on the disc: its angle (turned back by the spin) and its radius as a share of the half width. */
const onDisc = (p: { x: number; y: number }, v = VIEW) => {
  const dx = p.x - v.cx;
  const dy = (p.y - v.cy) / TILT;
  return { a: Math.atan2(dy, dx) - v.spin, r: Math.hypot(dx, dy) / v.rx };
};
const turn = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// The flow of an item's sparks (owner request 2026-11-13, "viz-disc-bigger": "flowing from the categories into the center"):
// out of the cell, inward along its own wedge on the disc's tilt, then up into the core.
describe('flowAt', () => {
  const cell = { a: 1.1, r: 0.8 };
  const half = 0.3;
  const core = coreAt(VIEW.cx, VIEW.cy, VIEW.rx);

  it('starts exactly on the cell (turned with the disc) and ends in the core', () => {
    const start = flowAt(cell, half, 0.7, 0, 0.4, VIEW);
    const at = project(cell.a, cell.r, VIEW.spin, VIEW.cx, VIEW.cy, VIEW.rx);
    expect(start.x).toBeCloseTo(at.x);
    expect(start.y).toBeCloseTo(at.y);
    const end = flowAt(cell, half, 0.7, 1, 0.4, VIEW);
    expect(end.x).toBeCloseTo(core.x);
    expect(end.y).toBeCloseTo(core.y);
  });

  it('moves in along the disc first: its radius shrinks steadily, and it stays inside its own wedge', () => {
    for (const spread of [-1, -0.4, 0, 0.6, 1]) {
      let prev = cell.r + 1e-9;
      for (let q = 0; q <= 0.4001; q += 0.05) {
        const d = onDisc(flowAt(cell, half, spread, q, 0, VIEW));
        expect(d.r).toBeLessThan(prev);
        prev = d.r;
        expect(turn(d.a, cell.a)).toBeLessThanOrEqual(half + 0.03);
      }
    }
  });

  it('stays down on the disc (it follows the tilt) before it lifts into the core', () => {
    // No lift: a cell at the front runs back toward the middle, up the picture, never above the core before the end.
    const front = { a: Math.PI / 2, r: 0.85 };
    const from = flowAt(front, half, 0, 0, 0, VIEW);
    const mid = flowAt(front, half, 0, 0.45, 0, VIEW);
    expect(mid.y).toBeLessThan(from.y);
    expect(mid.y).toBeGreaterThan(core.y);
    expect(Math.abs(mid.x - from.x)).toBeLessThan(Math.abs(mid.y - from.y));
  });

  it('bends further to one side or the other with the spread, but meets at the same two ends', () => {
    const left = flowAt(cell, half, -1, 0.4, 0.4, VIEW);
    const right = flowAt(cell, half, 1, 0.4, 0.4, VIEW);
    expect(Math.hypot(left.x - right.x, left.y - right.y)).toBeGreaterThan(8);
    for (const spread of [-1, 1]) {
      expect(flowAt(cell, half, spread, 0, 0.4, VIEW)).toEqual(flowAt(cell, half, 0, 0, 0.4, VIEW));
      expect(flowAt(cell, half, spread, 1, 0.4, VIEW).x).toBeCloseTo(core.x);
    }
  });

  it('never swings more than a narrow wedge allows, and a lone wedge does not make it spiral', () => {
    const wide = onDisc(flowAt(cell, Math.PI, 1, 0.45, 0, VIEW));
    expect(turn(wide.a, cell.a)).toBeLessThanOrEqual(0.5);
  });

  it('speeds up as it nears the core (along the disc and into the hub, apart from its arc)', () => {
    const d = (q0: number, q1: number) => {
      const a = flowAt(cell, half, 0, q0, 0, VIEW);
      const b = flowAt(cell, half, 0, q1, 0, VIEW);
      return Math.hypot(b.x - a.x, b.y - a.y);
    };
    expect(d(0.8, 0.9)).toBeGreaterThan(d(0.1, 0.2) * 2);
  });

  it('shoots up higher with a bigger lift, still starting on the cell and ending in the core', () => {
    expect(flowAt(cell, half, 0, 0.5, LIFT_MAX, VIEW).y).toBeLessThan(flowAt(cell, half, 0, 0.5, LIFT_MIN, VIEW).y);
    for (const lift of [LIFT_MIN, LIFT_MAX]) {
      expect(flowAt(cell, half, 0.3, 0, lift, VIEW)).toEqual(flowAt(cell, half, 0.3, 0, 0, VIEW));
      expect(flowAt(cell, half, 0.3, 1, lift, VIEW).y).toBeCloseTo(core.y);
    }
  });

  it('turns with the disc: the same flow a little later has moved round with the spin', () => {
    const a = flowAt(cell, half, 0, 0.3, 0.4, VIEW);
    const b = flowAt(cell, half, 0, 0.3, 0.4, { ...VIEW, spin: VIEW.spin + 0.5 });
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(20);
  });

  it('stays put at the ends for any progress it is given', () => {
    expect(flowAt(cell, half, 0.5, -3, 0.4, VIEW)).toEqual(flowAt(cell, half, 0.5, 0, 0.4, VIEW));
    expect(flowAt(cell, half, 0.5, 4, 0.4, VIEW).x).toBeCloseTo(core.x);
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
    const pts = flowTail({ a: 1.1, r: 0.8 }, 0.3, 0, 0.6, 4, 0.4, VIEW);
    const length = pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
    expect(length).toBeGreaterThan(40);
  });
});

// How high the fountains arc (owner request 2026-11-13, "make the fountains arc higher like the video"). In the
// reference clip a spark rises steeply from its cell, bends over well above the disc and drops onto the core:
// the middle of its path stands about a tenth of the disc's width (0.07 to 0.14) off the straight line from the
// cell to the core. The first version of this app was 0.02 to 0.08 on average, the flow before this change 0.01 to 0.03.
describe('how high the sparks arc', () => {
  /** The most the path strays from the straight line from its start to its end, as a share of the disc's width. */
  const bulge = (cell: { a: number; r: number }, half: number, lift: number, v = VIEW) => {
    const a = flowAt(cell, half, 0, 0, lift, v);
    const b = flowAt(cell, half, 0, 1, lift, v);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let best = 0;
    for (let i = 0; i <= 100; i++) {
      const p = flowAt(cell, half, 0, i / 100, lift, v);
      best = Math.max(best, Math.abs(-(p.y - a.y) * (b.x - a.x) + (p.x - a.x) * (b.y - a.y)) / len);
    }
    return best / (2 * v.rx);
  };
  const cells = Array.from({ length: 9 }, (_, w) => ({ cell: cellCentre(w, 9, 2, 6), half: Math.PI / 9 }));
  const average = (lift: number) => cells.reduce((s, c) => s + bulge(c.cell, c.half, lift), 0) / cells.length;

  it('bends 0.10 to 0.21 of the disc width off the straight line, from the lowest lift to the highest', () => {
    expect(average(LIFT_MIN)).toBeGreaterThan(0.1);
    expect(average(LIFT_MAX)).toBeLessThan(0.21);
    expect(average(LIFT_MAX)).toBeGreaterThan(average(LIFT_MIN));
  });

  it('even the highest spark of a cell next to the core stays inside the stage above it (not more than a disc width up)', () => {
    for (const { cell, half } of cells) {
      for (let i = 0; i <= 50; i++) expect(flowAt(cell, half, 0, i / 50, LIFT_MAX, VIEW).y).toBeGreaterThan(VIEW.cy - 2 * VIEW.rx);
    }
  });

  it('leaves the cell mostly straight up: in its first moves it climbs more than it moves sideways', () => {
    for (const { cell, half } of cells) {
      const a = flowAt(cell, half, 0, 0, 0.5, VIEW);
      const b = flowAt(cell, half, 0, 0.1, 0.5, VIEW);
      expect(a.y - b.y).toBeGreaterThan(Math.abs(b.x - a.x));
    }
  });

  it('is still one path into the core: the highest spark of a cell crosses no more than once through its own height before it ends (it rises, then comes down onto the core)', () => {
    const { cell, half } = cells[0];
    let peak = Infinity;
    let atPeak = 0;
    for (let i = 0; i <= 100; i++) {
      const y = flowAt(cell, half, 0, i / 100, LIFT_MAX, VIEW).y;
      if (y < peak) { peak = y; atPeak = i; }
    }
    expect(atPeak).toBeGreaterThan(5);
    expect(atPeak).toBeLessThan(100);
  });
});

describe('flowTail', () => {
  const cell = { a: 1.1, r: 0.8 };

  it('runs from the tail to the head along the particle\'s own path, with the head where the particle is', () => {
    const pts = flowTail(cell, 0.3, 0.4, 0.7, 3, 0.4, VIEW);
    expect(pts).toHaveLength(4);
    expect(pts[3]).toEqual(flowAt(cell, 0.3, 0.4, 0.7, 0.4, VIEW));
    expect(pts[0]).toEqual(flowAt(cell, 0.3, 0.4, 0.7 - tailSpan(0.7), 0.4, VIEW));
    for (let i = 1; i < pts.length; i++) expect(pts[i]).not.toEqual(pts[i - 1]);
  });

  it('starts on the cell at the beginning, so the tail grows out of it', () => {
    const pts = flowTail(cell, 0.3, 0.4, 0.02, 3, 0.4, VIEW);
    expect(pts[0]).toEqual(flowAt(cell, 0.3, 0.4, 0, 0.4, VIEW));
    expect(Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y)).toBeLessThan(25);
  });

  it('keeps the tail short when it is slow and long when it is fast', () => {
    const len = (q: number) => {
      const pts = flowTail(cell, 0.3, 0, q, 3, 0, VIEW); // the part of the path that is not the arc
      return Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y);
    };
    expect(len(0.9)).toBeGreaterThan(len(0.25) * 1.5);
  });
});

/** The trip's progress `ms` milliseconds into it. */
const at = (ms: number) => ms / TRIP_MS;

describe('warpPhase', () => {
  it('drops the beam first: it starts at the top and reaches the cell at STRIKE', () => {
    expect(warpPhase(0).beam).toBe(0);
    expect(warpPhase(STRIKE / 2).beam).toBeGreaterThan(0);
    expect(warpPhase(STRIKE / 2).beam).toBeLessThan(1);
    expect(warpPhase(STRIKE).beam).toBe(1);
    expect(warpPhase(at(300)).beamAlpha).toBe(1);
    expect(warpPhase(STRIKE + at(500)).beamAlpha).toBe(0); // gone soon after it lands
  });

  it('lets the beam and its ring linger on the cell a moment, then sends the particles along the whole arc and fades them into the core', () => {
    expect(COMET_START).toBeGreaterThan(STRIKE);
    expect(warpPhase(COMET_START - at(10)).comet).toBeNull();
    expect(warpPhase(STRIKE + at(20)).beamAlpha).toBeGreaterThan(0.5); // still there after landing
    expect(warpPhase(COMET_START).comet).toBe(0);
    expect(warpPhase((COMET_START + 1) / 2).comet).toBeCloseTo(0.5);
    expect(warpPhase(0.9999).comet).toBeGreaterThan(0.99);
  });

  it('flares the core as the comet arrives, not before', () => {
    expect(warpPhase(0).flare).toBe(0);
    expect(warpPhase(at(1000)).flare).toBe(0);
    expect(warpPhase(0.9).flare).toBeGreaterThan(0.9);
    expect(warpPhase(0.999).flare).toBeLessThan(warpPhase(0.9).flare);
  });

  it('peaks late, when the particles are nearly in the core, not before they get there', () => {
    expect(warpPhase(0.9).flare).toBeGreaterThan(warpPhase(0.8).flare);
    expect(warpPhase(0.9).flare).toBeGreaterThan(warpPhase(0.6).flare);
  });

  it('has finished flaring by the time the trip ends, so the core does not pop back', () => {
    expect(warpPhase(1).flare).toBeCloseTo(0, 9);
    expect(warpPhase(0.9).flare).toBeGreaterThan(0.9);
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

describe('slower beams and sparks (owner, 2026-11-13)', () => {
  it('drops the beam over 1050ms (three times the first 350ms) and the sparks fly for 2730ms (three times 910ms), the whole trip about 4.0s (owner 2026-11-13, "can make it slower": 1.5x slower than 700 and 1820), the strike and what follows shifting later together', () => {
    expect(DROP_MS).toBe(1050);
    expect(STRIKE * TRIP_MS).toBeCloseTo(1050);
    expect((1 - COMET_START) * TRIP_MS).toBeCloseTo(2730);
  });

  it('keeps the core flare to half of what it was, however many sparks arrive together', () => {
    expect(warpPhase(0.9).flare).toBeLessThanOrEqual(1);
    expect(FLARE_MAX).toBe(0.5);
    expect(FLARE_MAX * Math.tanh(50)).toBeLessThanOrEqual(0.5);
    expect(FLARE_MAX * Math.tanh(1)).toBeLessThan(0.5);
  });
});

describe('warpPhase impact flash', () => {
  it('flashes as the beam lands, brightest at the strike, and is spent soon after', () => {
    expect(warpPhase(STRIKE - at(10)).flash).toBe(0);
    expect(warpPhase(STRIKE).flash).toBe(1);
    expect(warpPhase(STRIKE + at(40)).flash).toBeGreaterThan(0);
    expect(warpPhase(STRIKE + at(40)).flash).toBeLessThan(1);
    expect(warpPhase(STRIKE + at(500)).flash).toBe(0);
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

describe('fountain', () => {
  it('is a burst of ten sparks, fewer when many arrive together (a fixed budget for the frame)', () => {
    expect(PARTICLES).toBe(10);
    expect(burstSize(1)).toBe(PARTICLES);
    expect(burstSize(5)).toBeGreaterThanOrEqual(8);
    for (let o = 1; o < 60; o++) {
      expect(burstSize(o)).toBeGreaterThanOrEqual(4);
      expect(burstSize(o)).toBeLessThanOrEqual(PARTICLES);
    }
    expect(burstSize(24)).toBeLessThan(burstSize(2));
    expect(burstSize(20)).toBe(PARTICLES); // 20 in the air: each fountain as dense as with 10 before
    expect(burstSize(24) * 24).toBeLessThanOrEqual(BURST_BUDGET + 24); // all that can be in the air at once stay near the budget
  });

  it('arcs each spark up to its own height, within limits, the same every time', () => {
    for (let item = 0; item < 20; item++) {
      for (let k = 0; k < PARTICLES; k++) {
        const s = particleSeed(item, k);
        expect(s.lift).toBeGreaterThanOrEqual(LIFT_MIN);
        expect(s.lift).toBeLessThanOrEqual(LIFT_MAX);
        expect(particleSeed(item, k)).toEqual(s);
      }
    }
    const lifts = new Set(Array.from({ length: PARTICLES }, (_, k) => particleSeed(7, k).lift));
    expect(lifts.size).toBeGreaterThan(PARTICLES / 2);
  });
});

describe('ripples and column', () => {
  it('rings three ripples out from the landing, one after another, each opening and fading', () => {
    const none = warpPhase(STRIKE - at(10)).ripples;
    expect(none).toHaveLength(RIPPLES);
    expect(none.every((r) => r.alpha === 0)).toBe(true);
    const early = warpPhase(STRIKE + at(30)).ripples;
    expect(early[0].alpha).toBeGreaterThan(0);
    expect(early[RIPPLES - 1].alpha).toBe(0); // the last has not started
    const later = warpPhase(STRIKE + at(300)).ripples;
    expect(later.filter((r) => r.alpha > 0).length).toBe(RIPPLES);
    expect(later[0].open).toBeGreaterThan(later[RIPPLES - 1].open); // the first has opened further
    expect(warpPhase(0.99).ripples.every((r) => r.alpha === 0)).toBe(true);
  });

  it('raises a bright column from the landing for a moment, then lets it go', () => {
    expect(warpPhase(STRIKE - at(10)).column).toEqual({ height: 0, alpha: 0 });
    expect(warpPhase(STRIKE).column.alpha).toBeGreaterThan(0);
    const peak = warpPhase(STRIKE + at(80)).column;
    expect(peak.alpha).toBeGreaterThan(0.8);
    expect(peak.height).toBeGreaterThan(warpPhase(STRIKE + at(15)).column.height);
    expect(warpPhase(STRIKE + at(600)).column.alpha).toBe(0);
  });

  it('keeps ripples and column inside 0 to 1', () => {
    for (const p of [-1, 0, STRIKE, STRIKE + at(150), 0.6, 1, 5]) {
      const w = warpPhase(p);
      for (const v of [w.column.height, w.column.alpha, ...w.ripples.flatMap((r) => [r.open, r.alpha])]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('beamWidths', () => {
  // Measured in the reference stills (owner request 2026-11-13, "make the beams thicker like the video"): the pink
  // band of a beam is about 0.0055 of the disc's width across at half its brightness (5 to 6px on a disc about 930px wide).
  // A sprite's brightness halves at about 0.38 of its width.
  const HALF = 0.38;
  const old = (rx: number) => ({ glow: 7 * Math.max(0.6, Math.min(1.2, rx / 260)), core: 1.8 * Math.max(0.6, Math.min(1.2, rx / 260)) });

  it('makes the pink glow about 0.008 of the disc width across at half brightness on a big stage', () => {
    for (const rx of [330, 400, 469, 600]) {
      const share = (beamWidths(rx).glow * HALF) / (2 * rx);
      expect(share).toBeGreaterThan(0.0068);
      expect(share).toBeLessThan(0.0095);
    }
  });

  it('keeps a thin bright core inside a wider glow, both wider than before', () => {
    for (const rx of [60, 100, 122, 200, 260, 330, 469, 600]) {
      const w = beamWidths(rx);
      expect(w.core).toBeLessThan(w.glow);
      expect(w.glow).toBeGreaterThan(old(rx).glow);
      expect(w.core).toBeGreaterThan(old(rx).core);
    }
  });

  it('grows with the stage but never goes thinner than a few pixels, so a beam stays visible on a phone', () => {
    expect(beamWidths(600).glow).toBeGreaterThan(beamWidths(122).glow);
    expect(beamWidths(122).glow).toBeGreaterThanOrEqual(8);
    expect(beamWidths(122).core).toBeGreaterThanOrEqual(2.4);
  });

  it('draws the glow bright enough to read as pink, not faint', () => {
    expect(BEAM_ALPHA.glow).toBeGreaterThanOrEqual(0.7);
    expect(BEAM_ALPHA.core).toBeGreaterThanOrEqual(0.85);
  });
});

describe('arcs stay on the canvas', () => {
  it('never rise above the top edge, even on a short stage where the arc would', () => {
    const short = { spin: 0, cx: 200, cy: 110, rx: 180 };
    for (const lift of [LIFT_MIN, LIFT_MAX]) {
      for (let i = 0; i <= 50; i++) expect(flowAt(cellCentre(0, 3, 2, 6), 0.5, 0, i / 50, lift, short).y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('core pulse on each landing (owner, 2026-11-13)', () => {
  it('is nothing before the beam lands, rises over about 0.15s, eases back over about 0.4s, and is spent after', () => {
    expect(pulseAt(-10)).toBe(0);
    expect(pulseAt(0)).toBe(0);
    expect(pulseAt(PULSE_RISE_MS)).toBeCloseTo(PULSE_PEAK, 6);
    expect(pulseAt(PULSE_RISE_MS / 2)).toBeGreaterThan(0);
    expect(pulseAt(PULSE_RISE_MS / 2)).toBeLessThan(PULSE_PEAK);
    expect(pulseAt(PULSE_RISE_MS + PULSE_FALL_MS / 2)).toBeLessThan(PULSE_PEAK);
    expect(pulseAt(PULSE_RISE_MS + PULSE_FALL_MS)).toBe(0);
    expect(pulseAt(5000)).toBe(0);
  });
  it('never passes its peak, and the shared cap keeps even sixteen together under FLARE_MAX', () => {
    for (let t = 0; t < 700; t += 10) expect(pulseAt(t)).toBeLessThanOrEqual(PULSE_PEAK + 1e-9);
    expect(FLARE_MAX * Math.tanh(16 * PULSE_PEAK + 16)).toBeLessThanOrEqual(FLARE_MAX);
  });
});
