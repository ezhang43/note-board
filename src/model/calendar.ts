// Google Calendar side panel (owner request, 2026-10-06): the pure part. Days are 'YYYY-MM-DD' keys
// in the person's own time zone, times 'HH:MM' on the 24-hour clock; weeks start on Monday.
// Calendar events aren't board data: they are never undone, synced with boards or kept in versions.

export type DayKey = string;
export type CalView = 'week' | 'month';

/** One event of the person's primary calendar, as the panel shows it. */
export interface CalEvent {
  id: string;
  title: string;
  allDay: boolean;
  /** All-day: the first day. Timed: local 'YYYY-MM-DDTHH:MM'. */
  start: string;
  /** All-day: the day after the last (as Google keeps it). Timed: local 'YYYY-MM-DDTHH:MM'. */
  end: string;
  /** Simple events only: not repeating, no guests, no reminders of its own, the person's own. */
  editable: boolean;
  /** Where to open it in Google Calendar. */
  link: string;
}

/** What the add / change form holds. Dates are 'YYYY-MM-DD', times 'HH:MM'; an all-day event's end is its last day. */
export interface Draft {
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

/** What is sent to Google to add or change an event. */
export interface EventBody {
  summary: string;
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CALENDAR_HOME = 'https://calendar.google.com/';

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The day as a date at noon, in UTC, so adding days never trips over a clock change. */
function toDate(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
const fromDate = (d: Date): DayKey => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function addDays(key: DayKey, n: number): DayKey {
  const d = toDate(key);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDate(d);
}

export function addMonths(key: DayKey, n: number): DayKey {
  const [y, m, d] = key.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return fromDate(first);
}

const weekStart = (key: DayKey) => addDays(key, -((toDate(key).getUTCDay() + 6) % 7));

export function weekDays(key: DayKey): DayKey[] {
  const monday = weekStart(key);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Whole weeks (Monday to Sunday) covering every day of the month `key` is in. */
export function monthGrid(key: DayKey): DayKey[][] {
  const first = `${key.slice(0, 7)}-01`;
  const next = addMonths(first, 1);
  const weeks: DayKey[][] = [];
  for (let monday = weekStart(first); monday < next; monday = addDays(monday, 7)) weeks.push(weekDays(monday));
  return weeks;
}

/** The days shown, `to` not included. */
export function viewRange(view: CalView, key: DayKey): { from: DayKey; to: DayKey } {
  if (view === 'week') {
    const from = weekStart(key);
    return { from, to: addDays(from, 7) };
  }
  const grid = monthGrid(key);
  return { from: grid[0][0], to: addDays(grid[grid.length - 1][6], 1) };
}

export function moveView(view: CalView, key: DayKey, step: number): DayKey {
  return view === 'week' ? addDays(key, 7 * step) : addMonths(key, step);
}

/** "Tue 6 Oct" */
export function dayLabel(key: DayKey): string {
  const d = toDate(key);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "5 – 11 Oct 2026", "28 Sep – 4 Oct 2026", "October 2026" */
export function rangeLabel(view: CalView, key: DayKey): string {
  const d = toDate(key);
  if (view === 'month') return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const days = weekDays(key);
  const [a, b] = [toDate(days[0]), toDate(days[6])];
  const end = `${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()} – ${end}`;
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${end}`;
  return `${a.getUTCDate()} – ${end}`;
}

const isDay = (s: unknown): s is DayKey => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromDate(toDate(s)) === s;
const isTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** A Google `start` / `end`: a day for all-day events, else a local 'YYYY-MM-DDTHH:MM'. */
function readWhen(w: unknown): { allDay: boolean; at: string } | null {
  if (typeof w !== 'object' || w === null) return null;
  const { date, dateTime } = w as { date?: unknown; dateTime?: unknown };
  if (isDay(date)) return { allDay: true, at: date };
  if (typeof dateTime !== 'string') return null;
  const t = new Date(dateTime);
  if (Number.isNaN(t.getTime())) return null;
  return { allDay: false, at: `${dayKey(t)}T${pad(t.getHours())}:${pad(t.getMinutes())}` };
}

/** Only links into Google Calendar are opened from the panel. */
export function safeLink(url: unknown): string {
  if (typeof url !== 'string') return CALENDAR_HOME;
  try {
    const u = new URL(url);
    const ok = u.protocol === 'https:' && (u.hostname === 'calendar.google.com' || (u.hostname === 'www.google.com' && u.pathname.startsWith('/calendar')));
    return ok ? u.href : CALENDAR_HOME;
  } catch {
    return CALENDAR_HOME;
  }
}

/**
 * An event as Google's Calendar API sends it, checked (it comes from outside), or null to leave it
 * out. Only simple events can be changed here; the rest open in Google Calendar.
 */
export function parseEvent(raw: unknown): CalEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== 'string' || !e.id || e.status === 'cancelled') return null;
  const start = readWhen(e.start);
  const end = readWhen(e.end);
  if (!start || !end || start.allDay !== end.allDay) return null;
  const list = (x: unknown) => (Array.isArray(x) ? x.length : 0);
  const reminders = e.reminders as { overrides?: unknown } | undefined;
  const organizer = e.organizer as { self?: unknown } | undefined;
  const editable =
    !e.recurringEventId &&
    !list(e.recurrence) &&
    !list(e.attendees) &&
    !list(reminders?.overrides) &&
    (!organizer || organizer.self === true) &&
    (e.eventType === undefined || e.eventType === 'default');
  return {
    id: e.id,
    title: typeof e.summary === 'string' && e.summary.trim() ? e.summary : '(No title)',
    allDay: start.allDay,
    start: start.at,
    end: end.at,
    editable,
    link: safeLink(e.htmlLink),
  };
}

/** The events on a day (also those running over into it): all-day first, then by start time. */
export function eventsOnDay(events: CalEvent[], key: DayKey): CalEvent[] {
  const next = addDays(key, 1);
  return events
    .filter((e) => (e.allDay ? e.start <= key && key < e.end : e.start < `${next}T00:00` && e.end > `${key}T00:00`))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
}

/** "10:00 – 11:00", or "All day". */
export function timeLabel(e: CalEvent): string {
  return e.allDay ? 'All day' : `${e.start.slice(11)} – ${e.end.slice(11)}`;
}

/** A new event: an hour from 9:00 on the chosen day. */
export function newDraft(key: DayKey): Draft {
  return { title: '', allDay: false, startDate: key, startTime: '09:00', endDate: key, endTime: '10:00' };
}

export function draftFor(e: CalEvent): Draft {
  if (e.allDay) return { title: e.title, allDay: true, startDate: e.start, startTime: '09:00', endDate: addDays(e.end, -1), endTime: '10:00' };
  return { title: e.title, allDay: false, startDate: e.start.slice(0, 10), startTime: e.start.slice(11), endDate: e.end.slice(0, 10), endTime: e.end.slice(11) };
}

/** A new start day moves the end day by as much, so the event keeps its length. */
export function moveDraftStart(d: Draft, startDate: string): Draft {
  if (!isDay(startDate)) return d;
  if (!isDay(d.startDate) || !isDay(d.endDate)) return { ...d, startDate };
  const shift = Math.round((toDate(startDate).getTime() - toDate(d.startDate).getTime()) / 86_400_000);
  return { ...d, startDate, endDate: addDays(d.endDate, shift) };
}

/** What Google takes for a draft, or null when its dates don't make sense (end not after start). */
export function draftBody(d: Draft, timeZone: string): EventBody | null {
  const summary = d.title.trim();
  if (!isDay(d.startDate) || !isDay(d.endDate)) return null;
  if (d.allDay) {
    if (d.endDate < d.startDate) return null;
    return { summary, start: { date: d.startDate }, end: { date: addDays(d.endDate, 1) } };
  }
  if (!isTime(d.startTime) || !isTime(d.endTime)) return null;
  const start = `${d.startDate}T${d.startTime}:00`;
  const end = `${d.endDate}T${d.endTime}:00`;
  if (end <= start) return null;
  return { summary, start: { dateTime: start, timeZone }, end: { dateTime: end, timeZone } };
}
