/**
 * One counter shared by the board's undo history and the calendar's (owner request 2026-11-17, job calendar-hotkeys):
 * every new step, every undo and every redo takes the next number, so while the calendar panel is open Ctrl+Z and
 * Ctrl+Y can tell whose step is newer. Kept in memory only, like both histories.
 */
let n = 0;
export const tick = () => ++n;

/** The board's marks (0: none): its newest undo step, its newest redo step, and its last new change (not an undo or redo). */
export interface BoardMarks {
  undo: number;
  redo: number;
  changed: number;
}

/** The calendar's marks (0: none): its newest undo step and its newest redo step. */
export interface CalendarMarks {
  undo: number;
  redo: number;
}

/**
 * Whether Ctrl+Z (`undo`) or Ctrl+Y (`redo`) steps the calendar rather than the board: the newer one wins. A calendar
 * redo also waits for no board change since it was undone, so an old one is never sent to Google out of the blue.
 */
export function calendarFirst(which: 'undo' | 'redo', board: BoardMarks, cal: CalendarMarks): boolean {
  if (which === 'undo') return cal.undo > board.undo;
  return cal.redo > board.redo && cal.redo > board.changed;
}
