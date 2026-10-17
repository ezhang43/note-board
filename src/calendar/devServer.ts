import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { dayKey as dateKey } from '../model/calendar';

// A pretend Google Calendar inside `npm run dev` (never in the published site), so the calendar
// panel can be tried and tested without Google: with ?demo-user=Alice the page calls
// /__calendar/calendar/v3/… the way it calls the Calendar API, with the demo person as its token.
// Each demo person gets their own calendar, made on first use and kept in memory until the dev
// server stops: "Dentist" today 10:00–11:00 (simple), "Team stand-up" every day 09:00–09:15
// (repeating), "Lunch with Sam" tomorrow 12:30–13:30 (with a guest), "Holiday" all day in 3 days,
// "Book club" in 2 days 18:00–19:00 (someone else's, the person invited).
// Only what the panel uses: list (timeMin / timeMax), get, add, change and delete on calendars/primary,
// for one event of a series or the whole series (its id), with guests and sendUpdates (job #85).
// Moving a series' time gives its events new ids, as Google can (job #88).

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

function seed(): Event[] {
  const at = (days: number, h: number, m: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    d.setHours(h, m);
    return { dateTime: d.toISOString() };
  };
  const date = (days: number) => {
    const d = new Date();
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

export function devCalendarPlugin(): Plugin {
  return {
    name: 'note-board-dev-calendar',
    apply: 'serve',
    configureServer(vite) {
      const calendars = new Map<string, Event[]>();
      // Events of a series changed on their own ("Only this event"), as "person/id": changing the series leaves them.
      const changedAlone = new Set<string>();
      let next = 1;
      vite.middlewares.use('/__calendar', (req, res) => void handle(req, res));

      async function handle(req: IncomingMessage, res: ServerResponse) {
        const send = (status: number, body?: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(body === undefined ? undefined : JSON.stringify(body));
        };
        const who = /^Bearer (demo-.{1,60})$/u.exec(req.headers.authorization ?? '')?.[1];
        if (!who) return send(401, { error: { code: 401, message: 'Invalid Credentials' } });
        if (!calendars.has(who)) calendars.set(who, seed());
        const events = calendars.get(who)!;
        const url = new URL(req.url ?? '', 'http://dev');
        if (!url.pathname.startsWith(PATH)) return send(404, { error: { code: 404 } });
        const id = decodeURIComponent(url.pathname.slice(PATH.length + 1));
        const found = events.findIndex((e) => e.id === id);
        const sendUpdates = url.searchParams.get('sendUpdates');
        if (sendUpdates !== null && !['all', 'externalOnly', 'none'].includes(sendUpdates)) return send(400, { error: { code: 400, message: 'Invalid sendUpdates' } });
        try {
          if (req.method === 'GET' && !id) {
            const min = Date.parse(url.searchParams.get('timeMin') ?? '');
            const max = Date.parse(url.searchParams.get('timeMax') ?? '');
            const items = events.filter((e) => !e.recurrence && ms(e.start) < max && ms(e.end) > min).sort((a, b) => ms(a.start) - ms(b.start));
            return send(200, { kind: 'calendar#events', items });
          }
          if (req.method === 'POST' && !id) {
            const body = JSON.parse(await readBody(req)) as Partial<Event>;
            if (badGuests(body.attendees)) return send(400, { error: { code: 400, message: 'Invalid attendee email.' } });
            const event: Event = {
              organizer: { self: true },
              reminders: { useDefault: true },
              htmlLink: LINK,
              summary: body.summary ?? '',
              start: body.start ?? {},
              end: body.end ?? {},
              ...(body.attendees !== undefined && { attendees: body.attendees }),
              id: `ev${next++}`,
            };
            events.push(event);
            return send(200, event);
          }
          if (found < 0) return send(id ? 410 : 404, { error: { code: 410, message: 'Resource has been deleted' } });
          if (req.method === 'GET') return send(200, events[found]);
          if (req.method === 'PATCH') {
            const body = JSON.parse(await readBody(req)) as Partial<Event>;
            if (badGuests(body.attendees)) return send(400, { error: { code: 400, message: 'Invalid attendee email.' } });
            // Like Google: a changed start / end is merged into the old one, null clearing a field;
            // one with both a date and a time is refused.
            const merge = (old: When, change?: When): When =>
              Object.fromEntries(Object.entries({ ...old, ...change }).filter(([, v]) => v !== null && v !== undefined));
            const start = merge(events[found].start, body.start);
            const end = merge(events[found].end, body.end);
            if ((start.date && start.dateTime) || (end.date && end.dateTime)) return send(400, { error: { code: 400, message: 'Invalid start time.' } });
            const fields = { ...(body.summary !== undefined && { summary: body.summary }), ...(body.attendees !== undefined && { attendees: body.attendees }) };
            const moved = ms(start) !== ms(events[found].start);
            events[found] = { ...events[found], ...fields, start, end };
            if (events[found].recurringEventId) changedAlone.add(`${who}/${id}`);
            // The whole series: its events not changed on their own follow, each on its own day.
            if (events[found].recurrence) {
              for (const [i, e] of events.entries()) {
                if (e.recurringEventId !== id) continue;
                // Like Google, an event's id comes from its series' time: a new time gives every event a new id (job #88).
                const newId = moved ? `${e.id.split('~')[0]}~${next++}` : e.id;
                if (changedAlone.delete(`${who}/${e.id}`)) changedAlone.add(`${who}/${newId}`);
                else events[i] = { ...e, ...fields, ...shift(e.originalStartTime as When, start, end) };
                events[i] = { ...events[i], id: newId };
              }
            }
            return send(200, events[found]);
          }
          if (req.method === 'DELETE') {
            // The whole series takes its events with it.
            calendars.set(who, events.filter((e) => e.id !== id && e.recurringEventId !== id));
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
