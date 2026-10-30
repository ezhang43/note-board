import { describe, expect, it, vi } from 'vitest';
import type { CalEvent, EventBody } from '../model/calendar';
import { NoAccess } from '../model/calendar';
import { calendarApi, createCalendar, UNDO_FAILED, UNDO_PART, NOT_CONNECTED, NO_WINDOW, NOT_GIVEN, SAVE_FAILED, BAD_TIMES, BAD_EMAIL, SERIES_ZONE, SERIES_ALL_DAY, SERIES_FAILED, type CalendarApi } from './calendar';

// Google Calendar side panel (owner request, 2026-10-06): the panel's state and the calls it makes.
// Calendar events aren't board data: not in Ctrl+Z, synced with boards or kept in versions
// (only the Undo message after a change, job 217).

const ev = (id: string, over: Partial<CalEvent> = {}): CalEvent => ({
  id,
  title: id,
  allDay: false,
  start: '2026-10-06T10:00',
  end: '2026-10-06T11:00',
  editable: true,
  link: 'https://calendar.google.com/',
  series: null,
  guests: [],
  timeZone: null,
  moved: false,
  ...over,
});

const mail = (notify?: boolean) => (notify === undefined ? '' : notify ? ' (emails sent)' : ' (no emails)');

function fakeApi(events: CalEvent[] = [ev('a')]) {
  const calls: string[] = [];
  const api: CalendarApi & { calls: string[]; bodies: Partial<EventBody>[]; fail: boolean; noAccess: 'window' | 'refused' | null; series: Partial<CalEvent>; failId: string | null } = {
    calls,
    fail: false,
    noAccess: null,
    series: {},
    failId: null,
    async list(from, to) {
      calls.push(`list ${from} ${to}`);
      if (api.noAccess) throw new NoAccess(api.noAccess);
      if (api.fail) throw new Error('403');
      return events;
    },
    bodies: [] as Partial<EventBody>[],
    async get(id) {
      calls.push(`get ${id}`);
      if (api.fail) throw new Error('403');
      // A series' own record: its first event was on 1 Sep, kept in this device's time zone.
      return ev(id, { start: '2026-09-01T09:00', end: '2026-09-01T09:15', editable: false, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...api.series });
    },
    async create(body: EventBody, notify?: boolean) {
      calls.push(`create ${body.summary}${mail(notify)}`);
      api.bodies.push(body);
      if (api.fail) throw new Error('403');
      return 'new1';
    },
    async restore(id) {
      calls.push(`restore ${id}`);
      if (api.fail) throw new Error('403');
    },
    async update(id, body, notify) {
      calls.push(`update ${id} ${body.summary}${mail(notify)}`);
      api.bodies.push(body);
      if (api.fail || id === api.failId) throw new Error('403');
      if (!events.some((e) => e.id === id || e.series === id)) throw new Error('404');
      // Like Google, an event of a series has an id made from its series' time, so changing the
      // series' time gives its events new ids, and putting the time back gives the old ids back.
      if (body.start) {
        const back = 'dateTime' in body.start && body.start.dateTime === `${api.series.start ?? '2026-09-01T09:00'}:00`;
        events = events.map((e) => (e.series === id ? { ...e, id: back ? e.id.split('~')[0] : `${e.id.split('~')[0]}~` } : e));
      }
      if (body.summary !== undefined) events = events.map((e) => (e.id === id ? { ...e, title: body.summary! } : e));
    },
    async remove(id, notify) {
      calls.push(`remove ${id}${mail(notify)}`);
      if (api.fail) throw new Error('403');
      const there = events.some((e) => e.id === id || e.series === id);
      events = events.filter((e) => e.id !== id);
      return there;
    },
  };
  return api;
}

const today = () => '2026-10-06';

/** The event as the panel shows it, to open in the form (one not shown is a stand-in). */
const at = (cal: ReturnType<typeof createCalendar>, id: string) => cal.get().events?.find((e) => e.id === id) ?? ev(id);

