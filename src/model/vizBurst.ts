import { INNER, OUTER, TRACKS, type Area } from './vizGeometry';

// The Visualizer's lit cells and the small cards by the core (owner request, 2026-11-13, "viz-burst", to match
// a second reference clip). Pure maths, no drawing, nothing random: the same item always shows in the same place.

// ---- Lit cells: one dash per finished item ----

/** The angle (radians) a dash's slot takes along a track: a cell holds as many slots side by side as fit. */
const DASH_STEP = 0.09;
/** A dash is this share of its slot long and of its track thick, so neighbors never join into a band. */
const DASH_LENGTH = 0.6;
const DASH_THICK = 0.5;
/** At most this share of a cell's slots ever gets a dash; items past that share their place with an earlier one. */
export const DASH_MAX_FILL = 0.4;

const trackWidth = (OUTER - INNER) / TRACKS;
const rowsOf = (a: Area) => Math.max(1, Math.floor((a.r1 - a.r0) / trackWidth));
const colsOf = (a: Area) => Math.max(1, Math.floor((a.a1 - a.a0) / DASH_STEP));

/** How many slots (tracks times places along the track) a cell has. */
export const dashCapacity = (area: Area): number => rowsOf(area) * colsOf(area);

/** How many different dashes a cell shows for `done` finished items: one each, up to DASH_MAX_FILL of its slots. */
export const dashCount = (area: Area, done: number): number => Math.min(done, Math.max(1, Math.floor(dashCapacity(area) * DASH_MAX_FILL)));

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * Where the dash of the cell's `k`th finished item sits: a short mark along one track inside `area`. The places
 * are walked in a fixed scattered order (so a cell fills like sprinkled dashes, not in rows) that starts
 * somewhere different for each `seed` (a number for the cell). Only DASH_MAX_FILL of the slots are ever used,
 * so with a thousand items the disc is still sparse.
 */
export function dashFor(area: Area, k: number, seed: number): Area {
  const rows = rowsOf(area);
  const cols = colsOf(area);
  const capacity = rows * cols;
  const usable = Math.max(1, Math.floor(capacity * DASH_MAX_FILL));
  let stride = Math.round(capacity * 0.618) + 1;
  while (gcd(stride, capacity) !== 1) stride++;
  const start = Math.imul(seed + 1, 2654435761) >>> 0;
  const slot = (((start % capacity) + (k % usable) * stride) % capacity + capacity) % capacity;
  const row = Math.floor(slot / cols);
  const col = slot % cols;
  const slotW = (area.a1 - area.a0) / cols;
  const rowH = (area.r1 - area.r0) / rows;
  const a0 = area.a0 + col * slotW + slotW * ((1 - DASH_LENGTH) / 2);
  const r1 = area.r1 - row * rowH - rowH * ((1 - DASH_THICK) / 2);
  return { a0, a1: a0 + slotW * DASH_LENGTH, r0: r1 - rowH * DASH_THICK, r1 };
}

// ---- The floating cards ----

/** How long a card is on screen, how long it takes to fade in, and to fade out at the end. */
export const CARD_LIFE_MS = 2600;
export const CARD_FADE_IN = 250;
const CARD_FADE_OUT = 600;
/** How quickly the oldest of three cards fades away when the third arrives. */
const CARD_BUMP_MS = 200;
/** A card is shown for an arrival only this long after the last one shown, so a wave of arrivals does not make the cards flicker. */
export const CARD_GAP_MS = 700;
export const MAX_CARDS = 2;

/** Whether the arrival at `at` ms gets a card, when the last card was shown for an arrival at `lastShown`. */
export const shouldShowCard = (lastShown: number, at: number): boolean => at - lastShown >= CARD_GAP_MS;

export interface CardState {
  index: number;
  /** 0 to 1. */
  alpha: number;
  /** How far through its life it is (0 to 1): the card drifts up as this grows. */
  rise: number;
  /** Which of the two places by the core it takes. */
  slot: 0 | 1;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The cards to draw `now`, oldest first, for `arrivals` (those that got a card, oldest first, each with the ms
 * it landed and, if given, which of the two places it takes). A card fades in, holds, and fades out over CARD_LIFE_MS. At most MAX_CARDS show: when a third
 * arrives the oldest fades away in CARD_BUMP_MS.
 */
export function cardsAt(arrivals: { index: number; at: number; slot?: 0 | 1 }[], now: number): CardState[] {
  const out: CardState[] = [];
  arrivals.forEach((a, j) => {
    const age = now - a.at;
    if (age < 0 || age >= CARD_LIFE_MS) return;
    let alpha = clamp01(age / CARD_FADE_IN) * clamp01((CARD_LIFE_MS - age) / CARD_FADE_OUT);
    const later = arrivals.slice(j + 1).filter((b) => b.at <= now);
    if (later.length >= MAX_CARDS) alpha *= 1 - clamp01((now - later[MAX_CARDS - 1].at) / CARD_BUMP_MS);
    if (alpha <= 0 && age > 0) return;
    out.push({ index: a.index, alpha, rise: age / CARD_LIFE_MS, slot: a.slot ?? ((a.index % 2) as 0 | 1) });
  });
  return out;
}

/** How far a card drifts up over its life, in pixels. */
const CARD_DRIFT = 18;

/**
 * Where a card `w` by `h` pixels goes, by the core: slot 0 above and to the right of it, slot 1 below and to the
 * left, drifted up by `rise`, and held wholly inside a canvas `canvasW` wide (8px in from each side).
 */
export function cardBox(slot: 0 | 1, core: { x: number; y: number }, rx: number, canvasW: number, w: number, h: number, rise: number): { x: number; y: number; w: number; h: number } {
  const width = Math.min(w, canvasW - 16);
  const x = slot === 0 ? core.x + rx * 0.08 : core.x - rx * 0.08 - width;
  const y = slot === 0 ? core.y - rx * 0.25 - h / 2 : core.y + rx * 0.12;
  return { x: Math.max(8, Math.min(canvasW - 8 - width, x)), y: Math.max(0, y - rise * CARD_DRIFT), w: width, h };
}
