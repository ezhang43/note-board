import { describe, expect, it } from 'vitest';
import { CARD_BUMP_MS, CARD_FADE_IN, CARD_GAP_MS, CARD_LIFE_MS, DASH_MAX_FILL, MAX_CARDS, SMALL_LIST, CARD_SCALE_MAX, cardBox, cardDrift, cardLayout, cardRoom, cardSlotsFor, cardsAt, dashCapacity, dashCount, dashFor, pickSlot, shouldShowCard, type CardSlot } from './vizBurst';
import { CORE_LIFT, INNER, OUTER, TRACKS, cellArea, coreAt } from './vizGeometry';
import { keepOut } from './vizNames';

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

// The name cards (owner request 2026-11-13, "make the name cards show for more items"): up to four at once, one
// every 0.3 seconds, each in its own place round the core so none covers another, the core or a rim name; every item of
// a small list gets one.
const CARD_H = 40;
const STAGES = [
  { label: 'a big desktop window', w: 1040, rx: 469 },
  { label: 'a laptop', w: 760, rx: 330 },
  { label: 'a phone', w: 390, rx: 122 },
  { label: 'a small phone', w: 320, rx: 100 },
];
/** The core's place for a stage: the middle of the canvas across, lifted above the disc's middle. */
const coreFor = (w: number, rx: number) => coreAt(w / 2, 400, rx);

describe('when an arrival gets a card', () => {
  it('shows a card for an arrival at most every CARD_GAP_MS (about 0.3 seconds) in a long list, so a wave does not flicker', () => {
    expect(CARD_GAP_MS).toBeGreaterThanOrEqual(250);
    expect(CARD_GAP_MS).toBeLessThanOrEqual(350);
    expect(shouldShowCard(-Infinity, 0, 40)).toBe(true);
    expect(shouldShowCard(0, CARD_GAP_MS - 1, 40)).toBe(false);
    expect(shouldShowCard(0, CARD_GAP_MS, 40)).toBe(true);
  });

  it('gives every item of a small list (up to SMALL_LIST, 8) a card, however close together they land', () => {
    expect(SMALL_LIST).toBe(8);
    for (const n of [1, 5, 8]) expect(shouldShowCard(0, 1, n)).toBe(true);
    expect(shouldShowCard(0, 1, 9)).toBe(false);
  });

  it('lets a card live about 2 seconds, shorter than before (2.6), and shows up to four at once', () => {
    expect(CARD_LIFE_MS).toBeGreaterThanOrEqual(1800);
    expect(CARD_LIFE_MS).toBeLessThanOrEqual(2200);
    expect(MAX_CARDS).toBe(4);
  });
});

describe('cardsAt', () => {
  it('fades a card in, holds it, and fades it out by the end of its life', () => {
    const arrivals = [{ index: 0, at: 1000, slot: 0 as CardSlot }];
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
    const arrivals = [{ index: 0, at: 0, slot: 0 as CardSlot }];
    expect(cardsAt(arrivals, 0)[0].rise).toBe(0);
    expect(cardsAt(arrivals, CARD_LIFE_MS / 2)[0].rise).toBeCloseTo(0.5);
    expect(cardsAt(arrivals, CARD_LIFE_MS - 1)[0].rise).toBeGreaterThan(0.99);
  });

  it('keeps the place a card was given when it arrived', () => {
    const [a, b] = cardsAt(
      [
        { index: 4, at: 0, slot: 0 },
        { index: 6, at: 300, slot: 3 },
      ],
      800,
    );
    expect([a.slot, b.slot]).toEqual([0, 3]);
  });

  it('when a new card takes the place of an old one, the old one is gone before the new one shows: never two in one place', () => {
    const arrivals = [
      { index: 0, at: 0, slot: 2 as CardSlot },
      { index: 1, at: 800, slot: 2 as CardSlot },
    ];
    for (let now = 0; now < 800 + CARD_LIFE_MS; now += 10) {
      const shown = cardsAt(arrivals, now).filter((c) => c.alpha > 0);
      expect(shown.length).toBeLessThanOrEqual(1);
    }
    expect(cardsAt(arrivals, 800 + CARD_BUMP_MS + CARD_FADE_IN + 1).map((c) => c.index)).toEqual([1]);
    expect(cardsAt(arrivals, 800 + CARD_BUMP_MS / 2).find((c) => c.index === 0)!.alpha).toBeLessThan(1);
  });
});

