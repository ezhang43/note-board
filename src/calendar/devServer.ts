import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { addDays, dayKey as dateKey } from '../model/calendar';
import { expandRecurrence } from '../model/calendarRepeat';

// A pretend Google Calendar inside `npm run dev` (never in the published site), so the calendar
// panel can be tried and tested without Google: with ?demo-user=Alice the page calls
// /__calendar/calendar/v3/… the way it calls the Calendar API, with the demo person as its token.
// Each demo person gets their own calendar, made on first use and kept in memory until the dev
// server stops: "Dentist" today 10:00–11:00 (simple), "Team stand-up" every day 09:00–09:15
// (repeating), "Lunch with Sam" tomorrow 12:30–13:30 (with a guest), "Holiday" all day in 3 days,
// "Book club" in 2 days 18:00–19:00 (someone else's, the person invited), plus two past events for the
// Visualizer (owner, 2026-11-13): "Kayaking lesson" 3 days ago (passed) and "Pottery workshop" 2 days ago,
// deleted after it started (status cancelled, with an `updated` deletion time after its start).
// Each change sets `updated` (Google's last-modification time); showDeleted also returns cancelled events.
// Only what the panel uses: list (timeMin / timeMax, showDeleted, q for search), get, add, change and delete on calendars/primary,
// for one event of a series or the whole series (its id), with guests and sendUpdates (job #85).
// Moving a series' time gives its events new ids, as Google can (job #88), made from that time, so
// moving it back gives the old ids back. Like Google, a deleted event is kept as cancelled and can be
// restored by setting its status back to confirmed (the Undo message, job 217); a deleted series
// hides its events until restored.

type Event = Record<string, unknown> & { id: string; start: When; end: When };
type When = { date?: string; dateTime?: string; timeZone?: string };

const PATH = '/calendar/v3/calendars/primary/events';
const LINK = 'https://calendar.google.com/calendar/r';

/** When a start / end is, in ms (an all-day date is local midnight). */
function ms(w: When): number {
  if (w.date) {
    const [y, m, d] = w.date.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  return Date.parse(w.dateTime ?? '');
}

/** Local midnight of the day a start / end is on. */
function day(w: When): Date {
  const d = new Date(ms(w));
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Where one event of a series goes when the series' start / end change to `start` / `end`: the
 * same day it was first on, at the series' new time and length.
 */
function shift(first: When, start: When, end: When): { start: When; end: When } {
  const on = day(first);
  if (start.date && end.date) {
    const days = Math.round((day(end).getTime() - day(start).getTime()) / 86_400_000);
    const last = new Date(on);
    last.setDate(last.getDate() + days);
    return { start: { date: dateKey(on) }, end: { date: dateKey(last) } };
  }
  const s = new Date(ms(start));
  const at = new Date(on);
  at.setHours(s.getHours(), s.getMinutes());
  return { start: { dateTime: at.toISOString() }, end: { dateTime: new Date(at.getTime() + ms(end) - ms(start)).toISOString() } };
}

/** Guests must have an email address that looks like one, as Google checks. */
const badGuests = (a: unknown) =>
  a !== undefined && (!Array.isArray(a) || a.some((g) => typeof g?.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email)));

/** The day the demo events are laid out around: today, or the day a test asks for with an `x-demo-today` header ('YYYY-MM-DD'). */
function seedDay(header: string | string[] | undefined): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof header === 'string' ? header : '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : new Date();
}

