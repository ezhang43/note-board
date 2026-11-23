import { dayKey, NoAccess, parseEvent, type CalEvent, type DayKey, type EventBody } from '../model/calendar';

export const NOT_CONNECTED = 'Google Calendar isn’t connected yet. Try again later.';
/** Without access yet (`needsAccess`), the panel offers Connect Google Calendar instead of Try again. */
export const NO_WINDOW = 'Google’s window didn’t open or was closed. Click Connect Google Calendar to try again.';
export const NOT_GIVEN = 'Calendar access wasn’t given. Click Connect Google Calendar to allow it.';
/** With the calendar helper (owner decision 2026-11-20): another Google account was picked in Google's window than the one signed in. */
export const WRONG_ACCOUNT = 'That was a different Google account. Click Connect Google Calendar and pick the one you signed in with.';
/** With the helper: Google gave no lasting access (an earlier hourly one), which was taken back so the next window gives one. */
export const ONE_MORE_STEP = 'One more step: click Connect Google Calendar to stay connected.';
/** After Disconnect calendar. */
export const DISCONNECTED = 'Google Calendar is disconnected. Click Connect Google Calendar to connect it again.';

/** What the panel says when there is no access, by why (`NoAccess.reason`); anything else can't reach Google. */
export function accessNote(e: unknown): { note: string; needsAccess: boolean } {
  if (!(e instanceof NoAccess)) return { note: NOT_CONNECTED, needsAccess: false };
  const notes = { window: NO_WINDOW, refused: NOT_GIVEN, account: WRONG_ACCOUNT, again: ONE_MORE_STEP, disconnected: DISCONNECTED };
  return { note: notes[e.reason], needsAccess: true };
}

/**
 * Google answered a call with this HTTP status (not 2xx); the message names it, as before. `reason` is the first
 * reason in Google's JSON answer (`error.errors[].reason`, such as "rateLimitExceeded"), if it gave one.
 */
export class CalendarApiError extends Error {
  constructor(readonly status: number, readonly reason?: string) {
    super(`Calendar API: ${status}`);
  }
}

export const SERIES_FAILED = 'Only this event changed: the rest of the series didn’t reach Google Calendar. Try again later.';
export const UNDO_PART = 'Only the series was put back: this event’s own change didn’t reach Google Calendar.';

/**
 * Whether a Ctrl+Z or Ctrl+Y that failed is kept to try again (owner decision 2026-11-17, "Keep step, retry"): yes when
 * it didn't get through (fetch threw, offline, a timeout, no access, a 5xx, or a 401 / 408 / 429, which a new token or a
 * wait can fix); no when Google says it can't be done (any other 4xx, such as 400, 403, 404 or 410), or when a series was
 * only half put back (UNDO_PART, SERIES_FAILED), as Google is left mixed.
 */
export function canRetry(err: unknown): boolean {
  if (err instanceof Error && (err.message === UNDO_PART || err.message === SERIES_FAILED)) return false;
  if (!(err instanceof CalendarApiError)) return true;
  // Google sends some rate limits as a 403 with one of these reasons, to be handled like a 429 (the Calendar API's
  // error guide; owner decision 2026-11-17). Its other 403s ("forbiddenForNonOrganizer", "quotaExceeded"...) are refusals.
  if (err.status === 403 && (err.reason === 'rateLimitExceeded' || err.reason === 'userRateLimitExceeded')) return true;
  return err.status < 400 || err.status >= 500 || [401, 408, 429].includes(err.status);
}

/** The first reason in Google's error answer (`{ error: { errors: [{ reason }] } }`); none for anything else, such as a page that isn't JSON. */
async function errorReason(res: Response): Promise<string | undefined> {
  const body: unknown = await res.json().catch(() => null);
  const errors = (body as { error?: { errors?: unknown } } | null)?.error?.errors;
  if (!Array.isArray(errors)) return undefined;
  const reason = errors.map((e) => (e as { reason?: unknown } | null)?.reason).find((r) => typeof r === 'string');
  return reason as string | undefined;
}

