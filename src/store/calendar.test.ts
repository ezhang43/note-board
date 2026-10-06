import { describe, expect, it, vi } from 'vitest';
import type { CalEvent, EventBody } from '../model/calendar';
import { calendarApi, createCalendar, NOT_CONNECTED, SAVE_FAILED, BAD_TIMES, type CalendarApi } from './calendar';

// Google Calendar side panel (owner request, 2026-10-06): the panel's state and the calls it makes.
// Calendar events aren't board data: nothing here is undone, synced with boards or kept in versions.

const ev = (id: string, over: Partial<CalEvent> = {}): CalEvent => ({
  id,
  title: id,
  allDay: false,
  start: '2026-10-06T10:00',
  end: '2026-10-06T11:00',
  editable: true,
  link: 'https://calendar.google.com/',
  ...over,
});

function fakeApi(events: CalEvent[] = [ev('a')]) {
  const calls: string[] = [];
  const api: CalendarApi & { calls: string[]; fail: boolean } = {
    calls,
    fail: false,
    async list(from, to) {
      calls.push(`list ${from} ${to}`);
      if (api.fail) throw new Error('403');
      return events;
    },
    async create(body: EventBody) {
      calls.push(`create ${body.summary}`);
      if (api.fail) throw new Error('403');
    },
    async update(id, body) {
      calls.push(`update ${id} ${body.summary}`);
      if (api.fail) throw new Error('403');
    },
    async remove(id) {
      calls.push(`remove ${id}`);
      if (api.fail) throw new Error('403');
      events = events.filter((e) => e.id !== id);
    },
  };
  return api;
}

const today = () => '2026-10-06';

describe('the calendar panel', () => {
  it('is only there with a calendar to show (signed in, or a demo person)', () => {
    expect(createCalendar(null, today).available).toBe(false);
    expect(createCalendar(fakeApi(), today).available).toBe(true);
  });

  it('opening it shows this week’s events', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    expect(api.calls).toEqual(['list 2026-10-05 2026-10-12']);
    expect(cal.get()).toMatchObject({ view: 'week', day: '2026-10-06', note: null, loading: false });
    expect(cal.get().events?.map((e) => e.id)).toEqual(['a']);
  });

  it('back, forward, today and the month view fetch the days shown', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.step(1);
    expect(cal.get().day).toBe('2026-10-13');
    await cal.setView('month');
    await cal.step(-1);
    expect(cal.get().day).toBe('2026-09-13');
    await cal.goToday();
    expect(api.calls).toEqual(['list 2026-10-05 2026-10-12', 'list 2026-10-12 2026-10-19', 'list 2026-09-28 2026-11-02', 'list 2026-08-31 2026-10-05', 'list 2026-09-28 2026-11-02']);
  });

  it('picking a day in the month only selects it (no new fetch while it is in the month shown)', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.setView('month');
    await cal.pickDay('2026-10-20');
    expect(cal.get().day).toBe('2026-10-20');
    expect(api.calls.length).toBe(2);
  });

  it('picking a greyed day from another month in the month view shows that month, fetched', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.setView('month');
    await cal.pickDay('2026-09-28');
    expect(cal.get().day).toBe('2026-09-28');
    expect(api.calls[2]).toBe('list 2026-08-31 2026-10-05');
  });

  it('when Google can’t be reached it shows one plain note, and Try again tries again', async () => {
    const api = fakeApi();
    api.fail = true;
    const cal = createCalendar(api, today);
    await cal.open();
    expect(cal.get()).toMatchObject({ note: NOT_CONNECTED, events: null, loading: false });
    api.fail = false;
    await cal.load();
    expect(cal.get().note).toBeNull();
    expect(cal.get().events?.length).toBe(1);
  });

  it('opening it again forgets what was shown before (a different person may have signed in)', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    api.fail = true;
    const opening = cal.open();
    expect(cal.get().events).toBeNull();
    await opening;
    expect(cal.get().events).toBeNull();
  });

  it('only the answer for the days now shown is used', async () => {
    let release: (v: CalEvent[]) => void = () => {};
    const api = fakeApi();
    api.list = vi.fn((from: string) => (from === '2026-10-05' ? new Promise<CalEvent[]>((r) => (release = r)) : Promise.resolve([ev('next')])));
    const cal = createCalendar(api, today);
    const first = cal.open();
    await cal.step(1);
    release([ev('old')]);
    await first;
    expect(cal.get().events?.map((e) => e.id)).toEqual(['next']);
  });
});

