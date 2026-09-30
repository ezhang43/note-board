import {
  BLOCK_MAX_H,
  BLOCK_MIN_H,
  CARD_MAX_W,
  CARD_MIN_W,
  COLUMN_MAX_W,
  COLUMN_MIN_W,
  SIZE_MATCH_TOLERANCE,
} from './constants';
import { snapToGrid } from './geometry';

/** Another block's drawn size, which a resize can snap to match. */
export interface SizeCandidate {
  id: string;
  w: number;
  h: number;
}

export interface ResizeResult {
  w: number;
  /** null when only the width is being changed. */
  h: number | null;
  /** Blocks whose width and/or height this size matches. */
  matchIds: string[];
  /** e.g. "240 × 180 · same width as 2 blocks". */
  label: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Closest candidate value within tolerance, and every block that has it. */
function nearest(cands: SizeCandidate[], key: 'w' | 'h', v: number) {
  let best: number | null = null;
  for (const c of cands) {
    const d = Math.abs(c[key] - v);
    if (d <= SIZE_MATCH_TOLERANCE && (best == null || d < Math.abs(best - v))) best = c[key];
  }
  if (best == null) return null;
  const value = best;
  return { value, ids: cands.filter((c) => Math.abs(c[key] - value) <= 1).map((c) => c.id) };
}

/**
 * The size a block gets while being resized to a raw (pointer-driven) width and height.
 * Within 8px of another block's width or height it matches that exactly; otherwise it lands on
 * the 20px grid when snapping is on. Pass h = null to change the width only.
 */
export function resizeTo(
  kind: 'card' | 'column',
  raw: { w: number; h: number | null },
  candidates: SizeCandidate[],
  snap: boolean,
): ResizeResult {
  const [minW, maxW] = kind === 'column' ? [COLUMN_MIN_W, COLUMN_MAX_W] : [CARD_MIN_W, CARD_MAX_W];
  const matched: string[] = [];
  const ids = new Set<string>();

  const fit = (v: number, key: 'w' | 'h', lo: number, hi: number) => {
    const clamped = clamp(v, lo, hi);
    const m = nearest(candidates, key, clamped);
    if (m) {
      matched.push(key === 'w' ? 'width' : 'height');
      m.ids.forEach((id) => ids.add(id));
      return Math.round(m.value);
    }
    return Math.round(snap ? clamp(snapToGrid(clamped), lo, hi) : clamped);
  };

  const w = fit(raw.w, 'w', minW, maxW);
  const h = raw.h == null ? null : fit(raw.h, 'h', BLOCK_MIN_H, BLOCK_MAX_H);
  const sizeText = h == null ? `${w} wide` : `${w} × ${h}`;
  const n = ids.size;
  const label = matched.length ? `${sizeText} · same ${matched.join(' & ')} as ${n} ${n === 1 ? 'block' : 'blocks'}` : sizeText;
  return { w, h, matchIds: [...ids], label };
}
