import { describe, expect, it, vi } from 'vitest';
import type { CalEvent, EventBody } from '../model/calendar';
import { NoAccess } from '../model/calendar';
import { tick } from './undoClock';
import { calendarApi, createCalendar, fetchCalendarDone, UNDO_FAILED, UNDO_PART, NOT_CONNECTED, NO_WINDOW, NOT_GIVEN, SAVE_FAILED, BAD_TIMES, BAD_EMAIL, SERIES_ZONE, SERIES_ALL_DAY, SERIES_FAILED, type CalendarApi, type CalendarSource } from './calendar';

// Google Calendar side panel (owner request, 2026-10-06): the panel's state and the calls it makes.
// Calendar events aren't board data: not synced with boards or kept in versions; undone by the Undo
// message after a change (job 217) or Ctrl+Z with the panel open (owner request 2026-11-17).

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

  it('opening it shows the events of this week, Sunday to Saturday (Tuesday 6 Oct: 4 to 10 Oct)', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    expect(api.calls).toEqual(['list 2026-10-04 2026-10-11']);
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
    expect(api.calls).toEqual(['list 2026-10-04 2026-10-11', 'list 2026-10-11 2026-10-18', 'list 2026-09-27 2026-11-01', 'list 2026-08-30 2026-10-04', 'list 2026-09-27 2026-11-01']);
  });

  it('in the week view back goes to the week before, and Today comes back to this week', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.step(-1);
    expect(cal.get().day).toBe('2026-09-29');
    await cal.goToday();
    expect(cal.get().day).toBe('2026-10-06');
    expect(api.calls).toEqual(['list 2026-10-04 2026-10-11', 'list 2026-09-27 2026-10-04', 'list 2026-10-04 2026-10-11']);
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
    expect(api.calls[api.calls.length - 1]).toBe('list 2026-12-27 2027-02-07');
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
    expect(api.calls[2]).toBe('list 2026-08-30 2026-10-04');
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

  it('adds an event and shows it, by the id Google gave it, without fetching the calendar again', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(null, draft)).toBeNull();
    await cal.settled();
    expect(api.calls.slice(1)).toEqual(['create Swim']);
    expect(cal.get().events).toMatchObject([{ id: 'a' }, { id: 'new1', title: 'Swim', start: '2026-10-07T07:00' }]);
  });

  it('renames or moves a simple event', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(at(cal, 'a'), { ...draft, title: 'Dentist (moved)' })).toBeNull();
    await cal.settled();
    expect(api.calls).toContain('update a Dentist (moved)');
  });

  it('never changes a read-only event', async () => {
    const api = fakeApi([ev('r', { editable: false })]);
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(at(cal, 'r'), draft)).toBe(SAVE_FAILED);
    expect(await cal.remove('r')).toBe(SAVE_FAILED);
    expect(api.calls).toEqual(['list 2026-10-04 2026-10-11']);
  });

  it('refuses an end before the start, without asking Google', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(null, { ...draft, endTime: '06:00' })).toBe(BAD_TIMES);
    expect(api.calls.length).toBe(1);
  });

  it('deletes an event', async () => {
    const api = fakeApi([ev('a'), ev('b')]);
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.remove('a')).toBeNull();
    await cal.settled();
    expect(cal.get().events?.map((e) => e.id)).toEqual(['b']);
  });

  it('a change Google refuses says so and changes nothing shown', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    api.fail = true;
    await cal.save(null, draft);
    await cal.settled();
    expect(cal.get().done).toMatchObject({ text: SAVE_FAILED, undo: null });
    await cal.remove('a');
    await cal.settled();
    expect(cal.get().done).toMatchObject({ text: SAVE_FAILED, undo: null });
    await cal.save(at(cal, 'a'), { ...draft, title: 'Dentist' });
    await cal.settled();
    expect(cal.get().done).toMatchObject({ text: SAVE_FAILED, undo: null });
    expect(cal.get().events).toMatchObject([{ id: 'a', title: 'a' }]);
    expect(cal.get().events).toHaveLength(1);
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
    await cal.settled();
    expect(api.calls[1]).toBe('update su_1016 Stand-up');
    expect(api.bodies[0].start).toMatchObject({ dateTime: '2026-10-16T09:30:00' });
  });

  it('“All events in the series” changes the series, keeping its own first day', async () => {
    const api = fakeApi([standUp]);
    api.series = { title: 'Stand-up' };
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(at(cal, 'su_1016'), change, { all: true })).toBeNull();
    await cal.settled();
    expect(api.calls.slice(1, 4)).toEqual(['get su', 'update su Stand-up', 'list 2026-10-04 2026-10-11']);
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
    await cal.settled();
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
    await cal.settled();
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
    await cal.settled();
    expect(api.calls.slice(1)).toEqual(['get su', 'update su_1016 Daily sync', 'update su Daily sync', 'list 2026-10-04 2026-10-11']);
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
    expect(api.calls.slice(1)).toEqual(['get su', 'update su_1016 Daily sync', 'update su Daily sync', 'list 2026-10-04 2026-10-11']);
    expect(cal.get().events?.[0].title).toBe('Daily sync');
    // The form still holds the event as it opened, so the series still gets the new title.
    api.failId = null;
    expect(await cal.save(moved, draft, { all: true })).toBeNull();
    await cal.settled();
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
    expect(api.calls).toEqual(['list 2026-10-04 2026-10-11']);
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
    await cal.settled();
    expect(api.bodies[0].attendees).toBeUndefined();
    // The series' new time gave the event a new id.
    expect(await cal.save(cal.get().events![0], { ...change, guests: ['sam@example.com', 'pat@example.com'] }, { all: true, notify: false })).toBeNull();
    await cal.settled();
    expect(api.bodies[1].attendees).toEqual([me, seriesSam, { email: 'pat@example.com' }]);
    expect(api.bodies).toHaveLength(2);
  });

  it('deleting one event of a series, or the whole series', async () => {
    const other = ev('su_1017', { series: 'su', start: '2026-10-17T09:00', end: '2026-10-17T09:15' });
    const api = fakeApi([standUp, other, ev('a')]);
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.remove('su_1016', { all: false })).toBeNull();
    await cal.settled();
    expect(cal.get().events?.map((e) => e.id)).toEqual(['su_1017', 'a']);
    expect(await cal.remove('su_1017', { all: true })).toBeNull();
    await cal.settled();
    expect(api.calls.slice(1)).toEqual(['remove su_1016', 'remove su']);
    expect(cal.get().events?.map((e) => e.id)).toEqual(['a']);
  });

  it('with guests, update emails are sent only when the person said Send', async () => {
    const api = fakeApi([lunch]);
    const cal = createCalendar(api, today);
    await cal.open();
    const d = { ...change, title: 'Lunch', startDate: '2026-10-07', endDate: '2026-10-07', guests: ['sam@example.com'] };
    await cal.save(at(cal, 'lunch'), d, { notify: true });
    await cal.settled();
    await cal.save(at(cal, 'lunch'), d, { notify: false });
    await cal.settled();
    await cal.save(at(cal, 'lunch'), d); // not asked: never emails
    await cal.settled();
    await cal.remove('lunch', { notify: true });
    await cal.settled();
    expect(api.calls.filter((c) => !c.startsWith('list'))).toEqual(['update lunch Lunch (emails sent)', 'update lunch Lunch (no emails)', 'update lunch Lunch (no emails)', 'remove lunch (emails sent)']);
  });

  it('without guests nothing about emails is sent to Google', async () => {
    const api = fakeApi([ev('a')]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.save(at(cal, 'a'), draftOf('a'), { notify: true });
    await cal.settled();
    await cal.remove('a', { notify: true });
    await cal.settled();
    expect(api.calls.slice(1)).toEqual(['update a a', 'remove a']);
  });

  it('adds and removes guests; the list is sent only when it changed', async () => {
    const api = fakeApi([lunch]);
    const cal = createCalendar(api, today);
    await cal.open();
    const d = { ...change, title: 'Lunch', startDate: '2026-10-07', endDate: '2026-10-07' };
    await cal.save(at(cal, 'lunch'), { ...d, guests: ['sam@example.com'] }, { notify: false });
    await cal.settled();
    expect(api.bodies[0].attendees).toBeUndefined();
    await cal.save(at(cal, 'lunch'), { ...d, guests: ['sam@example.com', 'pat@example.com'] }, { notify: false });
    await cal.settled();
    expect(api.bodies[1].attendees).toEqual([me, sam, { email: 'pat@example.com' }]);
    await cal.save(at(cal, 'lunch'), { ...d, guests: [] }, { notify: true });
    await cal.settled();
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
    await cal.settled();
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
    await cal.settled();
    expect(done(cal)).toBe('Event added');
    await cal.undo();
    expect(api.calls.slice(-2)).toEqual(['remove new1 (no emails)', 'list 2026-10-04 2026-10-11']);
    expect(done(cal)).toBeNull();
  });

  it('saving says “Event saved”; Undo puts the old title, time and guests back without emailing them', async () => {
    const lunch = ev('lunch', { title: 'Lunch', guests: [me, sam], start: '2026-10-07T12:30', end: '2026-10-07T13:30' });
    const api = fakeApi([lunch]);
    const cal = createCalendar(api, today);
    await cal.open();
    const d = { ...swim, title: 'Brunch', startTime: '11:00', endTime: '12:00', guests: [] };
    expect(await cal.save(at(cal, 'lunch'), d, { notify: true })).toBeNull();
    await cal.settled();
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
    await cal.settled();
    await cal.undo();
    expect(api.bodies.at(-1)).toEqual({ summary: 'a', start: { dateTime: '2026-10-06T10:00:00', timeZone: zone }, end: { dateTime: '2026-10-06T11:00:00', timeZone: zone } });
  });

  it('an all-day event’s Undo puts its days back', async () => {
    const api = fakeApi([ev('h', { allDay: true, start: '2026-10-09', end: '2026-10-10' })]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.save(at(cal, 'h'), { ...draftOf('h'), allDay: true, startDate: '2026-10-11', endDate: '2026-10-11' });
    await cal.settled();
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
    await cal.settled();
    expect(cal.get().events?.map((e) => e.id)).toEqual(['su_1016~']);
    expect(done(cal)).toBe('Event saved');
    const before = api.bodies.length;
    await cal.undo();
    expect(api.calls.slice(-3)).toEqual(['update su Stand-up (no emails)', 'update su_1016 Stand-up (no emails)', 'list 2026-10-04 2026-10-11']);
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
    await cal.settled();
    expect(done(cal)).toBe('Event deleted');
    await cal.undo();
    expect(api.calls.slice(-2)).toEqual(['restore a', 'list 2026-10-04 2026-10-11']);
    await cal.remove('su_1016', { all: false });
    await cal.settled();
    await cal.undo();
    expect(api.calls.slice(-2)[0]).toBe('restore su_1016');
    await cal.remove('su_1017', { all: true });
    await cal.settled();
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
    await cal.settled();
    // The series goes back (its events get their old ids back), then the event's own change fails.
    api.failId = 'su_1016';
    await cal.undo();
    expect(api.calls.slice(-3)).toEqual(['update su Stand-up (no emails)', 'update su_1016 Stand-up (no emails)', 'list 2026-10-04 2026-10-11']);
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
    await cal.settled();
    let fail!: () => void;
    api.update = async (id) => {
      if (id === 'su_1016') await new Promise((_, no) => (fail = () => no(new Error('offline'))));
    };
    const undoing = cal.undo();
    await cal.remove('b');
    await cal.settled();
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
    await cal.settled();
    expect(cal.get().done).toMatchObject({ text: 'Event deleted', undo: null });
    // The panel was out of date, so it is fetched again: Google may still have it under a new id (404).
    expect(api.calls.at(-1)).toBe('list 2026-10-04 2026-10-11');
    expect(cal.get().events?.map((e) => e.id)).toEqual(['a']);
  });

  it('when Undo doesn’t reach Google it says so, with nothing more to undo', async () => {
    const api = fakeApi([ev('a')]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.remove('a');
    await cal.settled();
    api.fail = true;
    await cal.undo();
    expect(cal.get().done).toMatchObject({ text: UNDO_FAILED, undo: null });
  });

  it('no message when the change was refused before it was sent, no Undo when Google refused it; a new change replaces the message; dismiss clears it', async () => {
    const api = fakeApi([ev('a'), ev('b')]);
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(null, { ...swim, endTime: '06:00' })).toBe(BAD_TIMES);
    expect(done(cal)).toBeNull();
    api.fail = true;
    expect(await cal.remove('a')).toBeNull();
    await cal.settled();
    expect(done(cal)).toBe(SAVE_FAILED);
    expect(cal.get().done?.undo).toBeNull();
    api.fail = false;
    await cal.save(at(cal, 'a'), draftOf('a'));
    await cal.settled();
    const first = cal.get().done!;
    await cal.remove('b');
    await cal.settled();
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
    await cal.settled();
    expect(cal.get().done).toMatchObject({ text: 'Event saved', undo: null });
  });

  it('a failed undo doesn’t replace a newer message', async () => {
    const api = fakeApi([ev('a'), ev('b')]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.remove('a');
    await cal.settled();
    let fail!: () => void;
    api.restore = () => new Promise((_, no) => (fail = () => no(new Error('offline'))));
    const undoing = cal.undo();
    await cal.remove('b');
    await cal.settled();
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
    await cal.settled();
    await cal.open();
    expect(cal.get().done).toBeNull();
  });

  it('an added event Google gave no id for has no Undo', async () => {
    const api = fakeApi([]);
    api.create = async () => null;
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.save(null, swim);
    await cal.settled();
    expect(cal.get().done).toMatchObject({ text: 'Event added', undo: null });
  });
});

function draftOf(id: string) {
  return { title: id, allDay: false, startDate: '2026-10-06', startTime: '10:00', endDate: '2026-10-06', endTime: '11:00', guests: [] as string[] };
}

describe('dragging an event onto another day (owner request 2026-11-11)', () => {
  const me = { email: 'me@example.com', self: true };
  const sam = { email: 'sam@example.com' };
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const done = (cal: ReturnType<typeof createCalendar>) => cal.get().done;

  it('moves a timed event to the new day, same time and length, then says “Event saved”', async () => {
    const api = fakeApi([ev('a')]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.move('a', '2026-10-06', '2026-10-09');
    // Shown on its new day already: the calendar isn't fetched again.
    expect(api.calls.slice(1)).toEqual(['update a a']);
    expect(api.bodies.at(-1)).toEqual({ summary: 'a', start: { dateTime: '2026-10-09T10:00:00', timeZone: zone }, end: { dateTime: '2026-10-09T11:00:00', timeZone: zone } });
    expect(done(cal)?.text).toBe('Event saved');
  });

  it('an all-day event keeps its number of days; a middle day can be the handle', async () => {
    const api = fakeApi([ev('trip', { allDay: true, start: '2026-10-08', end: '2026-10-11' })]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.move('trip', '2026-10-09', '2026-10-14');
    expect(api.bodies.at(-1)).toEqual({ summary: 'trip', start: { date: '2026-10-13' }, end: { date: '2026-10-16' } });
  });

  it('dropping on its own day, or a read-only or unknown event, asks Google for nothing', async () => {
    const api = fakeApi([ev('a'), ev('r', { editable: false })]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.move('a', '2026-10-06', '2026-10-06');
    await cal.move('r', '2026-10-06', '2026-10-07');
    await cal.move('nope', '2026-10-06', '2026-10-07');
    expect(api.calls).toEqual(['list 2026-10-04 2026-10-11']);
    expect(done(cal)).toBeNull();
  });

  it('with guests, update emails follow the answer; without guests nothing about emails is sent', async () => {
    const api = fakeApi([ev('lunch', { guests: [me, sam] }), ev('solo')]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.move('lunch', '2026-10-06', '2026-10-07', { notify: true });
    expect(api.calls).toContain('update lunch lunch (emails sent)');
    await cal.move('lunch', '2026-10-06', '2026-10-07');
    expect(api.calls).toContain('update lunch lunch (no emails)');
    await cal.move('solo', '2026-10-06', '2026-10-07');
    expect(api.calls).toContain('update solo solo');
    // The guests are not sent again: only the time changed.
    expect(api.bodies.every((b) => b.attendees === undefined)).toBe(true);
  });

  it('one event of a repeating series moves on its own; the series is not asked for or changed', async () => {
    const api = fakeApi([ev('s~1', { series: 's', title: 'Stand-up' })]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.move('s~1', '2026-10-06', '2026-10-08');
    expect(api.calls.slice(1)).toEqual(['update s~1 Stand-up', 'list 2026-10-04 2026-10-11']);
  });

  it('shows it on the new day at once, while Google is still answering', async () => {
    const api = fakeApi([ev('a')]);
    const cal = createCalendar(api, today);
    await cal.open();
    let release!: () => void;
    const slow = api.update;
    api.update = async (...args) => {
      await new Promise<void>((r) => (release = r));
      return slow(...args);
    };
    const moving = cal.move('a', '2026-10-06', '2026-10-09');
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(cal.get().events?.[0]).toMatchObject({ id: 'a', start: '2026-10-09T10:00', end: '2026-10-09T11:00' });
    release();
    await moving;
  });

  it('when Google refuses, the event goes back to its old day and the usual note shows, with no Undo', async () => {
    const api = fakeApi([ev('a')]);
    const cal = createCalendar(api, today);
    await cal.open();
    api.fail = true;
    await cal.move('a', '2026-10-06', '2026-10-09');
    expect(cal.get().events?.[0]).toMatchObject({ id: 'a', start: '2026-10-06T10:00', end: '2026-10-06T11:00' });
    expect(done(cal)).toMatchObject({ text: SAVE_FAILED, undo: null });
  });

  it('with two moves on their way, one that Google refuses puts back only its own event', async () => {
    const api = fakeApi([ev('a'), ev('b')]);
    const cal = createCalendar(api, today);
    await cal.open();
    const release: Record<string, () => void> = {};
    const slow = api.update;
    api.update = async (...args) => {
      await new Promise<void>((r) => (release[args[0]] = r));
      if (args[0] === 'a') throw new Error('403');
      return slow(...args);
    };
    const first = cal.move('a', '2026-10-06', '2026-10-09');
    const second = cal.move('b', '2026-10-06', '2026-10-09');
    await vi.waitFor(() => expect(release.a && release.b).toBeDefined());
    release.a();
    await first;
    expect(cal.get().events).toMatchObject([
      { id: 'a', start: '2026-10-06T10:00' },
      { id: 'b', start: '2026-10-09T10:00' },
    ]);
    release.b();
    await second;
  });

  it('an event already being moved is not moved again until Google has answered', async () => {
    const api = fakeApi([ev('a')]);
    const cal = createCalendar(api, today);
    await cal.open();
    let release!: () => void;
    const slow = api.update;
    api.update = async (...args) => {
      await new Promise<void>((r) => (release = r));
      return slow(...args);
    };
    const first = cal.move('a', '2026-10-06', '2026-10-09');
    await vi.waitFor(() => expect(release).toBeDefined());
    await cal.move('a', '2026-10-09', '2026-10-12');
    release();
    await first;
    expect(api.calls.filter((c) => c.startsWith('update'))).toEqual(['update a a']);
  });

  it('Undo puts the old day back and never emails the guests', async () => {
    const api = fakeApi([ev('lunch', { guests: [me, sam] })]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.move('lunch', '2026-10-06', '2026-10-09', { notify: true });
    await cal.undo();
    expect(api.calls.at(-2)).toBe('update lunch lunch (no emails)');
    expect(api.bodies.at(-1)).toEqual({ summary: 'lunch', start: { dateTime: '2026-10-06T10:00:00', timeZone: zone }, end: { dateTime: '2026-10-06T11:00:00', timeZone: zone } });
    expect(done(cal)).toBeNull();
  });
});

/**
 * Holds one kind of call to Google until the test answers it (or refuses it, as when offline), to see
 * what the panel shows while Google is still answering. Calls are answered in the order they were made.
 */
function hold(api: ReturnType<typeof fakeApi>, kind: 'create' | 'update' | 'remove') {
  const real = api[kind] as (...args: unknown[]) => Promise<unknown>;
  const waiting: { ok: () => void; no: () => void }[] = [];
  (api as unknown as Record<string, unknown>)[kind] = (...args: unknown[]) =>
    new Promise((ok, no) => waiting.push({ ok: () => ok(real(...args)), no: () => no(new Error('offline')) }));
  return {
    answer: () => waiting.shift()!.ok(),
    refuse: () => waiting.shift()!.no(),
    get waiting() {
      return waiting.length;
    },
  };
}

describe('changes show at once while Google is told in the background (owner request 2026-11-17)', () => {
  const swim = { title: 'Swim', allDay: false, startDate: '2026-10-07', startTime: '07:00', endDate: '2026-10-07', endTime: '08:00', guests: [] as string[] };
  const ids = (cal: ReturnType<typeof createCalendar>) => cal.get().events?.map((e) => e.id);

  it('a new event shows at once with a stand-in id, then gets Google’s id and “Event added” when Google answers', async () => {
    const api = fakeApi([ev('a')]);
    const cal = createCalendar(api, today);
    await cal.open();
    const google = hold(api, 'create');
    expect(await cal.save(null, swim)).toBeNull();
    const shown = cal.get().events!.find((e) => e.title === 'Swim')!;
    expect(shown).toMatchObject({ start: '2026-10-07T07:00', end: '2026-10-07T08:00', editable: true });
    expect(shown.id).not.toBe('new1');
    expect(cal.get().sending).toEqual([shown.id]);
    expect(cal.get().done).toBeNull();
    google.answer();
    await cal.settled();
    expect(ids(cal)).toEqual(['a', 'new1']);
    expect(cal.get().sending).toEqual([]);
    expect(cal.get().done).toMatchObject({ text: 'Event added' });
    // Nothing is fetched again: the list already shows what Google now has.
    expect(api.calls).toEqual(['list 2026-10-04 2026-10-11', 'create Swim']);
  });

  it('a change shows at once and “Event saved” comes when Google answers, with no fetch after', async () => {
    const api = fakeApi([ev('a')]);
    const cal = createCalendar(api, today);
    await cal.open();
    const google = hold(api, 'update');
    expect(await cal.save(at(cal, 'a'), { ...draftOf('a'), title: 'Dentist', startTime: '12:00', endTime: '13:00' })).toBeNull();
    expect(cal.get().events).toMatchObject([{ id: 'a', title: 'Dentist', start: '2026-10-06T12:00', end: '2026-10-06T13:00' }]);
    expect(cal.get().done).toBeNull();
    google.answer();
    await cal.settled();
    expect(cal.get().done).toMatchObject({ text: 'Event saved' });
    expect(api.calls).toEqual(['list 2026-10-04 2026-10-11', 'update a Dentist']);
  });

  it('a delete takes the event off at once; “Event deleted” comes when Google answers', async () => {
    const api = fakeApi([ev('a'), ev('b')]);
    const cal = createCalendar(api, today);
    await cal.open();
    const google = hold(api, 'remove');
    expect(await cal.remove('a')).toBeNull();
    expect(ids(cal)).toEqual(['b']);
    expect(cal.get().done).toBeNull();
    google.answer();
    await cal.settled();
    expect(ids(cal)).toEqual(['b']);
    expect(cal.get().done).toMatchObject({ text: 'Event deleted' });
    expect(cal.get().done?.undo).not.toBeNull();
  });

  it('when Google refuses, only that event goes back, and the message says so with no Undo', async () => {
    const api = fakeApi([ev('a'), ev('b', { start: '2026-10-06T12:00', end: '2026-10-06T13:00' })]);
    const cal = createCalendar(api, today);
    await cal.open();
    const adding = hold(api, 'create');
    const saving = hold(api, 'update');
    const deleting = hold(api, 'remove');
    await cal.save(null, swim);
    await cal.save(at(cal, 'a'), { ...draftOf('a'), title: 'Renamed' });
    await cal.remove('b');
    const swimId = cal.get().events!.find((e) => e.title === 'Swim')!.id;
    expect(ids(cal)).toEqual(['a', swimId]);
    saving.refuse();
    await vi.waitFor(() => expect(cal.get().done).toMatchObject({ text: SAVE_FAILED, undo: null }));
    expect(cal.get().events).toMatchObject([{ id: 'a', title: 'a' }, { id: swimId, title: 'Swim' }]);
    adding.refuse();
    await vi.waitFor(() => expect(ids(cal)).toEqual(['a']));
    deleting.refuse();
    await cal.settled();
    expect(ids(cal)).toEqual(['a', 'b']);
    expect(cal.get().done).toMatchObject({ text: SAVE_FAILED, undo: null });
    expect(cal.get().sending).toEqual([]);
  });

  it('a note that needs no answer from Google still comes back at once, and nothing is shown or sent', async () => {
    const api = fakeApi([ev('a')]);
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.save(null, { ...swim, endTime: '06:00' })).toBe(BAD_TIMES);
    expect(await cal.save(at(cal, 'a'), { ...draftOf('a'), guests: ['not an email'] })).toBe(BAD_EMAIL);
    expect(ids(cal)).toEqual(['a']);
    expect(cal.get().events?.[0].title).toBe('a');
    expect(api.calls).toEqual(['list 2026-10-04 2026-10-11']);
  });

  it('Undo is offered only once Google has answered, so it never runs on the stand-in id', async () => {
    const api = fakeApi([]);
    const cal = createCalendar(api, today);
    await cal.open();
    const google = hold(api, 'create');
    await cal.save(null, swim);
    await cal.undo();
    expect(api.calls).toEqual(['list 2026-10-04 2026-10-11']);
    google.answer();
    await cal.settled();
    await cal.undo();
    expect(api.calls.slice(-2)).toEqual(['remove new1 (no emails)', 'list 2026-10-04 2026-10-11']);
  });

  it('a new change takes away the last change’s message, so its Undo can’t race the new change', async () => {
    const api = fakeApi([ev('a')]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.save(at(cal, 'a'), { ...draftOf('a'), title: 'B' });
    await cal.settled();
    expect(cal.get().done?.text).toBe('Event saved');
    const google = hold(api, 'update');
    await cal.save(at(cal, 'a'), { ...draftOf('a'), title: 'C' });
    expect(cal.get().done).toBeNull();
    google.answer();
    await cal.settled();
  });

  it('an event with a change on its way can’t be changed, deleted or moved again until Google answers', async () => {
    const api = fakeApi([ev('a')]);
    const cal = createCalendar(api, today);
    await cal.open();
    const adding = hold(api, 'create');
    const saving = hold(api, 'update');
    await cal.save(null, swim);
    await cal.save(at(cal, 'a'), { ...draftOf('a'), title: 'B' });
    const stand = cal.get().events!.find((e) => e.title === 'Swim')!;
    expect(await cal.remove(stand.id)).toBe(SAVE_FAILED);
    expect(await cal.save(stand, { ...swim, title: 'Swim more' })).toBe(SAVE_FAILED);
    expect(await cal.remove('a')).toBe(SAVE_FAILED);
    expect(await cal.save(at(cal, 'a'), { ...draftOf('a'), title: 'C' })).toBe(SAVE_FAILED);
    await cal.move('a', '2026-10-06', '2026-10-08');
    expect(adding.waiting + saving.waiting).toBe(2);
    expect(api.calls).toEqual(['list 2026-10-04 2026-10-11']);
    adding.answer();
    saving.answer();
    await cal.settled();
    // Once answered, the new event is changed by Google’s id.
    expect(await cal.remove('new1')).toBeNull();
    await cal.settled();
    expect(api.calls).toContain('remove new1');
  });

  it('a list fetched while a change is on its way (another week and back, or an Undo’s fetch) still shows the change', async () => {
    const list = [ev('a'), ev('b')];
    const api = fakeApi(list);
    const cal = createCalendar(api, today);
    await cal.open();
    const deleting = hold(api, 'remove');
    const adding = hold(api, 'create');
    await cal.remove('a');
    await cal.save(null, swim);
    await cal.step(1);
    await cal.step(-1);
    expect(cal.get().events?.map((e) => e.title)).toEqual(['b', 'Swim']);
    // Google already lists the new event by the time it answers: it is shown once, by Google's id.
    list.push(ev('new1', { title: 'Swim', start: '2026-10-07T07:00', end: '2026-10-07T08:00' }));
    await cal.goToday();
    adding.answer();
    deleting.answer();
    await cal.settled();
    expect(ids(cal)).toEqual(['b', 'new1']);
  });

  it('opening the panel again drops changes still on their way from what is shown (someone else may be signed in); a yes then fetches the calendar again, with no Undo', async () => {
    const api = fakeApi([ev('a'), ev('b')]);
    const cal = createCalendar(api, today);
    await cal.open();
    const adding = hold(api, 'create');
    const deleting = hold(api, 'remove');
    await cal.save(null, swim);
    await cal.remove('a');
    await cal.remove('b');
    await cal.open();
    expect(ids(cal)).toEqual(['a', 'b']);
    adding.answer();
    await vi.waitFor(() => expect(cal.get().done).toMatchObject({ text: 'Event added', undo: null }));
    deleting.answer();
    await vi.waitFor(() => expect(cal.get().done).toMatchObject({ text: 'Event deleted', undo: null }));
    // The calendar as Google now has it: 'a' is gone.
    await vi.waitFor(() => expect(ids(cal)).toEqual(['b']));
    expect(api.calls.at(-1)).toBe('list 2026-10-04 2026-10-11');
    deleting.refuse();
    await cal.settled();
    expect(ids(cal)).toEqual(['b']);
    expect(cal.get().done).toMatchObject({ text: SAVE_FAILED, undo: null });
  });

  it('a change Google says yes to while a fetch is running still shows once that fetch (read before the change) lands', async () => {
    const api = fakeApi([ev('a'), ev('b')]);
    const cal = createCalendar(api, today);
    await cal.open();
    const deleting = hold(api, 'remove');
    await cal.remove('a');
    // A fetch that reads the calendar now, before Google has the delete, and answers late.
    const real = api.list.bind(api);
    let land = () => {};
    api.list = (from, to) => {
      const read = real(from, to);
      api.list = real;
      return new Promise((ok) => (land = () => ok(read)));
    };
    const fetching = cal.step(0);
    deleting.answer();
    await vi.waitFor(() => expect(cal.get().done?.text).toBe('Event deleted'));
    land();
    await fetching;
    await cal.settled();
    expect(ids(cal)).toEqual(['b']);
  });

  it('a drag that gives no times Google’s form allows (start equal to end) does nothing and says nothing', async () => {
    const api = fakeApi([ev('a', { start: '2026-10-06T10:00', end: '2026-10-06T10:00' })]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.move('a', '2026-10-06', '2026-10-08');
    expect(cal.get().done).toBeNull();
    expect(api.calls).toEqual(['list 2026-10-04 2026-10-11']);
  });

  it('“All events in the series” waits while one event of that series still has a change on its way', async () => {
    const api = fakeApi([ev('su_1', { series: 'su' }), ev('su_2', { series: 'su', start: '2026-10-07T09:00', end: '2026-10-07T10:00' })]);
    const cal = createCalendar(api, today);
    await cal.open();
    const deleting = hold(api, 'remove');
    await cal.remove('su_1', { all: false });
    expect(await cal.remove('su_2', { all: true })).toBe(SAVE_FAILED);
    expect(await cal.save(at(cal, 'su_2'), { ...draftOf('su_2'), title: 'Sync' }, { all: true })).toBe(SAVE_FAILED);
    expect(api.calls).toEqual(['list 2026-10-04 2026-10-11']);
    deleting.answer();
    await cal.settled();
    const all = cal.remove('su_2', { all: true });
    await vi.waitFor(() => expect(deleting.waiting).toBe(1));
    deleting.answer();
    expect(await all).toBeNull();
  });

  it('changing guests, or one event of a series, fetches the calendar again once Google says yes', async () => {
    const api = fakeApi([ev('a'), ev('su_1', { series: 'su' })]);
    const cal = createCalendar(api, today);
    await cal.open();
    await cal.save(at(cal, 'a'), { ...draftOf('a'), guests: ['sam@example.com'] }, { notify: false });
    await cal.settled();
    expect(api.calls.slice(-2)).toEqual(['update a a (no emails)', 'list 2026-10-04 2026-10-11']);
    await cal.save(at(cal, 'su_1'), { ...draftOf('su_1'), title: 'Stand-up' }, { all: false });
    await cal.settled();
    expect(api.calls.slice(-2)).toEqual(['update su_1 Stand-up', 'list 2026-10-04 2026-10-11']);
  });

  it('“All events in the series” still waits for Google: nothing is shown or answered until it has', async () => {
    const standUp = ev('su_1016', { title: 'Stand-up', series: 'su', start: '2026-10-16T09:00', end: '2026-10-16T09:15' });
    const api = fakeApi([standUp]);
    api.series = { title: 'Stand-up' };
    const cal = createCalendar(api, today);
    await cal.open();
    const saving = hold(api, 'update');
    let answered = false;
    const save = cal
      .save(at(cal, 'su_1016'), { ...swim, title: 'Daily sync', startDate: '2026-10-16', endDate: '2026-10-16', startTime: '09:00', endTime: '09:15' }, { all: true })
      .then((n) => ((answered = true), n));
    await vi.waitFor(() => expect(saving.waiting).toBe(1));
    expect(answered).toBe(false);
    expect(cal.get().events?.[0].title).toBe('Stand-up');
    saving.answer();
    expect(await save).toBeNull();
    const deleting = hold(api, 'remove');
    let gone = false;
    const remove = cal.remove(cal.get().events![0].id, { all: true }).then((n) => ((gone = true), n));
    await vi.waitFor(() => expect(deleting.waiting).toBe(1));
    expect(gone).toBe(false);
    expect(cal.get().events).toHaveLength(1);
    deleting.refuse();
    expect(await remove).toBe(SAVE_FAILED);
    expect(cal.get().events).toHaveLength(1);
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

// Past and deleted events for the Visualizer (owner, 2026-11-13): fetchCalendarDone uses only access
// already kept on this device (keptToken), never opening Google's window (so a source whose token()
// throws must still work), pages through the results, and turns 401 into "open Calendar once" and any
// other failure into a quiet error. uid null means nobody is signed in: nothing about the calendar.
describe('fetchCalendarDone (Visualizer: past and deleted events)', () => {
  const RANGE = '7';
  const TODAY = '2026-11-13';
  const res = (body: unknown, status = 200): Response => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

  /** A source that gives a kept token but whose token() throws, so a fetch that opened Google's window would fail the test. */
  const source = (over: Partial<CalendarSource> = {}): CalendarSource => ({
    base: 'https://cal.test/v3',
    token: () => Promise.reject(new Error('token() must never be called from the Visualizer')),
    forget: () => {},
    keptToken: async () => 'kept-token',
    ...over,
  });

  it('nobody signed in (uid null): signed-out, and no fetch', async () => {
    const fetchFn = vi.fn();
    const r = await fetchCalendarDone(null, RANGE, TODAY, undefined, fetchFn as unknown as typeof fetch, source());
    expect(r).toEqual({ status: 'signed-out' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('no source at all (running locally with no calendar): signed-out', async () => {
    const r = await fetchCalendarDone('u1', RANGE, TODAY, undefined, (() => {}) as unknown as typeof fetch, null);
    expect(r).toEqual({ status: 'signed-out' });
  });

  it('no fresh access kept: no-access, and never opens Google’s window', async () => {
    const fetchFn = vi.fn();
    const r = await fetchCalendarDone('u1', RANGE, TODAY, undefined, fetchFn as unknown as typeof fetch, source({ keptToken: async () => null }));
    expect(r).toEqual({ status: 'no-access' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('sends the right query (kept token, showDeleted, eventTypes=default, singleEvents) and never calls token()', async () => {
    let seen: URL | undefined;
    let auth: string | undefined;
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      seen = new URL(url);
      auth = (init?.headers as Record<string, string>)?.Authorization;
      return res({ items: [] });
    });
    const r = await fetchCalendarDone('u1', RANGE, TODAY, undefined, fetchFn as unknown as typeof fetch, source());
    expect(r.status).toBe('ok');
    expect(auth).toBe('Bearer kept-token');
    expect(seen!.pathname).toBe('/v3/calendars/primary/events');
    const q = seen!.searchParams;
    expect(q.get('singleEvents')).toBe('true');
    expect(q.get('showDeleted')).toBe('true');
    expect(q.get('eventTypes')).toBe('default');
    expect(q.get('orderBy')).toBe('startTime');
    expect(q.get('timeMin')).toBeTruthy();
    expect(q.get('timeMax')).toBeTruthy();
  });

  it('pages through nextPageToken and stops when there is no more', async () => {
    const pages = [
      { items: [{ id: 'a' }], nextPageToken: 'p2' },
      { items: [{ id: 'b' }], nextPageToken: 'p3' },
      { items: [{ id: 'c' }] },
    ];
    const tokens: (string | null)[] = [];
    let i = 0;
    const fetchFn = vi.fn(async (url: string) => {
      tokens.push(new URL(url).searchParams.get('pageToken'));
      return res(pages[i++]);
    });
    const r = await fetchCalendarDone('u1', RANGE, TODAY, undefined, fetchFn as unknown as typeof fetch, source());
    expect(r.status).toBe('ok');
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(tokens).toEqual([null, 'p2', 'p3']);
  });

  it('stops at the page cap even if Google keeps offering more', async () => {
    const fetchFn = vi.fn(async () => res({ items: [], nextPageToken: 'always' }));
    const r = await fetchCalendarDone('u1', RANGE, TODAY, undefined, fetchFn as unknown as typeof fetch, source());
    expect(r.status).toBe('ok');
    expect(fetchFn).toHaveBeenCalledTimes(11); // 5 on the whole window, then 6 (a piece's first page is free) reading it newest piece first
  });

  it('when the page cap is hit, the oldest events are the ones dropped, never the newest', async () => {
    // A calendar too full for 5 pages: Google (orderBy=startTime) gives each window oldest-first, so reading the
    // whole window would cut off the newest days. The pretend calendar has an event every 3 days (40 of them, ending
    // 2026-11-12) and a page holds only 3, so the whole window needs 14 pages and a 30-day piece needs 4.
    const dayMs = 86400000;
    const all = Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, at: Date.parse('2026-11-12T10:00:00Z') - (39 - i) * 3 * dayMs }));
    const fetchFn = vi.fn(async (url: string) => {
      const q = new URL(url).searchParams;
      const min = Date.parse(q.get('timeMin')!);
      const max = Date.parse(q.get('timeMax')!);
      const within = all.filter((e) => e.at >= min && e.at < max);
      const from = Number(q.get('pageToken') ?? 0);
      const page = within.slice(from, from + 3);
      const next = from + 3 < within.length ? String(from + 3) : undefined;
      return res({ items: page.map((e) => ({ id: e.id, summary: e.id, organizer: { self: true }, start: { dateTime: new Date(e.at).toISOString() }, end: { dateTime: new Date(e.at + 3600000).toISOString() } })), nextPageToken: next });
    });
    const r = await fetchCalendarDone('u1', 'all', '2026-11-13', undefined, fetchFn as unknown as typeof fetch, source());
    expect(r.status).toBe('ok');
    const ids = r.status === 'ok' ? r.items.map((i) => i.text) : [];
    expect(ids).toContain('e39'); // the newest is kept
    expect(ids).not.toContain('e0'); // the oldest is what went
    // what is kept is one unbroken run up to the newest (no hole in the middle)
    const nums = ids.map((t) => Number(t.slice(1))).sort((a, b) => a - b);
    expect(nums[nums.length - 1]).toBe(39);
    expect(nums.every((n, i) => i === 0 || n === nums[i - 1] + 1)).toBe(true);
  });

  it('empty recent pieces do not use up the page budget: the newest events that exist are still kept', async () => {
    // 30 events two days apart that all ended about 100 days ago; the three newest 30-day pieces are empty.
    const dayMs = 86400000;
    const all = Array.from({ length: 30 }, (_, i) => ({ id: `e${i}`, at: Date.parse('2026-11-13T10:00:00Z') - 100 * dayMs - (29 - i) * 2 * dayMs }));
    const fetchFn = vi.fn(async (url: string) => {
      const q = new URL(url).searchParams;
      const min = Date.parse(q.get('timeMin')!);
      const max = Date.parse(q.get('timeMax')!);
      const within = all.filter((e) => e.at >= min && e.at < max);
      const from = Number(q.get('pageToken') ?? 0);
      const next = from + 3 < within.length ? String(from + 3) : undefined;
      return res({ items: within.slice(from, from + 3).map((e) => ({ id: e.id, summary: e.id, organizer: { self: true }, start: { dateTime: new Date(e.at).toISOString() }, end: { dateTime: new Date(e.at + 3600000).toISOString() } })), nextPageToken: next });
    });
    const r = await fetchCalendarDone('u1', 'all', '2026-11-13', undefined, fetchFn as unknown as typeof fetch, source());
    const ids = r.status === 'ok' ? r.items.map((i) => i.text) : [];
    expect(ids).toContain('e29'); // the newest event there is
  });

  it('401 (access ran out) gives no-access', async () => {
    const fetchFn = vi.fn(async () => res({}, 401));
    const r = await fetchCalendarDone('u1', RANGE, TODAY, undefined, fetchFn as unknown as typeof fetch, source());
    expect(r).toEqual({ status: 'no-access' });
  });

  it('any other failure (a 500, or fetch throwing) gives a quiet error', async () => {
    const r500 = await fetchCalendarDone('u1', RANGE, TODAY, undefined, (async () => res({}, 500)) as unknown as typeof fetch, source());
    expect(r500).toEqual({ status: 'error' });
    const rThrow = await fetchCalendarDone('u1', RANGE, TODAY, undefined, (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch, source());
    expect(rThrow).toEqual({ status: 'error' });
  });

  it('an aborted fetch rethrows (the Visualizer dropped this result), not a shown error', async () => {
    const ac = new AbortController();
    ac.abort();
    const fetchFn = async () => {
      throw new DOMException('aborted', 'AbortError');
    };
    await expect(fetchCalendarDone('u1', RANGE, TODAY, ac.signal, fetchFn as unknown as typeof fetch, source())).rejects.toThrow();
  });
});

// Ctrl+Z and Ctrl+Y on events (owner request 2026-11-17, job calendar-hotkeys): several steps back through this
// session's event changes, kept in memory only, each one what the change's Undo message would do. Never emails guests.
describe('Ctrl+Z and Ctrl+Y on events (owner request 2026-11-17)', () => {
  const swim = { title: 'Swim', allDay: false, startDate: '2026-10-07', startTime: '07:00', endDate: '2026-10-07', endTime: '08:00', guests: [] as string[] };
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const sent = (api: ReturnType<typeof fakeApi>, from: number) => api.calls.slice(from).filter((c) => !c.startsWith('list'));

  async function opened(events: CalEvent[] = [ev('a'), ev('b')]) {
    const api = fakeApi(events);
    const cal = createCalendar(api, today);
    await cal.open();
    return { api, cal };
  }

  it('an add: Ctrl+Z deletes it, Ctrl+Y brings the same event back (no new event), neither emailing guests', async () => {
    const { api, cal } = await opened([]);
    await cal.save(null, { ...swim, guests: ['pat@example.com'] }, { notify: true });
    await cal.settled();
    const from = api.calls.length;
    await cal.undoLast();
    await cal.redo();
    expect(sent(api, from)).toEqual(['remove new1 (no emails)', 'restore new1']);
  });

  it('an edit: Ctrl+Z puts the old title and time back, Ctrl+Y sends the change again without emails', async () => {
    const { api, cal } = await opened();
    await cal.save(at(cal, 'a'), { ...draftOf('a'), title: 'Dentist', startTime: '12:00', endTime: '13:00' });
    await cal.settled();
    const from = api.calls.length;
    await cal.undoLast();
    expect(api.bodies.at(-1)).toEqual({ summary: 'a', start: { dateTime: '2026-10-06T10:00:00', timeZone: zone }, end: { dateTime: '2026-10-06T11:00:00', timeZone: zone } });
    await cal.redo();
    expect(sent(api, from)).toEqual(['update a a (no emails)', 'update a Dentist (no emails)']);
    expect(api.bodies.at(-1)).toEqual({ summary: 'Dentist', start: { dateTime: '2026-10-06T12:00:00', timeZone: zone }, end: { dateTime: '2026-10-06T13:00:00', timeZone: zone } });
  });

  it('a delete: Ctrl+Z restores it, Ctrl+Y deletes it again', async () => {
    const { api, cal } = await opened();
    await cal.remove('a');
    await cal.settled();
    const from = api.calls.length;
    await cal.undoLast();
    await cal.redo();
    expect(sent(api, from)).toEqual(['restore a', 'remove a (no emails)']);
  });

  it('a drag: Ctrl+Z puts it back on its old day', async () => {
    const { api, cal } = await opened();
    await cal.move('a', '2026-10-06', '2026-10-09');
    await cal.undoLast();
    expect(api.bodies.at(-1)).toEqual({ summary: 'a', start: { dateTime: '2026-10-06T10:00:00', timeZone: zone }, end: { dateTime: '2026-10-06T11:00:00', timeZone: zone } });
  });

  it('goes back several steps, newest first, even pressed quickly, and works after the message has gone', async () => {
    const { api, cal } = await opened();
    await cal.save(null, swim);
    await cal.save(at(cal, 'a'), { ...draftOf('a'), title: 'Dentist' });
    await cal.remove('b');
    await cal.settled();
    cal.dismissDone();
    const from = api.calls.length;
    await Promise.all([cal.undoLast(), cal.undoLast(), cal.undoLast()]);
    expect(sent(api, from)).toEqual(['restore b', 'update a a (no emails)', 'remove new1 (no emails)']);
    expect(cal.marks().undo).toBe(0);
    // And forward again, the last one undone redone last.
    await Promise.all([cal.redo(), cal.redo(), cal.redo()]);
    expect(sent(api, from).slice(3)).toEqual(['restore new1', 'update a Dentist (no emails)', 'remove b (no emails)']);
  });

  it('Ctrl+Z right after a change waits for Google’s answer, so it never sends a stand-in id', async () => {
    const { api, cal } = await opened();
    const google = hold(api, 'create');
    await cal.save(null, swim);
    const undoing = cal.undoLast();
    google.answer();
    await undoing;
    expect(api.calls.filter((c) => c.startsWith('remove'))).toEqual(['remove new1 (no emails)']);
  });

  it('a change Google refused, or one with no Undo, is not a step: Ctrl+Z goes to the one before', async () => {
    const { api, cal } = await opened();
    await cal.remove('a');
    await cal.settled();
    api.fail = true;
    await cal.remove('b');
    await cal.settled();
    api.fail = false;
    api.create = async () => null; // Google gave no id: no Undo
    await cal.save(null, swim);
    await cal.settled();
    const from = api.calls.length;
    await cal.undoLast();
    expect(sent(api, from)).toEqual(['restore a']);
  });

  it('a refused Ctrl+Z says so and drops that step; a refused Ctrl+Y says so and drops it too', async () => {
    const { api, cal } = await opened();
    await cal.remove('a');
    await cal.remove('b');
    await cal.settled();
    api.fail = true;
    await cal.undoLast();
    expect(cal.get().done).toMatchObject({ text: UNDO_FAILED, undo: null });
    expect(cal.marks().redo).toBe(0);
    api.fail = false;
    await cal.undoLast(); // the step before is still there
    expect(api.calls.at(-2)).toBe('restore a');
    api.fail = true;
    await cal.redo();
    expect(cal.get().done).toMatchObject({ text: SAVE_FAILED, undo: null });
    expect(cal.marks().redo).toBe(0);
    api.fail = false;
    const from = api.calls.length;
    await cal.redo();
    expect(sent(api, from)).toEqual([]);
  });

  it('a new change clears what Ctrl+Y could redo', async () => {
    const { api, cal } = await opened();
    await cal.remove('a');
    await cal.settled();
    await cal.undoLast();
    expect(cal.marks().redo).toBeGreaterThan(0);
    await cal.remove('b');
    expect(cal.marks().redo).toBe(0);
    await cal.settled();
    const from = api.calls.length;
    await cal.redo();
    expect(sent(api, from)).toEqual([]);
  });

  it('the message’s Undo and Ctrl+Z take back the same step, once', async () => {
    const { api, cal } = await opened();
    await cal.remove('a');
    await cal.remove('b');
    await cal.settled();
    await cal.undo(); // the message: “Event deleted · Undo” (b)
    const from = api.calls.length;
    await cal.undoLast(); // then a
    await cal.undoLast(); // nothing left
    expect(sent(api, from)).toEqual(['restore a']);
    expect(api.calls.filter((c) => c === 'restore b')).toHaveLength(1);
  });

  it('Ctrl+Z takes the message away, so its Undo can’t run the same step again', async () => {
    const { api, cal } = await opened();
    await cal.remove('a');
    await cal.settled();
    expect(cal.get().done?.undo).not.toBeNull();
    const undoing = cal.undoLast();
    expect(cal.get().done).toBeNull();
    await undoing;
    await cal.undo();
    expect(api.calls.filter((c) => c === 'restore a')).toHaveLength(1);
  });

  it('“All events in the series”: Ctrl+Z puts the series back first, Ctrl+Y sends this event’s own change first', async () => {
    const moved = ev('su_1016', { title: 'Stand-up', series: 'su', start: '2026-10-16T10:00', end: '2026-10-16T10:15' });
    const { api, cal } = await opened([moved]);
    api.series = { title: 'Stand-up' };
    await cal.save(at(cal, 'su_1016'), { ...swim, title: 'Daily sync', startDate: '2026-10-16', endDate: '2026-10-16', startTime: '10:30', endTime: '10:45' }, { all: true });
    const from = api.calls.length;
    await cal.undoLast();
    await cal.redo();
    expect(sent(api, from)).toEqual(['update su Stand-up (no emails)', 'update su_1016 Stand-up (no emails)', 'update su_1016 Daily sync (no emails)', 'update su Daily sync (no emails)']);
  });

  it('a series Ctrl+Y that only half reaches Google shows the calendar as Google has it and says so', async () => {
    const moved = ev('su_1016', { title: 'Stand-up', series: 'su', start: '2026-10-16T10:00', end: '2026-10-16T10:15' });
    const { api, cal } = await opened([moved]);
    api.series = { title: 'Stand-up' };
    await cal.save(at(cal, 'su_1016'), { ...swim, title: 'Daily sync', startDate: '2026-10-16', endDate: '2026-10-16', startTime: '10:30', endTime: '10:45' }, { all: true });
    await cal.undoLast();
    api.failId = 'su';
    await cal.redo();
    expect(cal.get().done).toMatchObject({ text: SERIES_FAILED, undo: null });
    expect(api.calls.at(-1)).toMatch(/^list /); // fetched again, whatever day the week starts on
  });

  it('a deleted series: Ctrl+Z restores it, Ctrl+Y deletes it again', async () => {
    const { api, cal } = await opened([ev('su_1016', { series: 'su' })]);
    await cal.remove('su_1016', { all: true });
    const from = api.calls.length;
    await cal.undoLast();
    await cal.redo();
    expect(sent(api, from)).toEqual(['restore su', 'remove su (no emails)']);
  });

  it('keeps the last 50 steps', async () => {
    const { api, cal } = await opened([ev('a')]);
    for (let i = 0; i < 52; i++) {
      await cal.save(at(cal, 'a'), { ...draftOf('a'), title: `t${i}` });
      await cal.settled();
    }
    let undone = 0;
    for (let i = 0; i < 55; i++) {
      const before = api.calls.filter((c) => c.startsWith('update')).length;
      await cal.undoLast();
      if (api.calls.filter((c) => c.startsWith('update')).length > before) undone++;
    }
    expect(undone).toBe(50);
  });

  it('opening the panel again starts with nothing to undo or redo (someone else may be signed in)', async () => {
    const { api, cal } = await opened();
    await cal.remove('a');
    await cal.remove('b');
    await cal.settled();
    await cal.undoLast();
    await cal.open();
    expect(cal.marks()).toEqual({ undo: 0, redo: 0 });
    const from = api.calls.length;
    await cal.undoLast();
    await cal.redo();
    expect(sent(api, from)).toEqual([]);
  });

  // From the high-level code review.
  it('Ctrl+Z before Google has answered an add: no “Event added · Undo” after it, so a refused undo still says so', async () => {
    const { api, cal } = await opened();
    const google = hold(api, 'create');
    await cal.save(null, swim);
    const undoing = cal.undoLast();
    google.answer();
    api.fail = true;
    await undoing;
    expect(cal.get().done).toMatchObject({ text: UNDO_FAILED, undo: null });
  });

  it('an “All events” save is numbered when it starts, so a board change made while Google answers counts as newer', async () => {
    const moved = ev('su_1016', { title: 'Stand-up', series: 'su', start: '2026-10-16T10:00', end: '2026-10-16T10:15' });
    const { api, cal } = await opened([moved]);
    api.series = { title: 'Stand-up' };
    const google = hold(api, 'update');
    const saving = cal.save(at(cal, 'su_1016'), { ...swim, title: 'Daily sync', startDate: '2026-10-16', endDate: '2026-10-16', startTime: '10:30', endTime: '10:45' }, { all: true });
    await Promise.resolve();
    const board = tick();
    while (google.waiting) {
      google.answer();
      await new Promise((r) => setTimeout(r, 0));
    }
    await saving;
    expect(cal.marks().undo).toBeLessThan(board);
  });

  it('while a series undo is on its way, an “All events” change to that series is refused', async () => {
    const { api, cal } = await opened([ev('su_1016', { series: 'su' }), ev('su_1017', { series: 'su', start: '2026-10-07T10:00', end: '2026-10-07T11:00' })]);
    await cal.remove('su_1016', { all: true });
    await cal.undoLast();
    const google = hold(api, 'remove');
    const redoing = cal.redo();
    await new Promise((r) => setTimeout(r, 0));
    expect(await cal.remove('su_1017', { all: true })).toBe(SAVE_FAILED);
    google.answer();
    await redoing;
  });

  it('Ctrl+D’s copy: the event again at the same time, without its guests, and refused copies say so', async () => {
    const { api, cal } = await opened([ev('a', { guests: [{ email: 'pat@example.com' }] })]);
    await cal.copy('a');
    await cal.settled();
    expect(api.calls.filter((c) => c.startsWith('create'))).toHaveLength(1);
    expect(api.bodies.at(-1)).toMatchObject({ summary: 'a', start: { dateTime: '2026-10-06T10:00:00', timeZone: zone } });
    expect(api.bodies.at(-1)?.attendees ?? []).toEqual([]);
    expect(cal.get().done?.text).toBe('Event added');
    api.fail = true;
    await cal.copy('a');
    await cal.settled();
    expect(cal.get().done?.text).toBe(SAVE_FAILED);
  });

  it('each step, undo and redo takes a newer number on the counter shared with the board', async () => {
    const { cal } = await opened();
    expect(cal.marks()).toEqual({ undo: 0, redo: 0 });
    const before = tick();
    await cal.remove('a');
    const made = cal.marks().undo;
    expect(made).toBeGreaterThan(before);
    await cal.settled();
    await cal.undoLast();
    expect(cal.marks().redo).toBeGreaterThan(made);
  });
});