describe('the calendar panel', () => {
  it('is only there with a calendar to show (signed in, or a demo person)', () => {
    expect(createCalendar(null, today).available).toBe(false);
    expect(createCalendar(fakeApi(), today).available).toBe(true);
  });

  it('opening it shows the events of today and the next six days (not the past days of this week)', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    expect(api.calls).toEqual(['list 2026-10-06 2026-10-13']);
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
    expect(api.calls).toEqual(['list 2026-10-06 2026-10-13', 'list 2026-10-13 2026-10-20', 'list 2026-09-28 2026-11-02', 'list 2026-08-31 2026-10-05', 'list 2026-09-28 2026-11-02']);
  });

  it('in the week view back goes to the seven days before, and Today comes back to today', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.step(-1);
    expect(cal.get().day).toBe('2026-09-29');
    await cal.goToday();
    expect(cal.get().day).toBe('2026-10-06');
    expect(api.calls).toEqual(['list 2026-10-06 2026-10-13', 'list 2026-09-29 2026-10-06', 'list 2026-10-06 2026-10-13']);
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

  it('Month then Week keeps the picked day, and Month steps cross New Year (job #156)', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, () => '2026-12-15');
    await cal.open();
    await cal.setView('month');
    await cal.pickDay('2026-12-20');
    await cal.setView('week');
    expect(cal.get().day).toBe('2026-12-20');
    expect(api.calls[api.calls.length - 1]).toBe('list 2026-12-20 2026-12-27');
    await cal.setView('month');
    await cal.step(1);
    expect(cal.get().day).toBe('2027-01-20');
    expect(api.calls[api.calls.length - 1]).toBe('list 2026-12-28 2027-02-01');
  });

  it('records today’s behavior: a month step from the 31st clamps to a shorter month and stays there', async () => {
    const cal = createCalendar(fakeApi(), () => '2027-01-31');
    await cal.open();
    await cal.setView('month');
    await cal.step(1);
    expect(cal.get().day).toBe('2027-02-28');
    await cal.step(1);
    expect(cal.get().day).toBe('2027-03-28'); // not 31 Mar: the original day is not kept (asked about in job #155)
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
    expect(cal.get()).toMatchObject({ note: NOT_CONNECTED, needsAccess: false, events: null, loading: false });
    api.fail = false;
    await cal.load();
    expect(cal.get().note).toBeNull();
    expect(cal.get().events?.length).toBe(1);
  });

  it('when Google’s window was blocked or closed it says so; Connect asks again', async () => {
    const api = fakeApi();
    api.noAccess = 'window';
    const cal = createCalendar(api, today);
    await cal.open();
    expect(cal.get()).toMatchObject({ note: NO_WINDOW, needsAccess: true, events: null, loading: false });
    api.noAccess = null;
    await cal.load();
    expect(cal.get().note).toBeNull();
    expect(cal.get().events?.length).toBe(1);
  });

  it('when calendar access was refused it says so', async () => {
    const api = fakeApi();
    api.noAccess = 'refused';
    const cal = createCalendar(api, today);
    await cal.open();
    expect(cal.get()).toMatchObject({ note: NOT_GIVEN, needsAccess: true });
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
    api.list = vi.fn((from: string) => (from === '2026-10-06' ? new Promise<CalEvent[]>((r) => (release = r)) : Promise.resolve([ev('next')])));
    const cal = createCalendar(api, today);
    const first = cal.open();
    await cal.step(1);
    release([ev('old')]);
    await first;
    expect(cal.get().events?.map((e) => e.id)).toEqual(['next']);
  });
});

