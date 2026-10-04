import type { Board } from './types';
import type { Workspace } from './workspace';

// Version history (owner request, like Google Docs): the board as it was, saved now and then,
// to look back at and restore. Pure rules here; saving and loading live in src/store/versions.ts.

/** A saved version, without the board itself (kept apart so the list loads quickly). */
export interface VersionMeta {
  id: string;
  /** When it was saved (ms since 1970). */
  savedAt: number;
  cards: number;
  columns: number;
  /** How many boards it holds, when more than one (owner request: several boards). */
  boards?: number;
  /** A short fingerprint of the board (`contentHash`), so a repeat can be spotted without downloading it. */
  hash?: string;
}

/** A version is saved when editing starts again after a quiet spell this long. */
export const VERSION_GAP_MS = 10 * 60 * 1000;
/** A long stretch of editing still gets a version this often. */
export const LONG_SESSION_MS = 60 * 60 * 1000;
/** How many versions are kept online; older ones are dropped. */
export const KEEP_VERSIONS = 100;
/** How many are kept on this device alone: each is a whole copy of the board, and device storage is small. */
export const LOCAL_KEEP_VERSIONS = 20;

/**
 * Whether a change now should first save the board as it was. `lastSavedAt`: the newest version,
 * if any. `lastEditAt`: the previous edit made on this page (null: none since it opened).
 */
export function needsVersion(lastSavedAt: number | null, lastEditAt: number | null, now: number): boolean {
  if (lastSavedAt === null) return true;
  if (lastEditAt === null) return now - lastSavedAt >= VERSION_GAP_MS;
  return now - lastEditAt >= VERSION_GAP_MS || now - lastSavedAt >= LONG_SESSION_MS;
}

/** A version that couldn't be saved (offline, say) is tried again this long after. */
export const RETRY_MS = 60 * 1000;

/** A short fingerprint of a saved board: two FNV-1a passes from different starting points, plus the length. */
export function contentHash(data: string): string {
  const pass = (seed: number) => {
    let h = seed;
    for (let i = 0; i < data.length; i++) {
      h ^= data.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  };
  return `${pass(0x811c9dc5)}-${pass(0x050c5d1f)}-${data.length.toString(36)}`;
}

export function summarize(board: Board): { cards: number; columns: number } {
  return { cards: Object.keys(board.cards).length, columns: Object.keys(board.columns).length };
}

/** Cards and columns on every board, and how many boards (left out when there is just one). */
export function summarizeWorkspace(ws: Workspace): { cards: number; columns: number; boards?: number } {
  const all = Object.values(ws.boards).map(summarize);
  const sum = { cards: all.reduce((n, s) => n + s.cards, 0), columns: all.reduce((n, s) => n + s.columns, 0) };
  return all.length > 1 ? { ...sum, boards: all.length } : sum;
}

/** e.g. "2 boards · 12 cards · 3 columns". */
export function describeVersion(v: VersionMeta): string {
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const boards = v.boards && v.boards > 1 ? n(v.boards, 'board') : '';
  if (!v.cards && !v.columns) return boards || 'Empty board';
  return [boards, v.cards && n(v.cards, 'card'), v.columns && n(v.columns, 'column')].filter(Boolean).join(' · ');
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