describe('changing events', () => {
  const draft = { title: 'Swim', allDay: false, startDate: '2026-10-07', startTime: '07:00', endDate: '2026-10-07', endTime: '08:00' };

  it('adds an event, then shows the calendar again', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(null, draft)).toBeNull();
    expect(api.calls.slice(1)).toEqual(['create Swim', 'list 2026-10-05 2026-10-12']);
  });

  it('renames or moves a simple event', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save('a', { ...draft, title: 'Dentist (moved)' })).toBeNull();
    expect(api.calls).toContain('update a Dentist (moved)');
  });

  it('never changes a read-only event', async () => {
    const api = fakeApi([ev('r', { editable: false })]);
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save('r', draft)).toBe(SAVE_FAILED);
    expect(await cal.remove('r')).toBe(SAVE_FAILED);
    expect(api.calls).toEqual(['list 2026-10-05 2026-10-12']);
  });

  it('refuses an end before the start, without asking Google', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(null, { ...draft, endTime: '06:00' })).toBe(BAD_TIMES);
    expect(api.calls.length).toBe(1);
  });

  it('deletes an event (no undo: it is Google’s, not the board’s)', async () => {
    const api = fakeApi([ev('a'), ev('b')]);
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.remove('a')).toBeNull();
    expect(cal.get().events?.map((e) => e.id)).toEqual(['b']);
  });

  it('a change Google refuses says so and changes nothing shown', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    api.fail = true;
    expect(await cal.save(null, draft)).toBe(SAVE_FAILED);
    expect(await cal.remove('a')).toBe(SAVE_FAILED);
    expect(cal.get().events?.map((e) => e.id)).toEqual(['a']);
  });
});

describe('talking to the Calendar API', () => {
  function fakeFetch(status = 200, body: unknown = { items: [] }) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return new Response(status === 204 ? null : JSON.stringify(body), { status });
    });
    return { fn: fn as unknown as typeof fetch, calls };
  }
  const source = () => ({ base: 'https://api.test/calendar/v3', token: vi.fn(async () => 'tok'), forget: vi.fn() });

  it('lists the primary calendar’s events between two days, repeating ones as single events', async () => {
    const f = fakeFetch(200, {
      items: [
        { id: 'x', summary: 'X', start: { dateTime: '2026-10-06T10:00:00' }, end: { dateTime: '2026-10-06T11:00:00' }, organizer: { self: true } },
        { id: 'bad' },
      ],
    });
    const api = calendarApi(source(), f.fn);
    const events = await api.list('2026-10-05', '2026-10-12');
    expect(events.map((e) => e.id)).toEqual(['x']);
    const url = new URL(f.calls[0].url);
    expect(url.origin + url.pathname).toBe('https://api.test/calendar/v3/calendars/primary/events');
    expect(url.searchParams.get('singleEvents')).toBe('true');
    expect(url.searchParams.get('orderBy')).toBe('startTime');
    expect(new Date(url.searchParams.get('timeMin')!).getTime()).toBe(new Date(2026, 9, 5).getTime());
    expect(new Date(url.searchParams.get('timeMax')!).getTime()).toBe(new Date(2026, 9, 12).getTime());
    expect((f.calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('adds, changes and deletes with POST, PATCH and DELETE', async () => {
    const f = fakeFetch(200, {});
    const api = calendarApi(source(), f.fn);
    const body = { summary: 'S', start: { date: '2026-10-08' }, end: { date: '2026-10-09' } };
    await api.create(body);
    await api.update('a/b', body);
    expect(f.calls.map((c) => [c.init.method, c.url])).toEqual([
      ['POST', 'https://api.test/calendar/v3/calendars/primary/events'],
      ['PATCH', 'https://api.test/calendar/v3/calendars/primary/events/a%2Fb'],
    ]);
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual(body);
    // Google merges a changed start / end with the old one, so the kind not used now is cleared
    // (else a timed event made all-day would have both a date and a time, which Google refuses).
    expect(JSON.parse(String(f.calls[1].init.body))).toEqual({
      summary: 'S',
      start: { date: '2026-10-08', dateTime: null, timeZone: null },
      end: { date: '2026-10-09', dateTime: null, timeZone: null },
    });
    const del = fakeFetch(204);
    await calendarApi(source(), del.fn).remove('a');
    expect(del.calls[0].init.method).toBe('DELETE');
  });

  it('an event already deleted elsewhere counts as deleted', async () => {
    await expect(calendarApi(source(), fakeFetch(410, {}).fn).remove('a')).resolves.toBeUndefined();
  });

  it('a refused call fails, and a refused sign-in token is forgotten so the next try asks again', async () => {
    const s = source();
    await expect(calendarApi(s, fakeFetch(403, {}).fn).list('2026-10-05', '2026-10-12')).rejects.toThrow();
    expect(s.forget).not.toHaveBeenCalled();
    await expect(calendarApi(s, fakeFetch(401, {}).fn).list('2026-10-05', '2026-10-12')).rejects.toThrow();
    expect(s.forget).toHaveBeenCalled();
  });

  it('a page of nonsense from the server shows no events rather than breaking', async () => {
    expect(await calendarApi(source(), fakeFetch(200, { items: 'nope' }).fn).list('2026-10-05', '2026-10-12')).toEqual([]);
  });
});
