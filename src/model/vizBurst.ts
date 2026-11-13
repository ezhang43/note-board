import { CORE_LIFT, INNER, OUTER, TRACKS, type Area } from './vizGeometry';
import { keepOut } from './vizNames';

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
// Up to four at once (owner request, 2026-11-13, "make the name cards show for more items"), each in its own place
// round the core: upper right, lower left, upper left, lower right. A place is a fixed box inside the ring the rim
// names stay outside of, so a card can never cover another card, the core or a name. A new card takes the place of
// the oldest.

/** How long a card is on screen, how long it takes to fade in, and to fade out at the end. */
export const CARD_LIFE_MS = 2000;
export const CARD_FADE_IN = 250;
const CARD_FADE_OUT = 500;
/** How quickly an old card fades away when a new one takes its place; the new one fades in after that. */
export const CARD_BUMP_MS = 150;
/** In a long list a card is shown for an arrival only this long after the last one shown, so a wave does not make the cards flicker. */
export const CARD_GAP_MS = 300;
export const MAX_CARDS = 4;
/** A list this long or shorter gives every item a card, however close together they land. */
export const SMALL_LIST = 8;

/** Which place by the core: 0 upper right, 1 lower left, 2 upper left, 3 lower right. */
export type CardSlot = 0 | 1 | 2 | 3;

/** Whether the arrival at `at` ms gets a card, when the last card was shown for an arrival at `lastShown`, in a list of `listLength` items. */
export const shouldShowCard = (lastShown: number, at: number, listLength = Infinity): boolean => listLength <= SMALL_LIST || at - lastShown >= CARD_GAP_MS;

/**
 * The place for a card arriving `now`: the first of `slots` that no card still on screen holds, else the place of
 * the card that has been there longest. `live` is every card shown so far (those past their life don't count).
 */
export function pickSlot(live: { slot: CardSlot; at: number }[], slots: CardSlot[], now: number): CardSlot {
  let best = slots[0];
  let bestAt = Infinity;
  for (const s of slots) {
    const latest = live.reduce((m, l) => (l.slot === s && now - l.at < CARD_LIFE_MS ? Math.max(m, l.at) : m), -Infinity);
    if (latest === -Infinity) return s;
    if (latest < bestAt) {
      bestAt = latest;
      best = s;
    }
  }
  return best;
}

export interface CardState {
  index: number;
  /** 0 to 1. */
  alpha: number;
  /** How far through its life it is (0 to 1): the card drifts up as this grows. */
  rise: number;
  /** Which place by the core it takes. */
  slot: CardSlot;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The cards to draw `now`, oldest first, for `arrivals` (those that got a card, oldest first, each with the ms it
 * landed and the place it was given). A card fades in, holds, and fades out over CARD_LIFE_MS. When a later card
 * takes its place the old one fades away in CARD_BUMP_MS and the new one fades in after that, so two cards never
 * show in one place.
 */
export function cardsAt(arrivals: { index: number; at: number; slot: CardSlot }[], now: number): CardState[] {
  const out: CardState[] = [];
  arrivals.forEach((a, j) => {
    const age = now - a.at;
    if (age < 0 || age >= CARD_LIFE_MS) return;
    const holds = (b: { at: number; slot: CardSlot }) => b.slot === a.slot;
    const heldBefore = arrivals.slice(0, j).some((b) => holds(b) && a.at - b.at < CARD_LIFE_MS);
    let alpha = clamp01((age - (heldBefore ? CARD_BUMP_MS : 0)) / CARD_FADE_IN) * clamp01((CARD_LIFE_MS - age) / CARD_FADE_OUT);
    const next = arrivals.slice(j + 1).find((b) => holds(b) && b.at <= now);
    if (next) alpha *= 1 - clamp01((now - next.at) / CARD_BUMP_MS);
    if (alpha <= 0 && age > 0) return;
    out.push({ index: a.index, alpha, rise: age / CARD_LIFE_MS, slot: a.slot });
  });
  return out;
}

/** How far a card drifts up over its life, in pixels: less on a small stage, where the places are close to the ring. */
export const cardDrift = (rx: number): number => Math.min(18, 0.1 * rx);

const onRight = (slot: CardSlot) => slot === 0 || slot === 3;
const isUpper = (slot: CardSlot) => slot === 0 || slot === 2;
const cardGap = (rx: number) => rx * 0.08;
/** Where a card's top starts, before it drifts: the upper row ends just above the core, the lower row starts just below it. */
const rowTop = (slot: CardSlot, core: { x: number; y: number }, rx: number, h: number) => (isUpper(slot) ? core.y - rx * 0.1 - 8 - h : core.y + rx * 0.12);

/**
 * How wide a card in `slot` can be: it stays wholly inside the ring the rim names stay outside of (so it can never
 * touch one), on the canvas (8px in from each side), and no wider than 240. 0 when it does not fit at all.
 */
export function cardRoom(slot: CardSlot, core: { x: number; y: number }, rx: number, canvasW: number, h: number): number {
  const { a, b } = keepOut(rx);
  const cy = core.y + CORE_LIFT * rx; // the middle of the disc, which is the middle of that ring
  const top = rowTop(slot, core, rx, h) - cardDrift(rx);
  const far = Math.max(Math.abs(top - cy), Math.abs(top + cardDrift(rx) + h - cy));
  if (far >= b) return 0;
  const gap = cardGap(rx);
  const reach = a * Math.sqrt(1 - (far / b) ** 2) - gap; // from the core's side of the card to the ring, at the farthest row
  const canvas = onRight(slot) ? canvasW - 8 - (core.x + gap) : core.x - gap - 8;
  return Math.max(0, Math.min(240, reach, canvas));
}

/** A card narrower than this is not worth showing in a place. */
const MIN_ROOM = 80;

/**
 * The places that have room for a card: all four on a stage wide enough, else at most two, the lower pair first
 * (on a phone the upper row does not fit inside the ring). None on a stage too small for any: then no card is shown.
 */
export function cardSlotsFor(core: { x: number; y: number }, rx: number, canvasW: number, h: number): CardSlot[] {
  const fits = (s: CardSlot) => cardRoom(s, core, rx, canvasW, h) >= MIN_ROOM;
  const all: CardSlot[] = [0, 1, 2, 3];
  if (all.every(fits)) return all;
  const some = ([1, 3, 0, 2] as CardSlot[]).filter(fits).slice(0, 2);
  return some;
}

/**
 * Where a card `w` by `h` pixels goes in `slot`: beside the core on the slot's side, cut to the room it has, drifted
 * up by `rise`.
 */
export function cardBox(slot: CardSlot, core: { x: number; y: number }, rx: number, canvasW: number, w: number, h: number, rise: number): { x: number; y: number; w: number; h: number } {
  const width = Math.min(w, cardRoom(slot, core, rx, canvasW, h));
  const gap = cardGap(rx);
  return { x: onRight(slot) ? core.x + gap : core.x - gap - width, y: Math.max(0, rowTop(slot, core, rx, h) - rise * cardDrift(rx)), w: width, h };
}