/** Where the calendar is and how to get a token for it (kept in memory and on this device until it runs out, job 107). */
export interface CalendarSource {
  base: string;
  token(): Promise<string>;
  /** The token was refused: get a new one next time. */
  forget(): void;
  /** Gets ready before the panel opens, so the click can ask for access with no wait. */
  prepare?(): void;
  /** The token already kept on this device (over a minute left), or null — never opening Google's window (the Visualizer, owner 2026-11-13). */
  keptToken?(): Promise<string | null>;
  /** Who is signed in now (their uid), or null: what is kept in memory belongs to one person (owner request, 2026-11-20). */
  person?(): string | null | undefined;
  /** Only with the calendar helper (owner decision 2026-11-20): revokes and forgets the lasting connection. */
  disconnect?(): Promise<void>;
}

/** One event with its plain searchable text fields (summary, description, location, guest emails & names) for partial matching. */
export interface SearchItem {
  event: CalEvent;
  fields: string[];
}

/** `notify`: email the guests (sendUpdates=all) or not (none); left out when there are no guests. */
export interface CalendarApi {
  list(from: DayKey, to: DayKey): Promise<CalEvent[]>;
  /**
   * Many weeks in one request (owner request, 2026-11-20): pages followed, at most WIDE_PAGES of 250. `covered` is the day
   * up to which (not included) every event is in `events`: `to` when Google had no more, else the day of the last one found.
   */
  listWide(from: DayKey, to: DayKey): Promise<{ events: CalEvent[]; covered: DayKey }>;
  /** Who the calendar belongs to now (the signed-in person's uid), or null; the store forgets what it kept when this changes. */
  person?(): string | null | undefined;
  /** Disconnect calendar, when the source has it (the calendar helper). */
  disconnect?(): Promise<void>;
  /** Google's own search of the whole primary calendar, past and future (owner request, 2026-11-19); `today` splits the two. Only reads. */
  search(text: string, today: DayKey): Promise<CalEvent[]>;
  /** Reads events across a broad window without `q` so partial-word matches still work when Google's whole-word `q` misses them (owner request, 2026-11-23). */
  listForSearch?(today: DayKey): Promise<SearchItem[]>;
  /** One event: a repeating event's series, to find its first day. */
  get(id: string): Promise<CalEvent | null>;
  /** Resolves to the new event's id (null if Google gave none). */
  create(body: EventBody, notify?: boolean): Promise<string | null>;
  /** Without a start and end (an event changed on its own getting a new title), its time stays. */
  update(id: string, body: Partial<EventBody>, notify?: boolean): Promise<void>;
  /** Resolves to false when it was already gone (deleted in Google Calendar, say). */
  remove(id: string, notify?: boolean): Promise<boolean>;
  /**
   * Brings a deleted event (or one event of a series, or a whole series) back, never emailing guests:
   * Google keeps a deleted event's details on its organizer's calendar "so that they can be restored
   * (undeleted)" (the Events reference, `status`), by setting its status back to confirmed (job 217).
   */
  restore(id: string): Promise<void>;
}

// Search looks this far back and forward from today (a call of the build, 2026-11-19), at most this many events each way.
const SEARCH_YEARS = 5;
/** The most pages a wide fetch follows (250 events each). */
export const WIDE_PAGES = 4;
/** Maximum upcoming and maximum past events kept by search. */
export const SEARCH_CAP = 125;
// simple: a year with more than SEARCH_PAGES pages of 250 matches loses its newest ones; upgrade if a search ever matches that often.
const SEARCH_PAGES = 4;
// Partial-match index (owner request, 2026-11-23; widened to 5 years + preloaded on openSearch for instant results):
// reads SEARCH_YEARS forward and SEARCH_YEARS past years a year at a time without `q` (`maxResults=2500`, up to
// PARTIAL_PAGES pages per window) and keeps it in memory for the session.
// simple: a single window exceeding PARTIAL_PAGES * 2500 events loses its newest entries; upgrade if a calendar ever has >5,000 events in one year.
const PARTIAL_YEARS = SEARCH_YEARS;
const PARTIAL_PAGES = 2;

export interface PaginateOptions<T> {
  /** Fetches one page given its query params (already including `pageToken` when paging). */
  fetchPage: (params: URLSearchParams) => Promise<{ items?: unknown; nextPageToken?: unknown }>;
  /** Base query parameters (without `pageToken`); copied per page. */
  params: Record<string, string>;
  /** Maximum number of pages to read. */
  maxPages: number;
  /** Maps each raw item from `body.items`; return `null` to skip an item. */
  mapItem: (raw: unknown) => T | null;
}

