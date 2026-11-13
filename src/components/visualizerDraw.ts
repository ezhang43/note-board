import { BEAM_ALPHA, INNER, OUTER, PARTICLE_DELAY, STRIKE, TILT, TRACKS, beamPoint, beamStart, beamWidths, burstSize, cellArea, cellCentre, coreAt, fitLabel, flowTail, particleSeed, pillarLevel, project, warpPhase, wedgeSpan } from '../model/vizGeometry';
import { loopMs, playhead, type Wedge } from '../model/visualizer';
import { NAME_H, NAME_MARGIN, fitDisc, placeNames } from '../model/vizNames';
import { CARD_LIFE_MS, cardBox, cardRoom, cardSlotsFor, cardsAt, dashCount, dashFor, pickSlot, shouldShowCard, type CardSlot } from '../model/vizBurst';

// Draws the Visualizer's ring on one canvas (owner request 2026-11-12; reshaped the same day to match the
// look and motion of a video the owner sent). Nothing here touches React state or the board: it is handed
// the pre-worked ring and loop, and calls `onLanded` when a beam lands.
// Per-frame work stays in this file; only the feed re-renders, once per landing.
// Each item is light warping into the middle: a thin beam shoots in from beyond the top of the canvas onto
// its cell (a white dot and a small ring show where it lands and the cell lights), then a burst of small
// glowing particles rises from the cell in a tall arc and streams along its wedge, curving in on the disc's tilt, then up
// into the core, which flares, and a thin pillar of light through the core swells with it (the timing is warpPhase in
// model/vizGeometry). The
// still parts of the picture (the floor, the track rings, the hub) are drawn once into one cached layer;
// the glows and shafts are cached sprites stamped or stretched with additive blending: no gradient is
// built and no shadowBlur is used per frame, and nothing here moves or measures the page (no layout, no
// paint of other elements), so a busy loop costs only canvas work.

/** How long one item's whole trip takes: the beam drops onto its cell, then the comet runs into the core. */
export const FLIGHT_MS = 1400;
/** A cell stays bright this long after a landing. */
const FLASH_MS = 700;
/** The ring turns once in about 80 seconds. */
const SPIN_PER_MS = (Math.PI * 2) / 80000;
/** The most a frame may move the clock, so a tab that was hidden does not jump the loop. */
const MAX_DT_MS = 100;
/** Past this many wedges, board names around the ring would run into each other, so only the picture is drawn. (There are at most 16 boards plus the one for the rest.) */
const MAX_LABELLED = 17;
/** About how many radial divisions the disc has all round. */
const SPOKES = 36;
/** The size of the small card for an item that just landed. */
const CARD_H = 40;
const CARD_PAD = 11;
/** The small uppercase monospace of the labels (a system font: nothing to download). */
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
/** The room a name's dot takes at its left, in pixels. */
const DOT_W = 12;

/** Colors, read from the `--viz-*` variables (hex only, so a see-through version can be made from them). */
export interface Palette {
  hues: string[];
  /** The magenta of the core's glow, the pillar, the beams' halo and the lit cells. */
  core: string;
  /** The white-hot color of the beams' line, the dots and the core's center. */
  spark: string;
  /** The tint of the first particle of each burst. */
  lead: string;
  /** The tint of the other particles. */
  pink: string;
  /** The violet of the disc and the floor under it. */
  disc: string;
  label: string;
  rim: string;
}

export function readPalette(el: Element): Palette {
  const style = getComputedStyle(el);
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const hues: string[] = [];
  for (let i = 0; i < 9; i++) hues.push(get(`--viz-hue-${i}`, i === 8 ? '#a79f90' : '#f2b62b'));
  return {
    hues,
    core: get('--viz-core', '#d94ee8'),
    spark: get('--viz-spark', '#fff3ff'),
    lead: get('--viz-lead', '#9dffb8'),
    pink: get('--viz-pink', '#ffc2f2'),
    disc: get('--viz-disc', '#3a1c78'),
    label: get('--viz-soft', '#b9a9e0'),
    rim: get('--viz-rim', '#8a74d0'),
  };
}

