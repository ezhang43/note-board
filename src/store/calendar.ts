import { useSyncExternalStore } from 'react';
import { canChangeSeries, dayKey, dropAccess, keepAccess, readAccess, draftBody, draftFor, emailGuests, exceptionChange, guestChanges, isEmail, moveView, NoAccess, PANEL_DEFAULT, parseEvent, parsePanelWidths, seriesDraft, viewRange, type CalEvent, type CalView, type DayKey, type Draft, type EventBody, type PanelWidths } from '../model/calendar';
import { demoUser } from '../sync/demo';

// Google Calendar side panel (owner request, 2026-10-06). Kept apart from the board store: calendar
// events are Google's, not board data, so nothing here is undone, synced with boards or kept in
// Version history. It talks to the Calendar API (v3) directly with fetch.

export const NOT_CONNECTED = 'Google Calendar isn’t connected yet. Try again later.';
/** Without access yet (`needsAccess`), the panel offers Connect Google Calendar instead of Try again. */
export const NO_WINDOW = 'Google’s window didn’t open or was closed. Click Connect Google Calendar to try again.';
export const NOT_GIVEN = 'Calendar access wasn’t given. Click Connect Google Calendar to allow it.';
export const SAVE_FAILED = 'That change didn’t reach Google Calendar. Try again later.';
export const BAD_TIMES = 'The end must be after the start.';
export const BAD_EMAIL = 'That doesn’t look like an email address.';
export const SERIES_ZONE = 'This series is in another time zone: change all of it in Google Calendar.';
export const SERIES_FAILED = 'Only this event changed: the rest of the series didn’t reach Google Calendar. Try again later.';
export const SERIES_ALL_DAY = 'This event was changed to or from all day on its own: change all of the series in Google Calendar.';

/** Where the calendar is and how to get a token for it (kept in memory and on this device until it runs out, job 107). */
export interface CalendarSource {
  base: string;
  token(): Promise<string>;
  /** The token was refused: get a new one next time. */
  forget(): void;
  /** Gets ready before the panel opens, so the click can ask for access with no wait. */
  prepare?(): void;
}

/** `notify`: email the guests (sendUpdates=all) or not (none); left out when there are no guests. */
export interface CalendarApi {
  list(from: DayKey, to: DayKey): Promise<CalEvent[]>;
  /** One event: a repeating event's series, to find its first day. */
  get(id: string): Promise<CalEvent | null>;
  create(body: EventBody, notify?: boolean): Promise<void>;
  /** Without a start and end (an event changed on its own getting a new title), its time stays. */
  update(id: string, body: Partial<EventBody>, notify?: boolean): Promise<void>;
  remove(id: string, notify?: boolean): Promise<void>;
}

