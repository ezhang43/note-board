import { OUTER, TILT } from './vizGeometry';

// Where the Visualizer's board names stand (owner request, 2026-11-13, "viz-disc-bigger"): out in the space
// round the tilted disc, never on it and never beside it holding it back. Pure maths, no drawing. The disc
// fills most of the stage's width; names that would stand beside it (where there is no room) stand above or
// below the disc's shoulders instead, where the stage is empty.

/** The height of a name's line, the room outside the stage edge, and the gap between the dashed ring and a name (pixels). */
export const NAME_H = 18; // 14 at first; names are 1.3x bigger (owner request 2026-11-13, "make the category names outside bigger too")
export const NAME_MARGIN = 8;
export const NAME_GAP = 8;
/** The dashed ring just outside the rim, as a share of the disc's half width (the disc draws it; names stay outside it). */
export const DASHED = OUTER + 0.07;
/** Names closer than this (pixels) to each other count as touching. */
const NAME_PAD = 2;

export interface NameBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0 to 1: a name hopping from one side of the disc to the other fades out for the hop. */
  fade: number;
}

export interface NameGeom {
  /** The stage. */
  w: number;
  h: number;
  /** The disc's middle and half width. */
  cx: number;
  cy: number;
  rx: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The ellipse names must stay outside of: the dashed ring plus a gap. Half width, half height. */
export const keepOut = (rx: number): { a: number; b: number } => {
  const a = rx * DASHED + NAME_GAP;
  return { a, b: a * TILT };
};

const overlapsDisc = (x: number, y: number, w: number, h: number, g: NameGeom): boolean => {
  const { a, b } = keepOut(g.rx);
  const dx = (clamp(g.cx, x, x + w) - g.cx) / a;
  const dy = (clamp(g.cy, y, y + h) - g.cy) / b;
  return dx * dx + dy * dy < 1;
};

const touch = (p: NameBox, q: NameBox) => p.x < q.x + q.w + NAME_PAD && q.x < p.x + p.w + NAME_PAD && p.y < q.y + q.h + NAME_PAD && q.y < p.y + p.h + NAME_PAD;

/**
 * The box of each name, for names `widths` pixels wide standing at screen angles `phis` (radians; 0 is the
 * disc's right, a quarter turn is its front, which is the bottom of the picture). Each name starts just
 * outside the disc at its own angle, leaning away from the disc so the box never covers the ring; then it is
 * kept on the stage; then, if that put it over the disc (the widest part, with no room beside it), it moves
 * straight up (for a name at the back) or down (the front) to just clear the ring; and names that touch are
 * moved further out, up or down, apart. It changes smoothly as the angle does, except where a name swaps
 * between the back and front of the disc, where it fades out for the hop.
 */
export function placeNames(widths: number[], phis: number[], g: NameGeom): NameBox[] {
  const m = NAME_MARGIN;
  const { a, b } = keepOut(g.rx);
  const boxes = widths.map((w0, i): NameBox & { dir: number } => {
    const w = Math.min(w0, g.w - 2 * m);
    const ux = Math.cos(phis[i]);
    const uy = Math.sin(phis[i]);
    const px = g.cx + (a + 2) * ux;
    const py = g.cy + (b + 2) * uy;
    const ideal = clamp(px - w * (0.5 - 0.5 * ux), m, g.w - m - w);
    const y0 = py - NAME_H * (0.5 - 0.5 * uy);
    const dir = uy >= 0 ? 1 : -1;
    let y = y0;
    let fade = 1;
    if (overlapsDisc(ideal, y, w, NAME_H, g)) {
      // The most of the ring's height over the box's width is at its nearest edge to the middle.
      const dx = Math.max(0, Math.max(g.cx - (ideal + w), ideal - g.cx));
      const clear = b * Math.sqrt(Math.max(0, 1 - (dx / a) ** 2)) + 1;
      y = dir > 0 ? g.cy + clear : g.cy - clear - NAME_H;
      fade = clamp(Math.abs(uy) / 0.12, 0, 1);
    }
    return { x: ideal, y, w, h: NAME_H, fade, dir };
  });
  // simple: names that touch are moved apart in a few passes, then kept on the stage; in a crowded corner of a tiny
  // stage the last clamp may leave two touching (fitDisc picks a disc that avoids it where it can).
  // Names that touch: the one further from the middle (up or down) moves out of the way, a few passes.
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i];
        const q = boxes[j];
        if (!touch(p, q)) continue;
        const [near, far] = Math.abs(p.y + p.h / 2 - g.cy) <= Math.abs(q.y + q.h / 2 - g.cy) ? [p, q] : [q, p];
        const down = far.y + far.h / 2 >= g.cy;
        far.y = down ? near.y + near.h + NAME_PAD : near.y - far.h - NAME_PAD;
        moved = true;
      }
    }
    for (const bx of boxes) bx.y = clamp(bx.y, m, Math.max(m, g.h - m - bx.h));
    if (!moved) break;
  }
  return boxes.map(({ x, y, w, h, fade }) => ({ x, y, w, h, fade }));
}