export interface PaginateResult<T> {
  items: T[];
  /** Number of pages fetched (0..maxPages). */
  pages: number;
  /** True when the last fetched page still returned a non-empty `nextPageToken`. */
  hasMore: boolean;
}

/** Shared Calendar API pagination loop: follows `nextPageToken` up to `maxPages`, mapping and collecting non-null items. */
export async function paginateEvents<T>({ fetchPage, params, maxPages, mapItem }: PaginateOptions<T>): Promise<PaginateResult<T>> {
  const items: T[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  let hasMore = false;
  for (let n = 0; n < maxPages; n++) {
    pages = n + 1;
    const q = new URLSearchParams(params);
    if (pageToken) q.set('pageToken', pageToken);
    const body = await fetchPage(q);
    if (Array.isArray(body.items)) {
      for (const raw of body.items) {
        const item = mapItem(raw);
        if (item !== null) items.push(item);
      }
    }
    const next = typeof body.nextPageToken === 'string' && body.nextPageToken !== '' ? body.nextPageToken : undefined;
    hasMore = next !== undefined;
    if (!next) break;
    pageToken = next;
  }
  return { items, pages, hasMore };
}

/** Searchable text fields of a raw Google event (outside data, checked): title, description, location, guest emails & display names. */
function searchFields(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const e = raw as Record<string, unknown>;
  const attendees = Array.isArray(e.attendees) ? e.attendees : [];
  const out: string[] = [];
  for (const v of [e.summary, e.description, e.location]) {
    if (typeof v === 'string' && v.trim()) out.push(v);
  }
  for (const a of attendees) {
    if (typeof a !== 'object' || a === null) continue;
    const g = a as Record<string, unknown>;
    if (typeof g.email === 'string' && g.email.trim()) out.push(g.email);
    if (typeof g.displayName === 'string' && g.displayName.trim()) out.push(g.displayName);
  }
  return out;
}

/** Local midnight at the start of a day, as the API wants it. */
const midnight = (key: DayKey) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
};