function seed(base: Date): Event[] {
  const at = (days: number, h: number, m: number) => {
    const d = new Date(base);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    d.setHours(h, m);
    return { dateTime: d.toISOString() };
  };
  const date = (days: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return { date: dateKey(d) };
  };
  const mine = { organizer: { self: true }, reminders: { useDefault: true }, htmlLink: LINK };
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const events: Event[] = [
    { ...mine, id: 'dentist', summary: 'Dentist', start: at(0, 10, 0), end: at(0, 11, 0) },
    {
      ...mine,
      id: 'lunch',
      summary: 'Lunch with Sam',
      start: at(1, 12, 30),
      end: at(1, 13, 30),
      attendees: [
        { email: 'you@example.com', self: true, organizer: true, responseStatus: 'accepted' },
        { email: 'sam@example.com', responseStatus: 'needsAction' },
      ],
    },
    { ...mine, id: 'holiday', summary: 'Holiday', start: date(3), end: date(4) },
    // Past events for the Visualizer (owner, 2026-11-13): one that passed, one deleted after it started.
    { ...mine, id: 'kayaking', summary: 'Kayaking lesson', start: at(-3, 14, 0), end: at(-3, 15, 0) },
    { ...mine, id: 'pottery', summary: 'Pottery workshop', start: at(-2, 10, 0), end: at(-2, 11, 0), status: 'cancelled', updated: at(-2, 12, 0).dateTime },
    {
      id: 'bookclub',
      summary: 'Book club',
      organizer: { email: 'pat@example.com' },
      reminders: { useDefault: true },
      htmlLink: LINK,
      start: at(2, 18, 0),
      end: at(2, 19, 0),
      attendees: [
        { email: 'pat@example.com', organizer: true, responseStatus: 'accepted' },
        { email: 'you@example.com', self: true, responseStatus: 'needsAction' },
      ],
    },
    // The series itself (never listed: the list asks for single events) and its events, each with its first time.
    // Like Google, a series keeps the time zone it repeats in (here the computer's own).
    { ...mine, id: 'standup', summary: 'Team stand-up', recurrence: ['RRULE:FREQ=DAILY'], start: { ...at(-45, 9, 0), timeZone: zone }, end: { ...at(-45, 9, 15), timeZone: zone } },
  ];
  for (let i = -45; i <= 45; i++) {
    const start = at(i, 9, 0);
    events.push({ ...mine, id: `standup_${i + 45}`, recurringEventId: 'standup', originalStartTime: start, summary: 'Team stand-up', start, end: at(i, 9, 15) });
  }
  return events;
}

/** Builds occurrences for a repeating master event over a generous window around its start and the demo day. */
function buildInstances(master: Event, base: Date, stamp: string): Event[] {
  const recurrence = Array.isArray(master.recurrence) ? (master.recurrence as string[]) : [];
  if (!recurrence.length) return [];
  const startDay = master.start.date ?? dateKey(new Date(ms(master.start)));
  const spanDays = recurrence.some((r) => /FREQ=YEARLY/i.test(r)) ? 366 * 3 : 180;
  const endWindow = addDays(startDay > dateKey(base) ? startDay : dateKey(base), spanDays);
  const days = expandRecurrence(startDay, recurrence, startDay, endWindow);
  const out: Event[] = [];
  for (const occDay of days) {
    let start: When;
    let end: When;
    if (master.start.date && master.end.date) {
      const span = Math.max(1, Math.round((day(master.end).getTime() - day(master.start).getTime()) / 86_400_000));
      start = { date: occDay };
      end = { date: addDays(occDay, span) };
    } else {
      const s = new Date(ms(master.start));
      const [y, m, d] = occDay.split('-').map(Number);
      const at = new Date(y, m - 1, d, s.getHours(), s.getMinutes());
      start = { dateTime: at.toISOString() };
      end = { dateTime: new Date(at.getTime() + ms(master.end) - ms(master.start)).toISOString() };
    }
    const { recurrence: _r, ...rest } = master;
    out.push({ ...rest, id: `${master.id}_${occDay}`, recurringEventId: master.id, originalStartTime: start, start, end, updated: stamp });
  }
  return out;
}

