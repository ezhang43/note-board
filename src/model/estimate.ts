import { updateCard } from './board';
import { editItems, findItem } from './checklist';
import type { Board, TodoItem } from './types';

// Time estimates on notes and checklist items, and the day an item was ticked (job saved-estimate-doneon).
// An estimate is whole minutes, from 1 to a day; a ticked day is "YYYY-MM-DD" in local time.

/** The longest estimate: a day, in minutes (the same cap as a brain dump's minutes). */
export const MAX_ESTIMATE = 24 * 60;

/** `v` when it is whole minutes from 1 to MAX_ESTIMATE, else undefined (loaded and imported data is checked with it). */
export function readEstimate(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_ESTIMATE ? v : undefined;
}

/** `v` when it is a real day written "YYYY-MM-DD", else undefined. */
export function readDay(v: unknown): string | undefined {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const [y, m, d] = v.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? v : undefined;
}

/** "45m", "1h", "1h 30m". */
export function estimateLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/**
 * The day an item was ticked, only while it is ticked. Items ticked before days were saved (or by
 * the Habits panel, or imported) have none, and a day left on an open item counts for nothing.
 */
export function tickedOn(item: TodoItem): string | null {
  return item.done ? (readDay(item.doneOn) ?? null) : null;
}

/** `x` with its estimate set to `minutes`, or cleared with null; `x` itself when that changes nothing. */
function estimated<T extends { estimate?: number }>(x: T, minutes: number | null): T {
  if ((x.estimate ?? null) === minutes) return x;
  const { estimate: _old, ...rest } = x;
  return (minutes === null ? rest : { ...rest, estimate: minutes }) as T;
}

/**
 * Sets (or with null clears) the estimate of a note, or of item `itemId` in a checklist. The same
 * board when nothing changes: an unknown card or item, the same estimate, or `minutes` that isn't
 * whole minutes from 1 to MAX_ESTIMATE.
 */
export function setEstimate(board: Board, cardId: string, itemId: string | null, minutes: number | null): Board {
  if (minutes !== null && readEstimate(minutes) === undefined) return board;
  if (itemId === null) return updateCard(board, cardId, (c) => (c.kind === 'note' ? estimated(c, minutes) : c));
  return editItems(board, cardId, (items) => {
    const found = findItem(items, itemId)?.item;
    if (!found || estimated(found, minutes) === found) return null;
    const next = structuredClone(items);
    const at = findItem(next, itemId)!;
    at.list[at.index] = estimated(at.item, minutes);
    return next;
  });
}
