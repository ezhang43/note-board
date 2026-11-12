// The Visualizer disc's shape (owner request, 2026-11-12). Pure maths, no drawing: radii are shares of
// the disc's half width (the core's edge is INNER, the rim OUTER), angles are in radians, and the disc
// is seen tilted, so it shows as a squashed ellipse that turns slowly.

export const INNER = 0.27;
export const OUTER = 1;
/** How much the disc is squashed up and down by its tilt (1 is seen from straight above). */
export const TILT = 0.55;
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

/** How far the core floats above the middle of the disc, as a share of the disc's half width. The pillar runs through it down to the hub. */
export const CORE_LIFT = 0.3;

/** Where the core is, for a disc centered at cx, cy with half width rx. */
export function coreAt(cx: number, cy: number, rx: number): { x: number; y: number } {
  return { x: cx, y: cy - CORE_LIFT * rx };
}

/**
 * Light warping into the core (owner request, 2026-11-12; reshaped the same day to match the video the
 * owner sent). One item's trip, `progress` 0 to 1: a thin beam shoots in from beyond the top of the canvas
 * onto its cell (until STRIKE), a white dot and a small ring show where it lands and the cell lights; the
 * beam lingers a moment, then a burst of small particles fans out from the cell along curved paths into the
 * core (COMET_START to 1), and the core flares as they arrive.
 */
export const STRIKE = 0.25;
/** The particles leave the cell this far into the trip, after the beam and its ring have lingered a moment. */
export const COMET_START = 0.35;
/** How much of the trip the beam takes to fade after it lands, the ring to open, and the particles to fade into the core. */
const BEAM_FADE = 0.2;
const PING_SPAN = 0.3;
/** How much of the trip the impact flash lasts. */
const FLASH_SPAN = 0.08;
/** The core flares up over FLARE_RISE of the trip and peaks at FLARE_AT, when the particles are nearly in; it is spent as the trip ends. */
const FLARE_AT = 0.95;
const FLARE_RISE = 0.3;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export interface WarpPhase {
  /** How far down its drop the beam's head is: 0 at the top, 1 on the cell. */
  beam: number;
  beamAlpha: number;
  /** How far open the ring on the cell is (0 to 1), null when there is no ring. */
  ping: number | null;
  /** How far along the burst of particles is (0 at the cell, 1 in the core), null until they leave the cell. */
  comet: number | null;
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
  const comet = p >= COMET_START ? (p - COMET_START) / (1 - COMET_START) : null;
  return {
    beam: drop * drop, // it falls, so it speeds up
    beamAlpha: struck ? clamp01(1 - (p - STRIKE) / BEAM_FADE) : 1,
    ping,
    comet,
    flash: struck ? clamp01(1 - (p - STRIKE) / FLASH_SPAN) : 0,
    flare: p < FLARE_AT ? clamp01(1 - (FLARE_AT - p) / FLARE_RISE) : clamp01((1 - p) / (1 - FLARE_AT)),
  };
}

/** How far above the top edge of the canvas (pixels) every beam starts, so the light arrives from outside the picture. */
export const BEAM_RISE = 60;
/** How far a beam leans outwards: a share of its cell's distance from the middle column. */
const BEAM_SLANT = 0.18;

/** Where a beam starts: above the canvas, leaning out from the middle column `cx`, so it shoots down and inwards onto its cell `to`. */
export function beamStart(to: { x: number; y: number }, cx: number): { x: number; y: number } {
  return { x: to.x + (to.x - cx) * BEAM_SLANT, y: -BEAM_RISE };
}

/** The point `p` (0 at the start, 1 on the cell) of the way down a beam. */
export function beamPoint(from: { x: number; y: number }, to: { x: number; y: number }, p: number): { x: number; y: number } {
  return { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p };
}

/**
 * The light pillar through the core (owner request, 2026-11-12): always there (so the core stays bright between arrivals), wider and brighter
 * as the core flares (`flare` 0 to 1). `width` is a multiple of its resting width, `alpha` how bright it is.
 */
