import { describe, expect, it } from 'vitest';
import { NAME_H, NAME_MARGIN, fitDisc, keepOut, namesFit, placeNames, type NameGeom } from './vizNames';

// The Visualizer's board names stand outside the disc, on the stage, apart (owner request, 2026-11-13, "viz-disc-bigger").

const NAMES = ['ERRANDS & SHOPPING', 'CALLS & MESSAGES', 'LEARNING', 'MONEY & ADMIN', 'HOME & CHORES', 'SOCIAL & FAMILY', 'HEALTH & FITNESS', 'WORK', 'OTHER'];
/** Mono text 10px: about 6px a letter, plus 12 for the dot. */
const widthsOf = (names: string[], px = 6) => names.map((n) => n.length * px + 12);
const many = (count: number) => Array.from({ length: count }, (_, i) => NAMES[i % NAMES.length]);

const phisAt = (n: number, spin: number) => Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * Math.PI * 2 + spin);

const STAGES = [
  { label: 'desktop', w: 1040, h: 930 },
  { label: 'a short wide window', w: 1280, h: 520 },
  { label: 'a phone', w: 390, h: 560 },
  { label: 'a small phone', w: 320, h: 480 },
  { label: 'a tall phone (70% of the screen)', w: 360, h: 518 },
  { label: 'a tall 390 phone', w: 390, h: 590 },
];

describe('fitDisc and placeNames', () => {
  for (const stage of STAGES) {
    for (const count of [1, 3, 9, 17]) {
      it(`${stage.label}, ${count} names: every name is on the stage, outside the ring and clear of the others at every turn`, () => {
        const widths = widthsOf(many(count));
        const fit = fitDisc(stage.w, stage.h, widths);
        const g: NameGeom = { w: stage.w, h: stage.h, ...fit };
        for (let s = 0; s < 60; s++) {
          const boxes = placeNames(widths, phisAt(count, (s / 60) * Math.PI * 2), g);
          expect(namesFit(boxes, g)).toBe(true);
          for (const b of boxes) {
            expect(b.x).toBeGreaterThanOrEqual(NAME_MARGIN - 1e-6);
            expect(b.x + b.w).toBeLessThanOrEqual(stage.w - NAME_MARGIN + 1e-6);
            expect(b.y).toBeGreaterThanOrEqual(NAME_MARGIN - 1e-6);
            expect(b.y + b.h).toBeLessThanOrEqual(stage.h - NAME_MARGIN + 1e-6);
          }
        }
      });
    }
  }

  it('with names of very different widths, every name fits at every turn of the disc, not only within one wedge step', () => {
    const names = ['A VERY LONG CATEGORY NAME HERE', 'WORK', 'ERRANDS & SHOPPING', 'OTHER', 'LEARNING AND STUDY TIME', 'CALLS', 'MONEY & ADMIN', 'HOME', 'SOCIAL & FAMILY LIFE'];
    for (const stage of [...STAGES, { label: 'narrow', w: 300, h: 420 }, { label: 'short', w: 700, h: 400 }]) {
      const widths = widthsOf(names, 5.5);
      widths[1] = 400 > stage.w ? 90 : 400;
      widths[5] = 20;
      const fit = fitDisc(stage.w, stage.h, widths);
      const g: NameGeom = { w: stage.w, h: stage.h, ...fit };
      for (let s = 0; s < 200; s++) {
        const phis = phisAt(names.length, (s / 200) * Math.PI * 2);
        expect(namesFit(placeNames(widths, phis, g), g)).toBe(true);
      }
    }
  });

  it('shows the whole name in a box as wide as the name when there is room (no cutting)', () => {
    const widths = widthsOf(many(9));
    const fit = fitDisc(1040, 930, widths);
    const boxes = placeNames(widths, phisAt(9, 0.4), { w: 1040, h: 930, ...fit });
    boxes.forEach((b, i) => expect(b.w).toBe(widths[i]));
  });

  it('makes the disc big: most of the stage width, not held back by the names beside it', () => {
    const widths = widthsOf(many(9));
    // Before this the disc was about 330 across half on that desktop and about 90 on that phone.
    const desktop = fitDisc(1040, 930, widths).rx;
    expect(desktop).toBeGreaterThan(330 * 1.3);
    expect(desktop * 2).toBeGreaterThan(1040 * 0.85); // the disc is most of the stage's width
    const phone = fitDisc(390, 560, widths).rx;
    expect(phone).toBeGreaterThan(90 * 1.4);
    expect(phone * 2).toBeGreaterThan(390 * 0.8);
  });

  it('keeps the whole disc and its dashed ring on the stage', () => {
    for (const s of STAGES) {
      const fit = fitDisc(s.w, s.h, widthsOf(many(9)));
      const { a, b } = keepOut(fit.rx);
      expect(fit.cx - a).toBeGreaterThanOrEqual(0);
      expect(fit.cx + a).toBeLessThanOrEqual(s.w);
      expect(fit.cy - b).toBeGreaterThanOrEqual(0);
      expect(fit.cy + b).toBeLessThanOrEqual(s.h);
    }
  });

  it('on a narrow stage picks the biggest disc whose names still fit: a smaller one for longer names', () => {
    const short = fitDisc(320, 480, widthsOf(many(9), 4)).rx;
    const long = fitDisc(320, 480, widthsOf(many(9), 7)).rx;
    expect(long).toBeLessThanOrEqual(short);
    expect(long).toBeGreaterThan(40);
  });

  it('cuts a name wider than the stage down to the stage, never off it', () => {
    const g = { w: 200, h: 400, ...fitDisc(200, 400, [500]) };
    const [b] = placeNames([500], [0.3], g);
    expect(b.w).toBe(200 - 2 * NAME_MARGIN);
    expect(b.x).toBeGreaterThanOrEqual(NAME_MARGIN - 1e-6);
  });

  it('moves smoothly as the disc turns, except for a hop between the back and front where the name fades out', () => {
    const widths = widthsOf(many(9));
    const fit = fitDisc(1040, 930, widths);
    const g: NameGeom = { w: 1040, h: 930, ...fit };
    const step = 0.004;
    let prev = placeNames(widths, phisAt(9, 0), g);
    for (let s = 1; s < 1600; s++) {
      const next = placeNames(widths, phisAt(9, s * step), g);
      next.forEach((b, i) => {
        // Names are numbered by their wedge, so each keeps its own box from one step to the next.
        const jump = Math.hypot(b.x - prev[i].x, b.y - prev[i].y);
        if (jump > 40) expect(Math.min(b.fade, prev[i].fade)).toBeLessThan(0.5);
      });
      prev = next;
    }
  });

  it('fades only the names that hop; the rest are fully shown', () => {
    const widths = widthsOf(many(9));
    const fit = fitDisc(1040, 930, widths);
    const boxes = placeNames(widths, phisAt(9, 0.3), { w: 1040, h: 930, ...fit });
    expect(boxes.filter((b) => b.fade < 1).length).toBeLessThanOrEqual(2);
  });

  it('has a box the height of a line', () => {
    const widths = widthsOf(many(3));
    const fit = fitDisc(800, 600, widths);
    for (const b of placeNames(widths, phisAt(3, 0), { w: 800, h: 600, ...fit })) expect(b.h).toBe(NAME_H);
  });
});