/** The person's primary calendar through the Calendar API. */
export function calendarApi(source: CalendarSource, fetchFn: typeof fetch = (url, init) => fetch(url, init)): CalendarApi {
  const events = `${source.base}/calendars/primary/events`;
  async function call(url: string, init: RequestInit = {}) {
    const token = await source.token();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (init.body) headers['Content-Type'] = 'application/json';
    const res = await fetchFn(url, { ...init, headers });
    if (res.status === 401) source.forget();
    return res;
  }
  // Only a 403's body is read, to find Google's reason (a rate limit sent as a 403); it is never shown.
  // simple: a 403 whose answer stalls holds the undo queue until the browser gives up on it; add a timeout if that is ever seen.
  const ok = async (res: Response) => {
    if (!res.ok) throw new CalendarApiError(res.status, res.status === 403 ? await errorReason(res) : undefined);
  };
  const fetchPage = async (q: URLSearchParams) => {
    const res = await call(`${events}?${q}`);
    await ok(res);
    return (await res.json()) as { items?: unknown; nextPageToken?: unknown };
  };
  const one = (id: string, notify?: boolean) => `${events}/${encodeURIComponent(id)}${updates(notify)}`;
  const updates = (notify?: boolean) => (notify === undefined ? '' : `?sendUpdates=${notify ? 'all' : 'none'}`);
  // Up to `pages` pages of events overlapping the days from `from` to `to`, oldest start first (so a cut-short answer is whole up to its last event).
  async function listRange(from: DayKey, to: DayKey, pages: number) {
    const { items, hasMore } = await paginateEvents({
      fetchPage,
      params: { timeMin: midnight(from), timeMax: midnight(to), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' },
      maxPages: pages,
      mapItem: parseEvent,
    });
    // A single page that was cut short has always been shown as it came (a week or month rarely has 250).
    return { events: items, covered: hasMore && pages > 1 && items.length ? items[items.length - 1].start.slice(0, 10) : to };
  }
  return {
    person: () => source.person?.(),
    disconnect: source.disconnect && (() => source.disconnect!()),
    async list(from, to) {
      // Repeating events come as single events (each with its series' id), in time order.
      // simple: one page of up to 250 events, plenty for a week or month; the wide call below follows more pages.
      return (await listRange(from, to, 1)).events;
    },
    listWide: (from, to) => listRange(from, to, WIDE_PAGES),
    async search(text, today) {
      const [y, m, d] = today.split('-').map(Number);
      const year = (n: number) => dayKey(new Date(y + n, m - 1, d));
      // Google can only sort oldest first, so the past is read a year at a time, each year whole, to keep the newest matches.
      const read = (from: DayKey, to: DayKey, max: number) =>
        paginateEvents({
          fetchPage,
          params: { q: text, timeMin: midnight(from), timeMax: midnight(to), singleEvents: 'true', orderBy: 'startTime', maxResults: String(max) },
          maxPages: max < 250 ? 1 : SEARCH_PAGES,
          mapItem: parseEvent,
        }).then((r) => r.items);
      const years = Array.from({ length: SEARCH_YEARS }, (_, i) => i);
      const [ahead, ...before] = await Promise.all([read(today, year(SEARCH_YEARS), SEARCH_CAP), ...years.map((i) => read(year(-i - 1), year(-i), 250))]);
      // An event running over a boundary comes from two requests: listed once, before the cap is applied.
      const seen = new Set(ahead.map((e) => e.id));
      const past = [...new Map(before.flat().map((e) => [e.id, e])).values()].filter((e) => !seen.has(e.id)).sort((a, b) => a.start.localeCompare(b.start)).slice(-SEARCH_CAP);
      return [...ahead, ...past];
    },
    async listForSearch(today) {
      const [y, m, d] = today.split('-').map(Number);
      const year = (n: number) => dayKey(new Date(y + n, m - 1, d));
      const read = (from: DayKey, to: DayKey) =>
        paginateEvents({
          fetchPage,
          params: { timeMin: midnight(from), timeMax: midnight(to), singleEvents: 'true', orderBy: 'startTime', maxResults: '2500' },
          maxPages: PARTIAL_PAGES,
          mapItem: (raw): SearchItem | null => {
            const event = parseEvent(raw);
            return event ? { event, fields: searchFields(raw) } : null;
          },
        }).then((r) => r.items);
      const pastYears = Array.from({ length: PARTIAL_YEARS }, (_, i) => i);
      const [ahead, ...before] = await Promise.all([read(today, year(PARTIAL_YEARS)), ...pastYears.map((i) => read(year(-i - 1), year(-i)))]);
      const byId = new Map<string, SearchItem>();
      for (const item of [...ahead, ...before.flat()]) if (!byId.has(item.event.id)) byId.set(item.event.id, item);
      return [...byId.values()];
    },
    async get(id) {
      const res = await call(one(id));
      await ok(res);
      return parseEvent(await res.json());
    },
    async create(body, notify) {
      const res = await call(`${events}${updates(notify)}`, { method: 'POST', body: JSON.stringify(body) });
      await ok(res);
      // Google has made it: an answer that can't be read only means no Undo, never a failed add (a retry would make two).
      const id = await res.json().then((b: { id?: unknown } | null) => b?.id, () => null);
      return typeof id === 'string' && id ? id : null;
    },
    async update(id, body, notify) {
      // Google merges a changed start / end with the old one: clear the kind not used now, else a
      // timed event made all-day (or back) would have both a date and a time, which Google refuses.
      const clear = { date: null, dateTime: null, timeZone: null };
      const patch = body.start && body.end ? { ...body, start: { ...clear, ...body.start }, end: { ...clear, ...body.end } } : body;
      await ok(await call(one(id, notify), { method: 'PATCH', body: JSON.stringify(patch) }));
    },
    async remove(id, notify) {
      const res = await call(one(id, notify), { method: 'DELETE' });
      // Already deleted (in Google Calendar, say): that's what was wanted.
      if (res.status === 404 || res.status === 410) return false;
      await ok(res);
      return true;
    },
    async restore(id) {
      await ok(await call(one(id, false), { method: 'PATCH', body: JSON.stringify({ status: 'confirmed' }) }));
    },
  };
}
