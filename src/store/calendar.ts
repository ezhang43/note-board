import { useSyncExternalStore } from 'react';
import { dayKey, draftBody, moveView, parseEvent, viewRange, type CalEvent, type CalView, type DayKey, type Draft, type EventBody } from '../model/calendar';
import { demoUser } from '../sync/demo';

// Google Calendar side panel (owner request, 2026-10-06). Kept apart from the board store: calendar
// events are Google's, not board data, so nothing here is undone, synced with boards or kept in
// Version history. It talks to the Calendar API (v3) directly with fetch.

export const NOT_CONNECTED = 'Google Calendar isn’t connected yet. Try again later.';
export const SAVE_FAILED = 'That change didn’t reach Google Calendar. Try again later.';
export const BAD_TIMES = 'The end must be after the start.';

/** Where the calendar is and how to get a token for it (kept in memory only, never saved). */
export interface CalendarSource {
  base: string;
  token(): Promise<string>;
  /** The token was refused: get a new one next time. */
  forget(): void;
}

export interface CalendarApi {
  list(from: DayKey, to: DayKey): Promise<CalEvent[]>;
  create(body: EventBody): Promise<void>;
  update(id: string, body: EventBody): Promise<void>;
  remove(id: string): Promise<void>;
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
  const one = (id: string) => `${events}/${encodeURIComponent(id)}`;
  return {
    async list(from, to) {
      // Repeating events come as single events (each read-only), in time order.
      // simple: one page of up to 250 events, plenty for a month; more would need nextPageToken.
      const q = new URLSearchParams({ timeMin: midnight(from), timeMax: midnight(to), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
      const res = await call(`${events}?${q}`);
      ok(res);
      const body = (await res.json()) as { items?: unknown };
      return Array.isArray(body.items) ? body.items.map(parseEvent).filter((e): e is CalEvent => e !== null) : [];
    },
    async create(body) {
      ok(await call(events, { method: 'POST', body: JSON.stringify(body) }));
    },
    async update(id, body) {
      ok(await call(one(id), { method: 'PATCH', body: JSON.stringify(body) }));
    },
    async remove(id) {
      const res = await call(one(id), { method: 'DELETE' });
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
}

export function createCalendar(api: CalendarApi | null, today: () => DayKey = () => dayKey(new Date())) {
  let state: CalendarState = { view: 'week', day: today(), events: null, loading: false, note: null };
  const listeners = new Set<() => void>();
  // Only the answer for the days shown now is used (back / forward may be clicked quickly).
  let asked = 0;
  const set = (patch: Partial<CalendarState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  const editable = (id: string) => state.events?.some((e) => e.id === id && e.editable) ?? false;
  const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function load() {
    if (!api) return;
    const n = ++asked;
    const { from, to } = viewRange(state.view, state.day);
    set({ loading: true, note: null });
    try {
      const events = await api.list(from, to);
      if (n === asked) set({ events, loading: false });
    } catch {
      if (n === asked) set({ events: null, loading: false, note: NOT_CONNECTED });
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
    /** Try again after a note. */
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
      const { from, to } = viewRange(state.view, state.day);
      set({ day });
      return day >= from && day < to ? Promise.resolve() : load();
    },
    /** Adds (`id` null) or changes a simple event. Resolves to a note to show, or null when it worked. */
    async save(id: string | null, draft: Draft): Promise<string | null> {
      if (!api || (id !== null && !editable(id))) return SAVE_FAILED;
      const body = draftBody(draft, timeZone());
      if (!body) return BAD_TIMES;
      try {
        await (id === null ? api.create(body) : api.update(id, body));
      } catch {
        return SAVE_FAILED;
      }
      await load();
      return null;
    },
    /** Deletes a simple event (after the panel asked). No undo: it's Google's, not the board's. */
    async remove(id: string): Promise<string | null> {
      if (!api || !editable(id)) return SAVE_FAILED;
      try {
        await api.remove(id);
      } catch {
        return SAVE_FAILED;
      }
      set({ events: state.events?.filter((e) => e.id !== id) ?? null });
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
    const google = () => import('../calendar/google');
    return { base: GOOGLE_API, token: () => google().then((g) => g.token()), forget: () => void google().then((g) => g.forget()) };
  }
  const demo = demoUser();
  if (!demo) return null;
  return { base: `${import.meta.env.BASE_URL}__calendar/calendar/v3`, token: async () => demo.uid, forget() {} };
}

const source = defaultSource();
export const calendar = createCalendar(source && calendarApi(source));

export function useCalendar(): CalendarState {
  return useSyncExternalStore(calendar.subscribe, calendar.get);
}
