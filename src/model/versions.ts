import type { Board } from './types';

// Version history (owner request, like Google Docs): the board as it was, saved now and then,
// to look back at and restore. Pure rules here; saving and loading live in src/store/versions.ts.

/** A saved version, without the board itself (kept apart so the list loads quickly). */
export interface VersionMeta {
  id: string;
  /** When it was saved (ms since 1970). */
  savedAt: number;
  cards: number;
  columns: number;
}

/** A new version is saved at most this often: when editing starts after a quiet spell this long. */
export const VERSION_GAP_MS = 10 * 60 * 1000;
/** How many versions are kept; older ones are dropped. */
export const KEEP_VERSIONS = 100;

/** Whether a change now should first save the board as it was (`lastSavedAt`: the newest version, if any). */
export function needsVersion(lastSavedAt: number | null, now: number): boolean {
  return lastSavedAt === null || now - lastSavedAt >= VERSION_GAP_MS;
}

export function summarize(board: Board): { cards: number; columns: number } {
  return { cards: Object.keys(board.cards).length, columns: Object.keys(board.columns).length };
}

/** e.g. "12 cards · 3 columns". */
export function describeVersion(v: VersionMeta): string {
  if (!v.cards && !v.columns) return 'Empty board';
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  return [v.cards && n(v.cards, 'card'), v.columns && n(v.columns, 'column')].filter(Boolean).join(' · ');
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Today", "Yesterday", "28 September", or "31 December 2025" outside this year (local time). */
export function dayLabel(savedAt: number, now: number): string {
  const day = new Date(savedAt);
  const today = new Date(now);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((startOf(today) - startOf(day)) / 86_400_000);
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  const date = `${day.getDate()} ${MONTHS[day.getMonth()]}`;
  return day.getFullYear() === today.getFullYear() ? date : `${date} ${day.getFullYear()}`;
}

/** Versions grouped by day, newest day and newest version first. */
export function groupByDay(versions: VersionMeta[], now: number): { label: string; versions: VersionMeta[] }[] {
  const groups: { label: string; versions: VersionMeta[] }[] = [];
  for (const v of [...versions].sort((a, b) => b.savedAt - a.savedAt)) {
    const label = dayLabel(v.savedAt, now);
    if (groups.at(-1)?.label === label) groups.at(-1)!.versions.push(v);
    else groups.push({ label, versions: [v] });
  }
  return groups;
}

/** The ids of versions past the newest `keep`. */
export function versionsToDrop(versions: VersionMeta[], keep = KEEP_VERSIONS): string[] {
  return [...versions].sort((a, b) => b.savedAt - a.savedAt).slice(keep).map((v) => v.id);
}
