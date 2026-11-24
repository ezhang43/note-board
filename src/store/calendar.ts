import { useSyncExternalStore } from 'react';
import { addDays, BAD_TIMES, canChangeSeries, dayKey, dragDraft, draftBody, draftFor, emailGuests, eventInRange, exceptionChange, guestChanges, isEmail, matchesSearch, mergeSearchResults, moveView, PANEL_DEFAULT, REPEAT_SERIES_ONLY, savedEvent, seriesDraft, validateDraft, viewRange, type CalEvent, type CalView, type DayKey, type Draft, type EventBody, type Guest, type PanelWidths } from '../model/calendar';
import { parseRecurrence, sameRepeat, toRecurrence, validateRepeat } from '../model/calendarRepeat';
import { weeksBetween } from '../model/weekList';
import { accessNote, calendarApi, CalendarApiError, canRetry, DISCONNECTED, NO_WINDOW, NOT_CONNECTED, NOT_GIVEN, ONE_MORE_STEP, SEARCH_CAP, SERIES_FAILED, UNDO_PART, WIDE_PAGES, WRONG_ACCOUNT, type CalendarApi, type CalendarSource, type SearchItem } from '../calendar/api';
import { calendarSource } from '../calendar/source';
import { fetchCalendarDone, type VizCalendar } from '../calendar/vizFetch';
import { announce } from './announce';
import { deviceStorage } from './env';
import { createWidthStore } from './panelWidths';
import { tick, type CalendarMarks } from './undoClock';

export { BAD_TIMES, calendarApi, CalendarApiError, canRetry, DISCONNECTED, fetchCalendarDone, NO_WINDOW, NOT_CONNECTED, NOT_GIVEN, ONE_MORE_STEP, REPEAT_SERIES_ONLY, SERIES_FAILED, UNDO_PART, WIDE_PAGES, WRONG_ACCOUNT };
export type { CalendarApi, CalendarSource, SearchItem, VizCalendar };

// Google Calendar side panel (owner request, 2026-10-06). Kept apart from the board store: calendar
// events are Google's, not board data, so nothing here is synced with boards or kept in Version history.
// A change is undone by its own Undo message (job 217) or, while the panel is open, by Ctrl+Z, which goes
// back several steps through this session's event changes, and Ctrl+Y forward again (owner request
// 2026-11-17); that history is in memory only, apart from the board's. It talks to the Calendar API (v3) directly with fetch.

export const SAVE_FAILED = 'That change didn’t reach Google Calendar. Try again later.';
export const BAD_EMAIL = 'That doesn’t look like an email address.';
export const SERIES_ZONE = 'This series is in another time zone: change all of it in Google Calendar.';
export const SERIES_ALL_DAY = 'This event was changed to or from all day on its own: change all of the series in Google Calendar.';
/** A Ctrl+Z or Ctrl+Y that didn't get through: its step is kept, and the message has Try again (owner decision 2026-11-17). */
export const UNDO_FAILED = 'Undo didn’t reach Google Calendar.';
export const REDO_FAILED = 'Redo didn’t reach Google Calendar.';
/** One Google said can't be done: its step is dropped, so the message offers nothing (owner decision 2026-11-17). */
export const UNDO_REFUSED = 'This change can’t be undone: Google refused it.';
export const REDO_REFUSED = 'This change can’t be redone: Google refused it.';
/** A series Ctrl+Y that only half reached Google: dropped, as Google is left mixed. */
export const SERIES_REDO_PART = 'Only this event was redone, not the rest of the series.';
/** Ctrl+Z and Ctrl+Y keep this many event changes (owner request 2026-11-17). */
export const UNDO_LIMIT = 50;
/** How long typing must stop before a search is sent (owner decision, 2026-11-19). */
export const SEARCH_WAIT = 300;

const HISTORY_COPY = {
  undo: { partErr: UNDO_PART, partMsg: UNDO_PART, failed: UNDO_FAILED, refused: UNDO_REFUSED, done: 'Undid the last change' },
  redo: { partErr: SERIES_FAILED, partMsg: SERIES_REDO_PART, failed: REDO_FAILED, refused: REDO_REFUSED, done: 'Redid the last change' },
} as const;

