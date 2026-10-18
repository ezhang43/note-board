import { dayLabel } from './calendar';
import { dayKey } from './completed';
import { BLOCK_GAP, CARD_W, GRID, NEW_BLOCK_H } from './constants';
import { spotForNewBlock, topLevelRects, type MeasuredHeight } from './layout';
import type { Board, Point } from './types';
import { boardTree, type Workspace } from './workspace';

// Daily journal (owner request, 2026-10-18): the Journal button opens the board called "Journal"
// and adds today's dated note at the top of it, or goes back to it.

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
