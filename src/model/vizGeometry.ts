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

/** A spark `p` (0 to 1) of the way along its arc from the core `from` to the cell `to`: it rises first, then comes down into the cell. */
export function sparkAt(from: { x: number; y: number }, to: { x: number; y: number }, p: number): { x: number; y: number } {
  const lift = Math.hypot(to.x - from.x, to.y - from.y) * 0.4 + 16;
  const e = 1 - (1 - p) * (1 - p); // fast off the core, settling into the cell
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