/** Whether every box is wholly on the stage, outside the disc's ring, and clear of the others. */
export function namesFit(boxes: NameBox[], g: NameGeom): boolean {
  return boxes.every(
    (bx, i) =>
      bx.x >= NAME_MARGIN - 1e-6 &&
      bx.x + bx.w <= g.w - NAME_MARGIN + 1e-6 &&
      bx.y >= NAME_MARGIN - 1e-6 &&
      bx.y + bx.h <= g.h - NAME_MARGIN + 1e-6 &&
      !overlapsDisc(bx.x, bx.y, bx.w, bx.h, g) &&
      boxes.every((o, j) => j <= i || !touch(bx, o)),
  );
}

/** The room kept under the ring for the names there, and the room kept above the disc for the core and beams. */
const BELOW = NAME_H + 6;
// simple: the check samples a whole turn of the disc at 72 angles, so two names could touch by a pixel or two
// between samples on a very crowded stage. Raise ANGLES if that ever shows.
const ANGLES = 72;

/**
 * Where the disc goes and how big it is on a stage `w` by `h`, for names `widths` pixels wide spread evenly
 * round it: the largest disc whose names all fit (on the stage, outside the ring, apart) at every turn of the
 * disc. It fills the stage's width, shrinking only as far as the names need (a phone with long names, a very
 * short stage). The disc sits low, with its names below it, and is lifted when the stage is tall.
 */
export function fitDisc(w: number, h: number, widths: number[]): { rx: number; cx: number; cy: number } {
  const n = widths.length;
  const m = NAME_MARGIN;
  const lay = (rx: number): NameGeom => {
    const { b } = keepOut(rx);
    const used = 2 * (b + BELOW) + rx * 0.5;
    const spare = Math.max(0, (h - used - 2 * m) / 2);
    return { w, h, rx, cx: w / 2, cy: h - m - BELOW - b - spare };
  };
  const ok = (rx: number) => {
    const g = lay(rx);
    for (let s = 0; s < ANGLES; s++) {
      const spin = (s / ANGLES) * Math.PI * 2;
      const phis = widths.map((_, i) => ((i + 0.5) / Math.max(1, n)) * Math.PI * 2 + spin);
      if (!namesFit(placeNames(widths, phis, g), g)) return false;
    }
    return true;
  };
  // The most the stage's width and height allow, with room for the ring, the gap and the margin beside and above.
  const rxWide = (w / 2 - m - NAME_GAP - 2) / DASHED;
  const rxTall = (h - 2 * m - 2 * BELOW - 40) / (2 * DASHED * TILT);
  let rx = Math.max(40, Math.min(rxWide, rxTall));
  // simple: stops at a 40px half width even if the names still do not fit there (a tiny stage with many long names);
  // they then may touch. A smaller font or a second row of names would be the next step.
  if (n > 0) for (let i = 0; i < 40 && rx > 40 && !ok(rx); i++) rx = Math.max(40, rx * 0.93);
  const g = lay(rx);
  return { rx, cx: g.cx, cy: g.cy };
}