/** `#rrggbb` as an rgba() color. */
function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** A soft round glow in one color, drawn once and stamped many times (cheaper than a blur per frame). */
const sprites = new Map<string, HTMLCanvasElement>();
function glow(color: string): HTMLCanvasElement {
  let s = sprites.get(color);
  if (!s) {
    s = document.createElement('canvas');
    s.width = s.height = 96;
    const g = s.getContext('2d')!;
    const grad = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    grad.addColorStop(0, rgba(color, 1));
    grad.addColorStop(0.3, rgba(color, 0.4));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 96, 96);
    sprites.set(color, s);
  }
  return s;
}

/**
 * A soft straight shaft of light in one color, drawn once and stretched along any line: bright in the
 * middle and soft at the sides. A 'beam' fades in towards its head (its tail is the top of the sprite, so
 * it has a tail without a gradient per frame); a 'pillar' is full along its length and fades out at the bottom.
 */
const shafts = new Map<string, HTMLCanvasElement>();
function shaft(color: string, kind: 'beam' | 'pillar'): HTMLCanvasElement {
  const key = `${kind}${color}`;
  let s = shafts.get(key);
  if (!s) {
    s = document.createElement('canvas');
    s.width = 32;
    s.height = 128;
    const g = s.getContext('2d')!;
    const across = g.createLinearGradient(0, 0, 32, 0);
    across.addColorStop(0, rgba(color, 0));
    across.addColorStop(0.25, rgba(color, 0.35));
    across.addColorStop(0.5, rgba(color, 1));
    across.addColorStop(0.75, rgba(color, 0.35));
    across.addColorStop(1, rgba(color, 0));
    g.fillStyle = across;
    g.fillRect(0, 0, 32, 128);
    const along = g.createLinearGradient(0, 0, 0, 128);
    if (kind === 'beam') {
      along.addColorStop(0, 'rgba(0,0,0,0)');
      along.addColorStop(0.7, 'rgba(0,0,0,0.6)');
      along.addColorStop(1, 'rgba(0,0,0,1)');
    } else {
      along.addColorStop(0, 'rgba(0,0,0,0.7)');
      along.addColorStop(0.15, 'rgba(0,0,0,1)');
      along.addColorStop(0.7, 'rgba(0,0,0,1)');
      along.addColorStop(1, 'rgba(0,0,0,0)');
    }
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = along;
    g.fillRect(0, 0, 32, 128);
    shafts.set(key, s);
  }
  return s;
}

/**
 * A tapering streak of light in one color, drawn once: a sharp bright head at the bottom and a soft, thin tail
 * fading to nothing at the top (a shooting star). Drawn in slices along a curved tail (see `drawStreak`), so there
 * is no gradient made per frame.
 */
const streaks = new Map<string, HTMLCanvasElement>();
const STREAK_W = 32;
const STREAK_H = 192;
function streak(color: string): HTMLCanvasElement {
  let s = streaks.get(color);
  if (!s) {
    s = document.createElement('canvas');
    s.width = STREAK_W;
    s.height = STREAK_H;
    const g = s.getContext('2d')!;
    const across = g.createLinearGradient(0, 0, STREAK_W, 0);
    across.addColorStop(0, rgba(color, 0));
    across.addColorStop(0.3, rgba(color, 0.45));
    across.addColorStop(0.5, rgba(color, 1));
    across.addColorStop(0.7, rgba(color, 0.45));
    across.addColorStop(1, rgba(color, 0));
    g.fillStyle = across;
    g.fillRect(0, 0, STREAK_W, STREAK_H);
    // The outline narrows towards the tail, and the brightness grows towards the head.
    const along = g.createLinearGradient(0, 0, 0, STREAK_H);
    along.addColorStop(0, 'rgba(0,0,0,0)');
    along.addColorStop(0.5, 'rgba(0,0,0,0.35)');
    along.addColorStop(0.85, 'rgba(0,0,0,0.85)');
    along.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = along;
    g.beginPath();
    g.moveTo(STREAK_W / 2, 0);
    for (let i = 1; i <= 24; i++) g.lineTo(STREAK_W / 2 + (STREAK_W / 2) * Math.pow(i / 24, 0.7), (i / 24) * STREAK_H);
    for (let i = 24; i >= 1; i--) g.lineTo(STREAK_W / 2 - (STREAK_W / 2) * Math.pow(i / 24, 0.7), (i / 24) * STREAK_H);
    g.closePath();
    g.fill();
    streaks.set(color, s);
  }
  return s;
}