describe('changing events', () => {
  const draft = { title: 'Swim', allDay: false, startDate: '2026-10-07', startTime: '07:00', endDate: '2026-10-07', endTime: '08:00', guests: [] as string[] };

  it('adds an event, then shows the calendar again', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(null, draft)).toBeNull();
    expect(api.calls.slice(1)).toEqual(['create Swim', 'list 2026-10-06 2026-10-13']);
  });

  it('renames or moves a simple event', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(at(cal, 'a'), { ...draft, title: 'Dentist (moved)' })).toBeNull();
    expect(api.calls).toContain('update a Dentist (moved)');
  });

  it('never changes a read-only event', async () => {
    const api = fakeApi([ev('r', { editable: false })]);
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(at(cal, 'r'), draft)).toBe(SAVE_FAILED);
    expect(await cal.remove('r')).toBe(SAVE_FAILED);
    expect(api.calls).toEqual(['list 2026-10-06 2026-10-13']);
  });

  it('refuses an end before the start, without asking Google', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(null, { ...draft, endTime: '06:00' })).toBe(BAD_TIMES);
    expect(api.calls.length).toBe(1);
  });

  it('deletes an event (not in Ctrl+Z: it is Google’s, not the board’s)', async () => {
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

describe('repeating events and guests (job #85)', () => {
  const me = { email: 'me@example.com', self: true };
  const sam = { email: 'sam@example.com', responseStatus: 'accepted' };
  const standUp = ev('su_1016', { title: 'Stand-up', series: 'su', start: '2026-10-16T09:00', end: '2026-10-16T09:15' });
  const lunch = ev('lunch', { title: 'Lunch', guests: [me, sam], start: '2026-10-07T12:30', end: '2026-10-07T13:30' });
  const change = { title: 'Stand-up', allDay: false, startDate: '2026-10-16', startTime: '09:30', endDate: '2026-10-16', endTime: '09:45', guests: [] as string[] };

  it('“Only this event” changes that one event only', async () => {
    const api = fakeApi([standUp]);
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(at(cal, 'su_1016'), change, { all: false })).toBeNull();
    expect(api.calls[1]).toBe('update su_1016 Stand-up');
    expect(api.bodies[0].start).toMatchObject({ dateTime: '2026-10-16T09:30:00' });
  });

  it('“All events in the series” changes the series, keeping its own first day', async () => {
    const api = fakeApi([standUp]);
    api.series = { title: 'Stand-up' };
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(at(cal, 'su_1016'), change, { all: true })).toBeNull();
    expect(api.calls.slice(1, 4)).toEqual(['get su', 'update su Stand-up', 'list 2026-10-06 2026-10-13']);
    expect(api.bodies[0].start).toMatchObject({ dateTime: '2026-09-01T09:30:00' });
    expect(api.bodies[0].end).toMatchObject({ dateTime: '2026-09-01T09:45:00' });
  });

  it('“All events” sends the series only what was changed: one event moved on its own doesn’t move the series (finding 1)', async () => {
    // Today's stand-up was moved to 10:00 on its own; the series (first on 1 Sep) is at 09:00.
    const moved = ev('su_1016', { title: 'Stand-up', series: 'su', start: '2026-10-16T10:00', end: '2026-10-16T10:15' });
    const api = fakeApi([moved]);
    api.series = { title: 'Stand-up' };
    const cal = createCalendar(api, today);
    await cal.open();
    const was = { ...change, startTime: '10:00', endTime: '10:15' };
    expect(await cal.save(at(cal, 'su_1016'), { ...was, title: 'Daily sync' }, { all: true })).toBeNull();
    expect(api.calls[3]).toBe('update su Daily sync');
    expect(api.bodies[1].start).toMatchObject({ dateTime: '2026-09-01T09:00:00' });
    expect(api.bodies[1].end).toMatchObject({ dateTime: '2026-09-01T09:15:00' });
  });

  it('“All events” renames the edited event too when it was changed on its own, keeping its time (finding 2)', async () => {
    // Today's stand-up was moved to 10:00 on its own: Google may leave it out of the series' change.
    const moved = ev('su_1016', { title: 'Stand-up', series: 'su', start: '2026-10-16T10:00', end: '2026-10-16T10:15' });
    const api = fakeApi([moved]);
    api.series = { title: 'Stand-up' };
    const cal = createCalendar(api, today);
    await cal.open();
    const was = { ...change, startTime: '10:00', endTime: '10:15' };
    expect(await cal.save(at(cal, 'su_1016'), { ...was, title: 'Daily sync' }, { all: true })).toBeNull();
    // The event first: the series' change can give it a new id (job #88).
    expect(api.calls.slice(1, 4)).toEqual(['get su', 'update su_1016 Daily sync', 'update su Daily sync']);
    expect(api.bodies[0]).toEqual({ summary: 'Daily sync' });
  });

  it('“All events” with a new time and title, from an event changed on its own, reaches both though the series’ change gives it a new id (job #88)', async () => {
    const moved = ev('su_1016', { title: 'Stand-up', series: 'su', start: '2026-10-16T10:00', end: '2026-10-16T10:15' });
    const api = fakeApi([moved]);
    api.series = { title: 'Stand-up' };
    const cal = createCalendar(api, today);
    await cal.open();
    const was = { ...change, startTime: '10:00', endTime: '10:15' };
    expect(await cal.save(at(cal, 'su_1016'), { ...was, title: 'Daily sync', startTime: '10:30', endTime: '10:45' }, { all: true })).toBeNull();
    expect(api.calls.slice(1)).toEqual(['get su', 'update su_1016 Daily sync', 'update su Daily sync', 'list 2026-10-06 2026-10-13']);
    // Its own time stays; the series gets the new one.
    expect(api.bodies[0]).toEqual({ summary: 'Daily sync' });
    expect(api.bodies[1].start).toMatchObject({ dateTime: '2026-09-01T10:30:00' });
  });

  it('when the edited event’s own change fails, nothing is changed and the series isn’t sent (job #88)', async () => {
    const moved = ev('su_1016', { title: 'Stand-up', series: 'su', start: '2026-10-16T10:00', end: '2026-10-16T10:15' });
    const api = fakeApi([moved]);
    api.series = { title: 'Stand-up' };
    api.failId = 'su_1016';
    const cal = createCalendar(api, today);
    await cal.open();
    const was = { ...change, startTime: '10:00', endTime: '10:15' };
    expect(await cal.save(at(cal, 'su_1016'), { ...was, title: 'Daily sync' }, { all: true })).toBe(SAVE_FAILED);
    expect(api.calls.slice(1)).toEqual(['get su', 'update su_1016 Daily sync']);
  });

  it('when the edited event changed but the series didn’t, it says so, shows the calendar as it now is, and trying again sends both (job #88)', async () => {
    const moved = ev('su_1016', { title: 'Stand-up', series: 'su', start: '2026-10-16T10:00', end: '2026-10-16T10:15' });
    const api = fakeApi([moved]);
    api.series = { title: 'Stand-up' };
    api.failId = 'su';
    const cal = createCalendar(api, today);
    await cal.open();
    const draft = { ...change, startTime: '10:00', endTime: '10:15', title: 'Daily sync' };
    expect(await cal.save(moved, draft, { all: true })).toBe(SERIES_FAILED);
    expect(api.calls.slice(1)).toEqual(['get su', 'update su_1016 Daily sync', 'update su Daily sync', 'list 2026-10-06 2026-10-13']);
    expect(cal.get().events?.[0].title).toBe('Daily sync');
    // The form still holds the event as it opened, so the series still gets the new title.
    api.failId = null;
    expect(await cal.save(moved, draft, { all: true })).toBeNull();
    expect(api.calls.slice(5, 8)).toEqual(['get su', 'update su_1016 Daily sync', 'update su Daily sync']);
  });

  it('“All events” from an event made all-day (or timed) on its own is left to Google Calendar (review, 2026-10-17)', async () => {
    const alone = ev('su_1016', { title: 'Stand-up', series: 'su', allDay: true, start: '2026-10-16', end: '2026-10-17' });
    const api = fakeApi([alone]);
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(at(cal, 'su_1016'), { ...change, title: 'Daily sync', allDay: true, startTime: '09:00', endTime: '10:00' }, { all: true })).toBe(SERIES_ALL_DAY);
    expect(api.calls.slice(1)).toEqual(['get su']);
  });

  it('“All events” is refused when the day was moved, or for an event that doesn’t repeat', async () => {
    const api = fakeApi([standUp, ev('a')]);
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(at(cal, 'su_1016'), { ...change, startDate: '2026-10-17', endDate: '2026-10-17' }, { all: true })).toBe(SAVE_FAILED);
    expect(await cal.save(at(cal, 'a'), draftOf('a'), { all: true })).toBe(SAVE_FAILED);
    expect(await cal.save(at(cal, 'su_1016'), { ...change, allDay: true }, { all: true })).toBe(SAVE_FAILED);
    expect(api.calls).toEqual(['list 2026-10-06 2026-10-13']);
  });

  it('“All events” of a series kept in another time zone is left to Google Calendar', async () => {
    const api = fakeApi([standUp]);
    api.series = { timeZone: 'Pacific/Chatham' };
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(at(cal, 'su_1016'), change, { all: true })).toBe(SERIES_ZONE);
    expect(api.calls.slice(1)).toEqual(['get su']);
  });

  it('“All events” of a series Google gave no time zone for is refused safely, and nothing is changed (job #156)', async () => {
    const api = fakeApi([standUp]);
    api.series = { timeZone: null };
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(at(cal, 'su_1016'), change, { all: true })).toBe(SERIES_ZONE);
    expect(api.calls.filter((c) => c.startsWith('update'))).toEqual([]);
  });

  it('“All events” sends the series’ own guests back (with their answers), and only when the guests changed', async () => {
    const seriesSam = { email: 'sam@example.com', responseStatus: 'needsAction' };
    const one = ev('su_1016', { title: 'Stand-up', series: 'su', start: '2026-10-16T09:00', end: '2026-10-16T09:15', guests: [me, sam] });
    const api = fakeApi([one]);
    api.series = { title: 'Stand-up', guests: [me, seriesSam] };
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.save(at(cal, 'su_1016'), { ...change, guests: ['sam@example.com'] }, { all: true, notify: false });
    expect(api.bodies[0].attendees).toBeUndefined();
    // The series' new time gave the event a new id.
    expect(await cal.save(cal.get().events![0], { ...change, guests: ['sam@example.com', 'pat@example.com'] }, { all: true, notify: false })).toBeNull();
    expect(api.bodies[1].attendees).toEqual([me, seriesSam, { email: 'pat@example.com' }]);
    expect(api.bodies).toHaveLength(2);
  });

  it('deleting one event of a series, or the whole series', async () => {
    const other = ev('su_1017', { series: 'su', start: '2026-10-17T09:00', end: '2026-10-17T09:15' });
    const api = fakeApi([standUp, other, ev('a')]);
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.remove('su_1016', { all: false })).toBeNull();
    expect(cal.get().events?.map((e) => e.id)).toEqual(['su_1017', 'a']);
    expect(await cal.remove('su_1017', { all: true })).toBeNull();
    expect(api.calls.slice(1)).toEqual(['remove su_1016', 'remove su']);
    expect(cal.get().events?.map((e) => e.id)).toEqual(['a']);
  });

  it('with guests, update emails are sent only when the person said Send', async () => {
    const api = fakeApi([lunch]);
    const cal = createCalendar(api, today);
    await cal.open();
    const d = { ...change, title: 'Lunch', startDate: '2026-10-07', endDate: '2026-10-07', guests: ['sam@example.com'] };
    await cal.save(at(cal, 'lunch'), d, { notify: true });
    await cal.save(at(cal, 'lunch'), d, { notify: false });
    await cal.save(at(cal, 'lunch'), d); // not asked: never emails
    await cal.remove('lunch', { notify: true });
    expect(api.calls.filter((c) => !c.startsWith('list'))).toEqual(['update lunch Lunch (emails sent)', 'update lunch Lunch (no emails)', 'update lunch Lunch (no emails)', 'remove lunch (emails sent)']);
  });

  it('without guests nothing about emails is sent to Google', async () => {
    const api = fakeApi([ev('a')]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.save(at(cal, 'a'), draftOf('a'), { notify: true });
    await cal.remove('a', { notify: true });
    expect(api.calls.slice(1)).toEqual(['update a a', 'list 2026-10-06 2026-10-13', 'remove a']);
  });

  it('adds and removes guests; the list is sent only when it changed', async () => {
    const api = fakeApi([lunch]);
    const cal = createCalendar(api, today);
    await cal.open();
    const d = { ...change, title: 'Lunch', startDate: '2026-10-07', endDate: '2026-10-07' };
    await cal.save(at(cal, 'lunch'), { ...d, guests: ['sam@example.com'] }, { notify: false });
    expect(api.bodies[0].attendees).toBeUndefined();
    await cal.save(at(cal, 'lunch'), { ...d, guests: ['sam@example.com', 'pat@example.com'] }, { notify: false });
    expect(api.bodies[1].attendees).toEqual([me, sam, { email: 'pat@example.com' }]);
    await cal.save(at(cal, 'lunch'), { ...d, guests: [] }, { notify: true });
    expect(api.bodies[2].attendees).toEqual([me]);
    expect(api.calls).toContain('update lunch Lunch (emails sent)');
  });

  it('a guest that isn’t an email address is refused, without asking Google', async () => {
    const api = fakeApi([lunch]);
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(null, { ...change, guests: ['not an email'] })).toBe(BAD_EMAIL);
    expect(api.calls.length).toBe(1);
  });

  it('a new event with guests invites them (asking about emails)', async () => {
    const api = fakeApi([]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.save(null, { ...change, guests: ['pat@example.com'] }, { notify: true });
    expect(api.calls[1]).toBe('create Stand-up (emails sent)');
    expect(api.bodies[0].attendees).toEqual([{ email: 'pat@example.com' }]);
  });

  it('a change to a series Google refuses says so', async () => {
    const api = fakeApi([standUp]);
    const cal = createCalendar(api, today);
    await cal.open();
    api.fail = true;
    expect(await cal.save(at(cal, 'su_1016'), change, { all: true })).toBe(SAVE_FAILED);
    expect(await cal.remove('su_1016', { all: true })).toBe(SAVE_FAILED);
    expect(cal.get().events?.map((e) => e.id)).toEqual(['su_1016']);
  });
});