describe('pickSlot', () => {
  const live = (...slots: CardSlot[]) => slots.map((slot, i) => ({ slot, at: i * 100 }));

  it("gives the first free place, in order, then reuses the oldest card's place once all are taken", () => {
    const order: CardSlot[] = [];
    const arrivals: { slot: CardSlot; at: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const slot = pickSlot(arrivals, [0, 1, 2, 3], i * 100);
      order.push(slot);
      arrivals.push({ slot, at: i * 100 });
    }
    expect([...order.slice(0, 4)].sort()).toEqual([0, 1, 2, 3]);
    expect(order[4]).toBe(order[0]); // the fifth takes the oldest's place
    expect(order[5]).toBe(order[1]);
  });

  it('only uses the places it is given (two on a phone)', () => {
    expect(pickSlot(live(1), [1, 3], 100)).toBe(3);
    expect(pickSlot(live(1, 3), [1, 3], 200)).toBe(1);
  });

  it('frees a place when its card is over', () => {
    expect(pickSlot([{ slot: 0, at: 0 }], [0, 1], CARD_LIFE_MS + 1)).toBe(0);
  });
});

describe('cardBox and where the cards stand', () => {
  const rises = [0, 0.25, 0.5, 0.75, 1];
  type Box = { x: number; y: number; w: number; h: number };
  const inside = (b: Box, core: { x: number; y: number }, rx: number) => {
    const { a, b: bb } = keepOut(rx);
    const cy = core.y + CORE_LIFT * rx;
    return [b.x, b.x + b.w].every((x) => [b.y, b.y + b.h].every((y) => ((x - core.x) / a) ** 2 + ((y - cy) / bb) ** 2 <= 1 + 1e-9));
  };
  const hit = (p: Box, q: Box) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

  for (const st of STAGES) {
    const core = coreFor(st.w, st.rx);
    const slots = cardSlotsFor(core, st.rx, st.w, CARD_H);

    it(`${st.label}: shows ${st.w > 600 ? 'four' : 'two'} cards, no more than fit`, () => {
      expect(slots.length).toBe(st.w > 600 ? 4 : 2);
    });

    it(`${st.label}: every place is wholly on the canvas, inside the ring the names stay outside of, and off the core`, () => {
      for (const slot of slots) {
        for (const rise of rises) {
          const room = cardRoom(slot, core, st.rx, st.w, CARD_H);
          const box = cardBox(slot, core, st.rx, st.w, 240, CARD_H, rise);
          expect(box.w).toBeLessThanOrEqual(room + 1e-9);
          expect(box.w).toBeGreaterThan(60);
          expect(box.x).toBeGreaterThanOrEqual(8 - 1e-9);
          expect(box.x + box.w).toBeLessThanOrEqual(st.w - 8 + 1e-9);
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(inside(box, core, st.rx)).toBe(true);
          expect(box.x <= core.x && core.x <= box.x + box.w && box.y <= core.y && core.y <= box.y + box.h).toBe(false);
        }
      }
    });

    it(`${st.label}: no two places overlap at any age`, () => {
      for (const s1 of slots) {
        for (const s2 of slots) {
          if (s1 >= s2) continue;
          for (const r1 of rises) {
            for (const r2 of rises) {
              expect(hit(cardBox(s1, core, st.rx, st.w, 240, CARD_H, r1), cardBox(s2, core, st.rx, st.w, 240, CARD_H, r2))).toBe(false);
            }
          }
        }
      }
    });
  }

  it('drifts upward as it ages, by a little less on a small stage', () => {
    const core = coreFor(1040, 469);
    expect(cardBox(0, core, 469, 1040, 160, CARD_H, 1).y).toBeLessThan(cardBox(0, core, 469, 1040, 160, CARD_H, 0).y);
    expect(cardDrift(100)).toBeLessThan(cardDrift(469));
  });

  it('puts the four places on four sides of the core: upper right, lower left, upper left, lower right', () => {
    const core = coreFor(1040, 469);
    const [ur, ll, ul, lr] = ([0, 1, 2, 3] as CardSlot[]).map((s) => cardBox(s, core, 469, 1040, 160, CARD_H, 0));
    expect(ur.x).toBeGreaterThan(core.x);
    expect(lr.x).toBeGreaterThan(core.x);
    expect(ll.x + ll.w).toBeLessThan(core.x);
    expect(ul.x + ul.w).toBeLessThan(core.x);
    expect(ur.y).toBeLessThan(lr.y);
    expect(ul.y).toBeLessThan(ll.y);
  });
});

