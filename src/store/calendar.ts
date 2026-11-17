import { useSyncExternalStore } from 'react';
import { canChangeSeries, dayKey, dragDraft, dropAccess, keepAccess, readAccess, draftBody, draftFor, emailGuests, exceptionChange, guestChanges, isEmail, moveView, NoAccess, PANEL_DEFAULT, parseEvent, savedEvent, seriesDraft, viewRange, type CalEvent, type CalView, type DayKey, type Draft, type EventBody, type PanelWidths } from '../model/calendar';
import { demoUser } from '../sync/demo';
import { calendarDoneItems, vizWindow } from '../model/vizCalendar';
import type { DoneItem, VizRange } from '../model/visualizer';
import { announce } from './announce';
import { deviceStorage } from './env';
import { createWidthStore } from './panelWidths';
import { tick, type CalendarMarks } from './undoClock';

// Google Calendar side panel (owner request, 2026-10-06). Kept apart from the board store: calendar
// events are Google's, not board data, so nothing here is synced with boards or kept in Version history.
// A change is undone by its own Undo message (job 217) or, while the panel is open, by Ctrl+Z, which goes
// back several steps through this session's event changes, and Ctrl+Y forward again (owner request
// 2026-11-17); that history is in memory only, apart from the board's. It talks to the Calendar API (v3) directly with fetch.

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
/** A Ctrl+Z or Ctrl+Y that didn't get through: its step is kept, and the message has Try again (owner decision 2026-11-17). */
export const UNDO_FAILED = 'Undo didn’t reach Google Calendar.';
export const REDO_FAILED = 'Redo didn’t reach Google Calendar.';
/** One Google said can't be done: its step is dropped, so the message offers nothing (owner decision 2026-11-17). */
export const UNDO_REFUSED = 'This change can’t be undone: Google refused it.';
export const REDO_REFUSED = 'This change can’t be redone: Google refused it.';
/** A series Ctrl+Y that only half reached Google: dropped, as Google is left mixed. */
export const SERIES_REDO_PART = 'Only this event was redone, not the rest of the series.';
export const UNDO_PART = 'Only the series was put back: this event’s own change didn’t reach Google Calendar.';
/** Ctrl+Z and Ctrl+Y keep this many event changes (owner request 2026-11-17). */
export const UNDO_LIMIT = 50;

/**
 * Google answered a call with this HTTP status (not 2xx); the message names it, as before. `reason` is the first
 * reason in Google's JSON answer (`error.errors[].reason`, such as "rateLimitExceeded"), if it gave one.
 */
export class CalendarApiError extends Error {
  constructor(readonly status: number, readonly reason?: string) {
    super(`Calendar API: ${status}`);
  }
}

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
}