/** The person's answers to the questions the form asks before saving or deleting (job #85). */
export interface Choice {
  /** "All events in the series" rather than "Only this event". */
  all?: boolean;
  /** "Send" update emails to guests; not asked (or "Don't send") never emails. */
  notify?: boolean;
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
  const ok = (res: Response) => {
    if (!res.ok) throw new Error(`Calendar API: ${res.status}`);
  };
  const one = (id: string, notify?: boolean) => `${events}/${encodeURIComponent(id)}${updates(notify)}`;
  const updates = (notify?: boolean) => (notify === undefined ? '' : `?sendUpdates=${notify ? 'all' : 'none'}`);
  return {
    async list(from, to) {
      // Repeating events come as single events (each with its series' id), in time order.
      // simple: one page of up to 250 events, plenty for a month; more would need nextPageToken.
      const q = new URLSearchParams({ timeMin: midnight(from), timeMax: midnight(to), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
      const res = await call(`${events}?${q}`);
      ok(res);
      const body = (await res.json()) as { items?: unknown };
      return Array.isArray(body.items) ? body.items.map(parseEvent).filter((e): e is CalEvent => e !== null) : [];
    },
    async get(id) {
      const res = await call(one(id));
      ok(res);
      return parseEvent(await res.json());
    },
    async create(body, notify) {
      ok(await call(`${events}${updates(notify)}`, { method: 'POST', body: JSON.stringify(body) }));
    },
    async update(id, body, notify) {
      // Google merges a changed start / end with the old one: clear the kind not used now, else a
      // timed event made all-day (or back) would have both a date and a time, which Google refuses.
      const clear = { date: null, dateTime: null, timeZone: null };
      const patch = body.start && body.end ? { ...body, start: { ...clear, ...body.start }, end: { ...clear, ...body.end } } : body;
      ok(await call(one(id, notify), { method: 'PATCH', body: JSON.stringify(patch) }));
    },
    async remove(id, notify) {
      const res = await call(one(id, notify), { method: 'DELETE' });
      // Already deleted (in Google Calendar, say): that's what was wanted.
      if (res.status !== 404 && res.status !== 410) ok(res);
    },
  };
}

export interface CalendarState {
  view: CalView;
  /** The picked day: the week or month around it is shown. */
  day: DayKey;
  /** Null until the calendar has answered. */
  events: CalEvent[] | null;
  loading: boolean;
  note: string | null;
  /** No calendar access yet (Google's window blocked or closed, or access refused): offer Connect. */
  needsAccess: boolean;
  /** How wide the panel is for each view; kept on this device, never synced (owner request, 2026-10-16). */
  widths: PanelWidths;
}

export const WIDTH_KEY = 'note-board:calendar-width';
type WidthStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function createCalendar(api: CalendarApi | null, today: () => DayKey = () => dayKey(new Date()), storage: WidthStorage | null = null) {
  let saved: string | null = null;
  try {
    saved = storage?.getItem(WIDTH_KEY) ?? null;
  } catch {
    // Blocked storage: the defaults are used.
  }
  let state: CalendarState = { view: 'week', day: today(), events: null, loading: false, note: null, needsAccess: false, widths: parsePanelWidths(saved) };
  const listeners = new Set<() => void>();
  // Only the answer for the days shown now is used (back / forward may be clicked quickly).
  let asked = 0;
  const set = (patch: Partial<CalendarState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  const editable = (id: string) => state.events?.find((e) => e.id === id && e.editable);
  const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function load() {
    if (!api) return;
    const n = ++asked;
    const { from, to } = viewRange(state.view, state.day);
    set({ loading: true, note: null, needsAccess: false });
    try {
      const events = await api.list(from, to);
      if (n === asked) set({ events, loading: false });
    } catch (e) {
      const needsAccess = e instanceof NoAccess;
      const note = !needsAccess ? NOT_CONNECTED : e.reason === 'window' ? NO_WINDOW : NOT_GIVEN;
      if (n === asked) set({ events: null, loading: false, note, needsAccess });
    }
  }

  return {
    /** False when no one is signed in (running locally without a demo person). */
    available: api !== null,
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** The panel opened: today's week or month, fetched afresh (whoever is signed in now). */
    open() {
      set({ day: today(), events: null });
      return load();
    },
    /** Try again (or Connect Google Calendar) after a note. */
    load,
    setView(view: CalView) {
      set({ view });
      return load();
    },
    step(n: number) {
      set({ day: moveView(state.view, state.day, n) });
      return load();
    },
    goToday() {
      set({ day: today() });
      return load();
    },
    pickDay(day: DayKey) {
      const before = viewRange(state.view, state.day);
      set({ day });
      // A greyed day from the month before or after shows that month: fetch it.
      const after = viewRange(state.view, day);
      return after.from === before.from && after.to === before.to ? Promise.resolve() : load();
    },
    /** The panel was dragged (or nudged) to this width for this view: remembered on this device. */
    setWidth(view: CalView, width: number) {
      set({ widths: { ...state.widths, [view]: width } });
      try {
        storage?.setItem(WIDTH_KEY, JSON.stringify(state.widths));
      } catch {
        // Full or blocked storage: the width still holds until the page is closed.
      }
    },
    resetWidth(view: CalView) {
      this.setWidth(view, PANEL_DEFAULT[view]);
    },
    /**
     * Adds (`opened` null) or changes an event, with the person's answers to "Only this event / All
     * events in the series" and "Send update emails to guests?". Resolves to a note to show, or null.
     * What was changed is worked out from `opened`, the event as the form opened it, so after only
     * part of a change reached Google a second try still sends the rest (job #88).
     */
    async save(opened: CalEvent | null, draft: Draft, choice: Choice = {}): Promise<string | null> {
      const event = opened && (editable(opened.id) ? opened : undefined);
      if (!api || event === undefined) return SAVE_FAILED;
      let body = draftBody(draft, timeZone());
      if (!body) return BAD_TIMES;
      if (!draft.guests.every(isEmail)) return BAD_EMAIL;
      // The whole series keeps its days: only offered while the event is still on its own day.
      const all = choice.all === true;
      if (all && !canChangeSeries(event, draft)) return SAVE_FAILED;
      // Guests are sent only when the person changed them here (from what this event had).
      let attendees = guestChanges(event, draft);
      const notify = emailGuests(event, draft) ? choice.notify === true : undefined;
      let own: Partial<EventBody> | null = null;
      try {
        if (all && event?.series) {
          const series = await api.get(event.series);
          if (!series) return SAVE_FAILED;
          // simple: the series' times are written in this device's time zone, so one kept in
          // another zone (which its repeat rule follows) is left to Google Calendar.
          if (!series.allDay && series.timeZone !== timeZone()) return SERIES_ZONE;
          // This event made all-day (or timed) on its own: its times don't fit the series.
          if (series.allDay !== event.allDay) return SERIES_ALL_DAY;
          body = draftBody(seriesDraft(draft, draftFor(event), draftFor(series)), timeZone());
          if (!body) return SAVE_FAILED;
          // Only the guests added or removed here change the series' own list (and its guests' answers stay).
          if (attendees) attendees = guestChanges(event, draft, series);
          own = exceptionChange(event, draft, series);
        }
        if (attendees) body = { ...body, attendees };
        // The edited event's own change goes first, since the series' change can give it a new id (job #88).
        if (event && own) await api.update(event.id, own, notify);
      } catch {
        return SAVE_FAILED;
      }
      try {
        await (event === null ? api.create(body, notify) : api.update(all && event.series ? event.series : event.id, body, notify));
      } catch {
        if (!own) return SAVE_FAILED;
        // Only this event changed: show the calendar as it now is, and say so.
        await load();
        return SERIES_FAILED;
      }
      await load();
      return null;
    },
    /** Deletes an event, or its whole series (after the panel asked). No undo: it's Google's, not the board's. */
    async remove(id: string, choice: Choice = {}): Promise<string | null> {
      const event = editable(id);
      if (!api || !event) return SAVE_FAILED;
      const series = choice.all === true ? event.series : null;
      try {
        await api.remove(series ?? id, emailGuests(event, null) ? choice.notify === true : undefined);
      } catch {
        return SAVE_FAILED;
      }
      set({ events: state.events?.filter((e) => e.id !== id && (series === null || e.series !== series)) ?? null });
      return null;
    },
  };
}

const GOOGLE_API = 'https://www.googleapis.com/calendar/v3';

/**
 * The published site uses the signed-in person's Google Calendar (a token from Google, asked for
 * when the panel first opens); `npm run dev` with ?demo-user=… a pretend calendar in the dev server
 * (src/calendar/devServer.ts); otherwise there is no calendar.
 */
function defaultSource(): CalendarSource | null {
  if (import.meta.env.VITE_SYNC === 'on') {
    // Kept once loaded, so a click on the button reaches Google without waiting (a window opened
    // after a wait may be blocked, Safari especially).
    let ready: typeof import('../calendar/google') | null = null;
    const google = () => import('../calendar/google').then((g) => (ready = g));
    return {
      base: GOOGLE_API,
      token: () => (ready ? ready.token() : google().then((g) => g.token())),
      forget: () => ready?.forget(),
      prepare: () => void google().then((g) => g.prepare()),
    };
  }
  const demo = demoUser();
  if (!demo) return null;
  // Locally, ?demo-calendar=blocked (or =refused) makes the first ask for access fail as Google's
  // window does when it is blocked or closed (or access isn't given), to try Connect Google Calendar.
  let noAccess = new URLSearchParams(location.search).get('demo-calendar');
  // Kept on this device for an hour, as on the published site, so a reload or new tab doesn't ask again.
  const device = deviceStorage;
  return {
    base: `${import.meta.env.BASE_URL}__calendar/calendar/v3`,
    async token() {
      const kept = readAccess(device, demo.uid);
      const reason = noAccess === 'blocked' ? 'window' : noAccess === 'refused' ? 'refused' : null;
      noAccess = null; // only the first ask: once connected (kept for every tab, job 107), the setting has no effect
      if (kept) return kept.token;
      if (reason) throw new NoAccess(reason);
      keepAccess(device, { token: demo.uid, expiresAt: Date.now() + 3599_000, user: demo.uid });
      return demo.uid;
    },
    forget: () => dropAccess(device),
  };
}

const source = defaultSource();
function deviceStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
export const calendar = Object.assign(createCalendar(source && calendarApi(source), undefined, deviceStorage()), { prepare: () => source?.prepare?.() });

export function useCalendar(): CalendarState {
  return useSyncExternalStore(calendar.subscribe, calendar.get);
}