describe('a stage too small for any card', () => {
  it('has no places, so no card is shown', () => {
    const core = coreFor(120, 30);
    expect(cardSlotsFor(core, 30, 120, CARD_H)).toEqual([]);
  });

  it('never shows two cards in one place even when two land in the same instant', () => {
    const arrivals = [
      { index: 0, at: 500, slot: 1 as CardSlot },
      { index: 1, at: 500, slot: 1 as CardSlot },
    ];
    for (let now = 500; now < 500 + CARD_LIFE_MS; now += 5) {
      expect(cardsAt(arrivals, now).filter((c) => c.alpha > 0).length).toBeLessThanOrEqual(1);
    }
  });
});

describe('a small list gets a card for every item, even landing together', () => {
  it('eight items 120ms apart: each one is shown at some moment, none shares a place while shown', () => {
    const core = coreFor(1040, 469);
    const slots = cardSlotsFor(core, 469, 1040, CARD_H);
    const arrivals: { index: number; at: number; slot: CardSlot }[] = [];
    let last = -Infinity;
    for (let i = 0; i < 8; i++) {
      const at = i * 120;
      if (!shouldShowCard(last, at, 8)) continue;
      last = at;
      arrivals.push({ index: i, at, slot: pickSlot(arrivals, slots, at) });
    }
    expect(arrivals).toHaveLength(8);
    const seen = new Set<number>();
    for (let now = 0; now < 3000; now += 10) {
      const shown = cardsAt(arrivals, now).filter((c) => c.alpha > 0);
      expect(shown.length).toBeLessThanOrEqual(MAX_CARDS);
      expect(new Set(shown.map((c) => c.slot)).size).toBe(shown.length);
      shown.forEach((c) => seen.add(c.index));
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('bigger cards (owner, 2026-11-13)', () => {
  type Box = { x: number; y: number; w: number; h: number };
  const hit = (p: Box, q: Box) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
  for (const st of STAGES) {
    const core = coreFor(st.w, st.rx);
    const first = cardSlotsFor(core, st.rx, st.w, CARD_H);
    const { scale, slots } = cardLayout(core, st.rx, st.w, CARD_H);

    it(`${st.label}: at most 1.4x, at least the first size, and never fewer places than at the first size`, () => {
      expect(scale).toBeGreaterThanOrEqual(1);
      expect(scale).toBeLessThanOrEqual(CARD_SCALE_MAX + 1e-9);
      expect(slots.length).toBeGreaterThanOrEqual(first.length);
    });

    it(`${st.label}: the bigger cards stay inside the ring and off the core, the canvas and each other`, () => {
      const { a, b } = keepOut(st.rx);
      const cy = core.y + CORE_LIFT * st.rx;
      const h = CARD_H * scale;
      const boxes = slots.flatMap((s) => [0, 0.5, 1].map((r) => ({ s, box: cardBox(s, core, st.rx, st.w, 240 * scale, h, r, 240 * scale) })));
      for (const { box } of boxes) {
        expect(box.x).toBeGreaterThanOrEqual(8 - 1e-9);
        expect(box.x + box.w).toBeLessThanOrEqual(st.w - 8 + 1e-9);
        for (const x of [box.x, box.x + box.w]) for (const y of [box.y, box.y + box.h]) expect(((x - core.x) / a) ** 2 + ((y - cy) / b) ** 2).toBeLessThanOrEqual(1 + 1e-9);
        expect(box.x <= core.x && core.x <= box.x + box.w && box.y <= core.y && core.y <= box.y + box.h).toBe(false);
      }
      for (const p of boxes) for (const q of boxes) if (p.s < q.s) expect(hit(p.box, q.box)).toBe(false);
    });
  }

  it('a big desktop window gets the full 1.4x', () => {
    const st = STAGES.find((s) => s.w > 900)!;
    expect(cardLayout(coreFor(st.w, st.rx), st.rx, st.w, CARD_H).scale).toBeCloseTo(CARD_SCALE_MAX, 1);
  });
});
