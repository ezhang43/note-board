import type { DayKey } from '../model/calendar';
import { calendarDoneItems, vizWindow } from '../model/vizCalendar';
import type { DoneItem, VizRange } from '../model/visualizer';
import { CalendarApiError, paginateEvents, type CalendarSource } from './api';
import { calendarSource } from './source';

/** What the Visualizer gets when it asks for past and deleted calendar events (owner, 2026-11-13). */
export type VizCalendar =
  | { status: 'signed-out' } // no calendar here, or nobody signed in: show nothing about the calendar
  | { status: 'no-access' } // signed in, but no fresh access kept on this device: "Open Calendar once"
  | { status: 'ok'; items: DoneItem[] }
  | { status: 'error' }; // the fetch failed: the Visualizer shows a quiet line and no events

// One fetch per open and range, paged. The window never exceeds the chart's two years, so one page of 2500
// almost always covers it; a few pages are read at most, then it stops.
// Google lists oldest-first only (orderBy=startTime; there is no descending order), so a calendar too full for the
// cap would lose its NEWEST events, the recent days that matter most (owner, 2026-11-15: keep the newest). Then the
// window is read again in pieces, newest piece first, until the pages run out; a piece the pages cannot finish is
// left out whole, so what is kept is an unbroken run up to today and what goes is the oldest.
const VIZ_MAX_PAGES = 5;
const VIZ_PIECE_DAYS = 30;

/**
 * Past and deleted events on the person's primary calendar within `range`, using only access already kept on
 * this device (never opening Google's window). Off the animation path: the Visualizer calls this in an effect,
 * not while drawing. `uid` null means nobody is signed in, so there is no calendar at all.
 */
export async function fetchCalendarDone(
  uid: string | null,
  range: VizRange,
  today: DayKey,
  signal?: AbortSignal,
  fetchFn: typeof fetch = (url, init) => fetch(url, init),
  src: CalendarSource | null = calendarSource,
): Promise<VizCalendar> {
  if (!src || uid === null) return { status: 'signed-out' };
  const token = src.keptToken ? await src.keptToken() : null;
  if (!token) return { status: 'no-access' };
  const { timeMin, timeMax } = vizWindow(range, today);
  // Built as a string (not new URL): the dev server's base is a relative path, which new URL() would reject.
  const endpoint = `${src.base}/calendars/primary/events`;

  /** Reads [min, max) page by page, at most `budget` pages. `done` is false when Google still had more. */
  const read = async (min: string, max: string, budget: number): Promise<{ items: unknown[]; pages: number; done: boolean } | 'no-access' | 'error'> => {
    try {
      const { items, pages, hasMore } = await paginateEvents({
        fetchPage: async (q) => {
          const res = await fetchFn(`${endpoint}?${q}`, { headers: { Authorization: `Bearer ${token}` }, signal });
          if (!res.ok) throw new CalendarApiError(res.status);
          return (await res.json()) as { items?: unknown; nextPageToken?: unknown };
        },
        params: {
          timeMin: min,
          timeMax: max,
          singleEvents: 'true', // each past instance of a repeating event, once
          showDeleted: 'true', // include deleted (cancelled) events
          eventTypes: 'default', // not working-location / out-of-office / focus-time / birthday
          orderBy: 'startTime',
          maxResults: '2500',
        },
        maxPages: budget,
        mapItem: (raw) => raw,
      });
      return { items, pages, done: !hasMore };
    } catch (e) {
      if (e instanceof CalendarApiError) return e.status === 401 ? 'no-access' : 'error';
      throw e;
    }
  };

  let raw: unknown[];
  try {
    const whole = await read(timeMin, timeMax, VIZ_MAX_PAGES);
    if (typeof whole === 'string') return { status: whole };
    raw = whole.items;
    if (!whole.done) {
      // Too full for the cap: read it again newest piece first, so the oldest are what is left out. A piece's first page
      // is free (a quiet month must not use up the budget; there are at most about 25 pieces in two years); the rest share VIZ_MAX_PAGES.
      raw = [];
      let left = VIZ_MAX_PAGES;
      const oldest = Date.parse(timeMin);
      for (let to = Date.parse(timeMax); to > oldest; ) {
        const from = Math.max(oldest, to - VIZ_PIECE_DAYS * 86400000);
        const piece = await read(new Date(from).toISOString(), new Date(to).toISOString(), left + 1);
        if (typeof piece === 'string') return { status: piece };
        // A piece the pages cannot finish is left out whole, so nothing newer than what is kept is missing.
        // simple: unless nothing newer was found; then its first pages (its OLDEST days) are kept. Upgrade if 30 days can ever hold 12,500 events.
        if (!piece.done && raw.length) break;
        raw.push(...piece.items);
        left -= piece.pages - 1;
        to = from;
        if (!piece.done) break;
      }
    }
  } catch (e) {
    if (signal?.aborted) throw e; // a cancelled fetch is not a failure to show
    return { status: 'error' };
  }
  return { status: 'ok', items: calendarDoneItems(raw, range, today) };
}