/** `notify`: email the guests (sendUpdates=all) or not (none); left out when there are no guests. */
export interface CalendarApi {
  list(from: DayKey, to: DayKey): Promise<CalEvent[]>;
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
  // The body of a refusal is read only to find Google's reason (a rate limit sent as a 403); it is never shown.
  const ok = async (res: Response) => {
    if (!res.ok) throw new CalendarApiError(res.status, await errorReason(res));
  };
  const one = (id: string, notify?: boolean) => `${events}/${encodeURIComponent(id)}${updates(notify)}`;
  const updates = (notify?: boolean) => (notify === undefined ? '' : `?sendUpdates=${notify ? 'all' : 'none'}`);
  return {
    async list(from, to) {
      // Repeating events come as single events (each with its series' id), in time order.
      // simple: one page of up to 250 events, plenty for a month; more would need nextPageToken.
      const q = new URLSearchParams({ timeMin: midnight(from), timeMax: midnight(to), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
      const res = await call(`${events}?${q}`);
      await ok(res);
      const body = (await res.json()) as { items?: unknown };
      return Array.isArray(body.items) ? body.items.map(parseEvent).filter((e): e is CalEvent => e !== null) : [];
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
  /**
   * The soft message after a change (owner request, 2026-10-29, job 217): "Event added", "Event
   * saved" or "Event deleted", with what its Undo does (null: no Undo, as after a failed undo).
   * `retry`: a Ctrl+Z or Ctrl+Y that didn't get through, kept, tried again by its Try again (owner decision 2026-11-17).
   * `n` tells one message from the next.
   */
  done: { text: string; undo: (() => Promise<unknown>) | null; retry: (() => Promise<unknown>) | null; n: number } | null;
  /**
   * Events with a change on its way to Google (owner request, 2026-11-17: shown at once, Google told
   * in the background): changed, deleted or dragged again only once Google has answered. A new event
   * is here under its stand-in id until Google gives it its own.
   */
  sending: string[];
}

/** A change to the list of events shown. */
type Patch = (events: CalEvent[]) => CalEvent[];
/**
 * One change that Ctrl+Z (or its Undo message) takes back and Ctrl+Y makes again at Google, never emailing guests.
 * Both keep the event's id (a deleted event is restored, not made again), so the steps around it still fit.
 */
interface Step {
  undo: () => Promise<unknown>;
  redo: () => Promise<unknown>;
  /** The events it changes: not changed again while it is on its way. */
  ids: string[];
  /** A whole series it changes: no "All events" change to it meanwhile. */
  series?: string;
}
/**
 * A step on the undo or redo list, numbered on the counter shared with the board (undoClock.ts). `step` is
 * undefined until Google has answered the change (`ready`), and null when there turned out to be nothing to undo.
 * `flying`: its undo or redo is on its way; it stays in its place on the list until Google has answered, so one that
 * didn't get through is still there to try again (owner decision 2026-11-17).
 */
interface Entry {
  at: number;
  flying?: boolean;
  step: Step | null | undefined;
  ready: Promise<void>;
  settle(step: Step | null): void;
}
/** What happens once Google has taken a change shown at once. */
interface Taken {
  text: string;
  step: Step | null;
  /** Makes the list match what Google now has (a new event gets Google's id). */
  after: Patch;
  /** Fetch the calendar again: what Google made of it can't be known here (guests' answers, a series' event). */
  reload: boolean;
}

const WIDTH_KEY = 'note-board:calendar-width';

export function createCalendar(api: CalendarApi | null, today: () => DayKey = () => dayKey(new Date()), storage: Pick<Storage, 'getItem' | 'setItem'> | null = null) {
  const widthStore = createWidthStore(WIDTH_KEY, PANEL_DEFAULT, storage);
  let state: CalendarState = { view: 'week', day: today(), events: null, loading: false, note: null, needsAccess: false, widths: widthStore.get(), done: null, sending: [] };
  let said = 0;
  const listeners = new Set<() => void>();
  // Only the answer for the days shown now is used (back / forward may be clicked quickly).
  let asked = 0;
  const set = (patch: Partial<CalendarState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  const editable = (id: string) => state.events?.find((e) => e.id === id && e.editable);
  // Changes shown before Google has answered, by event id: applied again to every list fetched
  // meanwhile (another week and back, an Undo's fetch), so they don't flicker off and on.
  const shownEarly = new Map<string, Patch>();
  // Those calls to Google, so a drag (and the tests) can wait for the answer.
  const flights = new Map<string, Promise<void>>();
  // Opening the panel again starts afresh (whoever is signed in now): earlier changes no longer touch the list.
  let session = 0;
  let standIns = 0;
  const patch = (change: Patch) => set({ events: state.events && change(state.events) });
  const busy = (id: string) => state.sending.includes(id);
  // A whole series waits while one of its events still has a change on its way (its rollback could bring that one back).
  const sendingSeries = new Map<string, string>();
  const seriesBusy = (series: string) => [...sendingSeries.values()].includes(series);
  const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
  /** Shows (and says aloud) the message after a change, with its Undo when it has a step to undo. */
  const tell = (text: string, step: Entry | null, retry: (() => Promise<unknown>) | null = null) => {
    set({ done: { text, undo: step && (() => undoEntry(step)), retry, n: ++said } });
    announce(text);
  };

  // Ctrl+Z and Ctrl+Y (owner request 2026-11-17): the steps of this session's changes, newest last, and one queue
  // that sends each undo or redo to Google after the one before, so quick presses go in order.
  let undos: Entry[] = [];
  let redos: Entry[] = [];
  let queue: Promise<void> = Promise.resolve();
  // A press that didn't get through stops the presses queued behind it, so an older step never reaches Google first.
  let halts = 0;
  const onto = (list: Entry[], e: Entry) => [...list, e].slice(-UNDO_LIMIT);
  /** The newest step that isn't on its way already: the next one Ctrl+Z (or Ctrl+Y) steps. */
  const newest = (list: Entry[]) => {
    for (let i = list.length - 1; i >= 0; i--) if (!list[i].flying) return list[i];
    return undefined;
  };
  const drop = (e: Entry) => {
    undos = undos.filter((x) => x !== e);
    redos = redos.filter((x) => x !== e);
  };
  /** A new step, waiting for its change; nothing to undo (null) takes it off the lists. */
  function entry(at = tick()): Entry {
    const e = { at, step: undefined } as Entry;
    e.ready = new Promise<void>((done) => {
      e.settle = (step) => {
        e.step = step;
        if (!step) drop(e);
        done();
      };
    });
    return e;
  }
  /** A new change (numbered `at`, when it started): its step goes on the undo list, and what could be redone is gone. */
  function remember(at?: number): Entry {
    const e = entry(at);
    undos = onto(undos, e);
    redos = [];
    return e;
  }
  /**
   * Runs one undo or redo of `from`'s step after the ones already on their way, unless the panel was opened afresh
   * meanwhile; `to` (on the other list) gets the step once it has reached Google, or is dropped if it didn't. `from`
   * leaves its list once Google has it, or has said it can't be done; one that didn't get through stays in its place,
   * with its number, to try again, and the presses queued behind it send nothing (owner decision 2026-11-17).
   */
  function inTurn(from: Entry, to: Entry, run: (step: Step) => Promise<void>): Promise<void> {
    const at = session;
    const halted = halts;
    from.flying = true;
    // Its message goes (its Undo must not run the same step), as when a new change is made.
    set({ done: null });
    const job = queue.then(async () => {
      await from.ready;
      if (!from.step || at !== session || halted !== halts) {
        from.flying = false;
        return to.settle(null);
      }
      const step = from.step;
      const key = `step ${to.at}`;
      if (step.series) sendingSeries.set(key, step.series);
      set({ sending: [...state.sending, ...step.ids] });
      try {
        await run(step);
        drop(from);
        to.settle(step);
      } catch (err) {
        if (canRetry(err)) halts++;
        else drop(from);
        to.settle(null);
      } finally {
        from.flying = false;
        sendingSeries.delete(key);
        set({ sending: state.sending.filter((s) => !step.ids.includes(s)) });
      }
    });
    queue = job;
    return job;
  }
  /** Undoes this step at Google (Ctrl+Z, or the message's Undo); Ctrl+Y can then redo it. */
  function undoEntry(e: Entry): Promise<void> {
    if (!undos.includes(e) || e.flying) return Promise.resolve();
    const back = entry();
    redos = onto(redos, back);
    return inTurn(e, back, async (step) => {
      try {
        await step.undo();
      } catch (err) {
        const part = err instanceof Error && err.message === UNDO_PART;
        // Unless a newer change has its own message by now; a half-done undo is said anyway, as Google is left mixed.
        // A kept step (the same canRetry as inTurn's) gets Try again: the same undo again, as Ctrl+Z again would.
        const kept = canRetry(err);
        if (state.done === null || part) tell(part ? UNDO_PART : kept ? UNDO_FAILED : UNDO_REFUSED, null, kept ? () => undoEntry(e) : null);
        if (part) await load();
        throw err;
      }
      announce('Undid the last change');
      await load();
    });
  }
  /** Makes an undone step again at Google (Ctrl+Y); Ctrl+Z can then undo it again. */
  function redoEntry(e: Entry): Promise<void> {
    if (!redos.includes(e) || e.flying) return Promise.resolve();
    const again = entry();
    undos = onto(undos, again);
    return inTurn(e, again, async (step) => {
      try {
        await step.redo();
      } catch (err) {
        const part = err instanceof Error && err.message === SERIES_FAILED;
        const kept = canRetry(err);
        if (state.done === null || part) tell(part ? SERIES_REDO_PART : kept ? REDO_FAILED : REDO_REFUSED, null, kept ? () => redoEntry(e) : null);
        if (part) await load();
        throw err;
      }
      announce('Redid the last change');
      await load();
    });
  }
  /**
   * What puts an event back as it was (Undo after a save): its old title and time, and its old
   * guests (as Google gave them) when the change sent guests. Never emails them.
   * simple: the time is written in this device's time zone (the same moment), as saving does.
   */
  const putBack = (id: string, was: CalEvent, guests: boolean) => {
    const body = draftBody(draftFor(was), timeZone());
    // Old times Google allows but the form doesn't (an end not after its start): no Undo.
    return body && (() => api!.update(id, guests ? { ...body, attendees: was.guests } : body, false));
  };
  /** A save's step: none when it can't be put back. */
  const undoSave = (id: string, series: string | undefined, undo: (() => Promise<unknown>) | null, redo: () => Promise<unknown>): Step | null =>
    undo ? { undo, redo, ids: [id], series } : null;

  /**
   * A change shown at once while Google is told (owner request, 2026-11-17). `answer` is the call
   * already made to Google. If Google says yes, the usual message with its Undo shows (only now, so
   * an Undo never runs on a stand-in id); if it refuses (offline or an error), `back` puts back only
   * this event, unless the panel was opened afresh since, and the message says it didn't reach Google.
   * A yes that comes while a fetch is running (read before Google had the change), or after the panel
   * was opened afresh, fetches the calendar again, so the list shows what Google now has; after a
   * fresh open there is no Undo, as someone else may be signed in by then.
   */
  function instant(id: string, series: string | null, change: Patch, back: Patch, answer: Promise<Taken>) {
    const at = session;
    // Its Ctrl+Z step is on the list from now (it waits for Google's answer), so Ctrl+Z never skips it.
    const step = remember();
    shownEarly.set(id, change);
    if (series) sendingSeries.set(id, series);
    // The last change's message goes: its Undo must not race this change.
    set({ sending: [...state.sending, id], done: null });
    patch(change);
    const sent = () => {
      shownEarly.delete(id);
      flights.delete(id);
      sendingSeries.delete(id);
      set({ sending: state.sending.filter((s) => s !== id) });
    };
    const flight = answer.then(
      async (taken) => {
        sent();
        const same = at === session;
        if (same) patch(taken.after);
        step.settle(same ? taken.step : null);
        // Unless Ctrl+Z already took it back while Google answered: its undo has its own message.
        if (!step.step || (undos.includes(step) && !step.flying)) tell(taken.text, step.step ? step : null);
        if (taken.reload || state.loading || !same) await load();
      },
      () => {
        sent();
        step.settle(null);
        if (at === session) patch(back);
        tell(SAVE_FAILED, null);
      },
    );
    flights.set(id, flight);
  }

  async function load() {
    if (!api) return;
    const n = ++asked;
    const { from, to } = viewRange(state.view, state.day);
    set({ loading: true, note: null, needsAccess: false });
    try {
      const events = await api.list(from, to);
      if (n === asked) set({ events: [...shownEarly.values()].reduce((list, change) => change(list), events), loading: false });
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
      session++;
      shownEarly.clear();
      undos = [];
      redos = [];
      set({ day: today(), events: null, done: null });
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
      widthStore.set(view, width);
      set({ widths: widthStore.get() });
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
      if (!api || event === undefined || (event && busy(event.id))) return SAVE_FAILED;
      let body = draftBody(draft, timeZone());
      if (!body) return BAD_TIMES;
      if (!draft.guests.every(isEmail)) return BAD_EMAIL;
      // The whole series keeps its days: only offered while the event is still on its own day.
      const all = choice.all === true;
      if (all && (!canChangeSeries(event, draft) || (event?.series && seriesBusy(event.series)))) return SAVE_FAILED;
      // Guests are sent only when the person changed them here (from what this event had).
      let attendees = guestChanges(event, draft);
      const notify = emailGuests(event, draft) ? choice.notify === true : undefined;
      if (!all || !event?.series) {
        // Shown at once; Google is asked in this same tick (no wait before it, so asking for access isn't held back).
        if (attendees) body = { ...body, attendees };
        const sent = body;
        if (event === null) {
          const standIn = `local-${++standIns}`;
          const shown = savedEvent(null, sent, standIn);
          const answer = api.create(sent, notify).then(
            (id): Taken => ({
              text: 'Event added',
              // Redo brings the same event back, so a step made after it (an edit) still finds it.
              step: id ? { undo: () => api.remove(id, false), redo: () => api.restore(id), ids: [id] } : null,
              // Already listed by Google's id (a fetch in between): shown once. No id: shown as Google has it.
              after: (l) => (id && !l.some((e) => e.id === id) ? l.map((e) => (e.id === standIn ? { ...e, id } : e)) : l.filter((e) => e.id !== standIn)),
              reload: !id || attendees !== null,
            }),
          );
          instant(standIn, null, (l) => (l.some((e) => e.id === standIn) ? l : [...l, shown]), (l) => l.filter((e) => e.id !== standIn), answer);
          return null;
        }
        const shown = savedEvent(event, sent, event.id);
        const answer = api.update(event.id, sent, notify).then(
          (): Taken => ({
            text: 'Event saved',
            step: undoSave(event.id, undefined, putBack(event.id, event, sent.attendees !== undefined), () => api.update(event.id, sent, false)),
            after: (l) => l,
            // Guests' answers, or an event of a series (its id may change), as Google has them.
            reload: sent.attendees !== undefined || event.series !== null,
          }),
        );
        // Only this event goes back, and only while it is still shown as changed.
        instant(event.id, event.series, (l) => l.map((e) => (e.id === event.id ? shown : e)), (l) => l.map((e) => (e === shown ? event : e)), answer);
        return null;
      }
      // "All events in the series" waits for Google (the form shows its answer), as before.
      // Numbered now, so a board change made while Google answers counts as newer.
      const started = tick();
      const seriesId = event.series;
      let own: Partial<EventBody> | null;
      let series: CalEvent | null;
      try {
        series = await api.get(seriesId);
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
        if (attendees) body = { ...body, attendees };
        // The edited event's own change goes first, since the series' change can give it a new id (job #88).
        if (own) await api.update(event.id, own, notify);
      } catch {
        return SAVE_FAILED;
      }
      let step: Step | null;
      try {
        const seriesBody = body;
        await api.update(seriesId, seriesBody, notify);
        // The series first, which also gives its events back their old ids, then the edited event's own change.
        const seriesBack = putBack(seriesId, series, attendees !== null);
        const ownBack = own && { ...(own.summary !== undefined && { summary: draftFor(event).title }), ...(own.attendees && { attendees: event.guests }) };
        step = undoSave(
          event.id,
          seriesId,
          seriesBack &&
            (async () => {
              await seriesBack();
              // Half undone: the series is back but this event isn't, so the calendar is shown as Google has it.
              if (ownBack) await api.update(event.id, ownBack, false).catch(() => Promise.reject(new Error(UNDO_PART)));
            }),
          // Redone as it was saved: this event's own change first, then the series (half done: the calendar is shown as Google has it).
          async () => {
            if (own) await api.update(event.id, own, false);
            await api.update(seriesId, seriesBody, false).catch((e) => Promise.reject(own ? new Error(SERIES_FAILED) : e));
          },
        );
      } catch {
        if (!own) return SAVE_FAILED;
        // Only this event changed: show the calendar as it now is, and say so.
        await load();
        return SERIES_FAILED;
      }
      await load();
      const e = remember(started);
      e.settle(step);
      tell('Event saved', step ? e : null);
      return null;
    },
    /**
     * Dragging an event onto another day (owner request, 2026-11-11): `from` is the day it was picked
     * up on, `to` the day dropped on. Saved exactly as the form saves a change to its day, so it asks
     * Google the same, answers with "Event saved" and its Undo, and emails guests only as `choice.notify`
     * says. It shows on the new day at once; if Google refuses, it goes back and the usual note shows
     * in the message with no Undo. A repeating event moves on its own ("All events" can't be offered
     * for a new day, see canChangeSeries). Nothing happens for the same day or a read-only event.
     */
    async move(id: string, from: DayKey, to: DayKey, choice: Choice = {}): Promise<void> {
      const event = editable(id);
      const draft = event && dragDraft(event, from, to);
      // A drag never shows the form's notes (an end not after the start): it just does nothing.
      if (!api || !event || !draft || busy(id) || !draftBody(draft, timeZone())) return;
      // Shown on the new day at once (a change shown before Google answers); resolves once Google has.
      const note = await this.save(event, draft, { notify: choice.notify });
      if (note) tell(note, null);
      else await flights.get(id);
    },
    /**
     * Ctrl+D on an event's card (owner request 2026-11-17): a new event like it at the same time, without its
     * guests, so no one is invited unasked; added as the form adds one ("Event added", undone like any add).
     * A refusal says so in the message.
     */
    async copy(id: string): Promise<void> {
      const event = editable(id);
      if (!event || busy(id)) return;
      const note = await this.save(null, { ...draftFor(event), guests: [] });
      if (note) tell(note, null);
    },
    /** Deletes an event, or its whole series (after the panel asked); its Undo brings it back (job 217). */
    async remove(id: string, choice: Choice = {}): Promise<string | null> {
      const event = editable(id);
      if (!api || !event || busy(id)) return SAVE_FAILED;
      const series = choice.all === true ? event.series : null;
      if (series !== null && seriesBusy(series)) return SAVE_FAILED;
      const notify = emailGuests(event, null) ? choice.notify === true : undefined;
      if (series === null) {
        // Off the list at once; Google is asked in this same tick. Refused: it comes back (it shows by its day and time).
        const gone: Patch = (l) => l.filter((e) => e.id !== id);
        const answer = api.remove(id, notify).then(
          (deleted): Taken => ({
            text: 'Event deleted',
            // Already gone (someone deleted it on purpose): no Undo to bring it back.
            step: deleted ? { undo: () => api.restore(id), redo: () => api.remove(id, false), ids: [id] } : null,
            after: gone,
            // The panel was out of date: show the calendar as Google has it (a 404 may be an event with a new id).
            reload: !deleted,
          }),
        );
        instant(id, event.series, gone, (l) => (l.some((e) => e.id === id) ? l : [...l, event]), answer);
        return null;
      }
      // All of a series waits for Google (the card shows its answer), as before.
      const started = tick();
      let deleted: boolean;
      try {
        deleted = await api.remove(series, notify);
      } catch {
        return SAVE_FAILED;
      }
      set({ events: state.events?.filter((e) => e.id !== id && e.series !== series) ?? null });
      const step = remember(started);
      step.settle(deleted ? { undo: () => api.restore(series), redo: () => api.remove(series, false), ids: [id], series } : null);
      tell('Event deleted', step.step ? step : null);
      if (!deleted) await load();
      return null;
    },
    /** The message's Undo: the change is undone at Google, then the calendar is shown again (the same step as Ctrl+Z). */
    async undo() {
      await state.done?.undo?.();
    },
    /** Ctrl+Z with the panel open: undoes the newest event change of this session, once Google has it. */
    undoLast(): Promise<void> {
      const e = newest(undos);
      return e ? undoEntry(e) : Promise.resolve();
    },
    /** Ctrl+Y (or Ctrl+Shift+Z): makes the last undone event change again. */
    redo(): Promise<void> {
      const e = newest(redos);
      return e ? redoEntry(e) : Promise.resolve();
    },
    /** The newest undo and redo steps on the counter shared with the board (0: none), so the newer one is stepped. */
    marks: (): CalendarMarks => ({ undo: newest(undos)?.at ?? 0, redo: newest(redos)?.at ?? 0 }),
    dismissDone() {
      set({ done: null });
    },
    /** Resolves once every change shown before Google answered has its answer (for tests). */
    async settled() {
      while (flights.size) await Promise.all(flights.values());
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
      keptToken: () => (ready ? Promise.resolve(ready.keptToken()) : google().then((g) => g.keptToken())),
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
    keptToken: async () => readAccess(device, demo.uid)?.token ?? null,
  };
}

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
  src: CalendarSource | null = source,
): Promise<VizCalendar> {
  if (!src || uid === null) return { status: 'signed-out' };
  const token = src.keptToken ? await src.keptToken() : null;
  if (!token) return { status: 'no-access' };
  const { timeMin, timeMax } = vizWindow(range, today);
  // Built as a string (not new URL): the dev server's base is a relative path, which new URL() would reject.
  const endpoint = `${src.base}/calendars/primary/events`;

  /** Reads [min, max) page by page, at most `budget` pages. `done` is false when Google still had more. */
  const read = async (min: string, max: string, budget: number): Promise<{ items: unknown[]; pages: number; done: boolean } | 'no-access' | 'error'> => {
    const items: unknown[] = [];
    let pageToken: string | undefined;
    for (let pages = 1; pages <= budget; pages++) {
      const q = new URLSearchParams({
        timeMin: min,
        timeMax: max,
        singleEvents: 'true', // each past instance of a repeating event, once
        showDeleted: 'true', // include deleted (cancelled) events
        eventTypes: 'default', // not working-location / out-of-office / focus-time / birthday
        orderBy: 'startTime',
        maxResults: '2500',
      });
      if (pageToken) q.set('pageToken', pageToken);
      const res = await fetchFn(`${endpoint}?${q}`, { headers: { Authorization: `Bearer ${token}` }, signal });
      if (res.status === 401) return 'no-access'; // access ran out: ask to open Calendar again
      if (!res.ok) return 'error';
      const data = (await res.json()) as { items?: unknown; nextPageToken?: unknown };
      if (Array.isArray(data.items)) items.push(...data.items);
      pageToken = typeof data.nextPageToken === 'string' ? data.nextPageToken : undefined;
      if (!pageToken) return { items, pages, done: true };
    }
    return { items, pages: budget, done: false };
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

const source = defaultSource();
export const calendar = Object.assign(createCalendar(source && calendarApi(source), undefined, deviceStorage()), { prepare: () => source?.prepare?.() });

export function useCalendar(): CalendarState {
  return useSyncExternalStore(calendar.subscribe, calendar.get);
}
