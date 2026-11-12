import { INNER, OUTER, PARTICLES, PARTICLE_DELAY, STRIKE, TILT, beamPoint, beamStart, cellArea, cellCentre, coreAt, discRadius, fitLabel, LABEL_RADIUS, particleAt, particleSeed, pillarLevel, project, warpPhase, wedgeSpan } from '../model/vizGeometry';
import { loopMs, playhead, type Wedge } from '../model/visualizer';

// Draws the Visualizer's ring on one canvas (owner request 2026-11-12; reshaped the same day to match the
// look and motion of a video the owner sent). Nothing here touches React state or the board: it is handed
// the pre-worked ring and loop, and calls `onLanded` when a beam lands.
// Per-frame work stays in this file; only the feed re-renders, once per landing.
// Each item is light warping into the middle: a thin beam shoots in from beyond the top of the canvas onto
// its cell (a white dot and a small ring show where it lands and the cell lights), then a burst of small
// glowing particles fans out from the cell along curved paths up into the core, which flares, and a thin
// pillar of light through the core swells with it (the timing is warpPhase in model/vizGeometry). The
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
/** How many thin track rings the disc has between the hub and the rim, and about how many radial divisions it has all round. */
const TRACKS = 14;
const SPOKES = 36;
/** How many short arcs a lit cell can show along each of its tracks. */
const SLOTS = 4;
/** The small uppercase monospace of the labels (a system font: nothing to download). */
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
/** Room for a board name is rounded down to this many pixels when its cut is remembered. */
const LABEL_STEP = 4;

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
  let landedCount = wedges.map((w) => w.cells.map(() => 0));
  const flashAt = wedges.map((w) => w.cells.map(() => -Infinity));
  let w = 0;
  let h = 0;
  let dpr = 1;
  let labelW = 58; // the widest name round the rim, in pixels: the disc is sized so it fits beside the dashed ring
  const labelFont = () => `500 ${w > 800 ? 11 : 10}px ${MONO}`;
  // Each board's name as cut to fit, by the room it had (in LABEL_STEP pixel steps), so measureText runs when a room is first seen, not every frame. Emptied on resize.
  const labels = wedges.map(() => new Map<number, string>());
  const hubTexts: (string | undefined)[] = wedges.map(() => undefined);
  // The still parts of the picture, drawn once per size (a canvas of the same size, stamped each frame).
  const base = document.createElement('canvas');

  /** Where the disc and the core sit on the canvas, and how big the disc is. Sits low; when the stage is tall there is room to lift it so the core and the beams get their space above. */
  const layout = () => {
    const rx = discRadius(w, h, labelW);
    const spare = Math.max(0, (h - (rx * 1.25 + 60)) / 2);
    const cx = w / 2;
    const cy = h - rx * TILT * LABEL_RADIUS - 34 - spare;
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
    h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    labels.forEach((m) => m.clear());
    hubTexts.fill(undefined);
    if (wedges.length > 0 && wedges.length <= MAX_LABELLED) {
      ctx.font = labelFont();
      labelW = Math.max(...wedges.map((wedge) => ctx.measureText(fitLabel(wedge.name.toUpperCase(), Infinity, (t) => ctx.measureText(t).width)).width));
    }
    paintBase();
    // The names as they read at the narrowest spot (beside the disc), for the browser tests to check.
    const side = Math.min(labelW, w * 0.2);
    canvas.dataset.rimLabels = wedges.length > MAX_LABELLED ? '' : wedges.map((wedge) => fitLabel(wedge.name.toUpperCase(), side, (t) => ctx.measureText(t).width)).join('|');
  };
  size();
  const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(size);
  watch?.observe(canvas);

  let t = 0;
  let spin = -Math.PI / 2 + 0.3; // the first wedge starts at the front
  let last = 0;
  let landed = 0;
  let latest = -1; // the wedge of the item that landed last, named in the hub
  let raf = 0;

  /** The patch of ring a cell covers, as a closed path. */
  const patch = (a0: number, a1: number, r0: number, r1: number, cx: number, cy: number, rx: number) => {
    const steps = Math.max(2, Math.ceil((a1 - a0) / 0.12));
    ctx.beginPath();
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

    // The lit cells: short magenta arcs along the tracks, a little more of the cell for each item that has landed.
    const track = (OUTER - INNER) / TRACKS;
    wedges.forEach((wedge, wi) => {
      wedge.cells.forEach((cell, ci) => {
        const done = landedCount[wi][ci];
        const flash = Math.max(0, 1 - (now - flashAt[wi][ci]) / FLASH_MS);
        if (!done && flash <= 0) return;
        const a = cellArea(wi, count, ci, wedge.cells.length);
        const front = (Math.sin((a.a0 + a.a1) / 2 + spin) + 1) / 2; // 1 at the front of the ring, 0 at the back
        const depth = 0.7 + 0.3 * front;
        const tracks = Math.max(1, Math.floor((a.r1 - a.r0) / track));
        const share = cell.count > 0 ? Math.min(1, done / cell.count) : 1;
        const lit = Math.ceil(share * tracks * SLOTS);
        ctx.fillStyle = rgba(palette.core, Math.min(1, (0.5 + 0.2 * share + 0.4 * flash * flash) * depth));
        for (let row = 0; row < tracks; row++) {
          const n = Math.min(SLOTS, lit - row * SLOTS);
          if (n <= 0) break;
          const r1 = a.r1 - row * track;
          patch(a.a0, a.a0 + ((a.a1 - a.a0) * n) / SLOTS, r1 - track * 0.8, r1 - track * 0.1, cx, cy, rx);
          ctx.fill();
        }
        if (flash > 0) {
          const c = cellCentre(wi, count, ci, wedge.cells.length);
          const p = project(c.a, c.r, spin, cx, cy, rx);
          ctx.globalCompositeOperation = 'lighter';
          stamp(ctx, palette.core, p.x, p.y, 16 + 14 * flash, 0.8 * flash);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
      });
    });

    // Names around the rim, small uppercase monospace, evenly spaced; the name of the latest landing sits in the hub.
    ctx.font = labelFont();
    ctx.textBaseline = 'middle';
    if (count > 0 && count <= MAX_LABELLED) {
      wedges.forEach((wedge, wi) => {
        const span = wedgeSpan(wi, count);
        const mid = (span.a0 + span.a1) / 2;
        const p = project(mid, LABEL_RADIUS, spin, cx, cy, rx);
        const side = Math.cos(mid + spin);
        ctx.textAlign = side > 0.25 ? 'left' : side < -0.25 ? 'right' : 'center';
        const front = (Math.sin(mid + spin) + 1) / 2;
        const room = side > 0.25 ? w - p.x - 14 : side < -0.25 ? p.x - 14 : Math.min(150, (rx * Math.PI * 2 * 0.9) / count);
        const step = Math.max(0, Math.floor(room / LABEL_STEP));
        let text = labels[wi].get(step);
        if (text === undefined) {
          text = fitLabel(wedge.name.toUpperCase(), step * LABEL_STEP, (t) => ctx.measureText(t).width);
          labels[wi].set(step, text);
        }
        const dx = side > 0.25 ? 8 : side < -0.25 ? -8 : 0;
        ctx.fillStyle = rgba(palette.label, 0.55 + 0.45 * front);
        ctx.fillText(text, p.x + dx, p.y);
        // A small dot in the wedge's own color keeps what each name stands for.
        ctx.fillStyle = rgba(hueOf(wi), 0.7 + 0.3 * front);
        ctx.beginPath();
        ctx.arc(p.x + (side > 0.25 ? 2 : side < -0.25 ? -2 : -ctx.measureText(text).width / 2 - 6), p.y, 1.8, 0, Math.PI * 2);
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
      const drawShaft = (sprite: HTMLCanvasElement, a: { x: number; y: number }, b: { x: number; y: number }, width: number, alpha: number) => {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1) return;
        const th = Math.atan2(a.x - b.x, b.y - a.y); // turns the sprite's down (its head end) onto the line
        const cs = Math.cos(th) * dpr;
        const sn = Math.sin(th) * dpr;
        ctx.setTransform(cs, sn, -sn, cs, a.x * dpr, a.y * dpr);
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprite, -width / 2, 0, width, len);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      // A loop with very many items has quick, crowded arrivals, so every burst is smaller (fixed for the whole loop, so no particle pops in or out), to stay inside the frame.
      const bursts = slots.length > 250 ? 3 : PARTICLES;
      flying.forEach((f, fi) => {
        const ph = phases[fi];
        const s = slots[f.index];
        const c = cellCentre(s.wedge, count, s.cell, wedges[s.wedge].cells.length);
        const to = project(c.a, c.r, spin, cx, cy, rx);
        if (ph.beamAlpha > 0) {
          const from = beamStart(to, cx);
          const head = beamPoint(from, to, ph.beam);
          const a = ph.beamAlpha;
          drawShaft(shaft(palette.core, 'beam'), from, head, 9 * unit, 0.5 * a); // the faint halo
          drawShaft(shaft(palette.spark, 'beam'), from, head, 2.2 * unit, 0.85 * a);
          stamp(ctx, palette.core, head.x, head.y, 14 * unit, 0.7 * a);
          stamp(ctx, palette.spark, head.x, head.y, 5 * unit, a); // the bright dot where it lands
        }
        if (ph.flash > 0) {
          stamp(ctx, palette.core, to.x, to.y, (12 + 36 * ph.flash) * unit, 0.8 * ph.flash);
          stamp(ctx, palette.spark, to.x, to.y, (6 + 14 * ph.flash) * unit, ph.flash);
        }
        if (ph.ping !== null || ph.beamAlpha > 0) {
          // The small ring on the disc: it is there while the beam is, and opens a little as the cell lights.
          const open = ph.ping ?? 0;
          ctx.strokeStyle = palette.spark;
          ctx.lineWidth = 1.1;
          ctx.globalAlpha = 0.85 * Math.min(ph.beamAlpha + 0.2, 1) * (1 - open * 0.6);
          const r = (8 + 10 * open) * unit;
          ctx.beginPath();
          ctx.ellipse(to.x, to.y, r, r * TILT, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (ph.comet !== null) {
          // The burst: a few small lights with short fading tails, fanned out along curved paths from the cell into the core. The first is tinted green, the others white and pink.
          for (let k = 0; k < bursts; k++) {
            const seed = particleSeed(f.index, k);
            const q = Math.min(1, (ph.comet - seed.delay) / (1 - PARTICLE_DELAY));
            if (q <= 0) continue;
            const alpha = Math.min(1, (1 - q) / 0.12);
            if (alpha <= 0) continue;
            const head = particleAt(to, core, seed.spread, q);
            const tail = particleAt(to, core, seed.spread, Math.max(0, q - 0.16));
            const tint = k === 0 ? palette.lead : palette.pink;
            drawShaft(shaft(tint, 'beam'), tail, head, (k === 0 ? 3.2 : 2.4) * unit, 0.85 * alpha);
            stamp(ctx, tint, head.x, head.y, (k === 0 ? 8 : 6) * unit, 0.8 * alpha);
            stamp(ctx, palette.spark, head.x, head.y, 2.6 * unit, alpha);
          }
        }
      });
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
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
      o.onLanded(0);
    }
    const ph = playhead(t, n, flight, strike);
    for (let k = landed; k < ph.landed; k++) {
      const s = slots[k];
      latest = s.wedge;
      landedCount[s.wedge][s.cell]++;
      flashAt[s.wedge][s.cell] = now;
    }
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
