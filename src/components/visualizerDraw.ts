import { INNER, OUTER, STRIKE, TILT, beamPoint, beamStart, beamTail, cellArea, cellCentre, fitLabel, pillarLevel, project, warpAt, warpPhase, wedgeSpan } from '../model/vizGeometry';
import { loopMs, playhead, type Wedge } from '../model/visualizer';

// Draws the Visualizer's ring on one canvas (owner request 2026-11-12). Nothing here touches React
// state or the board: it is handed the pre-worked ring and loop, and calls `onLanded` when a beam lands.
// Per-frame work stays in this file; only the feed and the chart's marker re-render, once per landing.
// Each item is light warping into the middle: a bright beam shoots in from beyond the top of the canvas
// onto its cell (which flashes and lights up), then a comet runs from the cell into the core, which
// flares, and a pillar of light through the core swells with it (the timing is warpPhase in
// model/vizGeometry). It is all drawn into this one canvas from cached sprites, stamped or stretched with
// additive blending: no gradient is built and no shadowBlur is used per frame, and nothing here moves or
// measures the page (no layout, no paint of other elements), so a busy loop costs only canvas work.

/** How long one item's whole trip takes: the beam drops onto its cell, then the comet runs into the core. */
export const FLIGHT_MS = 1400;
/** A cell stays bright this long after a landing. */
const FLASH_MS = 700;
/** The ring turns once in about 80 seconds. */
const SPIN_PER_MS = (Math.PI * 2) / 80000;
/** The most a frame may move the clock, so a tab that was hidden does not jump the loop. */
const MAX_DT_MS = 100;
/** Past this many wedges, board names around the ring would run into each other, so only the picture is drawn. */
const MAX_LABELLED = 10;
/** Room for a board name is rounded down to this many pixels when its cut is remembered. */
const LABEL_STEP = 12;

/** Colors, read from the `--viz-*` variables (hex only, so a see-through version can be made from them). */
export interface Palette {
  hues: string[];
  core: string;
  spark: string;
  label: string;
  rim: string;
}