// After a change, a soft "Event added / saved / deleted · Undo" (owner request, 2026-10-29, job 217).
// Undo never emails guests (sendUpdates=none).
describe('Undo after adding, saving or deleting an event (job 217)', () => {
  const me = { email: 'me@example.com', self: true };
  const sam = { email: 'sam@example.com', responseStatus: 'accepted' };
  const swim = { title: 'Swim', allDay: false, startDate: '2026-10-07', startTime: '07:00', endDate: '2026-10-07', endTime: '08:00', guests: [] as string[] };
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const done = (cal: ReturnType<typeof createCalendar>) => cal.get().done?.text ?? null;

  it('adding says “Event added”; Undo deletes the new event without emailing guests, and shows the calendar again', async () => {
    const api = fakeApi([]);
    const cal = createCalendar(api, today);
    await cal.open();
    expect(done(cal)).toBeNull();
    expect(await cal.save(null, { ...swim, guests: ['pat@example.com'] }, { notify: true })).toBeNull();
    expect(done(cal)).toBe('Event added');
    await cal.undo();
    expect(api.calls.slice(-2)).toEqual(['remove new1 (no emails)', 'list 2026-10-06 2026-10-13']);
    expect(done(cal)).toBeNull();
  });

  it('saving says “Event saved”; Undo puts the old title, time and guests back without emailing them', async () => {
    const lunch = ev('lunch', { title: 'Lunch', guests: [me, sam], start: '2026-10-07T12:30', end: '2026-10-07T13:30' });
    const api = fakeApi([lunch]);
    const cal = createCalendar(api, today);
    await cal.open();
    const d = { ...swim, title: 'Brunch', startTime: '11:00', endTime: '12:00', guests: [] };
    expect(await cal.save(at(cal, 'lunch'), d, { notify: true })).toBeNull();
    expect(done(cal)).toBe('Event saved');
    await cal.undo();
    expect(api.calls.at(-2)).toBe('update lunch Lunch (no emails)');
    expect(api.bodies.at(-1)).toEqual({
      summary: 'Lunch',
      start: { dateTime: '2026-10-07T12:30:00', timeZone: zone },
      end: { dateTime: '2026-10-07T13:30:00', timeZone: zone },
      attendees: [me, sam],
    });
  });

  it('Undo of a save leaves the guests alone when they weren’t changed', async () => {
    const api = fakeApi([ev('a')]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.save(at(cal, 'a'), { ...draftOf('a'), title: 'B' });
    await cal.undo();
    expect(api.bodies.at(-1)).toEqual({ summary: 'a', start: { dateTime: '2026-10-06T10:00:00', timeZone: zone }, end: { dateTime: '2026-10-06T11:00:00', timeZone: zone } });
  });

  it('an all-day event’s Undo puts its days back', async () => {
    const api = fakeApi([ev('h', { allDay: true, start: '2026-10-09', end: '2026-10-10' })]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.save(at(cal, 'h'), { ...draftOf('h'), allDay: true, startDate: '2026-10-11', endDate: '2026-10-11' });
    await cal.undo();
    expect(api.bodies.at(-1)).toEqual({ summary: 'h', start: { date: '2026-10-09' }, end: { date: '2026-10-10' } });
  });

  it('“All events in the series”: Undo puts the series back first, then the edited event’s own change', async () => {
    const moved = ev('su_1016', { title: 'Stand-up', series: 'su', start: '2026-10-16T10:00', end: '2026-10-16T10:15' });
    const api = fakeApi([moved]);
    api.series = { title: 'Stand-up' };
    const cal = createCalendar(api, today);
    await cal.open();
    // A new time too: the series' change gives the edited event a new id, and putting it back gives the old one back.
    const d = { ...swim, title: 'Daily sync', startDate: '2026-10-16', endDate: '2026-10-16', startTime: '10:30', endTime: '10:45' };
    expect(await cal.save(at(cal, 'su_1016'), d, { all: true })).toBeNull();
    expect(cal.get().events?.map((e) => e.id)).toEqual(['su_1016~']);
    expect(done(cal)).toBe('Event saved');
    const before = api.bodies.length;
    await cal.undo();
    expect(api.calls.slice(-3)).toEqual(['update su Stand-up (no emails)', 'update su_1016 Stand-up (no emails)', 'list 2026-10-06 2026-10-13']);
    expect(api.bodies[before]).toEqual({ summary: 'Stand-up', start: { dateTime: '2026-09-01T09:00:00', timeZone: zone }, end: { dateTime: '2026-09-01T09:15:00', timeZone: zone } });
    expect(api.bodies[before + 1]).toEqual({ summary: 'Stand-up' });
  });

  it('deleting says “Event deleted”; Undo restores that event, one event of a series, or the whole series, without emails', async () => {
    const one = ev('su_1016', { series: 'su', start: '2026-10-16T09:00', end: '2026-10-16T09:15' });
    const other = ev('su_1017', { series: 'su', start: '2026-10-17T09:00', end: '2026-10-17T09:15' });
    const api = fakeApi([ev('a'), one, other]);
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.remove('a')).toBeNull();
    expect(done(cal)).toBe('Event deleted');
    await cal.undo();
    expect(api.calls.slice(-2)).toEqual(['restore a', 'list 2026-10-06 2026-10-13']);
    await cal.remove('su_1016', { all: false });
    await cal.undo();
    expect(api.calls.slice(-2)[0]).toBe('restore su_1016');
    await cal.remove('su_1017', { all: true });
    await cal.undo();
    expect(api.calls.slice(-2)[0]).toBe('restore su');
  });

  it('an “All events” Undo that only half reaches Google shows the calendar as Google has it and says so', async () => {
    const moved = ev('su_1016', { title: 'Stand-up', series: 'su', start: '2026-10-16T10:00', end: '2026-10-16T10:15' });
    const api = fakeApi([moved]);
    api.series = { title: 'Stand-up' };
    const cal = createCalendar(api, today);
    await cal.open();
    const d = { ...swim, title: 'Daily sync', startDate: '2026-10-16', endDate: '2026-10-16', startTime: '10:30', endTime: '10:45' };
    await cal.save(at(cal, 'su_1016'), d, { all: true });
    // The series goes back (its events get their old ids back), then the event's own change fails.
    api.failId = 'su_1016';
    await cal.undo();
    expect(api.calls.slice(-3)).toEqual(['update su Stand-up (no emails)', 'update su_1016 Stand-up (no emails)', 'list 2026-10-06 2026-10-13']);
    expect(cal.get().events?.map((e) => e.id)).toEqual(['su_1016']);
    expect(cal.get().done).toMatchObject({ text: UNDO_PART, undo: null });
  });

  it('a half-done Undo is said even over a newer message, since Google is left mixed', async () => {
    const moved = ev('su_1016', { title: 'Stand-up', series: 'su', start: '2026-10-16T10:00', end: '2026-10-16T10:15' });
    const api = fakeApi([moved, ev('b')]);
    api.series = { title: 'Stand-up' };
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.save(at(cal, 'su_1016'), { ...swim, title: 'Daily sync', startDate: '2026-10-16', endDate: '2026-10-16', startTime: '10:30', endTime: '10:45' }, { all: true });
    let fail!: () => void;
    api.update = async (id) => {
      if (id === 'su_1016') await new Promise((_, no) => (fail = () => no(new Error('offline'))));
    };
    const undoing = cal.undo();
    await cal.remove('b');
    fail();
    await undoing;
    expect(cal.get().done?.text).toBe(UNDO_PART);
  });

  it('deleting an event that was already gone (deleted in Google Calendar) offers no Undo', async () => {
    const api = fakeApi([ev('a')]);
    const cal = createCalendar(api, today);
    await cal.open();
    api.remove = async () => false;
    expect(await cal.remove('a')).toBeNull();
    expect(cal.get().done).toMatchObject({ text: 'Event deleted', undo: null });
    // The panel was out of date, so it is fetched again: Google may still have it under a new id (404).
    expect(api.calls.at(-1)).toBe('list 2026-10-06 2026-10-13');
    expect(cal.get().events?.map((e) => e.id)).toEqual(['a']);
  });

  it('when Undo doesn’t reach Google it says so, with nothing more to undo', async () => {
    const api = fakeApi([ev('a')]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.remove('a');
    api.fail = true;
    await cal.undo();
    expect(cal.get().done).toMatchObject({ text: UNDO_FAILED, undo: null });
  });

  it('no message when the change itself failed or was refused; a new change replaces the message; dismiss clears it', async () => {
    const api = fakeApi([ev('a'), ev('b')]);
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(null, { ...swim, endTime: '06:00' })).toBe(BAD_TIMES);
    expect(done(cal)).toBeNull();
    api.fail = true;
    expect(await cal.remove('a')).toBe(SAVE_FAILED);
    expect(done(cal)).toBeNull();
    api.fail = false;
    await cal.save(at(cal, 'a'), draftOf('a'));
    const first = cal.get().done!;
    await cal.remove('b');
    expect(done(cal)).toBe('Event deleted');
    expect(cal.get().done!.n).not.toBe(first.n);
    cal.dismissDone();
    expect(done(cal)).toBeNull();
    // Undo with nothing to undo does nothing.
    const calls = api.calls.length;
    await cal.undo();
    expect(api.calls.length).toBe(calls);
  });

  it('an event whose old times can’t be sent back (an end not after its start) gets no Undo', async () => {
    const api = fakeApi([ev('z', { start: '2026-10-06T09:00', end: '2026-10-06T09:00' })]);
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(at(cal, 'z'), { ...draftOf('z'), startTime: '09:00', endTime: '09:30' })).toBeNull();
    expect(cal.get().done).toMatchObject({ text: 'Event saved', undo: null });
  });

  it('a failed undo doesn’t replace a newer message', async () => {
    const api = fakeApi([ev('a'), ev('b')]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.remove('a');
    let fail!: () => void;
    api.restore = () => new Promise((_, no) => (fail = () => no(new Error('offline'))));
    const undoing = cal.undo();
    await cal.remove('b');
    fail();
    await undoing;
    expect(cal.get().done?.text).toBe('Event deleted');
    expect(cal.get().done?.undo).not.toBeNull();
  });

  it('opening the panel again drops the message (someone else may be signed in now)', async () => {
    const api = fakeApi([ev('a')]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.remove('a');
    await cal.open();
    expect(cal.get().done).toBeNull();
  });

  it('an added event Google gave no id for has no Undo', async () => {
    const api = fakeApi([]);
    api.create = async () => null;
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.save(null, swim);
    expect(cal.get().done).toMatchObject({ text: 'Event added', undo: null });
  });
});

function draftOf(id: string) {
  return { title: id, allDay: false, startDate: '2026-10-06', startTime: '10:00', endDate: '2026-10-06', endTime: '11:00', guests: [] as string[] };
}

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
    // Only a title (an event changed on its own, finding 2): no start or end is sent, so its time stays.
    await api.update('c', { summary: 'T' });
    expect(JSON.parse(String(f.calls[2].init.body))).toEqual({ summary: 'T' });
    const del = fakeFetch(204);
    await calendarApi(source(), del.fn).remove('a');
    expect(del.calls[0].init.method).toBe('DELETE');
  });

  it('asks Google to email guests, or not, only when told to (sendUpdates)', async () => {
    const f = fakeFetch(200, {});
    const api = calendarApi(source(), f.fn);
    const body = { summary: 'S', start: { date: '2026-10-08' }, end: { date: '2026-10-09' } };
    await api.create(body);
    await api.create(body, true);
    await api.update('a', body, false);
    await api.remove('a', true);
    expect(f.calls.map((c) => new URL(c.url).searchParams.get('sendUpdates'))).toEqual([null, 'all', 'none', 'all']);
  });

  it('adding gives back the new event’s id; restoring a deleted event sets it back to confirmed, never emailing guests (job 217)', async () => {
    const f = fakeFetch(200, { id: 'new9' });
    const api = calendarApi(source(), f.fn);
    expect(await api.create({ summary: 'S', start: { date: '2026-10-08' }, end: { date: '2026-10-09' } })).toBe('new9');
    await api.restore('a/b');
    expect(f.calls[1].init.method).toBe('PATCH');
    expect(f.calls[1].url).toBe('https://api.test/calendar/v3/calendars/primary/events/a%2Fb?sendUpdates=none');
    expect(JSON.parse(String(f.calls[1].init.body))).toEqual({ status: 'confirmed' });
    expect(await calendarApi(source(), fakeFetch(200, {}).fn).create({ summary: 'S', start: { date: '2026-10-08' }, end: { date: '2026-10-09' } })).toBeNull();
    await expect(calendarApi(source(), fakeFetch(410, {}).fn).restore('a')).rejects.toThrow();
    // An add Google made but whose answer can't be read still counts as added (no Undo), so Save isn't tried twice.
    const cut = vi.fn(async () => new Response('{"id": "ne', { status: 200 })) as unknown as typeof fetch;
    expect(await calendarApi(source(), cut).create({ summary: 'S', start: { date: '2026-10-08' }, end: { date: '2026-10-09' } })).toBeNull();
  });

  it('reads one event (a repeating event’s series) by its id', async () => {
    const f = fakeFetch(200, { id: 's', summary: 'Stand-up', start: { dateTime: '2026-09-01T09:00:00' }, end: { dateTime: '2026-09-01T09:15:00' }, recurrence: ['RRULE:FREQ=DAILY'] });
    const got = await calendarApi(source(), f.fn).get('s');
    expect(f.calls[0].url).toBe('https://api.test/calendar/v3/calendars/primary/events/s');
    expect(got).toMatchObject({ id: 's', start: '2026-09-01T09:00' });
    await expect(calendarApi(source(), fakeFetch(404, {}).fn).get('s')).rejects.toThrow();
  });

  it('an event already deleted elsewhere counts as deleted', async () => {
    await expect(calendarApi(source(), fakeFetch(410, {}).fn).remove('a')).resolves.toBe(false);
    await expect(calendarApi(source(), fakeFetch(404, {}).fn).remove('a')).resolves.toBe(false);
    await expect(calendarApi(source(), fakeFetch(204).fn).remove('a')).resolves.toBe(true);
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

describe('the panel width kept on this device', () => {
  const memory = (start: Record<string, string> = {}) => {
    const data = { ...start };
    return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
  };

  it('starts at the defaults and remembers a width for each view separately', () => {
    const storage = memory();
    const c = createCalendar(null, () => '2026-10-06', storage);
    expect(c.get().widths).toEqual({ week: 420, month: 720 });
    c.setWidth('week', 500);
    c.setWidth('month', 900);
    expect(c.get().widths).toEqual({ week: 500, month: 900 });
    expect(JSON.parse(storage.data['note-board:calendar-width'])).toEqual({ week: 500, month: 900 });
    // A later visit reads them back.
    expect(createCalendar(null, () => '2026-10-06', storage).get().widths).toEqual({ week: 500, month: 900 });
  });

  it('resetWidth puts one view back to its default', () => {
    const c = createCalendar(null, () => '2026-10-06', memory());
    c.setWidth('month', 900);
    c.setWidth('week', 500);
    c.resetWidth('month');
    expect(c.get().widths).toEqual({ week: 500, month: 720 });
  });

  it('bad stored values, or no storage at all, give the defaults and nothing breaks', () => {
    expect(createCalendar(null, () => '2026-10-06', memory({ 'note-board:calendar-width': '{oops' })).get().widths).toEqual({ week: 420, month: 720 });
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    const c = createCalendar(null, () => '2026-10-06', broken);
    expect(c.get().widths.week).toBe(420);
    c.setWidth('week', 480);
    expect(c.get().widths.week).toBe(480);
  });
});
