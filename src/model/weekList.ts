// The calendar's scrolling Week list (owner request, 2026-11-20): which week is looked at, and when the drawn weeks move.
import type { DayKey } from './calendar';

/** Weeks drawn each side of the middle one (more are kept in the store). */
export const WEEKS_DRAWN = 6;
/** The drawn weeks move to the week looked at once it is this many weeks from their middle. */
export const RECENTER = 3;

/** Whole weeks from one day to another (negative: earlier); by calendar dates, so a clock change never counts. */
export function weeksBetween(from: DayKey, to: DayKey): number {
  return Math.round((Date.parse(`${to}T00:00Z`) - Date.parse(`${from}T00:00Z`)) / (7 * 86400000));
}

/**
 * The week looked at: the last week, in list order, whose top is at or above the line (its distance from the list's top),
 * so the line sitting in the gap between two weeks still names the one above; the first week when none has reached it.
 */
export function weekAtLine(tops: [DayKey, number][], line: number): DayKey | null {
  let found: DayKey | null = tops[0]?.[0] ?? null;
  for (const [week, top] of tops) if (top <= line) found = week;
  return found;
}

/** Whether the drawn weeks move to the week looked at. */
export function recenterOn(middle: DayKey, week: DayKey): boolean {
  return Math.abs(weeksBetween(middle, week)) >= RECENTER;
}
