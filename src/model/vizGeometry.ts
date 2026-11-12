// The Visualizer disc's shape (owner request, 2026-11-12). Pure maths, no drawing: radii are shares of
// the disc's half width (the core's edge is INNER, the rim OUTER), angles are in radians, and the disc
// is seen tilted, so it shows as a squashed ellipse that turns slowly.

export const INNER = 0.2;
export const OUTER = 1;
/** How much the disc is squashed up and down by its tilt (1 is seen from straight above). */
export const TILT = 0.42;
/** Empty space between wedges (radians, shrunk for many wedges) and between rings of cells (share of one ring). */
const WEDGE_GAP = 0.035;
const CELL_GAP = 0.12;

export interface Area {
  a0: number;
  a1: number;
  r0: number;
  r1: number;
}

/** The angles wedge `w` of `wedges` covers: equal shares of the circle with a small gap between neighbors. */
export function wedgeSpan(w: number, wedges: number): { a0: number; a1: number } {
  const share = (Math.PI * 2) / wedges;
  const gap = Math.min(WEDGE_GAP, share * 0.15);
  return { a0: w * share + gap / 2, a1: (w + 1) * share - gap / 2 };
}

/** How many cells sit side by side across a wedge, so a wedge with many lists is not a thin sliver. */
export const columnsFor = (cells: number): number => (cells <= 4 ? 1 : cells <= 12 ? 2 : 3);

/** The ring-and-angle patch of cell `c` of `cells` in wedge `w`: the first cells fill the outside ring and work inwards. */
export function cellArea(w: number, wedges: number, c: number, cells: number): Area {
  const { a0, a1 } = wedgeSpan(w, wedges);
  const cols = columnsFor(cells);
  const rows = Math.ceil(cells / cols);
  const row = Math.floor(c / cols);
  const col = c % cols;
  const band = (OUTER - INNER) / rows;
  const r1 = OUTER - row * band;
  const r0 = r1 - band * (1 - CELL_GAP);
  const colSpan = (a1 - a0) / cols;
  const pad = colSpan * CELL_GAP * 0.5;
  return { a0: a0 + col * colSpan + pad, a1: a0 + (col + 1) * colSpan - pad, r0, r1 };
}

/** The middle of a cell (where a spark lands). */
export function cellCentre(w: number, wedges: number, c: number, cells: number): { a: number; r: number } {
  const t = cellArea(w, wedges, c, cells);
  return { a: (t.a0 + t.a1) / 2, r: (t.r0 + t.r1) / 2 };
}

/** Where angle `a` (turned by `spin`) at radius `r` shows on screen, for a disc centered at cx, cy with half width rx. */
export function project(a: number, r: number, spin: number, cx: number, cy: number, rx: number): { x: number; y: number } {
  return { x: cx + Math.cos(a + spin) * r * rx, y: cy + Math.sin(a + spin) * r * rx * TILT };
}

/**
 * Light warping into the core (owner request, 2026-11-12). One item's trip, `progress` 0 to 1: a bright
 * beam shoots in from beyond the top of the canvas onto its cell (until STRIKE), a flash and a ring burst
 * on the cell and it lights, a comet runs from the cell along an arc into the core (STRIKE to 1), and the
 * core flares as it arrives.
 */
export const STRIKE = 0.25;
/** How much of the trip the beam takes to fade after it lands, the ring to open, and the comet to fade into the core. */
const BEAM_FADE = 0.1;
const PING_SPAN = 0.3;
/** How much of the trip the impact flash lasts. */
const FLASH_SPAN = 0.08;
const COMET_FADE = 0.12;
/** The core flares around this point of the trip, as the comet goes in. */
const FLARE_AT = 0.9;
const FLARE_WIDTH = 0.1; // FLARE_AT + FLARE_WIDTH is 1: the flare is spent as the trip ends

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export interface WarpPhase {
  /** How far down its drop the beam's head is: 0 at the top, 1 on the cell. */
  beam: number;
  beamAlpha: number;
  /** How far open the ring on the cell is (0 to 1), null when there is no ring. */
  ping: number | null;
  /** How far along its arc the comet is (0 at the cell, 1 in the core), null before the beam has landed. */
  comet: number | null;
  cometAlpha: number;
  /** How bright the flash where the beam lands is: 1 at the strike, gone FLASH_SPAN of the trip later. */
  flash: number;
  /** How hard the core is flaring from this item (0 to 1). */
  flare: number;
}

