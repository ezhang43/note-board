import { describe, expect, it } from 'vitest';
import { CARD_FADE_IN, CARD_GAP_MS, CARD_LIFE_MS, DASH_MAX_FILL, MAX_CARDS, cardBox, cardsAt, dashCapacity, dashCount, dashFor, shouldShowCard } from './vizBurst';
import { INNER, OUTER, TRACKS, cellArea } from './vizGeometry';

// The Visualizer's lit cells and name cards (owner request, 2026-11-13, "viz-burst"): each finished item is one
// small magenta dash at its own place in its cell, and the item that just arrived gets a small floating card.

const area = cellArea(0, 6, 0, 3); // a cell in a wedge of six wedges with three cells

describe('dashCount', () => {
  it('shows one dash per finished item, up to the fill cap', () => {
    const cap = Math.max(1, Math.floor(dashCapacity(area) * DASH_MAX_FILL));
    expect(dashCount(area, 0)).toBe(0);
    expect(dashCount(area, 1)).toBe(1);
    expect(dashCount(area, 100000)).toBe(cap);
  });
});

describe('dashFor', () => {
  it('puts every dash inside its cell, a short mark along one track (not a whole band)', () => {
    const track = (OUTER - INNER) / TRACKS;
    for (let k = 0; k < 30; k++) {
      const d = dashFor(area, k, 3);
      expect(d.a0).toBeGreaterThanOrEqual(area.a0 - 1e-9);
      expect(d.a1).toBeLessThanOrEqual(area.a1 + 1e-9);
      expect(d.r0).toBeGreaterThanOrEqual(area.r0 - 1e-9);
      expect(d.r1).toBeLessThanOrEqual(area.r1 + 1e-9);
      expect(d.r1 - d.r0).toBeLessThan(track);
      expect(d.a1 - d.a0).toBeLessThan((area.a1 - area.a0) / 2);
    }
  });

  it('gives each item of a cell its own place, the same one every time', () => {
    const cap = Math.floor(dashCapacity(area) * DASH_MAX_FILL);
    expect(cap).toBeGreaterThan(5);
    const seen = new Set(Array.from({ length: cap }, (_, k) => JSON.stringify(dashFor(area, k, 3))));
    expect(seen.size).toBe(cap);
    expect(dashFor(area, 4, 3)).toEqual(dashFor(area, 4, 3));
  });

  it('spreads different cells differently, so two cells do not show the same pattern', () => {
    const rel = (d: ReturnType<typeof dashFor>) => [((d.a0 - area.a0) / (area.a1 - area.a0)).toFixed(3), ((d.r1 - area.r0) / (area.r1 - area.r0)).toFixed(3)].join();
    const a = Array.from({ length: 6 }, (_, k) => rel(dashFor(area, k, 1)));
    const b = Array.from({ length: 6 }, (_, k) => rel(dashFor(area, k, 2)));
    expect(a).not.toEqual(b);
  });

  it('never fills a cell up: with a thousand items the dashes stay sparse, so the disc is not solid bands', () => {
    const places = new Set(Array.from({ length: 1000 }, (_, k) => JSON.stringify(dashFor(area, k, 0))));
    expect(places.size).toBeLessThanOrEqual(Math.floor(dashCapacity(area) * DASH_MAX_FILL));
    const dash = dashFor(area, 0, 0);
    const covered = places.size * (dash.a1 - dash.a0) * (dash.r1 - dash.r0);
    expect(covered / ((area.a1 - area.a0) * (area.r1 - area.r0))).toBeLessThan(0.25);
  });

  it('still works for a tiny cell (at least one place)', () => {
    const tiny = { a0: 0, a1: 0.01, r0: 0.5, r1: 0.52 };
    expect(dashCapacity(tiny)).toBeGreaterThanOrEqual(1);
    const d = dashFor(tiny, 3, 0);
    expect(d.a1).toBeGreaterThan(d.a0);
    expect(d.r1).toBeGreaterThan(d.r0);
  });
});