export function devCalendarPlugin(): Plugin {
  return {
    name: 'note-board-dev-calendar',
    apply: 'serve',
    configureServer(vite) {
      const calendars = new Map<string, Event[]>();
      // Events of a series changed on their own ("Only this event"), as "person/id": changing the series leaves them.
      const changedAlone = new Set<string>();
      // Each series' first time of day, as "person/id": its events' ids are made from the series' time.
      const firstTime = new Map<string, string>();
      let next = 1;
      // A pretend calendar helper (calendar-helper/, owner decision 2026-11-20), for ?demo-helper=on: it only remembers who
      // connected (until the dev server stops), and gives them an access when asked, as the real one does from its refresh token.
      const connected = new Set<string>();
      vite.middlewares.use('/__calendar-helper', (req, res) => {
        const who = /^Bearer (demo-.{1,60})$/u.exec(req.headers.authorization ?? '')?.[1];
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return send(405, { error: 'method' });
        if (!who) return send(401, { error: 'sign_in' });
        const path = (req.url ?? '').split('?')[0];
        if (path === '/connect') connected.add(who);
        else if (path === '/disconnect') return connected.delete(who), send(200, { ok: true });
        else if (path !== '/access') return send(404, { error: 'path' });
        if (!connected.has(who)) return send(404, { error: 'not_connected' });
        send(200, { access_token: who, expires_in: 3599 });
      });
      vite.middlewares.use('/__calendar', (req, res) => void handle(req, res));

      async function handle(req: IncomingMessage, res: ServerResponse) {
        const send = (status: number, body?: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(body === undefined ? undefined : JSON.stringify(body));
        };
        const who = /^Bearer (demo-.{1,60})$/u.exec(req.headers.authorization ?? '')?.[1];
        if (!who) return send(401, { error: { code: 401, message: 'Invalid Credentials' } });
        const baseDay = seedDay(req.headers['x-demo-today']);
        if (!calendars.has(who)) calendars.set(who, seed(baseDay));
        const events = calendars.get(who)!;
        const url = new URL(req.url ?? '', 'http://dev');
        if (!url.pathname.startsWith(PATH)) return send(404, { error: { code: 404 } });
        const id = decodeURIComponent(url.pathname.slice(PATH.length + 1));
        const found = events.findIndex((e) => e.id === id);
        // Deleted (cancelled), or one event of a deleted series.
        const gone = (e: Event) => e.status === 'cancelled' || events.some((s) => s.id === e.recurringEventId && s.status === 'cancelled');
        // Google's "Last modification time" (used by the Visualizer as a deleted event's deletion time).
        const stamp = () => new Date().toISOString();
        const sendUpdates = url.searchParams.get('sendUpdates');
        if (sendUpdates !== null && !['all', 'externalOnly', 'none'].includes(sendUpdates)) return send(400, { error: { code: 400, message: 'Invalid sendUpdates' } });
        try {
          if (req.method === 'GET' && !id) {
            const min = Date.parse(url.searchParams.get('timeMin') ?? '');
            const max = Date.parse(url.searchParams.get('timeMax') ?? '');
            // showDeleted (the Visualizer): also return events that are themselves cancelled, but never an
            // instance hidden only because its series was deleted (Google returns those as cancelled too,
            // but the dev server keeps it simple: a deleted series just hides its instances).
            const withDeleted = url.searchParams.get('showDeleted') === 'true';
            const shown = (e: Event) => (withDeleted ? e.status === 'cancelled' || !gone(e) : !gone(e));
            // q (search, owner request 2026-11-19): like Google Calendar's real `q` parameter, matches whole
            // words/tokens across name, description, place and guests (not partial substrings — partial matching
            // is handled client-side via listForSearch, owner request 2026-11-23).
            const q = url.searchParams.get('q')?.trim().toLowerCase();
            const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
            const qTerms = q ? words(q) : [];
            const found = (e: Event) => {
              if (!q) return true;
              if (!qTerms.length) return false;
              const pool = new Set(
                [e.summary, e.description, e.location, ...((e.attendees as { email?: string; displayName?: string }[] | undefined) ?? []).flatMap((a) => [a.email, a.displayName])]
                  .filter((t): t is string => typeof t === 'string')
                  .flatMap(words),
              );
              return qTerms.every((t) => pool.has(t));
            };
            const items = events.filter((e) => !e.recurrence && shown(e) && found(e) && ms(e.start) < max && ms(e.end) > min).sort((a, b) => ms(a.start) - ms(b.start));
            return send(200, { kind: 'calendar#events', items });
          }
          if (req.method === 'POST' && !id) {
            const body = JSON.parse(await readBody(req)) as Partial<Event>;
            if (badGuests(body.attendees)) return send(400, { error: { code: 400, message: 'Invalid attendee email.' } });
            const recurrence = Array.isArray(body.recurrence) ? (body.recurrence as string[]).filter((r) => typeof r === 'string' && r.trim() !== '') : [];
            const now = stamp();
            const event: Event = {
              organizer: { self: true },
              reminders: { useDefault: true },
              htmlLink: LINK,
              summary: body.summary ?? '',
              start: body.start ?? {},
              end: body.end ?? {},
              ...(body.attendees !== undefined && { attendees: body.attendees }),
              ...(recurrence.length > 0 && { recurrence }),
              id: `ev${next++}`,
              updated: now,
            };
            events.push(event);
            if (recurrence.length > 0) events.push(...buildInstances(event, baseDay, now));
            return send(200, event);
          }
          if (found < 0) return send(id ? 410 : 404, { error: { code: 410, message: 'Resource has been deleted' } });
          const body = req.method === 'PATCH' ? (JSON.parse(await readBody(req)) as Partial<Event>) : {};
          if (gone(events[found])) {
            // Only restoring a deleted event (not one of a deleted series) is allowed.
            if (req.method !== 'PATCH' || body.status !== 'confirmed' || events[found].status !== 'cancelled') return send(410, { error: { code: 410, message: 'Resource has been deleted' } });
            events[found] = { ...events[found], status: 'confirmed', updated: stamp() };
            return send(200, events[found]);
          }
          if (req.method === 'GET') return send(200, events[found]);
          if (req.method === 'PATCH') {
            if (badGuests(body.attendees)) return send(400, { error: { code: 400, message: 'Invalid attendee email.' } });
            // Like Google: a changed start / end is merged into the old one, null clearing a field;
            // one with both a date and a time is refused.
            const merge = (old: When, change?: When): When =>
              Object.fromEntries(Object.entries({ ...old, ...change }).filter(([, v]) => v !== null && v !== undefined));
            const start = merge(events[found].start, body.start);
            const end = merge(events[found].end, body.end);
            if ((start.date && start.dateTime) || (end.date && end.dateTime)) return send(400, { error: { code: 400, message: 'Invalid start time.' } });
            const fields = { ...(body.summary !== undefined && { summary: body.summary }), ...(body.attendees !== undefined && { attendees: body.attendees }) };
            const newTime = ms(start) !== ms(events[found].start);
            const clock = (w: When) => new Date(ms(w)).toTimeString().slice(0, 5);
            if (!firstTime.has(`${who}/${id}`)) firstTime.set(`${who}/${id}`, clock(events[found].start));
            const hasRecPatch = body.recurrence !== undefined;
            const nextRec = hasRecPatch && Array.isArray(body.recurrence) ? (body.recurrence as string[]).filter((r) => typeof r === 'string' && r.trim() !== '') : null;
            if (hasRecPatch && nextRec === null) return send(400, { error: { code: 400, message: 'Invalid recurrence.' } });
            const now = stamp();
            const updated: Event = { ...events[found], ...fields, start, end, updated: now };
            if (hasRecPatch) {
              if (nextRec!.length > 0) updated.recurrence = nextRec!;
              else delete updated.recurrence;
            }
            events[found] = updated;
            if (events[found].recurringEventId) changedAlone.add(`${who}/${id}`);
            if (hasRecPatch) {
              // Recurrence added, changed, or cleared: drop old instances and rebuild if still repeating.
              for (let i = events.length - 1; i >= 0; i--) {
                if (events[i].recurringEventId === id) {
                  changedAlone.delete(`${who}/${events[i].id}`);
                  events.splice(i, 1);
                }
              }
              if (nextRec!.length > 0) events.push(...buildInstances(updated, baseDay, now));
            } else if (events[found].recurrence) {
              // The whole series: its events not changed on their own follow, each on its own day.
              for (const [i, e] of events.entries()) {
                if (e.recurringEventId !== id) continue;
                const alone = changedAlone.has(`${who}/${e.id}`);
                if (!alone) {
                  const to = shift(e.originalStartTime as When, start, end);
                  events[i] = { ...e, ...fields, ...to, updated: now, ...(newTime && { originalStartTime: to.start }) };
                }
                // Like Google, an event's id comes from its series' time: a new time gives every event a new id (job #88).
                if (newTime) {
                  const base = e.id.split('~')[0];
                  const newId = clock(start) === firstTime.get(`${who}/${id}`) ? base : `${base}~${clock(start).replace(':', '')}`;
                  events[i] = { ...events[i], id: newId };
                  if (alone) {
                    changedAlone.delete(`${who}/${e.id}`);
                    changedAlone.add(`${who}/${newId}`);
                  }
                }
              }
            }
            return send(200, updated);
          }
          if (req.method === 'DELETE') {
            // Kept as cancelled; a whole series hides its events with it. `updated` is the deletion time.
            events[found] = { ...events[found], status: 'cancelled', updated: stamp() };
            return send(204);
          }
          send(405, { error: { code: 405 } });
        } catch {
          send(400, { error: { code: 400, message: 'Bad Request' } });
        }
      }
    },
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((done, fail) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => done(body));
    req.on('error', fail);
  });
}
