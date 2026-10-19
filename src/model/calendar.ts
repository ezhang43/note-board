// Google Calendar side panel (owner request, 2026-10-06): the pure part. Days are 'YYYY-MM-DD' keys
// in the person's own time zone, times 'HH:MM' on the 24-hour clock. The week view is seven days
// from the day it starts on (today when it opens); the month grid's weeks start on Monday.
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
  /** The person's own events, without reminders of their own and not one of Google's special kinds. */
  editable: boolean;
  /** Where to open it in Google Calendar. */
  link: string;
  /** One event of a repeating series: the series' id (job #85). */
  series: string | null;
  /** Its guests as Google gave them (checked), the person themself included, marked `self`. */
  guests: Guest[];
  /** Timed: the time zone Google keeps it in (a series repeats in it), when Google says. */
  timeZone: string | null;
  /** One event of a series whose start was changed on its own (it isn't where the series put it). */
  moved: boolean;
}

/** A guest of an event: the fields of Google's attendee kept, so an unchanged guest is sent back as it was. */
export type Guest = { email: string; self?: boolean } & Record<string, string | number | boolean>;

/** No calendar access: Google's window was blocked or closed, or access wasn't given. */
export class NoAccess extends Error {
  constructor(readonly reason: 'window' | 'refused') {
    super(reason === 'window' ? 'Google window blocked or closed' : 'Calendar access not given');
  }
}

/** What the add / change form holds. Dates are 'YYYY-MM-DD', times 'HH:MM'; an all-day event's end is its last day. */
export interface Draft {
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  /** The other guests' email addresses (not the person themself). */
  guests: string[];
}

