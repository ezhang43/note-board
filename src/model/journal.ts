import { dayLabel } from './calendar';
import { dayKey } from './completed';
import { BLOCK_GAP, CARD_W, GRID, NEW_BLOCK_H } from './constants';
import { spotForNewBlock, topLevelRects, type MeasuredHeight } from './layout';
import type { Board, Point } from './types';
import { boardTree, type Workspace } from './workspace';

// Daily journal (owner request, 2026-10-18): the Journal button opens a side panel that writes
// into the board called "Journal": one dated note a day, today's at the top.

/** The board the Journal button uses. */
export const JOURNAL_NAME = 'Journal';

/** Today's heading, in the calendar's style with the year: "Sun 18 Oct 2026" (local time). */
export function journalDateLine(now: Date): string {
  const key = dayKey(now);
  return `${dayLabel(key)} ${key.slice(0, 4)}`;
}

/**
 * The board named exactly "Journal" that is the person's own: the first in the Boards menu order,
 * skipping any board a share holds (`shared`: their ids). Null when there is none.
 */
export function findJournalBoard(ws: Workspace, shared: string[]): string | null {
  // simple: with several boards named Journal the first in the menu is used; they are not merged.
  return boardTree(ws).find(({ id }) => ws.boards[id].name === JOURNAL_NAME && !shared.includes(id))?.id ?? null;
}

/** The note on `board` whose first line is `dateLine`, with or without a title after it (today's note), or null. */
export function todaysNote(board: Board, dateLine: string): string | null {
  const first = (text: string) => text.split('\n')[0].trimEnd();
  const note = Object.values(board.cards).find((c) => c.kind === 'note' && (first(c.text) === dateLine || first(c.text).startsWith(`${dateLine} `)));
  return note?.id ?? null;
}

/**
 * Where today's note goes: straight above every other block, level with the leftmost, so the
 * newest sits on top and nothing moves. On an empty board, the middle of the screen (`centre`).
 */
export function journalSpot(board: Board, measured: MeasuredHeight, centre: Point): Point {
  const rects = topLevelRects(board, measured);
  if (!rects.length) return spotForNewBlock(board, CARD_W, NEW_BLOCK_H.note, centre, measured);
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  // Clear of the block below even after rounding to the grid.
  return spotForNewBlock(board, CARD_W, NEW_BLOCK_H.note, { x: left + CARD_W / 2, y: top - GRID - BLOCK_GAP - NEW_BLOCK_H.note / 2 }, measured);
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATE_LINE = new RegExp(`^(?:${DAYS.join('|')}) (\\d{1,2}) (${MONTHS.join('|')}) (\\d{4})(?: |$)`);

/** A note's first line, without trailing spaces or a Windows line end. */
const firstLine = (text: string) => text.split('\n')[0].trimEnd();

/** What is written under a note's date line (the date line and the blank line after it left out). */
export function journalBody(text: string): string {
  const i = text.indexOf('\n');
  if (i < 0) return '';
  const rest = text.slice(i + 1);
  return rest.startsWith('\n') ? rest.slice(1) : rest;
}

/** The note's text with `body` under its date line, keeping the date line and the gap after it as they are. */
export function withJournalBody(text: string, body: string): string {
  const i = text.indexOf('\n');
  if (i < 0) return `${text}\n\n${body}`;
  return text.slice(0, i + 1) + (text.slice(i + 1).startsWith('\n') ? '\n' : '') + body;
}

/** The dated notes on a Journal board, newest day first: each note's id, its date line and what is written under it. */
export function journalEntries(board: Board): { id: string; date: string; body: string }[] {
  const out: { id: string; date: string; body: string; day: number }[] = [];
  for (const c of Object.values(board.cards)) {
    const m = c.kind === 'note' ? DATE_LINE.exec(firstLine(c.text)) : null;
    if (c.kind !== 'note' || !m) continue;
    out.push({ id: c.id, date: firstLine(c.text), body: journalBody(c.text), day: Number(m[3]) * 10000 + MONTHS.indexOf(m[2]) * 100 + Number(m[1]) });
  }
  return out.sort((a, b) => b.day - a.day).map(({ id, date, body }) => ({ id, date, body }));
}

/**
 * The Journal board kept out of the Boards menu: the one the panel uses (see findJournalBoard),
 * when no card opens it and it holds only dated notes, so nothing on it is out of sight. A Journal
 * board with a card on Home (as the Journal button used to make) stays listed. Never the home board.
 */
export function hiddenJournal(ws: Workspace, shared: string[]): string | null {
  const id = findJournalBoard(ws, shared);
  if (!id || id === ws.home) return null;
  const board = ws.boards[id];
  if (Object.keys(board.columns).length || journalEntries(board).length !== Object.keys(board.cards).length) return null;
  const opened = Object.values(ws.boards).some((b) => Object.values(b.cards).some((c) => c.kind === 'board' && c.boardId === id));
  return opened ? null : id;
}