describe('cards', () => {
  it('shows a card for an arrival at most every CARD_GAP_MS, so a wave of arrivals does not flicker', () => {
    expect(shouldShowCard(-Infinity, 0)).toBe(true);
    expect(shouldShowCard(0, CARD_GAP_MS - 1)).toBe(false);
    expect(shouldShowCard(0, CARD_GAP_MS)).toBe(true);
  });

  it('fades a card in, holds it, and fades it out by the end of its life', () => {
    const arrivals = [{ index: 0, at: 1000 }];
    expect(cardsAt(arrivals, 999)).toEqual([]);
    expect(cardsAt(arrivals, 1000)[0].alpha).toBe(0);
    expect(cardsAt(arrivals, 1000 + CARD_FADE_IN)[0].alpha).toBe(1);
    expect(cardsAt(arrivals, 1000 + CARD_LIFE_MS / 2)[0].alpha).toBe(1);
    const late = cardsAt(arrivals, 1000 + CARD_LIFE_MS - 100)[0];
    expect(late.alpha).toBeGreaterThan(0);
    expect(late.alpha).toBeLessThan(1);
    expect(cardsAt(arrivals, 1000 + CARD_LIFE_MS)).toEqual([]);
  });

  it('drifts: it has moved further the older it is (rise 0 to 1)', () => {
    const arrivals = [{ index: 0, at: 0 }];
    expect(cardsAt(arrivals, 0)[0].rise).toBe(0);
    expect(cardsAt(arrivals, CARD_LIFE_MS / 2)[0].rise).toBeCloseTo(0.5);
    expect(cardsAt(arrivals, CARD_LIFE_MS - 1)[0].rise).toBeGreaterThan(0.99);
  });

  it('has at most MAX_CARDS on screen: a third arrival makes the oldest fade away quickly', () => {
    expect(MAX_CARDS).toBe(2);
    const arrivals = [
      { index: 0, at: 0 },
      { index: 1, at: 700 },
      { index: 2, at: 1400 },
    ];
    expect(cardsAt(arrivals, 1300).map((c) => c.index)).toEqual([0, 1]);
    const mid = cardsAt(arrivals, 1500);
    expect(mid.find((c) => c.index === 0)!.alpha).toBeLessThan(1);
    expect(cardsAt(arrivals, 1400 + 400).map((c) => c.index)).toEqual([1, 2]);
  });

  it('gives the two cards different places (slots), by their item', () => {
    const [a, b] = cardsAt(
      [
        { index: 4, at: 0 },
        { index: 5, at: 700 },
      ],
      800,
    );
    expect(a.slot).not.toBe(b.slot);
  });

  it('uses the place a card was given when it arrived, so two items in a row never share one', () => {
    const [a, b] = cardsAt(
      [
        { index: 4, at: 0, slot: 0 },
        { index: 6, at: 700, slot: 1 },
      ],
      800,
    );
    expect([a.slot, b.slot]).toEqual([0, 1]);
  });
});

describe('cardBox', () => {
  const core = { x: 400, y: 200 };

  it('puts the two slots on different sides of the core, near it', () => {
    const a = cardBox(0, core, 300, 800, 160, 36, 0);
    const b = cardBox(1, core, 300, 800, 160, 36, 0);
    expect(a.x + a.w / 2).toBeGreaterThan(core.x);
    expect(b.x + b.w / 2).toBeLessThan(core.x);
    expect(Math.abs(a.y - core.y)).toBeLessThan(300);
  });

  it('drifts upward as it ages', () => {
    expect(cardBox(0, core, 300, 800, 160, 36, 1).y).toBeLessThan(cardBox(0, core, 300, 800, 160, 36, 0).y);
  });

  it('stays wholly inside a narrow canvas', () => {
    for (const slot of [0, 1] as const) {
      for (const w of [320, 390, 500]) {
        const b = cardBox(slot, { x: w / 2, y: 120 }, 150, w, 200, 36, 0.5);
        expect(b.x).toBeGreaterThanOrEqual(8 - 1e-9);
        expect(b.x + b.w).toBeLessThanOrEqual(w - 8 + 1e-9);
        expect(b.y).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
