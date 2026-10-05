import type { CompletedCard, TodoItem } from './types';

// The ant hill (owner request, 2026-10-05): every ticked item Clean up sends into the Completed card
// moves an ant one step higher up a hill drawn at the top of that card. Each hill takes 10 more
// items than the one before (10, 20, 30…). The count is worked out from the Completed card itself,
// so it is saved, synced and undone with it, and an item sent back to its list takes its step back.

/** How many items one hill takes: 10 for the first, 20 for the second, and so on. */
export const STEPS_PER_HILL = 10;

/** Ticked items in the Completed card: each cleaned-up item and every ticked sub-item under it. */
export function climbedCount(card: CompletedCard | null): number {
  const ticked = (items: TodoItem[]): number => items.reduce((n, it) => n + (it.done ? 1 : 0) + ticked(it.children), 0);
  return card ? card.groups.reduce((n, g) => n + g.entries.reduce((m, e) => m + ticked([e.item]), 0), 0) : 0;
}

export interface Climb {
  /** Which hill the ant is on, from 1. */
  hill: number;
  /** Steps taken on this hill, 0 to `steps`. */
  step: number;
  /** Steps from the foot of this hill to its top. */
  steps: number;
  /** At the top: it stays there, flag reached, until the next item starts the next hill. */
  atTop: boolean;
}

/** Where the ant is after `count` items. */
export function antClimb(count: number): Climb {
  let hill = 1;
  let before = 0; // items taken by the hills already climbed
  while (count > before + hill * STEPS_PER_HILL) {
    before += hill * STEPS_PER_HILL;
    hill++;
  }
  const steps = hill * STEPS_PER_HILL;
  const step = Math.max(0, count - before);
  return { hill, step, steps, atTop: step === steps };
}

// The picture, in its own units: 216 wide (a card's inside width) by 72 high, y going down.
export const HILL_VIEW = { w: 216, h: 72 };
const FOOT = { x: 14, y: 66 };
const BEND = { x: 96, y: 22 };
export const HILL_SUMMIT = { x: 170, y: 22 };

/** The hill's outline: up the trail to the summit, then down the far side to the ground. */
export const HILL_PATH = `M0 70 L0 68 Q6 66 ${FOOT.x} ${FOOT.y} Q${BEND.x} ${BEND.y} ${HILL_SUMMIT.x} ${HILL_SUMMIT.y} Q198 22 216 60 L216 70 Z`;
/** The trail the ant walks, foot to summit. */
export const TRAIL_PATH = `M${FOOT.x} ${FOOT.y} Q${BEND.x} ${BEND.y} ${HILL_SUMMIT.x} ${HILL_SUMMIT.y}`;
/** Where the flag stands, just past the summit. */
export const FLAG_FOOT = { x: 188, y: 25 };

/**
 * The point `t` of the way up the trail (0 = foot, 1 = summit), and the slope there in degrees
 * (negative = uphill to the right), so the ant can lean with it.
 */
export function trailPoint(t: number): { x: number; y: number; angle: number } {
  const u = Math.min(1, Math.max(0, t));
  const v = 1 - u;
  const x = v * v * FOOT.x + 2 * u * v * BEND.x + u * u * HILL_SUMMIT.x;
  const y = v * v * FOOT.y + 2 * u * v * BEND.y + u * u * HILL_SUMMIT.y;
  const dx = 2 * v * (BEND.x - FOOT.x) + 2 * u * (HILL_SUMMIT.x - BEND.x);
  const dy = 2 * v * (BEND.y - FOOT.y) + 2 * u * (HILL_SUMMIT.y - BEND.y);
  return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}