/** The person's answers to the questions the form asks before saving or deleting (job #85). */
export interface Choice {
  /** "All events in the series" rather than "Only this event". */
  all?: boolean;
  /** "Send" update emails to guests; not asked (or "Don't send") never emails. */
  notify?: boolean;
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
  /**
   * The search box (owner request, 2026-11-19), null while closed. `results` is null until Google has answered the
   * text now typed; the text is sent SEARCH_WAIT ms after typing stops. `note` is why a search failed.
   */
  search: { text: string; results: CalEvent[] | null; note: string | null; needsAccess: boolean } | null;
  /**
   * The Week list scrolls on (owner request, 2026-11-20): `events` then holds the events of every week near the one looked at
   * (`day`) whose events are known, and `loaded` those weeks' Sundays; a week near it that isn't there yet shows a placeholder.
   * Empty in the Month view.
   */
  loaded: DayKey[];
  /** Counts the asks to bring the week of `day` into view (‹ ›, Today, a picked day), not a scroll to it. */
  jump: number;
  /** Temporary wide mode for Month view on desktop (view state only; never overwrites saved widths). */
  expanded: boolean;
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

/**
 * The most ranges kept to show at once (owner request, 2026-11-19; 20 for a wide window of 13 weeks, 2026-11-20; 40 for the
 * scrolling Week list, 2026-11-20, which lists WEEKS_AROUND weeks each side): the ones looked at or fetched ahead most recently.
 */
export const CACHE_LIMIT = 40;
/** How many weeks before and after the one looked at the scrolling Week list holds (it draws fewer): the rest are let go. */
export const WEEKS_AROUND = 10;

/** `ahead`: fetch the range before and after the one shown (the tests count calls, so most turn it off). */
export function createCalendar(realApi: CalendarApi | null, today: () => DayKey = () => dayKey(new Date()), storage: Pick<Storage, 'getItem' | 'setItem'> | null = null, ahead = true) {
  const widthStore = createWidthStore(WIDTH_KEY, PANEL_DEFAULT, storage);
  // Weeks and months already fetched, in memory only, newest last (owner request, 2026-11-19): shown at once on stepping, then
  // refreshed. Raw from Google, without the changes in `shownEarly`. `generation` counts the times it was cleared, so an answer
  // that was asked for before a change or a fresh open is never kept.
  const cache = new Map<string, CalEvent[]>();
  const fetching = new Set<string>();
  /** The series master being read for an open event form, reused once by Save so "All events" doesn't ask Google twice. */
  const seriesReads = new Map<string, { req: Promise<CalEvent | null>; done: boolean; at: number }>();
  /** Per-session index of events for partial-match search; cleared on any change, fresh open, or person switch. */
  let searchIndex: Promise<SearchItem[]> | null = null;
  let cachedIndex: SearchItem[] | null = null;
  let generation = 0;
  const forget = () => {
    cache.clear();
    fetching.clear();
    seriesReads.clear();
    searchIndex = null;
    cachedIndex = null;
    generation++;
  };
  const keep = (key: string, events: CalEvent[]) => {
    cache.delete(key);
    cache.set(key, events);
    for (const old of cache.keys()) if (cache.size > CACHE_LIMIT) cache.delete(old);
  };
  // simple: any change to Google (add, save, delete, undo, redo, restore) forgets every fetched range, before and after Google
  // answers, instead of working out which ranges it touches. Once Google has answered, the window around the range shown is
  // fetched again quietly (calendar-save-speed, 2026-11-20), so stepping right after a save shows the weeks at once.
  const changing = <T,>(call: Promise<T>): Promise<T> => {
    forget();
    return call.finally(() => {
      forget();
      fetchAhead(state.view, state.day);
    });
  };
  const api: CalendarApi | null = realApi && {
    ...realApi,
    create: (...a) => changing(realApi.create(...a)),
    update: (...a) => changing(realApi.update(...a)),
    remove: (...a) => changing(realApi.remove(...a)),
    restore: (...a) => changing(realApi.restore(...a)),
  };
  let state: CalendarState = { view: 'week', day: today(), events: null, loading: false, note: null, needsAccess: false, widths: widthStore.get(), done: null, sending: [], search: null, loaded: [], jump: 0, expanded: false };
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
  /** Marks `ids` (and optionally `series` under `key`) as in-flight; returns a release callback that clears them. */
  function trackFlight(key: string, ids: string[], series?: string | null, extra?: Partial<CalendarState>): () => void {
    if (series) sendingSeries.set(key, series);
    set({ sending: [...state.sending, ...ids], ...extra });
    return () => {
      sendingSeries.delete(key);
      set({ sending: state.sending.filter((s) => !ids.includes(s)) });
    };
  }
  const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
  /** Shows (and says aloud) the message after a change, with its Undo when it has a step to undo. */
  const tell = (text: string, step: Entry | null, retry: (() => Promise<unknown>) | null = null) => {
    set({ done: { text, undo: step && (() => runHistoryEntry('undo', step)), retry, n: ++said } });
    // The button is on the message, away from the keyboard: say that it is there.
    announce(retry ? `${text} Try again is on the message.` : text);
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
   * Starts a fresh session: clears cached ranges, optimistic edits, undo/redo history, and search state.
   * `cancelLoad` bumps `asked` so any in-flight `load()` will not overwrite the reset state (used by `disconnect`;
   * `changedPerson` leaves `asked` untouched so `load()` can detect stale calls and re-load for the new person).
   */
  function resetSession(extra: Partial<CalendarState> = {}, cancelLoad = false) {
    session++;
    if (cancelLoad) asked++;
    forget();
    shownKey = null;
    shownEarly.clear();
    undos = [];
    redos = [];
    stopSearch();
    set({ events: null, loaded: [], done: null, search: null, ...extra });
  }

  // The person the kept weeks belong to (owner request, 2026-11-20): when another signs in (or out) with the panel still open,
  // everything kept, and every answer still on its way, is dropped before anything is shown or kept.
  // undefined: not known yet (Google's sign-in code is still loading), which is never a change.
  let cacheFor = api?.person?.();
  const changedPerson = () => {
    const now = api?.person?.();
    if (now === undefined || now === cacheFor) return false;
    const first = cacheFor === undefined;
    cacheFor = now;
    // Learning who it is for the first time is no change, unless something was already kept (then whose it is can't be known).
    if (first && !cache.size && !state.events && !searchIndex) return false;
    // As opening the panel afresh does, except showing the new person's week: the caller loads it.
    resetSession();
    return true;
  };

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
      const release = trackFlight(`step ${to.at}`, step.ids, step.series);
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
        release();
      }
    });
    queue = job;
    return job;
  }
  /** Runs an undo (Ctrl+Z / Undo button) or redo (Ctrl+Y) step at Google, moving it to the opposite stack on success. */
  function runHistoryEntry(dir: 'undo' | 'redo', e: Entry): Promise<void> {
    const sourceList = dir === 'undo' ? undos : redos;
    if (!sourceList.includes(e) || e.flying) return Promise.resolve();
    const opposite = entry();
    if (dir === 'undo') redos = onto(redos, opposite);
    else undos = onto(undos, opposite);
    const copy = HISTORY_COPY[dir];
    return inTurn(e, opposite, async (step) => {
      try {
        await step[dir]();
      } catch (err) {
        const part = err instanceof Error && err.message === copy.partErr;
        // Unless a newer change has its own message by now; a half-done undo/redo is said anyway, as Google is left mixed.
        // A kept step (the same canRetry as inTurn's) gets Try again: the same undo/redo again, as Ctrl+Z/Ctrl+Y again would.
        const kept = canRetry(err);
        if (state.done === null || part) tell(part ? copy.partMsg : kept ? copy.failed : copy.refused, null, kept ? () => runHistoryEntry(dir, e) : null);
        if (part) await load();
        throw err;
      }
      announce(copy.done);
      await load();
    });
  }
  /**
   * What puts an event back as it was (Undo after a save): its old title and time, and its old
   * guests (as Google gave them) when the change sent guests. Never emails them.
   * simple: the time is written in this device's time zone (the same moment), as saving does.
   */
  const putBack = (id: string, was: CalEvent, guests: boolean, recurrence?: string[]) => {
    const body = draftBody(draftFor(was), timeZone());
    // Old times Google allows but the form doesn't (an end not after its start): no Undo.
    return body && (() => api!.update(id, { ...body, ...(guests && { attendees: was.guests }), ...(recurrence !== undefined && { recurrence }) }, false));
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
    // The last change's message goes: its Undo must not race this change.
    const release = trackFlight(id, [id], series, { done: null });
    patch(change);
    const sent = () => {
      shownEarly.delete(id);
      flights.delete(id);
      release();
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

  /** Saves a new event or a single-event update optimistically via `instant`. */
  function saveSingle(event: CalEvent | null, draft: Draft, baseBody: EventBody, attendees: Guest[] | null, notify: boolean | undefined): null {
    // Shown at once; Google is asked in this same tick (no wait before it, so asking for access isn't held back).
    let body = attendees ? { ...baseBody, attendees } : baseBody;
    const addRecurrence =
      !event?.series && draft.repeat && draft.repeat.kind !== 'none' && draft.repeat.kind !== 'unsupported'
        ? toRecurrence(draft.repeat, draft.startDate, draft.allDay)
        : null;
    if (addRecurrence && addRecurrence.length > 0) body = { ...body, recurrence: addRecurrence };
    const sent = body;
    if (event === null) {
      const standIn = `local-${++standIns}`;
      const shown = savedEvent(null, sent, standIn);
      const createdSeries = sent.recurrence !== undefined && sent.recurrence.length > 0;
      const answer = api!.create(sent, notify).then(
        (id): Taken => ({
          text: 'Event added',
          // Redo brings the same event back, so a step made after it (an edit) still finds it.
          step: id ? { undo: () => api!.remove(id, false), redo: () => api!.restore(id), ids: [id], ...(createdSeries && { series: id }) } : null,
          // Already listed by Google's id (a fetch in between): shown once. No id: shown as Google has it.
          after: (l) => (id && !l.some((e) => e.id === id) ? l.map((e) => (e.id === standIn ? { ...e, id } : e)) : l.filter((e) => e.id !== standIn)),
          reload: !id || attendees !== null || createdSeries,
        }),
      );
      instant(standIn, null, (l) => (l.some((e) => e.id === standIn) ? l : [...l, shown]), (l) => l.filter((e) => e.id !== standIn), answer);
      return null;
    }
    const shown = savedEvent(event, sent, event.id);
    const addedRepeat = sent.recurrence !== undefined && sent.recurrence.length > 0;
    const answer = api!.update(event.id, sent, notify).then(
      (): Taken => ({
        text: 'Event saved',
        step: undoSave(event.id, addedRepeat ? event.id : undefined, putBack(event.id, event, sent.attendees !== undefined, addedRepeat ? [] : undefined), () => api!.update(event.id, sent, false)),
        after: (l) => l,
        // Guests' answers, an event of a series (its id may change), or a newly repeating event as Google has them.
        reload: sent.attendees !== undefined || event.series !== null || addedRepeat,
      }),
    );
    // Only this event goes back, and only while it is still shown as changed.
    instant(event.id, event.series, (l) => l.map((e) => (e.id === event.id ? shown : e)), (l) => l.map((e) => (e === shown ? event : e)), answer);
    return null;
  }

  /** Saves "All events in the series": fetches the series master, applies exception + series updates, and reloads quietly. */
  async function saveSeries(event: CalEvent, seriesId: string, draft: Draft, initialAttendees: Guest[] | null, notify: boolean | undefined): Promise<string | null> {
    // "All events in the series" waits for Google (the form shows its answer), as before.
    // Numbered now, so a board change made while Google answers counts as newer.
    const started = tick();
    let own: Partial<EventBody> | null;
    let series: CalEvent | null;
    let body: EventBody | null;
    let attendees = initialAttendees;
    let oldRecurrence: string[] | undefined;
    try {
      const loaded = seriesReads.get(seriesId);
      seriesReads.delete(seriesId);
      const fresh = loaded && (!loaded.done || Date.now() - loaded.at < 2000) ? loaded.req : null;
      series = await (fresh ?? api!.get(seriesId));
      if (!series) return SAVE_FAILED;
      // simple: the series' times are written in this device's time zone, so one kept in
      // another zone (which its repeat rule follows) is left to Google Calendar.
      if (!series.allDay && series.timeZone !== timeZone()) return SERIES_ZONE;
      // This event made all-day (or timed) on its own: its times don't fit the series.
      if (series.allDay !== event.allDay) return SERIES_ALL_DAY;
      const seriesStart = draftFor(series);
      body = draftBody(seriesDraft(draft, draftFor(event), seriesStart), timeZone());
      if (!body) return SAVE_FAILED;
      // Only the guests added or removed here change the series' own list (and its guests' answers stay).
      if (attendees) attendees = guestChanges(event, draft, series);
      if (attendees) body = { ...body, attendees };
      if (draft.repeat !== undefined && draft.repeat.kind !== 'unsupported') {
        const anchor = seriesStart.startDate;
        const current = parseRecurrence(series.recurrence, anchor);
        if (!sameRepeat(current, draft.repeat, anchor, series.allDay)) {
          const repeatErr = validateRepeat(draft.repeat, anchor);
          if (repeatErr) return repeatErr;
          const nextRec = toRecurrence(draft.repeat, anchor, series.allDay);
          if (nextRec !== null) {
            oldRecurrence = series.recurrence ?? [];
            body = { ...body, recurrence: nextRec };
          }
        }
      }
      // Changing recurrence regenerates the series' occurrences, so don't patch an old exception id separately.
      own = oldRecurrence !== undefined ? null : exceptionChange(event, draft, series);
      // The edited event's own change goes first, since the series' change can give it a new id (job #88).
      if (own) await api!.update(event.id, own, notify);
    } catch {
      return SAVE_FAILED;
    }
    let step: Step | null;
    try {
      const seriesBody = body;
      await api!.update(seriesId, seriesBody, notify);
      // The series first, which also gives its events back their old ids, then the edited event's own change.
      const seriesBack = putBack(seriesId, series, attendees !== null, oldRecurrence);
      const ownBack = own && { ...(own.summary !== undefined && { summary: draftFor(event).title }), ...(own.attendees && { attendees: event.guests }) };
      step = undoSave(
        event.id,
        seriesId,
        seriesBack &&
          (async () => {
            await seriesBack();
            // Half undone: the series is back but this event isn't, so the calendar is shown as Google has it.
            if (ownBack) await api!.update(event.id, ownBack, false).catch(() => Promise.reject(new Error(UNDO_PART)));
          }),
        // Redone as it was saved: this event's own change first, then the series (half done: the calendar is shown as Google has it).
        async () => {
          if (own) await api!.update(event.id, own, false);
          await api!.update(seriesId, seriesBody, false).catch((e) => Promise.reject(own ? new Error(SERIES_FAILED) : e));
        },
      );
    } catch {
      if (!own) return SAVE_FAILED;
      // Only this event changed: show the calendar as it now is, and say so.
      await load();
      return SERIES_FAILED;
    }
    // Done once Google has it (calendar-save-speed): the form closes now, and the calendar is fetched again behind it, quietly.
    // Until then the series' events show as on their way and can't be changed again (Google may have given them new ids).
    const e = remember(started);
    e.settle(step);
    tell('Event saved', step ? e : null);
    const key = `reload ${++standIns}`;
    const ids = (state.events ?? []).filter((x) => x.id === event.id || x.series === seriesId).map((x) => x.id);
    const release = trackFlight(key, ids, seriesId);
    const reload = load().finally(() => {
      flights.delete(key);
      release();
    });
    flights.set(key, reload);
    return null;
  }

  const rangeKey = (view: CalView, day: DayKey) => `${view} ${viewRange(view, day).from}`;
  const withEarly = (events: CalEvent[]) => [...shownEarly.values()].reduce((list, change) => change(list), events);
  /** The key of the range whose events are on show, to tell a reload from a move to another range. */
  let shownKey: string | null = null;

  // Weeks and months fetched ahead of the one shown, in one request (owner request, 2026-11-20): in the week view 4 weeks
  // before and 8 after, in the month view the month before and after. `near`: the next window is fetched once any range within
  // that many steps of the one shown is missing, so stepping to 2 weeks from the end of the window fetches the next one.
  // The range shown is in it too when it isn't kept (after a change), so stepping back to it is at once as well.
  const WINDOW = { week: { back: 4, ahead: 8, near: 2 }, month: { back: 1, ahead: 1, near: 1 } };
  function fetchAhead(view: CalView, day: DayKey) {
    if (!api || !ahead) return;
    const w = WINDOW[view];
    const need: { key: string; k: number; from: DayKey; to: DayKey }[] = [];
    for (let k = -w.back; k <= w.ahead; k++) {
      const key = rangeKey(view, moveView(view, day, k));
      if (cache.has(key) || fetching.has(key)) continue;
      need.push({ key, k, ...viewRange(view, moveView(view, day, k)) });
    }
    if (!need.some((n) => Math.abs(n.k) <= w.near)) return;
    const from = need.reduce((a, n) => (n.from < a ? n.from : a), need[0].from);
    const to = need.reduce((a, n) => (n.to > a ? n.to : a), need[0].to);
    const at = generation;
    for (const n of need) fetching.add(n.key);
    api.listWide(from, to).then(
      ({ events, covered }) => {
        // An answer for the person who has since gone is dropped by the clearing, and the panel shows the new person's week.
        if (changedPerson()) return void load();
        if (at !== generation) return;
        // Only the ranges the answer covered whole; the farthest first, so the nearest are kept longest.
        for (const n of [...need].sort((x, y) => Math.abs(y.k) - Math.abs(x.k))) {
          if (n.to <= covered) keep(n.key, events.filter((e) => eventInRange(e, n.from, n.to)));
        }
        // The scrolling Week list shows them straight away, in place of their placeholders.
        if (view === 'week' && state.view === 'week' && state.events !== null) set(weeksShown());
      },
      () => {}, // quiet: stepping there asks again, and shows why if it fails
    ).finally(() => {
      if (at === generation) for (const n of need) fetching.delete(n.key);
    });
  }

  /**
   * The scrolling Week list (owner request, 2026-11-20): the events of the weeks within WEEKS_AROUND of the one looked at,
   * each week from what was fetched (`fresh` first, then the cache), else as it is shown now (a change forgets the cache, and
   * the weeks on screen must not turn back into placeholders meanwhile). Weeks further away are let go, so memory stays bounded.
   */
  function weeksShown(answer?: { key: string; events: CalEvent[] }) {
    const shown = state.events ?? [];
    const seen = new Set<string>();
    const events: CalEvent[] = [];
    const loaded: DayKey[] = [];
    const add = (list: CalEvent[]) => {
      for (const e of list) if (!seen.has(e.id)) seen.add(e.id), events.push(e);
    };
    const weeks = Array.from({ length: 2 * WEEKS_AROUND + 1 }, (_, i) => {
      const key = rangeKey('week', moveView('week', state.day, i - WEEKS_AROUND));
      return { key, ...viewRange('week', moveView('week', state.day, i - WEEKS_AROUND)), raw: answer?.key === key ? answer.events : cache.get(key) };
    });
    // What Google gave first; then, for a week shown but not fetched since, what is shown now, except what is also in a week
    // Google has given (it may have moved or deleted it since).
    const fresh = weeks.filter((w) => w.raw);
    for (const w of fresh) add(w.raw!);
    const kept = weeks.filter((w) => !w.raw && state.loaded.includes(w.from));
    add(shown.filter((e) => kept.some((w) => eventInRange(e, w.from, w.to)) && !fresh.some((w) => eventInRange(e, w.from, w.to))));
    for (const w of weeks) if (w.raw || kept.includes(w)) loaded.push(w.from);
    return { events: loaded.length ? withEarly(events) : null, loaded };
  }

  /** `scrolled`: the Week list was scrolled there by hand (a week that fails to come then stays a placeholder). */
  async function load(scrolled = false): Promise<void> {
    if (!api) return;
    const n = ++asked;
    changedPerson();
    const { view, day } = state;
    const { from, to } = viewRange(view, day);
    const key = rangeKey(view, day);
    const early = cache.get(key);
    const at = generation;
    if (view === 'week') {
      // Every week near it at once; this week is fetched afresh, and is loading (a placeholder) only when it isn't shown yet.
      if (early) keep(key, early);
      const near = weeksShown();
      shownKey = null;
      set({ ...near, loading: !near.loaded.includes(from), note: null, needsAccess: false });
    } else {
      if (state.loaded.length) set({ loaded: [] });
      if (early) {
        // Shown at once; the fresh list replaces it when it arrives. Looked at, so it is kept longest.
        keep(key, early);
        shownKey = key;
        set({ events: withEarly(early), loading: false, note: null, needsAccess: false });
      } else {
        // Never another range's events under this heading (a reload of the same range keeps what is shown).
        if (shownKey !== key) {
          shownKey = null;
          set({ events: null });
        }
        set({ loading: true, note: null, needsAccess: false });
      }
    }
    try {
      const events = await api.list(from, to);
      // Another person since: this is not theirs, so it is neither kept nor shown; ask again for them.
      if (changedPerson()) return n === asked ? load() : undefined;
      if (at === generation) keep(key, events);
      if (view === 'week') {
        // An answer for a week since scrolled past is still shown, if it is still near; never one that set out before a change
        // (it may hold an event since deleted or moved: the weeks shown stay as they are until the fetch after the change).
        if (state.view === 'week') set({ ...weeksShown(at === generation ? { key, events } : undefined), ...(n === asked && { loading: false }) });
        if (n === asked) fetchAhead(view, day);
      } else if (n === asked) {
        shownKey = key;
        set({ events: withEarly(events), loading: false });
        fetchAhead(view, day);
      }
    } catch (e) {
      if (changedPerson()) return n === asked ? load() : undefined;
      cache.delete(key);
      if (n !== asked) return;
      const err = accessNote(e);
      // Scrolled into a week that didn't come: it stays a placeholder (asked again when scrolled back to) and the weeks
      // shown stay. Stepped to (‹ ›, Today), with nothing shown, or when Google needs connecting again: the usual note.
      if (view === 'week' && scrolled && !err.needsAccess && state.loaded.length) set({ loading: false });
      else {
        if (view !== 'week') shownKey = null;
        set({ events: null, ...(view === 'week' && { loaded: [] }), loading: false, ...err });
      }
    }
  }

  // The search typed (owner request, 2026-11-19): sent once typing stops; only the answer to the text now in the box is used.
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let searched = 0;
  function stopSearch() {
    clearTimeout(searchTimer);
    searchTimer = undefined;
    searched++;
  }
  function matchCached(query: string, day: DayKey): CalEvent[] | null {
    if (!cachedIndex || !query) return null;
    const partial = cachedIndex.filter((item) => matchesSearch(item.fields, query)).map((item) => item.event);
    return partial.length ? mergeSearchResults([], partial, day, SEARCH_CAP) : null;
  }
  function getSearchIndex(day: DayKey): Promise<SearchItem[]> {
    if (!api?.listForSearch) return Promise.resolve([]);
    if (!searchIndex) {
      const req = api.listForSearch(day).then(
        (items) => {
          if (changedPerson()) {
            void load();
            return [] as SearchItem[];
          }
          if (searchIndex === req) {
            cachedIndex = items;
            // If the person already typed while the preload was in flight, show matching hits right away.
            const box = state.search;
            if (box && box.results === null && !box.note && box.text.trim()) {
              const instant = matchCached(box.text.trim(), day);
              if (instant) set({ search: { ...box, results: instant } });
            }
          }
          return items;
        },
        () => {
          if (searchIndex === req) {
            searchIndex = null;
            cachedIndex = null;
          }
          return [] as SearchItem[];
        },
      );
      searchIndex = req;
    }
    return searchIndex;
  }
  async function runSearch() {
    const box = state.search;
    if (!api || !box) return;
    if (changedPerson()) return void load();
    const n = ++searched;
    const query = box.text.trim();
    const day = today();
    try {
      const [fromGoogle, index] = await Promise.all([api.search(query, day), getSearchIndex(day)]);
      if (changedPerson()) return void load();
      if (n !== searched) return;
      const partial = index.filter((item) => matchesSearch(item.fields, query)).map((item) => item.event);
      const results = partial.length ? mergeSearchResults(fromGoogle, partial, day, SEARCH_CAP) : fromGoogle;
      set({ search: { ...box, results, note: null, needsAccess: false } });
    } catch (e) {
      if (changedPerson()) return void load();
      if (n === searched) set({ search: { ...box, results: null, ...accessNote(e) } });
    }
  }

  return {
    /** False when no one is signed in (running locally without a demo person). */
    available: api !== null,
    /** The panel offers Disconnect calendar: only with the calendar helper (owner decision 2026-11-20). */
    canDisconnect: Boolean(api?.disconnect),
    /**
     * Disconnect calendar: the helper revokes the connection at Google and forgets it, this device's access goes,
     * and the panel says it is disconnected, with Connect. Rejects, leaving everything as it was, when that failed.
     */
    async disconnect() {
      if (!api?.disconnect) return;
      // Changes still on their way to Google finish first: their answers fetch again, which after it would ask for access.
      while (flights.size) await Promise.all(flights.values());
      await api.disconnect();
      // As opening the panel afresh does: nothing of the connection's is kept or shown.
      resetSession({ loading: false, note: DISCONNECTED, needsAccess: true }, true);
    },
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** The panel opened: today's week or month, fetched afresh (whoever is signed in now). */
    open() {
      resetSession({ day: today(), jump: state.jump + 1, expanded: false });
      return load();
    },
    /** Try again (or Connect Google Calendar) after a note. */
    load,
    openSearch() {
      if (!state.search) {
        set({ search: { text: '', results: null, note: null, needsAccess: false } });
        // Preload the partial-match index quietly as soon as the search box opens so results show instantly while typing.
        void getSearchIndex(today());
      }
    },
    /** Closes the box; the week or month is as it was. */
    closeSearch() {
      stopSearch();
      set({ search: null });
    },
    setSearchText(text: string) {
      stopSearch();
      const query = text.trim();
      const instant = matchCached(query, today());
      set({ search: { text, results: instant, note: null, needsAccess: false } });
      if (query) searchTimer = setTimeout(() => void runSearch(), SEARCH_WAIT);
    },
    /** Try again (or Connect Google Calendar) after a search failed: at once, straight from the click. */
    searchNow() {
      stopSearch();
      if (state.search?.text.trim()) return runSearch();
    },
    setView(view: CalView) {
      set({ view, expanded: false });
      return load();
    },
    /** Toggles temporary wide mode for Month view (never writes to saved widths). */
    setExpanded(expanded: boolean) {
      const next = expanded && state.view === 'month';
      if (state.expanded !== next) set({ expanded: next });
    },
    step(n: number) {
      set({ day: moveView(state.view, state.day, n), jump: state.jump + 1 });
      return load();
    },
    goToday() {
      set({ day: today(), jump: state.jump + 1 });
      return load();
    },
    /**
     * The Week list was scrolled to the week of `day` (owner request, 2026-11-20): it is the one looked at now (its heading,
     * N's day), keeping the weekday as ‹ and › do, and the weeks around it are fetched. The list isn't asked to move.
     */
    scrolledTo(day: DayKey): Promise<void> {
      const from = viewRange('week', day).from;
      const was = viewRange('week', state.day).from;
      if (state.view !== 'week' || from === was) return Promise.resolve();
      set({ day: addDays(state.day, weeksBetween(was, from) * 7) });
      // A week already fetched is shown as fetched, with no request of its own (a fling through weeks would send one per
      // week); the weeks beyond are fetched ahead as usual. ‹ ›, Today, a change and a fresh open still fetch it afresh.
      const key = rangeKey('week', state.day);
      const cached = !changedPerson() && cache.get(key);
      if (!cached) return load(true);
      asked++;
      keep(key, cached);
      set({ ...weeksShown(), loading: false, note: null, needsAccess: false });
      fetchAhead('week', state.day);
      return Promise.resolve();
    },
    pickDay(day: DayKey) {
      const before = viewRange(state.view, state.day);
      set({ day, jump: state.jump + 1 });
      // A greyed day from the month before or after shows that month: fetch it.
      const after = viewRange(state.view, day);
      return after.from === before.from && after.to === before.to ? Promise.resolve() : load();
    },
    /** The panel was dragged (or nudged) to this width for this view: remembered on this device. */
    setWidth(view: CalView, width: number) {
      widthStore.set(view, width);
      set({ widths: widthStore.get(), expanded: false });
    },
    resetWidth(view: CalView) {
      this.setWidth(view, PANEL_DEFAULT[view]);
    },
    /** Reads a repeating event's master record (including its recurrence rules), or null on failure. */
    async getSeries(seriesId: string): Promise<CalEvent | null> {
      if (!api) return null;
      const existing = seriesReads.get(seriesId);
      // Reuse an in-flight read (StrictMode double-mount) or one that just finished; older reads fetch fresh.
      if (existing && (!existing.done || Date.now() - existing.at < 2000)) {
        try {
          return await existing.req;
        } catch {
          return null;
        }
      }
      const entry = { req: api.get(seriesId), done: false, at: Date.now() };
      seriesReads.set(seriesId, entry);
      try {
        const res = await entry.req;
        if (res === null) {
          if (seriesReads.get(seriesId) === entry) seriesReads.delete(seriesId);
          return null;
        }
        entry.done = true;
        entry.at = Date.now();
        return res;
      } catch {
        if (seriesReads.get(seriesId) === entry) seriesReads.delete(seriesId);
        return null;
      }
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
      const body = draftBody(draft, timeZone());
      if (!body) return BAD_TIMES;
      if (!draft.guests.every(isEmail)) return BAD_EMAIL;
      // The whole series keeps its days: only offered while the event is still on its own day.
      const all = choice.all === true;
      const repeatChanged = all && Boolean(draft.repeat && draft.repeat.kind !== 'unsupported');
      const err = validateDraft(draft, {
        event,
        repeatChanged,
        repeatAnchor: draft.startDate,
        validateRepeat: event?.series ? undefined : validateRepeat,
      });
      if (err) return err;
      if (all && (!canChangeSeries(event, draft) || (event?.series && seriesBusy(event.series)))) return SAVE_FAILED;
      // Guests are sent only when the person changed them here (from what this event had).
      const attendees = guestChanges(event, draft);
      const notify = emailGuests(event, draft) ? choice.notify === true : undefined;
      if (!all || !event?.series) return saveSingle(event, draft, body, attendees, notify);
      return saveSeries(event, event.series, draft, attendees, notify);
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
    /** The message's Try again: the undo or redo that didn't get through, tried again (owner decision 2026-11-17). */
    async retry() {
      await state.done?.retry?.();
    },
    /** Ctrl+Z with the panel open: undoes the newest event change of this session, once Google has it. */
    undoLast(): Promise<void> {
      const e = newest(undos);
      return e ? runHistoryEntry('undo', e) : Promise.resolve();
    },
    /** Ctrl+Y (or Ctrl+Shift+Z): makes the last undone event change again. */
    redo(): Promise<void> {
      const e = newest(redos);
      return e ? runHistoryEntry('redo', e) : Promise.resolve();
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

export const calendar = Object.assign(createCalendar(calendarSource && calendarApi(calendarSource), undefined, deviceStorage()), { prepare: () => calendarSource?.prepare?.() });

export function useCalendar(): CalendarState {
  return useSyncExternalStore(calendar.subscribe, calendar.get);
}