/** What is sent to Google to add or change an event. */
export interface EventBody {
  summary: string;
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
  /** Only when the guest list changed (or a new event has guests). */
  attendees?: Guest[];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CALENDAR_HOME = 'https://calendar.google.com/';
const UNTITLED = '(No title)';

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

/** Seven days from `key`: the week view (today and the next six when it opens), or a row of the month grid. */
export function weekDays(key: DayKey): DayKey[] {
  return Array.from({ length: 7 }, (_, i) => addDays(key, i));
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
  if (view === 'week') return { from: key, to: addDays(key, 7) };
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

/** "Thu 15 – Wed 21 Oct 2026", "Wed 30 Sep – Tue 6 Oct 2026", "October 2026" */
export function rangeLabel(view: CalView, key: DayKey): string {
  const a = toDate(key);
  if (view === 'month') return `${MONTH_NAMES[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
  const last = addDays(key, 6);
  const b = toDate(last);
  const end = `${dayLabel(last)} ${b.getUTCFullYear()}`;
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${dayLabel(key)} ${a.getUTCFullYear()} – ${end}`;
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${dayLabel(key)} – ${end}`;
  return `${DAYS[a.getUTCDay()]} ${a.getUTCDate()} – ${end}`;
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
 * out. Only the person's own events can be changed here; the rest open in Google Calendar.
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
  // Repeating events and guests can be changed (job #85); a guest list Google cut short can't be
  // changed safely (the guests left out would be dropped), and a series itself is never listed.
  const editable =
    !list(e.recurrence) &&
    e.attendeesOmitted !== true &&
    !list(reminders?.overrides) &&
    (!organizer || organizer.self === true) &&
    (e.eventType === undefined || e.eventType === 'default');
  // Where the series put it (one event of a series): a different start means it was moved on its own.
  const first = readWhen(e.originalStartTime);
  return {
    id: e.id,
    title: typeof e.summary === 'string' && e.summary.trim() ? e.summary : UNTITLED,
    allDay: start.allDay,
    start: start.at,
    end: end.at,
    editable,
    link: safeLink(e.htmlLink),
    series: typeof e.recurringEventId === 'string' && e.recurringEventId ? e.recurringEventId : null,
    guests: Array.isArray(e.attendees) ? e.attendees.map(readGuest).filter((g): g is Guest => g !== null) : [],
    timeZone: start.allDay ? null : zoneOf(e.start),
    moved: first !== null && first.at !== start.at,
  };
}

const zoneOf = (w: unknown) => {
  const zone = (w as { timeZone?: unknown }).timeZone;
  return typeof zone === 'string' && zone ? zone : null;
};

/** A Google attendee with an email address, keeping only its plain fields (it comes from outside). */
function readGuest(raw: unknown): Guest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const g = raw as Record<string, unknown>;
  if (typeof g.email !== 'string' || !g.email) return null;
  const plain = Object.entries(g).filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean');
  return Object.fromEntries(plain) as Guest;
}

/** The events on a day (also those running over into it): all-day first, then by start time. */
export function eventsOnDay(events: CalEvent[], key: DayKey): CalEvent[] {
  const next = addDays(key, 1);
  return events
    .filter((e) => (e.allDay ? e.start <= key && key < e.end : e.start < `${next}T00:00` && e.end > `${key}T00:00`))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
}

/** A day in the month grid shows up to `max` lines; when more events than that, the last line says "+n more". */
export function cellLines(events: CalEvent[], max: number): { shown: CalEvent[]; more: number } {
  if (events.length <= max) return { shown: events, more: 0 };
  return { shown: events.slice(0, max - 1), more: events.length - (max - 1) };
}

/** "10:00" on the day a timed event starts; nothing on the days it runs over into, or for all-day events. */
export function cellTime(e: CalEvent, key: DayKey): string {
  return !e.allDay && e.start.startsWith(key) ? e.start.slice(11) : '';
}

/** "10:00 – 11:00", or "All day". */
export function timeLabel(e: CalEvent): string {
  return e.allDay ? 'All day' : `${e.start.slice(11)} – ${e.end.slice(11)}`;
}

/** A new event: an hour from 9:00 on the chosen day. */
export function newDraft(key: DayKey): Draft {
  return { title: '', allDay: false, startDate: key, startTime: '09:00', endDate: key, endTime: '10:00', guests: [] };
}

export function draftFor(e: CalEvent): Draft {
  const guests = others(e);
  // The "(No title)" shown for an untitled event is the form's placeholder, never sent as its name.
  const title = e.title === UNTITLED ? '' : e.title;
  if (e.allDay) return { title, allDay: true, startDate: e.start, startTime: '09:00', endDate: addDays(e.end, -1), endTime: '10:00', guests };
  return { title, allDay: false, startDate: e.start.slice(0, 10), startTime: e.start.slice(11), endDate: e.end.slice(0, 10), endTime: e.end.slice(11), guests };
}

// Guests (job #85): the person's own events can have guests added (by email address) and removed.

/** Looks like an email address: something@something.something, no spaces or list characters. */
export function isEmail(s: string): boolean {
  return s.length <= 254 && /^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[^\s@<>(),;:"[\]]+$/.test(s);
}

/** The event's guests other than the person themself. */
const others = (e: CalEvent | null) => (e?.guests ?? []).filter((g) => !g.self).map((g) => g.email);
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x.toLowerCase() === b[i].toLowerCase());

/** Whether to ask "Send update emails to guests?": the event has guests, or will have after the change. */
export function emailGuests(e: CalEvent | null, d: Draft | null): boolean {
  return others(e).length > 0 || (d?.guests.length ?? 0) > 0;
}

/** The form's guests with `email` added, unless it is there already or is the person's own address. */
export function withGuest(e: CalEvent | null, guests: string[], email: string): string[] {
  const known = [...guests, ...(e?.guests ?? []).filter((g) => g.self).map((g) => g.email)];
  return known.some((g) => g.toLowerCase() === email.toLowerCase()) ? guests : [...guests, email];
}

/**
 * The guest list to send when it changed, else null (nothing about guests is sent). The person
 * and the guests already there are sent back as Google gave them, so their answers stay. For the
 * whole series, `onto` is the series: only the guests added or removed here change its own list.
 */
export function guestChanges(e: CalEvent | null, d: Draft, onto: CalEvent | null = e): Guest[] | null {
  const had = others(e);
  if (same(had, d.guests)) return null;
  const has = (list: string[], email: string) => list.some((x) => x.toLowerCase() === email.toLowerCase());
  const kept = (onto?.guests ?? []).filter((g) => g.self || has(d.guests, g.email) || !has(had, g.email));
  const added = d.guests.filter((email) => !has(had, email) && !has(kept.map((g) => g.email), email));
  return [...kept, ...added.map((email) => ({ email }))];
}

/**
 * "All events in the series" (job #85): what the person changed in the form (`d` against `was`,
 * this event as it opened) put on the series, on its own first day; the rest stays as the series
 * has it, so a time or title this one event was given on its own doesn't spread to the whole series
 * (finding 1, 2026-10-17). The guests are worked out apart (guestChanges).
 */
export function seriesDraft(d: Draft, was: Draft, series: Draft): Draft {
  // Start and length in minutes from the start day (an all-day draft's times are fixed, so unchanged).
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const length = (x: Draft) => Math.round((toDate(x.endDate).getTime() - toDate(x.startDate).getTime()) / 60_000) + mins(x.endTime) - mins(x.startTime);
  const start = d.startTime !== was.startTime ? d.startTime : series.startTime;
  const end = mins(start) + (d.startTime !== was.startTime || length(d) !== length(was) ? length(d) : length(series));
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    ...series,
    title: d.title.trim() !== was.title.trim() ? d.title : series.title,
    startTime: start,
    endTime: `${pad(Math.floor((end % 1440) / 60))}:${pad(end % 60)}`,
    endDate: addDays(series.startDate, Math.floor(end / 1440)),
    guests: d.guests,
  };
}

/**
 * "All events" from an event that was changed on its own (finding 2, 2026-10-17): the series'
 * change may not reach it (Google can keep its own title), so the title and guests changed in the
 * form go on it too. Only when it was moved or differs from the series on its day; its own time stays. Null: nothing to send.
 */
export function exceptionChange(e: CalEvent, d: Draft, series: CalEvent): Partial<EventBody> | null {
  const was = draftFor(e);
  const usual = moveDraftStart(draftFor(series), was.startDate);
  const own = e.moved || (['title', 'startTime', 'endTime', 'endDate'] as const).some((k) => usual[k] !== was[k]) || !same(usual.guests, was.guests);
  if (!own) return null;
  const attendees = guestChanges(e, d);
  const change = { ...(d.title.trim() !== was.title.trim() && { summary: d.title.trim() }), ...(attendees && { attendees }) };
  return Object.keys(change).length ? change : null;
}

/**
 * Whether "All events in the series" can be offered: a repeating event still on its own day and
 * still timed (or still all-day), since moving every event, or making them all-day, would change
 * the repeat rule.
 */
export function canChangeSeries(e: CalEvent | null, d: Draft): boolean {
  if (!e?.series) return false;
  const was = draftFor(e);
  return d.startDate === was.startDate && d.allDay === was.allDay;
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

// The calendar access (Google's token, about an hour) is kept for this tab only, in sessionStorage,
// so a reload within the hour doesn't ask Google again (owner choice, 2026-10-19). The storage is
// passed as a getter, since even reaching it can throw where the browser blocks it.
export const ACCESS_KEY = 'note-board:calendar-access';
export interface Access {
  token: string;
  /** When it runs out, in ms since 1970. */
  expiresAt: number;
  /** Who it belongs to: the signed-in person's account id. */
  user: string;
}
type TabStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function keepAccess(storage: () => TabStorage | null, access: Access) {
  try {
    storage()?.setItem(ACCESS_KEY, JSON.stringify(access));
  } catch {
    // Blocked or full: the access is still kept in memory until the page is closed.
  }
}

export function dropAccess(storage: () => TabStorage | null) {
  try {
    storage()?.removeItem(ACCESS_KEY);
  } catch {
    // Blocked: nothing was kept.
  }
}

/** The kept access if it is this person's with over a minute left; anything else is dropped. */
export function readAccess(storage: () => TabStorage | null, user: string | null, now = Date.now()): Access | null {
  type Raw = { token?: unknown; expiresAt?: unknown; user?: unknown };
  let a: Raw | null = null;
  try {
    a = JSON.parse(storage()?.getItem(ACCESS_KEY) ?? 'null') as Raw | null;
  } catch {
    // Blocked or damaged: Google is asked as usual.
  }
  const { token, expiresAt, user: owner }: Raw = a && typeof a === 'object' ? a : {};
  if (typeof token === 'string' && token !== '' && typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt > now + 60_000 && user !== null && owner === user) return { token, expiresAt, user };
  dropAccess(storage);
  return null;
}

// The panel's width (owner request, 2026-10-16): kept on this device for each view, so Week and Month
// can differ. Not board data. The window width is passed in, so this stays free of the DOM.
export const PANEL_MIN = 300;
export const PANEL_DEFAULT: Record<CalView, number> = { week: 420, month: 720 };
export const PANEL_STEP = 20;
export type PanelWidths = Record<CalView, number>;

/** A width between 300px and the window width minus 300px (so 300px of board stays visible). */
export function clampPanelWidth(width: number, windowWidth: number): number {
  return Math.max(PANEL_MIN, Math.min(Math.round(width), windowWidth - PANEL_MIN));
}

/** The remembered widths; anything missing or bad (not a number from 300 to 4000) is the default. */
export function parsePanelWidths(raw: string | null): PanelWidths {
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // simple: a damaged value is ignored; the defaults are used.
  }
  const read = (view: CalView) => {
    const v = data && typeof data === 'object' ? (data as Record<string, unknown>)[view] : undefined;
    return typeof v === 'number' && v >= PANEL_MIN && v <= 4000 ? Math.round(v) : PANEL_DEFAULT[view];
  };
  return { week: read('week'), month: read('month') };
}