function stamp(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, radius: number, alpha: number) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(glow(color), x - radius, y - radius, radius * 2, radius * 2);
}

export interface DiscOptions {
  canvas: HTMLCanvasElement;
  wedges: Wedge[];
  /** Where each item of the loop lands: its wedge and cell, in loop order. */
  slots: { wedge: number; cell: number }[];
  palette: Palette;
  /** Reduced motion: no spinning, no beam, no trail, no pulsing; cells just light up as items land. */
  still: boolean;
  /** The two lines of the small card shown for each item of the loop (its text, then "category · board"), in loop order. Plain text. */
  cards: [string, string][];
  /** How many items have landed so far in this trip round the loop (0 when it starts again). Called when that changes. */
  onLanded(landed: number): void;
}

/** Starts the loop on the canvas. Returns the function that stops it. */
export function startDisc(o: DiscOptions): () => void {
  const { canvas, wedges, slots, palette, still } = o;
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const n = slots.length;
  const flight = still ? 1 : FLIGHT_MS;
  const strike = still ? 1 : FLIGHT_MS * STRIKE; // when the beam reaches its cell: it lands and lights up
  const hueOf = (wi: number) => palette.hues[wedges[wi].hue % palette.hues.length];
  const total = loopMs(n, flight);
  // The most fountains in the air together over this loop sets how many sparks each has; the same for the whole loop, so none pops in or out. A narrow stage (a phone) gets a few fewer.
  let overlap = 1;
  if (!still) for (let at = 0; at < total; at += 50) overlap = Math.max(overlap, playhead(at, n, flight, strike).flying.length);
  const sparks = burstSize(overlap);
  const crowded = overlap > 4; // fixed for the whole loop too, so a fountain never changes look in flight
  let bursts = sparks;
  let landedCount = wedges.map((w) => w.cells.map(() => 0));
  const flashAt = wedges.map((w) => w.cells.map(() => -Infinity));
  let w = 0;
  let h = 0;
  let dpr = 1;
  const labelFont = () => `500 ${w > 800 ? 11 : 10}px ${MONO}`;
  // Each board's name (cut only if it is wider than the stage) and how wide its box is with the dot, measured once per size.
  let nameTexts: string[] = [];
  let nameWidths: number[] = [];
  // Where the disc sits and how big it is: as big as the stage's width allows with the names fitting round it. Worked out per size.
  let fit = { rx: 40, cx: 0, cy: 0 };
  const hubTexts: (string | undefined)[] = wedges.map(() => undefined);
  // The cards' lines as cut to fit (and their width), by item and place, measured when first shown. Emptied on resize.
  const cardText = new Map<string, { title: string; sub: string; width: number }>();
  // The still parts of the picture, drawn once per size (a canvas of the same size, stamped each frame).
  const base = document.createElement('canvas');

  /** Where the disc and the core sit on the canvas, and how big the disc is. Sits low; when the stage is tall there is room to lift it so the core and the beams get their space above. */
  const layout = () => {
    const { rx, cx, cy } = fit;
    return { rx, cx, cy, core: coreAt(cx, cy, rx) };
  };

  /** An ellipse on the disc: radius `r` (a share of the half width) round the centre. */
  const ring = (g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, r: number) => {
    g.beginPath();
    g.ellipse(cx, cy, r * rx, r * rx * TILT, 0, 0, Math.PI * 2);
  };

  const paintBase = () => {
    const g = base.getContext('2d');
    if (!g) return;
    base.width = canvas.width;
    base.height = canvas.height;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { rx, cx, cy } = layout();
    // The floor: a soft violet glow spreading past the rim, drawn as a circle squashed to the disc's tilt.
    g.save();
    g.translate(cx, cy);
    g.scale(1, TILT);
    const floor = g.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx * 1.45);
    floor.addColorStop(0, rgba(palette.disc, 0.5));
    floor.addColorStop(0.7, rgba(palette.disc, 0.28));
    floor.addColorStop(1, rgba(palette.disc, 0));
    g.fillStyle = floor;
    g.beginPath();
    g.arc(0, 0, rx * 1.45, 0, Math.PI * 2);
    g.fill();
    // The disc itself, a dark violet.
    const disc = g.createRadialGradient(0, 0, rx * INNER, 0, 0, rx * OUTER);
    disc.addColorStop(0, rgba(palette.disc, 0.85));
    disc.addColorStop(1, rgba(palette.disc, 0.6));
    g.fillStyle = disc;
    g.beginPath();
    g.arc(0, 0, rx * OUTER, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // The track rings, many and thin, every fourth a little stronger.
    g.lineWidth = 0.8;
    for (let i = 1; i < TRACKS; i++) {
      g.strokeStyle = rgba(palette.rim, i % 4 === 0 ? 0.3 : 0.16);
      ring(g, cx, cy, rx, INNER + ((OUTER - INNER) * i) / TRACKS);
      g.stroke();
    }
    // The rim, and a dashed ring just outside it.
    g.strokeStyle = rgba(palette.rim, 0.5);
    g.lineWidth = 1;
    ring(g, cx, cy, rx, OUTER);
    g.stroke();
    g.strokeStyle = rgba(palette.rim, 0.4);
    g.setLineDash([2, 5]);
    ring(g, cx, cy, rx, OUTER + 0.07);
    g.stroke();
    g.setLineDash([]);
    // The dark hub in the middle.
    g.fillStyle = 'rgba(8, 4, 22, 0.92)';
    g.strokeStyle = rgba(palette.rim, 0.45);
    ring(g, cx, cy, rx, INNER);
    g.fill();
    g.stroke();
    g.strokeStyle = rgba(palette.rim, 0.18);
    ring(g, cx, cy, rx, INNER * 0.82);
    g.stroke();
  };

  const size = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth;
    bursts = w < 520 ? Math.max(4, Math.round(sparks * 0.7)) : sparks;
    h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    hubTexts.fill(undefined);
    cardText.clear();
    ctx.font = labelFont();
    nameTexts = wedges.length > MAX_LABELLED ? [] : wedges.map((wedge) => fitLabel(wedge.name.toUpperCase(), Math.max(20, w - 2 * NAME_MARGIN - DOT_W), (t) => ctx.measureText(t).width));
    nameWidths = nameTexts.map((text) => ctx.measureText(text).width + DOT_W);
    fit = fitDisc(w, h, nameWidths);
    paintBase();
    // The names as they read (cut only if wider than the stage), for the browser tests to check.
    canvas.dataset.rimLabels = nameTexts.join('|');
    // The disc's middle and half width, and the stage's size, in pixels (for the browser tests to check how much of the stage the disc fills).
    canvas.dataset.disc = [fit.cx, fit.cy, fit.rx, w, h].map(Math.round).join(',');
  };
  size();
  const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(size);
  watch?.observe(canvas);

  let t = 0;
  let spin = -Math.PI / 2 + 0.3; // the first wedge starts at the front
  let last = 0;
  let landed = 0;
  let latest = -1; // the wedge of the item that landed last, named in the hub
  // The items that got a card (when they landed, on the animation clock), oldest first, and when the last was shown.
  let cardArrivals: { index: number; at: number; slot: CardSlot }[] = [];
  let lastCard = -Infinity;
  let raf = 0;

  /** Adds the patch of ring between two angles and two radii to the current path, as a closed shape. */
  const patch = (a0: number, a1: number, r0: number, r1: number, cx: number, cy: number, rx: number) => {
    const steps = Math.max(1, Math.ceil((a1 - a0) / 0.12));
    for (let i = 0; i <= steps; i++) {
      const p = project(a0 + ((a1 - a0) * i) / steps, r1, spin, cx, cy, rx);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    }
    for (let i = steps; i >= 0; i--) {
      const p = project(a0 + ((a1 - a0) * i) / steps, r0, spin, cx, cy, rx);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  };

  const draw = (now: number, flying: { index: number; progress: number }[]) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineJoin = 'round';
    const { rx, cx, cy, core } = layout();
    const count = wedges.length;
    ctx.drawImage(base, 0, 0, w, h);

    // The radial divisions: the edges of the wedges a little stronger than the fine ones between.
    const per = Math.max(1, Math.round(SPOKES / Math.max(1, count)));
    ctx.lineWidth = 0.7;
    for (const edge of [false, true]) {
      ctx.strokeStyle = rgba(palette.rim, edge ? 0.3 : 0.14);
      ctx.beginPath();
      for (let wi = 0; wi < count; wi++) {
        const span = wedgeSpan(wi, count);
        for (let i = edge ? 0 : 1; i < (edge ? 1 : per); i++) {
          const a = span.a0 + ((span.a1 - span.a0) * i) / per;
          const p0 = project(a, INNER, spin, cx, cy, rx);
          const p1 = project(a, OUTER, spin, cx, cy, rx);
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
        }
      }
      ctx.stroke();
    }

    // The lit cells: one short magenta dash for each finished item, each at its own place in its cell (never a solid band). The newest flashes.
    wedges.forEach((wedge, wi) => {
      wedge.cells.forEach((_, ci) => {
        const done = landedCount[wi][ci];
        const flash = Math.max(0, 1 - (now - flashAt[wi][ci]) / FLASH_MS);
        if (!done) return;
        const a = cellArea(wi, count, ci, wedge.cells.length);
        const front = (Math.sin((a.a0 + a.a1) / 2 + spin) + 1) / 2; // 1 at the front of the ring, 0 at the back
        const seed = wi * 131 + ci;
        const shown = dashCount(a, done);
        ctx.fillStyle = rgba(palette.core, (0.62 + 0.3 * front) * (still ? 1 : 0.9));
        ctx.beginPath();
        for (let k = 0; k < shown; k++) {
          const d = dashFor(a, k, seed);
          patch(d.a0, d.a1, d.r0, d.r1, cx, cy, rx);
        }
        ctx.fill();
        if (flash > 0) {
          // simple: past DASH_MAX_FILL of a cell's places the newest item shares an earlier dash, so that one glows; upgrade if cells should show every item.
          const d = dashFor(a, (done - 1) % shown, seed); // the newest dash is the one that glows
          ctx.fillStyle = rgba(palette.spark, Math.min(1, flash * 1.2));
          ctx.beginPath();
          patch(d.a0, d.a1, d.r0, d.r1, cx, cy, rx);
          ctx.fill();
          const c = project((d.a0 + d.a1) / 2, (d.r0 + d.r1) / 2, spin, cx, cy, rx);
          ctx.globalCompositeOperation = 'lighter';
          stamp(ctx, palette.core, c.x, c.y, 14 + 12 * flash, 0.7 * flash);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
      });
    });

    // Names round the disc, outside its dashed ring (above and below it where there is no room beside it), small uppercase monospace; the name of the latest landing sits in the hub.
    ctx.font = labelFont();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    if (count > 0 && count <= MAX_LABELLED) {
      const phis = wedges.map((_, wi) => {
        const span = wedgeSpan(wi, count);
        return (span.a0 + span.a1) / 2 + spin;
      });
      placeNames(nameWidths, phis, { w, h, cx, cy, rx }).forEach((box, wi) => {
        if (box.fade <= 0.02) return;
        const front = (Math.sin(phis[wi]) + 1) / 2;
        const alpha = (0.55 + 0.45 * front) * box.fade;
        ctx.fillStyle = rgba(palette.label, alpha);
        ctx.fillText(nameTexts[wi], box.x + DOT_W, box.y + NAME_H / 2);
        // A small dot in the wedge's own color keeps what each name stands for.
        ctx.fillStyle = rgba(hueOf(wi), (0.7 + 0.3 * front) * box.fade);
        ctx.beginPath();
        ctx.arc(box.x + 3, box.y + NAME_H / 2, 1.8, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.font = `500 ${rx > 200 ? 9 : 8}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = rgba(palette.label, 0.55);
    if (latest >= 0 && hubTexts[latest] === undefined) hubTexts[latest] = fitLabel(wedges[latest].name.toUpperCase(), rx * INNER * 1.5, (t) => ctx.measureText(t).width);
    ctx.fillText(latest >= 0 ? hubTexts[latest] ?? '' : 'COMPLETED', cx, cy);

    // How hard the core is flaring from particles going in (several can land at once).
    let flare = 0;
    const phases = still ? [] : flying.map((f) => warpPhase(f.progress)); // once per frame, shared by the flare and the drawing below
    for (const ph of phases) flare += ph.flare;
    flare = Math.min(1, flare);

    // The pillar of light through the core down to the hub, and the core's bloom: always there, swelling with the flare.
    const pulse = still ? 1 : 1 + 0.05 * Math.sin(now / 600) + 0.25 * flare;
    const lv = pillarLevel(flare);
    const beam = beamWidths(rx); // how wide a beam is drawn: wider on a bigger stage, never thinner than a few pixels
    const unit = Math.max(0.6, Math.min(1.2, rx / 260)); // the beams, flash and pillar follow the size of the stage, so on a phone a landing does not flood its neighbors
    ctx.globalCompositeOperation = 'lighter';
    for (const [color, wide, a, swell] of [
      [palette.core, 16, 0.35, lv.width],
      [palette.core, 5, 0.75, lv.width],
      [palette.spark, 1.6, 1, 1 + 0.7 * flare], // the white-hot line swells less than the glows
    ] as const) {
      const pw = wide * unit * swell;
      ctx.globalAlpha = a * lv.alpha;
      ctx.drawImage(shaft(color, 'pillar'), cx - pw / 2, 0, pw, cy + 6);
    }
    stamp(ctx, palette.core, core.x, core.y, rx * 0.22 * pulse, 0.55);
    stamp(ctx, palette.core, core.x, core.y, rx * 0.11 * pulse, 0.9);
    stamp(ctx, palette.spark, core.x, core.y, rx * 0.06 * pulse, 0.95);
    if (flare > 0) {
      stamp(ctx, palette.core, core.x, core.y, rx * (0.22 + 0.16 * flare), 0.6 * flare);
      stamp(ctx, palette.spark, core.x, core.y, rx * (0.07 + 0.1 * flare), 0.9 * flare);
    }
    ctx.globalAlpha = 1;

    // Light warping in: each item's thin beam comes in from beyond the top of the canvas onto its cell, a white dot and a small ring show where it lands, and a burst of particles runs from the cell into the core.
    if (!still) {
      /** Stretches a cached shaft along the line from `a` (its tail) to `b` (its head), `width` pixels across. */
      const drawShaft = (sprite: HTMLCanvasElement, a: { x: number; y: number }, b: { x: number; y: number }, width: number, alpha: number, from = 0, to = 1) => {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 0.5) return;
        const th = Math.atan2(a.x - b.x, b.y - a.y); // turns the sprite's down (its head end) onto the line
        const cs = Math.cos(th) * dpr;
        const sn = Math.sin(th) * dpr;
        ctx.setTransform(cs, sn, -sn, cs, a.x * dpr, a.y * dpr);
        ctx.globalAlpha = alpha;
        // `from` to `to` (0 to 1) is the slice of the sprite that goes onto this line (all of it unless the line is one piece of a curved streak).
        ctx.drawImage(sprite, 0, sprite.height * from, sprite.width, sprite.height * (to - from), -width / 2, 0, width, len);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      /** A streak along the curved path `pts` (tail first), as one slice of the cached sprite per piece. */
      const drawStreak = (sprite: HTMLCanvasElement, pts: { x: number; y: number }[], width: number, alpha: number) => {
        const pieces = pts.length - 1;
        for (let i = 0; i < pieces; i++) drawShaft(sprite, pts[i], pts[i + 1], width, alpha, i / pieces, (i + 1) / pieces);
      };
      flying.forEach((f, fi) => {
        const ph = phases[fi];
        const s = slots[f.index];
        const c = cellCentre(s.wedge, count, s.cell, wedges[s.wedge].cells.length);
        const to = project(c.a, c.r, spin, cx, cy, rx);
        if (ph.beamAlpha > 0) {
          const from = beamStart(to, cx);
          const head = beamPoint(from, to, ph.beam);
          const a = ph.beamAlpha;
          drawShaft(shaft(palette.core, 'beam'), from, head, beam.glow, BEAM_ALPHA.glow * a); // the wide pink glow
          drawShaft(shaft(palette.spark, 'beam'), from, head, beam.core, BEAM_ALPHA.core * a); // the thin bright core
          stamp(ctx, palette.core, head.x, head.y, 12 * unit, 0.7 * a);
          stamp(ctx, palette.spark, head.x, head.y, 4.5 * unit, a); // the bright dot where it lands
          if (ph.beam < 1) {
            // A small ring marks the cell the beam is heading for.
            ctx.strokeStyle = palette.spark;
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.7 * a;
            ctx.beginPath();
            ctx.ellipse(to.x, to.y, 8 * unit, 8 * unit * TILT, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        if (ph.flash > 0) {
          stamp(ctx, palette.core, to.x, to.y, (12 + 36 * ph.flash) * unit, 0.8 * ph.flash);
          stamp(ctx, palette.spark, to.x, to.y, (6 + 14 * ph.flash) * unit, ph.flash);
        }
        // The ripples: rings on the disc opening out from the landing spot, one after another.
        ctx.strokeStyle = palette.spark;
        for (const rp of ph.ripples) {
          if (rp.alpha <= 0) continue;
          const r = (6 + 44 * rp.open) * unit;
          ctx.lineWidth = 1.4 - 0.8 * rp.open;
          ctx.globalAlpha = 0.85 * rp.alpha;
          ctx.beginPath();
          ctx.ellipse(to.x, to.y, r, r * TILT, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (ph.column.alpha > 0) {
          // A thick bright column rises from the landing spot for a moment, brightest at the foot and thinning out above.
          const up = rx * 0.6 * ph.column.height;
          ctx.globalAlpha = 0.55 * ph.column.alpha;
          ctx.drawImage(shaft(palette.core, 'beam'), to.x - 13 * unit, to.y - up, 26 * unit, up);
          ctx.globalAlpha = 0.95 * ph.column.alpha;
          ctx.drawImage(shaft(palette.spark, 'beam'), to.x - 5 * unit, to.y - up, 10 * unit, up);
          stamp(ctx, palette.spark, to.x, to.y, 16 * unit, 0.8 * ph.column.alpha);
        }
        if (ph.comet !== null) {
          // The fountain: shooting stars that stream from the cell along its wedge, curving in on the disc's tilt, then lift into the core (the flow paths are `flowTail`).
          const sp = wedgeSpan(s.wedge, count);
          const half = (sp.a1 - sp.a0) / 2;
          const view = { spin, cx, cy, rx };
          // Each has a white-hot head in a soft halo and a long tapering tail along its recent path (longer the faster it goes). Some are tinted green, the rest white and lavender.
          for (let k = 0; k < bursts; k++) {
            const seed = particleSeed(f.index, k);
            const q = Math.min(1, (ph.comet - seed.delay) / (1 - PARTICLE_DELAY));
            if (q <= 0) continue;
            const alpha = Math.min(1, (1 - q) / 0.12);
            if (alpha <= 0) continue;
            const pts = flowTail(c, half, seed.spread, q, crowded ? 4 : 7, seed.lift, view);
            const head = pts[pts.length - 1];
            const tint = k % 4 === 0 ? palette.lead : k % 2 ? palette.pink : palette.spark;
            const lead = (k === 0 ? 1.2 : 1) * Math.max(0.4, Math.min(1.2, rx / 260)); // follows the size of the stage more closely than `unit`, so on a phone the fountain stays a few crisp streaks
            drawStreak(streak(tint), pts, 7 * lead, 0.8 * alpha); // the glowing streak
            drawStreak(streak(palette.spark), pts, 2.8 * lead, alpha); // its white-hot core
            if (!crowded) stamp(ctx, tint, head.x, head.y, 15 * lead, 0.7 * alpha); // the halo round the head
            stamp(ctx, palette.spark, head.x, head.y, 7 * lead, alpha);
          }
        }
      });
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // The small cards by the core, for the items that just landed (none for reduced motion).
    if (!still) {
      const titlePx = rx > 200 ? 12 : rx > 150 ? 11 : 10; // the card follows the size of the stage, so on a phone it stays small beside the disc
      const subPx = titlePx - 2;
      const places = cardSlotsFor(core, rx, w, CARD_H); // after a resize a live card may be in a place that no longer fits: it is skipped
      for (const card of cardsAt(cardArrivals, now)) {
        const lines = o.cards[card.index];
        if (!lines || !places.includes(card.slot)) continue;
        const textKey = `${card.index}:${card.slot}`;
        let text = cardText.get(textKey);
        if (!text) {
          const room = cardRoom(card.slot, core, rx, w, CARD_H) - CARD_PAD * 2; // the place's own room, so the text is cut to fit it
          ctx.font = `600 ${titlePx}px ${SANS}`;
          const title = fitLabel(lines[0], room, (t) => ctx.measureText(t).width);
          const titleW = ctx.measureText(title).width;
          ctx.font = `400 ${subPx}px ${SANS}`;
          const sub = fitLabel(lines[1], room, (t) => ctx.measureText(t).width);
          text = { title, sub, width: Math.ceil(Math.max(titleW, ctx.measureText(sub).width)) + CARD_PAD * 2 };
          cardText.set(textKey, text);
        }
        const box = cardBox(card.slot, core, rx, w, text.width, CARD_H, card.rise);
        ctx.globalAlpha = card.alpha;
        ctx.fillStyle = 'rgba(10, 6, 28, 0.9)';
        ctx.strokeStyle = rgba(palette.lead, 0.75);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(box.x, box.y, box.w, box.h, 9);
        ctx.fill();
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = palette.spark;
        ctx.font = `600 ${titlePx}px ${SANS}`;
        ctx.fillText(text.title, box.x + CARD_PAD, box.y + 15);
        ctx.fillStyle = rgba(palette.label, 0.9);
        ctx.font = `400 ${subPx}px ${SANS}`;
        ctx.fillText(text.sub, box.x + CARD_PAD, box.y + 29);
      }
      ctx.globalAlpha = 1;
    }
  };

  const frame = (now: number) => {
    const dt = last ? Math.min(MAX_DT_MS, now - last) : 0;
    last = now;
    t += dt;
    if (!still) spin += dt * SPIN_PER_MS;
    if (n && t >= total) {
      // Back to the start: the cells go dark again and the oldest item is next.
      t -= total;
      landed = 0;
      landedCount = wedges.map((x) => x.cells.map(() => 0));
      flashAt.forEach((row) => row.fill(-Infinity));
      latest = -1;
      cardArrivals = [];
      lastCard = -Infinity;
      o.onLanded(0);
    }
    const ph = playhead(t, n, flight, strike);
    for (let k = landed; k < ph.landed; k++) {
      const s = slots[k];
      latest = s.wedge;
      landedCount[s.wedge][s.cell]++;
      flashAt[s.wedge][s.cell] = now;
      if (!still && shouldShowCard(lastCard, now, n)) {
        lastCard = now;
        const { rx, core } = layout();
        const places = cardSlotsFor(core, rx, w, CARD_H);
        if (places.length) cardArrivals.push({ index: k, at: now, slot: pickSlot(cardArrivals, places, now) });
      }
    }
    while (cardArrivals.length && now - cardArrivals[0].at >= CARD_LIFE_MS) cardArrivals.shift();
    if (ph.landed !== landed) {
      landed = ph.landed;
      o.onLanded(landed);
    }
    draw(now, ph.flying);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    watch?.disconnect();
  };
}
