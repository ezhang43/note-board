import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

// A pretend Google Calendar inside `npm run dev` (never in the published site), so the calendar
// panel can be tried and tested without Google: with ?demo-user=Alice the page calls
// /__calendar/calendar/v3/… the way it calls the Calendar API, with the demo person as its token.
// Each demo person gets their own calendar, made on first use and kept in memory until the dev
// server stops: "Dentist" today 10:00–11:00 (simple), "Team stand-up" every day 09:00–09:15
// (repeating), "Lunch with Sam" tomorrow 12:30–13:30 (with a guest), "Holiday" all day in 3 days.
// Only what the panel uses: list (timeMin / timeMax), add, change and delete on calendars/primary.

type Event = Record<string, unknown> & { id: string; start: When; end: When };
type When = { date?: string; dateTime?: string };

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
    return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
  };
  const mine = { organizer: { self: true }, reminders: { useDefault: true }, htmlLink: LINK };
  const events: Event[] = [
    { ...mine, id: 'dentist', summary: 'Dentist', start: at(0, 10, 0), end: at(0, 11, 0) },
    { ...mine, id: 'lunch', summary: 'Lunch with Sam', start: at(1, 12, 30), end: at(1, 13, 30), attendees: [{ email: 'sam@example.com' }] },
    { ...mine, id: 'holiday', summary: 'Holiday', start: date(3), end: date(4) },
  ];
  for (let i = -45; i <= 45; i++) {
    events.push({ ...mine, id: `standup_${i + 45}`, recurringEventId: 'standup', summary: 'Team stand-up', start: at(i, 9, 0), end: at(i, 9, 15) });
  }
  return events;
}

export function devCalendarPlugin(): Plugin {
  return {
    name: 'note-board-dev-calendar',
    apply: 'serve',
    configureServer(vite) {
      const calendars = new Map<string, Event[]>();
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
        try {
          if (req.method === 'GET' && !id) {
            const min = Date.parse(url.searchParams.get('timeMin') ?? '');
            const max = Date.parse(url.searchParams.get('timeMax') ?? '');
            const items = events.filter((e) => ms(e.start) < max && ms(e.end) > min).sort((a, b) => ms(a.start) - ms(b.start));
            return send(200, { kind: 'calendar#events', items });
          }
          if (req.method === 'POST' && !id) {
            const body = JSON.parse(await readBody(req)) as Partial<Event>;
            const event: Event = { organizer: { self: true }, reminders: { useDefault: true }, htmlLink: LINK, summary: body.summary ?? '', start: body.start ?? {}, end: body.end ?? {}, id: `ev${next++}` };
            events.push(event);
            return send(200, event);
          }
          if (found < 0) return send(id ? 410 : 404, { error: { code: 410, message: 'Resource has been deleted' } });
          if (req.method === 'PATCH') {
            const body = JSON.parse(await readBody(req)) as Partial<Event>;
            events[found] = { ...events[found], ...(body.summary !== undefined && { summary: body.summary }), ...(body.start && { start: body.start }), ...(body.end && { end: body.end }) };
            return send(200, events[found]);
          }
          if (req.method === 'DELETE') {
            events.splice(found, 1);
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