export function warpPhase(progress: number): WarpPhase {
  const p = clamp01(progress);
  const drop = clamp01(p / STRIKE);
  const struck = p >= STRIKE;
  const ping = struck && p - STRIKE <= PING_SPAN ? (p - STRIKE) / PING_SPAN : null;
  const comet = struck ? (p - STRIKE) / (1 - STRIKE) : null;
  return {
    beam: drop * drop, // it falls, so it speeds up
    beamAlpha: struck ? clamp01(1 - (p - STRIKE) / BEAM_FADE) : 1,
    ping,
    comet,
    cometAlpha: comet === null ? 0 : clamp01((1 - comet) / COMET_FADE),
    flash: struck ? clamp01(1 - (p - STRIKE) / FLASH_SPAN) : 0,
    flare: clamp01(1 - Math.abs(p - FLARE_AT) / FLARE_WIDTH),
  };
}

/** How far above the top edge of the canvas (pixels) every beam starts, so the light arrives from outside the picture. */
export const BEAM_RISE = 60;
/** How far a beam leans outwards: a share of its cell's distance from the middle column. */
const BEAM_SLANT = 0.18;
/** The length of a beam's tail behind its head, as a share of its whole fall. */
const BEAM_TAIL = 0.55;

/** Where a beam starts: above the canvas, leaning out from the middle column `cx`, so it shoots down and inwards onto its cell `to`. */
export function beamStart(to: { x: number; y: number }, cx: number): { x: number; y: number } {
  return { x: to.x + (to.x - cx) * BEAM_SLANT, y: -BEAM_RISE };
}

/** The point `p` (0 at the start, 1 on the cell) of the way down a beam. */
export function beamPoint(from: { x: number; y: number }, to: { x: number; y: number }, p: number): { x: number; y: number } {
  return { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p };
}

/** Where the tail of a beam whose head is `head` (0 to 1) of the way down ends, on the same scale (never before the start). */
export function beamTail(head: number): number {
  return Math.max(0, head - BEAM_TAIL);
}

/**
 * The light pillar through the core (owner request, 2026-11-12): always faintly there, wider and brighter
 * as the core flares (`flare` 0 to 1). `width` is a multiple of its resting width, `alpha` how bright it is.
 */
export function pillarLevel(flare: number): { width: number; alpha: number } {
  const f = clamp01(flare);
  return { width: 1 + 1.4 * f, alpha: 0.4 + 0.6 * f };
}

/** A comet `p` (0 to 1) of the way along its arc from a cell `from` into the core `to`: it climbs in a curve and speeds up as it is drawn in. */
export function warpAt(from: { x: number; y: number }, to: { x: number; y: number }, p: number): { x: number; y: number } {
  const lift = Math.hypot(to.x - from.x, to.y - from.y) * 0.4 + 16;
  const e = p * p; // slow off the cell, quickest into the core
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e - Math.sin(Math.PI * p) * lift };
}

/** The most characters of a board name that are ever measured or drawn round the ring. */
export const MAX_LABEL_CHARS = 60;

/**
 * The board name cut to fit `room` pixels: at most MAX_LABEL_CHARS characters (so a huge pasted name
 * costs the same as a short one), then the longest start that fits followed by an ellipsis, found by
 * halving rather than one character at a time. `measure` is the canvas's measureText width.
 */
export function fitLabel(name: string, room: number, measure: (text: string) => number): string {
  const full = name.length > MAX_LABEL_CHARS ? `${name.slice(0, MAX_LABEL_CHARS)}…` : name;
  if (measure(full) <= room) return full;
  let lo = 0; // `lo` characters plus an ellipsis is the best known fit (just the ellipsis if nothing better)
  let hi = Math.min(name.length, MAX_LABEL_CHARS) - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${name.slice(0, mid)}…`) <= room) lo = mid;
    else hi = mid - 1;
  }
  return `${name.slice(0, lo)}…`;
}