export function readPalette(el: Element): Palette {
  const style = getComputedStyle(el);
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const hues: string[] = [];
  for (let i = 0; i < 9; i++) hues.push(get(`--viz-hue-${i}`, i === 8 ? '#a79f90' : '#f2b62b'));
  return { hues, core: get('--viz-core', '#f2b62b'), spark: get('--viz-spark', '#fff4d6'), label: get('--viz-soft', '#b9ae98'), rim: get('--viz-rim', '#8d8372') };
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
  const family = getComputedStyle(canvas).fontFamily;
  let w = 0;
  let h = 0;
  let dpr = 1;
  // Each board's name as cut to fit, by the room it had (in LABEL_STEP pixel steps), so measureText runs when a room is first seen, not every frame. Emptied on resize.
  const labels = wedges.map(() => new Map<number, string>());
  const size = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    labels.forEach((m) => m.clear());
  };
  size();
  const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(size);
  watch?.observe(canvas);

  let t = 0;
  let spin = -Math.PI / 2 + 0.3; // the first wedge starts at the front
  let last = 0;
  let landed = 0;
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
    const rx = Math.max(40, Math.min((w - 2 * 64) / 2, (h - 44) / 1.35));
    const cx = w / 2;
    const room = rx * 0.55; // the space kept above the ring for the comets' arcs
    // Sits low, but when the stage is tall there is room to lift it so the core's beam and the comets' arcs get their space above.
    const spare = Math.max(0, (h - 84 - room - 2 * rx * TILT - 60) / 2);
    const cy = h - rx * TILT - 28 - spare;
    const count = wedges.length;

    // The floor under the ring.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1;
    ctx.drawImage(glow(palette.core), cx - rx * 1.25, cy - rx * 1.25 * TILT, rx * 2.5, rx * 2.5 * TILT);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // The cells: faint outlines until something lands, then they stay lit a little more for each item.
    wedges.forEach((wedge, wi) => {
      const hue = hueOf(wi);
      wedge.cells.forEach((cell, ci) => {
        const a = cellArea(wi, count, ci, wedge.cells.length);
        const front = (Math.sin((a.a0 + a.a1) / 2 + spin) + 1) / 2; // 1 at the front of the ring, 0 at the back
        const depth = 0.7 + 0.3 * front;
        const done = landedCount[wi][ci];
        const flash = Math.max(0, 1 - (now - flashAt[wi][ci]) / FLASH_MS);
        const fill = (0.07 + (done ? 0.18 + 0.42 * Math.min(1, done / cell.count) : 0) + 0.35 * flash * flash) * depth;
        patch(a.a0, a.a1, a.r0, a.r1, cx, cy, rx);
        ctx.fillStyle = rgba(hue, Math.min(1, fill));
        ctx.fill();
        ctx.strokeStyle = rgba(hue, (done ? 0.55 : 0.28) * depth);
        ctx.lineWidth = 1;
        ctx.stroke();
        if (flash > 0) {
          const c = cellCentre(wi, count, ci, wedge.cells.length);
          const p = project(c.a, c.r, spin, cx, cy, rx);
          ctx.globalCompositeOperation = 'lighter';
          stamp(ctx, hue, p.x, p.y, 26 + 22 * flash, flash);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
      });
    });

    // The rim and the hole in the middle.
    ctx.strokeStyle = rgba(palette.rim, 0.45);
    ctx.lineWidth = 1;
    for (const r of [OUTER + 0.02, INNER - 0.02]) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * rx, r * rx * TILT, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Board names around the ring.
    if (count > 0 && count <= MAX_LABELLED) {
      ctx.font = `500 12px ${family}`;
      ctx.textBaseline = 'middle';
      wedges.forEach((wedge, wi) => {
        const span = wedgeSpan(wi, count);
        const mid = (span.a0 + span.a1) / 2;
        const p = project(mid, OUTER + 0.1, spin, cx, cy, rx);
        const side = Math.cos(mid + spin);
        ctx.textAlign = side > 0.25 ? 'left' : side < -0.25 ? 'right' : 'center';
        const front = (Math.sin(mid + spin) + 1) / 2;
        ctx.fillStyle = rgba(hueOf(wi), 0.55 + 0.45 * front);
        const room = side > 0.25 ? w - p.x - 8 : side < -0.25 ? p.x - 8 : 120;
        const step = Math.max(0, Math.floor(room / LABEL_STEP));
        let text = labels[wi].get(step);
        if (text === undefined) {
          text = fitLabel(wedge.name, step * LABEL_STEP, (t) => ctx.measureText(t).width);
          labels[wi].set(step, text);
        }
        ctx.fillText(text, p.x + (side > 0.25 ? 4 : side < -0.25 ? -4 : 0), p.y + (Math.sin(mid + spin) > 0 ? 8 : -8));
      });
    }

    // How hard the core is flaring from comets going in (several can land at once).
    let flare = 0;
    const phases = still ? [] : flying.map((f) => warpPhase(f.progress)); // once per frame, shared by the flare and the drawing below
    for (const ph of phases) flare += ph.flare;
    flare = Math.min(1, flare);

    // The core's bloom and the pillar of light through it: faintly there always, swelling with the flare.
    const pulse = still ? 1 : 1 + 0.08 * Math.sin(now / 600) + 0.3 * flare;
    const lv = pillarLevel(flare);
    const unit = Math.max(0.6, Math.min(1.2, rx / 260)); // the beams, flash and pillar follow the size of the stage, so on a phone a landing does not flood its neighbors
    ctx.globalCompositeOperation = 'lighter';
    const pillarBottom = cy + rx * 0.3 * TILT;
    for (const [color, wide, a, swell] of [
      [palette.core, 70, 0.5, lv.width],
      [palette.core, 22, 0.75, lv.width],
      [palette.spark, 3.5, 1, 1 + 0.5 * flare], // the white-hot line swells less than the glows
    ] as const) {
      const pw = wide * unit * swell;
      ctx.globalAlpha = a * lv.alpha;
      ctx.drawImage(shaft(color, 'pillar'), cx - pw / 2, 0, pw, pillarBottom);
    }
    stamp(ctx, palette.core, cx, cy, rx * 0.5 * pulse, 0.6);
    stamp(ctx, palette.core, cx, cy, rx * 0.3 * pulse, 0.9);
    stamp(ctx, palette.spark, cx, cy, rx * 0.15 * pulse, 0.95);
    if (flare > 0) {
      stamp(ctx, palette.spark, cx, cy, rx * (0.2 + 0.28 * flare), 0.85 * flare);
      ctx.globalAlpha = 0.8 * flare;
      const sw = rx * (0.5 + 0.9 * flare); // a flat streak of light across the core
      ctx.drawImage(glow(palette.spark), cx - sw, cy - rx * 0.05, sw * 2, rx * 0.1);
    }
    ctx.globalAlpha = 1;

    // Light warping in: each item's beam shoots in from beyond the top of the canvas onto its cell, a flash and rings burst on it, and a comet streaks from it into the core.
    if (!still) {
      ctx.lineCap = 'round';
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
      flying.forEach((f, fi) => {
        const ph = phases[fi];
        const s = slots[f.index];
        const c = cellCentre(s.wedge, count, s.cell, wedges[s.wedge].cells.length);
        const to = project(c.a, c.r, spin, cx, cy, rx);
        const hue = hueOf(s.wedge);
        if (ph.beamAlpha > 0) {
          const from = beamStart(to, cx);
          const head = beamPoint(from, to, ph.beam);
          const tail = beamPoint(from, to, beamTail(ph.beam));
          const a = ph.beamAlpha;
          drawShaft(shaft(hue, 'beam'), tail, head, 70 * unit, 0.9 * a); // the wide soft glow
          drawShaft(shaft(hue, 'beam'), tail, head, 26 * unit, a);
          drawShaft(shaft(palette.spark, 'beam'), tail, head, 8 * unit, a); // the white-hot core
          stamp(ctx, hue, head.x, head.y, 40 * unit, 0.7 * a);
          stamp(ctx, palette.spark, head.x, head.y, 20 * unit, a);
        }
        if (ph.flash > 0) {
          stamp(ctx, hue, to.x, to.y, (28 + 70 * ph.flash) * unit, 0.9 * ph.flash);
          stamp(ctx, palette.spark, to.x, to.y, (12 + 30 * ph.flash) * unit, ph.flash);
        }
        if (ph.ping !== null) {
          ctx.strokeStyle = palette.spark;
          for (const [grow, width, a] of [
            [46, 2.5, 1],
            [26, 1.5, 0.7],
          ] as const) {
            ctx.globalAlpha = a * (1 - ph.ping);
            ctx.lineWidth = width;
            const r = 4 + grow * ph.ping;
            ctx.beginPath();
            ctx.ellipse(to.x, to.y, r, r * TILT, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        if (ph.comet !== null && ph.cometAlpha > 0) {
          // The comet: a white-hot head in a glow, a trail of fading lights behind it along the same arc, and a few bright dots beside the trail.
          for (let k = 0; k < 9; k++) {
            const q = ph.comet - k * 0.055;
            if (q < 0) break;
            const at = warpAt(to, { x: cx, y: cy }, q);
            const fade = 1 - k / 9;
            const alpha = ph.cometAlpha;
            if (k === 0) {
              stamp(ctx, hue, at.x, at.y, 30, 0.9 * alpha);
              stamp(ctx, palette.spark, at.x, at.y, 15, alpha);
            } else {
              stamp(ctx, k < 3 ? palette.spark : hue, at.x, at.y, 4 + 11 * fade, (0.3 + 0.7 * fade) * alpha);
              if (k % 2) stamp(ctx, palette.spark, at.x + (k % 4 === 1 ? 1 : -1) * (4 + k * 0.8), at.y + 2, 2.2, 0.95 * fade * alpha);
            }
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
      o.onLanded(0);
    }
    const ph = playhead(t, n, flight, strike);
    for (let k = landed; k < ph.landed; k++) {
      const s = slots[k];
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
