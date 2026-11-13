import { addDays, readWhen } from './calendar';
import { MAX_CHART_DAYS, rangeStart, type DoneItem, type VizRange } from './visualizer';

// Past and deleted Google Calendar events for the Visualizer (owner request, 2026-11-13: "can the
// visualizer also take into account calendar events that have passed or were deleted?"). Pure: it turns
// the raw events Google's Calendar API sends into DoneItem-like entries so the disc, counts and chart
// treat them like a ticked item. Events are NOT board data: nothing here is saved, undone, synced, exported
// or sent to Anthropic (the `event` flag keeps their titles out of Sort with AI; see aiCategories.aiEntry).
//
// Which events count (owner's answers):
// - On the person's primary calendar, within the Visualizer's range.
// - Passed: a confirmed event that has ENDED (its end is at or before now). Own events and accepted invites
//   count, all-day included; declined and no-reply invites are skipped (a no-reply invite is not "accepted",
//   so it is left out — the simple, faithful reading of "own events and invites they accepted").
// - Deleted: a cancelled event counts only if it was deleted AFTER it started (a delete before its start is a
//   cancellation, not a done thing). Google keeps a deleted event's title, times and `updated` on the
//   organizer's own calendar; `updated` is its last-modification time, which for a cancelled event is when it
//   was deleted (the Events: list reference ties deletion to that time: "entries deleted since this time will
//   always be included"). If a deleted event gives no usable title, start or deletion time (a cancelled
//   repeating instance can lack them), it is skipped rather than guessed.
// - Working-location, out-of-office, focus-time and birthday event types never count.

/** The sentinel board a calendar event belongs to: its own "Calendar" wedge By board, and By category it is sorted by its title's words. */
export const CAL_BOARD_ID = 'calendar';
export const CAL_BOARD_NAME = 'Calendar';
/** Events sort after every real board on the same day (board items first, then calendar events). */
export const CAL_RANK = Number.MAX_SAFE_INTEGER;

/** The fetch window for a range, ending at the end of today: timeMin bounds an event's end, timeMax its start (both exclusive, as Google defines them). */
export function vizWindow(range: VizRange, today: string): { timeMin: string; timeMax: string } {
  const firstDay = range === 'all' ? addDays(today, 1 - MAX_CHART_DAYS) : rangeStart(range, today) ?? addDays(today, 1 - MAX_CHART_DAYS);
  return { timeMin: midnight(firstDay), timeMax: midnight(addDays(today, 1)) };
}

/** Local midnight of a day key, as an RFC3339 (UTC) instant for Google. */
function midnight(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}

/** A parsed start/end as a moment in ms (all-day is local midnight; the all-day end is the day after the last). */
function whenMs(w: { allDay: boolean; at: string }): number {
  if (w.allDay) {
    const [y, m, d] = w.at.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  return new Date(w.at).getTime();
}

/** The local day a when is on (all-day keeps its date; timed takes the date part). */
const dayOf = (w: { allDay: boolean; at: string }) => (w.allDay ? w.at : w.at.slice(0, 10));

/** Whether the person counts as having done this event: own events and accepted invites, never a declined or no-reply invite. */
function attends(e: Record<string, unknown>): boolean {
  const attendees = Array.isArray(e.attendees) ? e.attendees : [];
  const me = attendees.find((a): a is Record<string, unknown> => typeof a === 'object' && a !== null && (a as { self?: unknown }).self === true);
  if (me?.responseStatus === 'declined') return false;
  const organizer = e.organizer as { self?: unknown } | undefined;
  if (!organizer || organizer.self === true) return true; // the person's own event
  return me?.responseStatus === 'accepted'; // someone else's: only if they accepted
}

interface Parsed {
  id: string;
  text: string;
  date: string;
  start: number;
}

/** One raw Google event to a parsed entry, or null to leave it out. */
function parse(raw: unknown, range: VizRange, today: string, now: number): Parsed | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== 'string' || !e.id) return null;
  // Only regular events (default), never working-location / out-of-office / focus-time / birthday.
  if (typeof e.eventType === 'string' && e.eventType !== 'default') return null;
  if (!attends(e)) return null;

  const start = readWhen(e.start) ?? readWhen(e.originalStartTime);
  const end = readWhen(e.end);
  if (!start) return null; // no usable time
  const summary = typeof e.summary === 'string' ? e.summary.trim() : '';
  const day = end ? endDay(end) : dayOf(start);

  if (e.status === 'cancelled') {
    // Deleted: needs a title and a deletion time, and must have been deleted after it started.
    const updated = typeof e.updated === 'string' ? Date.parse(e.updated) : NaN;
    if (!summary || !Number.isFinite(updated)) return null; // no usable title or deletion time: do not guess
    if (updated < whenMs(start)) return null; // deleted before it started: a cancellation, not a done thing
  } else {
    // Passed: a confirmed event counts once it has ended.
    if (!end || whenMs(end) > now) return null;
  }

  const from = rangeStart(range, today);
  if (day > today || (from !== null && day < from)) return null;
  return { id: `${CAL_BOARD_ID}:${e.id}`, text: summary, date: day, start: whenMs(start) };
}

/** An all-day event's last day is the day before Google's exclusive end; a timed event's is its end's day. */
const endDay = (end: { allDay: boolean; at: string }) => (end.allDay ? addDays(end.at, -1) : end.at.slice(0, 10));

/** The raw events Google sent, as DoneItem entries within `range` (ending on `today`), oldest first, ranked after board items. */
export function calendarDoneItems(raw: unknown[], range: VizRange, today: string, now = Date.now()): DoneItem[] {
  const seen = new Map<string, Parsed>();
  for (const e of raw) {
    const p = parse(e, range, today, now);
    if (p) seen.set(p.id, p);
  }
  return [...seen.values()]
    .sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1))
    .map((p, order): DoneItem => ({ id: p.id, text: p.text, boardId: CAL_BOARD_ID, boardName: CAL_BOARD_NAME, list: '', date: p.date, boardRank: CAL_RANK, order, event: true }));
}