export function pillarLevel(flare: number): { width: number; alpha: number } {
  const f = clamp01(flare);
  return { width: 1 + 1.4 * f, alpha: 0.6 + 0.4 * f };
}

/** How many small lights make up the burst that runs from a cell into the core. */
export const PARTICLES = 5;
/** The most a particle may hold back, as a share of the burst's run (the first one never does). */
export const PARTICLE_DELAY = 0.15;

/**
 * How particle `k` of item `item` fans out: `spread` (-1 to 1) is how far to the left or right its path
 * bends, `delay` how long it holds back. Worked out from the two numbers alone, so the same item always
 * looks the same and nothing is random while drawing. Particle 0 is the leader: nearly straight, no delay.
 */
export function particleSeed(item: number, k: number): { spread: number; delay: number } {
  const h = Math.imul(item * 31 + k * 17 + 7, 2654435761) >>> 0;
  const h2 = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; // a second round, so the delay does not follow the bend
  const spread = ((h >>> 8) % 2001) / 1000 - 1;
  const delay = (((h2 >>> 8) % 1000) / 1000) * PARTICLE_DELAY;
  return k === 0 ? { spread: spread * 0.25, delay: 0 } : { spread, delay };
}

/**
 * A particle `q` (0 to 1) of the way along its curve from a cell `from` into the core `to`: it climbs in an
 * arc that leans to one side by `spread` and speeds up as it is drawn in. All the paths of a burst start on
 * the cell and meet in the core, and fan out in between.
 */
export function particleAt(from: { x: number; y: number }, to: { x: number; y: number }, spread: number, q: number): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // A quadratic curve: the control point sits above the middle of the line, pushed sideways by the spread.
  const cx = from.x + dx / 2 + (-dy / len) * spread * len * 0.3;
  const cy = from.y + dy / 2 - len * 0.35 + (dx / len) * spread * len * 0.3;
  const e = Math.pow(clamp01(q), 1.5); // slow off the cell, quickest into the core
  const u = 1 - e;
  return { x: u * u * from.x + 2 * u * e * cx + e * e * to.x, y: u * u * from.y + 2 * u * e * cy + e * e * to.y };
}

/** The most characters of a board name that are ever measured or drawn round the ring. */
export const MAX_LABEL_CHARS = 60;

/** How far out from the middle (a share of the disc's half width) the names stand: outside the rim and the dashed ring. */
export const LABEL_RADIUS = OUTER + 0.17;
/** The most of a first word that is kept when a name has to be cut right back. */
const FIRST_WORD_KEEP = 8;

/**
 * The name cut to fit `room` pixels: the whole name when it fits; otherwise at most MAX_LABEL_CHARS characters
 * (so a huge pasted name costs the same as a short one), then the longest start that fits followed by an
 * ellipsis, found by halving rather than one character at a time. It is never cut below the first word (at
 * most FIRST_WORD_KEEP letters of it), so a real name is never empty or just an ellipsis, even in a tight
 * spot. `measure` is the canvas's measureText width.
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
  const first = name.trimStart().split(/\s/)[0].slice(0, FIRST_WORD_KEEP);
  const keep = Math.max(lo, name.length - name.trimStart().length + first.length);
  return keep >= name.trimEnd().length ? name.trimEnd() : `${name.slice(0, keep).trimEnd()}…`;
}

/**
 * The disc's half width for a stage `w` by `h` pixels, when the longest name is `labelWidth` pixels wide: the
 * most the height allows, shrunk so that name fits beside the dashed ring at the widest point (at most a fifth
 * of the width is kept back for it, so a phone keeps a usable disc), never under 40.
 */
export function discRadius(w: number, h: number, labelWidth: number): number {
  const reserve = Math.min(labelWidth, w * 0.2);
  return Math.max(40, Math.min((h - 60) / 1.3, (w / 2 - reserve - 14) / LABEL_RADIUS));
}
