import { describe, expect, it } from 'vitest';
import {
  PANEL_DEFAULT,
  PANEL_STEP,
  clampPanelWidth,
  parsePanelWidths,
  addDays,
  addMonths,
  canChangeSeries,
  cellLines,
  cellTime,
  dayKey,
  dayLabel,
  draftBody,
  draftFor,
  emailGuests,
  eventsOnDay,
  guestChanges,
  isEmail,
  monthGrid,
  moveDraftStart,
  moveView,
  newDraft,
  parseEvent,
  rangeLabel,
  safeLink,
  seriesDraft,
  timeLabel,
  viewRange,
  weekDays,
  withGuest,
  type CalEvent,
} from './calendar';

// Google Calendar side panel (owner request, 2026-10-06): the pure part. Days are 'YYYY-MM-DD'
// keys in the person's own time zone; weeks start on Monday.

const timed = (over: Partial<CalEvent> = {}): CalEvent => ({
  id: 'e1',
  title: 'Dentist',
  allDay: false,
  start: '2026-10-06T10:00',
  end: '2026-10-06T11:00',
  editable: true,
  link: 'https://calendar.google.com/',
  series: null,
  guests: [],
  timeZone: null,
  ...over,
});

describe('day maths', () => {
  it('names a day by its local date', () => {
    expect(dayKey(new Date(2026, 9, 6, 23, 30))).toBe('2026-10-06');
    expect(dayKey(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-03-28', 7)).toBe('2026-04-04'); // over a clock change
  });

  it('adds months, keeping the day where it can', () => {
    expect(addMonths('2026-10-06', 1)).toBe('2026-11-06');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('the week view is seven days from the day it starts on (today when it opens), not Monday to Sunday', () => {
    expect(weekDays('2026-10-15')).toEqual(['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21']);
    expect(weekDays('2026-10-11')[0]).toBe('2026-10-11');
    expect(weekDays('2026-12-29')[6]).toBe('2027-01-04');
  });

  it('a month grid is whole weeks covering every day of the month', () => {
    const grid = monthGrid('2026-10-20');
    expect(grid[0][0]).toBe('2026-09-28');
    expect(grid[grid.length - 1][6]).toBe('2026-11-01');
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid.length).toBe(5);
    expect(monthGrid('2027-02-10').length).toBe(4); // Feb 2027 starts on a Monday and has 28 days
  });

  it('the range to fetch is the days shown, the end day not included', () => {
    expect(viewRange('week', '2026-10-15')).toEqual({ from: '2026-10-15', to: '2026-10-22' });
    expect(viewRange('month', '2026-10-06')).toEqual({ from: '2026-09-28', to: '2026-11-02' });
  });

  it('back and forward move a week or a month', () => {
    expect(moveView('week', '2026-10-06', 1)).toBe('2026-10-13');
    expect(moveView('week', '2026-10-06', -1)).toBe('2026-09-29');
    expect(moveView('month', '2026-10-06', 1)).toBe('2026-11-06');
  });

  it('labels days and ranges', () => {
    expect(dayLabel('2026-10-06')).toBe('Tue 6 Oct');
    expect(rangeLabel('week', '2026-10-15')).toBe('Thu 15 – Wed 21 Oct 2026');
    expect(rangeLabel('week', '2026-09-30')).toBe('Wed 30 Sep – Tue 6 Oct 2026');
    expect(rangeLabel('week', '2026-12-30')).toBe('Wed 30 Dec 2026 – Tue 5 Jan 2027');
    expect(rangeLabel('month', '2026-10-06')).toBe('October 2026');
  });
});

describe('reading events from Google', () => {
  const simple = {
    id: 'abc',
    status: 'confirmed',
    summary: 'Dentist',
    htmlLink: 'https://www.google.com/calendar/event?eid=abc',
    start: { dateTime: '2026-10-06T10:00:00' },
    end: { dateTime: '2026-10-06T11:30:00' },
    organizer: { email: 'me@example.com', self: true },
    reminders: { useDefault: true },
  };

  it('reads a simple timed event, in local time', () => {
    expect(parseEvent(simple)).toEqual({
      id: 'abc',
      title: 'Dentist',
      allDay: false,
      start: '2026-10-06T10:00',
      end: '2026-10-06T11:30',
      editable: true,
      link: 'https://www.google.com/calendar/event?eid=abc',
      series: null,
      guests: [],
      timeZone: null,
    });
  });

  it('reads an all-day event (its end day is not included)', () => {
    const ev = parseEvent({ ...simple, start: { date: '2026-10-08' }, end: { date: '2026-10-10' } });
    expect(ev).toMatchObject({ allDay: true, start: '2026-10-08', end: '2026-10-10', editable: true });
  });

  it('custom reminders, others’ events and Google’s special kinds are read-only', () => {
    expect(parseEvent({ ...simple, reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] } })?.editable).toBe(false);
    expect(parseEvent({ ...simple, organizer: { email: 'boss@example.com' } })?.editable).toBe(false);
    expect(parseEvent({ ...simple, eventType: 'outOfOffice' })?.editable).toBe(false);
    // A series itself (never listed: repeating events come as single events) stays read-only.
    expect(parseEvent({ ...simple, recurrence: ['RRULE:FREQ=DAILY'] })?.editable).toBe(false);
    // A guest list Google cut short can't be changed safely (its missing guests would be dropped).
    expect(parseEvent({ ...simple, attendees: [{ email: 'sam@example.com' }], attendeesOmitted: true })?.editable).toBe(false);
    // No guests and only the calendar's default reminders: still simple.
    expect(parseEvent({ ...simple, attendees: [], eventType: 'default', reminders: { useDefault: false, overrides: [] } })?.editable).toBe(true);
  });

  it('one event of a repeating series can be changed, and knows its series (job #85)', () => {
    expect(parseEvent({ ...simple, id: 'abc_20261006', recurringEventId: 'abc' })).toMatchObject({ editable: true, series: 'abc' });
  });

  it('the person’s own events with guests can be changed; the guest list is read and checked (job #85)', () => {
    const ev = parseEvent({
      ...simple,
      attendees: [
        { email: 'me@example.com', self: true, organizer: true, responseStatus: 'accepted' },
        { email: 'sam@example.com', responseStatus: 'needsAction', displayName: 'Sam', extra: { nested: 1 } },
        { displayName: 'no email' },
        'junk',
      ],
    });
    expect(ev?.editable).toBe(true);
    expect(ev?.guests).toEqual([
      { email: 'me@example.com', self: true, organizer: true, responseStatus: 'accepted' },
      { email: 'sam@example.com', responseStatus: 'needsAction', displayName: 'Sam' },
    ]);
    // Someone else's event with guests (an invite) stays read-only.
    expect(parseEvent({ ...simple, organizer: { email: 'boss@example.com' }, attendees: [{ email: 'me@example.com', self: true }] })?.editable).toBe(false);
  });

  it('an untitled event shows "(No title)"', () => {
    expect(parseEvent({ ...simple, summary: undefined })?.title).toBe('(No title)');
  });

  it('skips cancelled and broken events', () => {
    expect(parseEvent({ ...simple, status: 'cancelled' })).toBeNull();
    expect(parseEvent({ ...simple, id: 5 })).toBeNull();
    expect(parseEvent({ ...simple, start: {} })).toBeNull();
    expect(parseEvent({ ...simple, start: { dateTime: 'soon' } })).toBeNull();
    expect(parseEvent({ ...simple, start: { date: '2026-13-45' }, end: { date: '2026-10-10' } })).toBeNull();
    expect(parseEvent(null)).toBeNull();
    expect(parseEvent('event')).toBeNull();
  });

  it('only opens links to Google Calendar', () => {
    expect(safeLink('https://www.google.com/calendar/event?eid=abc')).toBe('https://www.google.com/calendar/event?eid=abc');
    expect(safeLink('https://calendar.google.com/calendar/r/eventedit/x')).toBe('https://calendar.google.com/calendar/r/eventedit/x');
    expect(safeLink('javascript:alert(1)')).toBe('https://calendar.google.com/');
    expect(safeLink('https://evil.example/calendar')).toBe('https://calendar.google.com/');
    expect(safeLink('https://www.google.com.evil.example/')).toBe('https://calendar.google.com/');
    expect(safeLink(undefined)).toBe('https://calendar.google.com/');
  });
});

describe('a day’s events', () => {
  const allDay = timed({ id: 'h', title: 'Holiday', allDay: true, start: '2026-10-08', end: '2026-10-10' });
  const late = timed({ id: 'late', title: 'Late show', start: '2026-10-08T23:00', end: '2026-10-09T01:00' });
  const early = timed({ id: 'early', title: 'Run', start: '2026-10-08T07:00', end: '2026-10-08T08:00' });

  it('lists all-day events first, then by start time, including events running over from the day before', () => {
    const events = [late, early, allDay, timed()];
    expect(eventsOnDay(events, '2026-10-08').map((e) => e.id)).toEqual(['h', 'early', 'late']);
    expect(eventsOnDay(events, '2026-10-09').map((e) => e.id)).toEqual(['h', 'late']);
    expect(eventsOnDay(events, '2026-10-10').map((e) => e.id)).toEqual([]);
    expect(eventsOnDay(events, '2026-10-06').map((e) => e.id)).toEqual(['e1']);
  });

  it('an event ending at midnight is not on the next day', () => {
    const toMidnight = timed({ start: '2026-10-06T22:00', end: '2026-10-07T00:00' });
    expect(eventsOnDay([toMidnight], '2026-10-07')).toEqual([]);
  });

  it('shows times on the 24-hour clock', () => {
    expect(timeLabel(timed())).toBe('10:00 – 11:00');
    expect(timeLabel(allDay)).toBe('All day');
  });
});

describe('a day in the month grid (job #47)', () => {
  const ev = (id: string) => timed({ id });
  it('shows every event when they fit', () => {
    expect(cellLines([ev('a'), ev('b')], 2)).toEqual({ shown: [ev('a'), ev('b')], more: 0 });
    expect(cellLines([ev('a'), ev('b'), ev('c')], 3)).toEqual({ shown: [ev('a'), ev('b'), ev('c')], more: 0 });
    expect(cellLines([], 3)).toEqual({ shown: [], more: 0 });
  });

  it('when more than fit, the last line says how many more', () => {
    expect(cellLines([ev('a'), ev('b'), ev('c'), ev('d'), ev('e')], 3)).toEqual({ shown: [ev('a'), ev('b')], more: 3 });
    expect(cellLines([ev('a'), ev('b'), ev('c')], 2)).toEqual({ shown: [ev('a')], more: 2 });
  });

  it('a timed event shows its start time on the day it starts only', () => {
    const overnight = timed({ start: '2026-10-06T22:00', end: '2026-10-07T02:00' });
    expect(cellTime(overnight, '2026-10-06')).toBe('22:00');
    expect(cellTime(overnight, '2026-10-07')).toBe('');
    expect(cellTime(timed({ allDay: true, start: '2026-10-08', end: '2026-10-09' }), '2026-10-08')).toBe('');
  });
});

describe('editing an event', () => {
  it('a new event is an hour from 9:00 on the chosen day', () => {
    expect(newDraft('2026-10-07')).toEqual({ title: '', allDay: false, startDate: '2026-10-07', startTime: '09:00', endDate: '2026-10-07', endTime: '10:00', guests: [] });
  });

  it('fills the form from an event (an all-day event’s last day is shown, not the day after)', () => {
    expect(draftFor(timed())).toEqual({ title: 'Dentist', allDay: false, startDate: '2026-10-06', startTime: '10:00', endDate: '2026-10-06', endTime: '11:00', guests: [] });
    expect(draftFor(timed({ allDay: true, start: '2026-10-08', end: '2026-10-10' }))).toMatchObject({ allDay: true, startDate: '2026-10-08', endDate: '2026-10-09' });
  });

  it('moving the start day moves the end day with it', () => {
    const d = { title: 'Trip', allDay: true, startDate: '2026-10-08', startTime: '09:00', endDate: '2026-10-09', endTime: '10:00', guests: [] };
    expect(moveDraftStart(d, '2026-10-20')).toMatchObject({ startDate: '2026-10-20', endDate: '2026-10-21' });
    expect(moveDraftStart(d, '')).toBe(d);
  });

  it('turns a timed draft into what Google takes, in the person’s time zone', () => {
    const body = draftBody({ title: ' Dentist ', allDay: false, startDate: '2026-10-06', startTime: '10:00', endDate: '2026-10-06', endTime: '11:30', guests: [] }, 'Europe/London');
    expect(body).toEqual({
      summary: 'Dentist',
      start: { dateTime: '2026-10-06T10:00:00', timeZone: 'Europe/London' },
      end: { dateTime: '2026-10-06T11:30:00', timeZone: 'Europe/London' },
    });
  });

  it('turns an all-day draft into dates, the end day after the last', () => {
    const body = draftBody({ title: 'Holiday', allDay: true, startDate: '2026-10-08', startTime: '', endDate: '2026-10-09', endTime: '', guests: [] }, 'Europe/London');
    expect(body).toEqual({ summary: 'Holiday', start: { date: '2026-10-08' }, end: { date: '2026-10-10' } });
  });

  it('refuses an end before the start, or a missing date or time', () => {
    const d = { title: 'X', allDay: false, startDate: '2026-10-06', startTime: '10:00', endDate: '2026-10-06', endTime: '10:00', guests: [] };
    expect(draftBody(d, 'UTC')).toBeNull();
    expect(draftBody({ ...d, endTime: '09:00' }, 'UTC')).toBeNull();
    expect(draftBody({ ...d, endDate: '2026-10-07', endTime: '09:00' }, 'UTC')).not.toBeNull(); // overnight is fine
    expect(draftBody({ ...d, startTime: '' }, 'UTC')).toBeNull();
    expect(draftBody({ ...d, allDay: true, endDate: '2026-10-05' }, 'UTC')).toBeNull();
    expect(draftBody({ ...d, allDay: true, startDate: '' }, 'UTC')).toBeNull();
  });

  it('an empty title is saved as "(No title)" in the list, but sent empty', () => {
    const body = draftBody({ title: '  ', allDay: true, startDate: '2026-10-08', startTime: '', endDate: '2026-10-08', endTime: '', guests: [] }, 'UTC');
    expect(body?.summary).toBe('');
  });
});

describe('guests (job #85)', () => {
  const me = { email: 'me@example.com', self: true, responseStatus: 'accepted' };
  const sam = { email: 'sam@example.com', responseStatus: 'declined' };
  const withSam = timed({ guests: [me, sam] });

  it('an email address must look like one', () => {
    expect(isEmail('sam@example.com')).toBe(true);
    expect(isEmail('a.b+c@sub.example.co.uk')).toBe(true);
    for (const bad of ['', 'sam', 'sam@', '@example.com', 'sam@example', 'sam @example.com', 'sam@exa mple.com', 'a@b@c.com', '<sam@example.com>', 'sam@example.com,pat@example.com', `${'a'.repeat(250)}@example.com`]) {
      expect(isEmail(bad), bad).toBe(false);
    }
  });

  it('the form shows the other guests, not the person themself', () => {
    expect(draftFor(withSam).guests).toEqual(['sam@example.com']);
  });

  it('asks about update emails only when there are guests, before or after the change', () => {
    expect(emailGuests(timed(), null)).toBe(false);
    expect(emailGuests(timed({ guests: [me] }), draftFor(timed({ guests: [me] })))).toBe(false);
    expect(emailGuests(withSam, null)).toBe(true);
    expect(emailGuests(withSam, { ...draftFor(withSam), guests: [] })).toBe(true); // all removed
    expect(emailGuests(timed(), { ...draftFor(timed()), guests: ['pat@example.com'] })).toBe(true); // first one added
    expect(emailGuests(null, { ...newDraft('2026-10-07'), guests: ['pat@example.com'] })).toBe(true);
    expect(emailGuests(null, newDraft('2026-10-07'))).toBe(false);
  });

  it('sends the guest list only when it changed, keeping the person and existing guests as Google gave them', () => {
    expect(guestChanges(withSam, draftFor(withSam))).toBeNull();
    expect(guestChanges(withSam, { ...draftFor(withSam), guests: ['SAM@example.com'] })).toBeNull(); // case doesn't matter
    expect(guestChanges(withSam, { ...draftFor(withSam), guests: ['sam@example.com', 'pat@example.com'] })).toEqual([me, sam, { email: 'pat@example.com' }]);
    expect(guestChanges(withSam, { ...draftFor(withSam), guests: [] })).toEqual([me]);
    expect(guestChanges(null, newDraft('2026-10-07'))).toBeNull();
    expect(guestChanges(null, { ...newDraft('2026-10-07'), guests: ['pat@example.com'] })).toEqual([{ email: 'pat@example.com' }]);
  });

  it('for the whole series, puts only the guests added or removed in the form on the series’ own list (review, 2026-10-17)', () => {
    const a = { email: 'a@example.com', responseStatus: 'accepted' };
    const b = { email: 'b@example.com', responseStatus: 'tentative' };
    const c = { email: 'c@example.com' };
    const series = timed({ guests: [me, a, b] });
    // This one event was given C instead of B on its own; the person now removes A, for all events:
    // the series loses A only (C, given to this one event alone, isn't spread).
    const one = timed({ guests: [me, a, c] });
    expect(guestChanges(one, { ...draftFor(one), guests: ['c@example.com'] }, series)).toEqual([me, b]);
    expect(guestChanges(one, { ...draftFor(one), guests: ['a@example.com', 'c@example.com', 'pat@example.com'] }, series)).toEqual([me, a, b, { email: 'pat@example.com' }]);
    expect(guestChanges(one, draftFor(one), series)).toBeNull();
  });

  it('adding a guest already there, or the person themself, changes nothing', () => {
    expect(withGuest(withSam, ['sam@example.com'], 'pat@example.com')).toEqual(['sam@example.com', 'pat@example.com']);
    expect(withGuest(withSam, ['sam@example.com'], 'Sam@Example.com')).toEqual(['sam@example.com']);
    expect(withGuest(withSam, ['sam@example.com'], 'ME@example.com')).toEqual(['sam@example.com']);
    expect(withGuest(null, [], 'pat@example.com')).toEqual(['pat@example.com']);
  });
});

describe('all events in a repeating series (job #85)', () => {
  it('puts only what was changed in the form on the series, which keeps its own first day', () => {
    const series = { title: 'Stand-up', allDay: false, startDate: '2026-09-01', startTime: '09:00', endDate: '2026-09-01', endTime: '09:15', guests: [] };
    const was = { ...series, startDate: '2026-10-16', endDate: '2026-10-16' };
    // New times and length go on the series' first day.
    const d = { ...was, startTime: '09:30', endTime: '09:45' };
    expect(seriesDraft(d, was, series)).toEqual({ ...d, startDate: '2026-09-01', endDate: '2026-09-01' });
    // An overnight or several-day event keeps its length.
    expect(seriesDraft({ ...d, endDate: '2026-10-18' }, was, series)).toMatchObject({ startDate: '2026-09-01', endDate: '2026-09-03', startTime: '09:30' });
    // Finding 1: this one event was moved to 10:00 on its own; a new title alone keeps the series at 09:00.
    const moved = { ...was, startTime: '10:00', endTime: '10:15' };
    expect(seriesDraft({ ...moved, title: 'Daily sync' }, moved, series)).toEqual({ ...series, title: 'Daily sync' });
    // And the other way: renamed on its own, a new time alone keeps the series' title.
    const renamed = { ...was, title: 'Planning' };
    expect(seriesDraft({ ...renamed, startTime: '11:00', endTime: '11:15' }, renamed, series)).toEqual({ ...series, startTime: '11:00', endTime: '11:15' });
  });

  it('a new start or a new end alone goes on the series as such (review, 2026-10-17)', () => {
    const series = { title: 'Stand-up', allDay: false, startDate: '2026-09-01', startTime: '09:00', endDate: '2026-09-01', endTime: '09:15', guests: [] };
    // This one event was moved to 10:00–10:15 on its own.
    const moved = { ...series, startDate: '2026-10-16', endDate: '2026-10-16', startTime: '10:00', endTime: '10:15' };
    // Only the end changed (30 minutes long now): the series keeps its 09:00 start.
    expect(seriesDraft({ ...moved, endTime: '10:30' }, moved, series)).toMatchObject({ startTime: '09:00', endTime: '09:30', endDate: '2026-09-01' });
    // Only the start changed: the series starts then and ends as the form says.
    expect(seriesDraft({ ...moved, startTime: '09:30' }, moved, series)).toMatchObject({ startTime: '09:30', endTime: '10:15', endDate: '2026-09-01' });
    // A late series made longer runs over midnight into the next day.
    const late = { ...series, startTime: '23:00', endTime: '23:30' };
    const lateOne = { ...late, startDate: '2026-10-16', endDate: '2026-10-16' };
    expect(seriesDraft({ ...lateOne, endDate: '2026-10-17', endTime: '00:30' }, lateOne, late)).toMatchObject({ startTime: '23:00', endTime: '00:30', endDate: '2026-09-02' });
  });

  it('is offered only for a repeating event still on its own day and still timed (or still all-day)', () => {
    const one = timed({ series: 'su' });
    expect(canChangeSeries(one, draftFor(one))).toBe(true);
    expect(canChangeSeries(one, { ...draftFor(one), startTime: '11:00', endTime: '12:00', title: 'X' })).toBe(true);
    expect(canChangeSeries(one, moveDraftStart(draftFor(one), '2026-10-07'))).toBe(false);
    expect(canChangeSeries(one, { ...draftFor(one), allDay: true })).toBe(false);
    expect(canChangeSeries(timed(), draftFor(timed()))).toBe(false);
  });

  it('keeps the time zone a timed event is kept in, which the series is repeated in', () => {
    const raw = { id: 's', start: { dateTime: '2026-09-01T09:00:00-04:00', timeZone: 'America/New_York' }, end: { dateTime: '2026-09-01T09:15:00-04:00', timeZone: 'America/New_York' } };
    expect(parseEvent(raw)?.timeZone).toBe('America/New_York');
    expect(parseEvent({ ...raw, start: { dateTime: '2026-09-01T09:00:00Z' } })?.timeZone).toBeNull();
    expect(parseEvent({ id: 'h', start: { date: '2026-09-01' }, end: { date: '2026-09-02' } })?.timeZone).toBeNull();
  });
});

describe('the calendar panel’s width', () => {
  it('starts roomier than the usual 300px: 420px for Week, 720px for Month', () => {
    expect(PANEL_DEFAULT).toEqual({ week: 420, month: 720 });
    expect(PANEL_STEP).toBe(20);
  });

  it('stays between 300px and the window width minus 300px, so 300px of board is left', () => {
    expect(clampPanelWidth(500, 1440)).toBe(500);
    expect(clampPanelWidth(100, 1440)).toBe(300);
    expect(clampPanelWidth(5000, 1440)).toBe(1140);
    expect(clampPanelWidth(720, 760)).toBe(460);
    expect(clampPanelWidth(720.4, 1440)).toBe(720);
  });

  it('never goes below 300px, even in a window too small for both', () => {
    expect(clampPanelWidth(500, 500)).toBe(300);
  });

  it('reads the remembered widths, and falls back to the defaults for anything bad', () => {
    expect(parsePanelWidths('{"week":500,"month":900}')).toEqual({ week: 500, month: 900 });
    expect(parsePanelWidths('{"week":500}')).toEqual({ week: 500, month: 720 });
    expect(parsePanelWidths(null)).toEqual({ week: 420, month: 720 });
    expect(parsePanelWidths('junk')).toEqual({ week: 420, month: 720 });
    expect(parsePanelWidths('[1,2]')).toEqual({ week: 420, month: 720 });
    expect(parsePanelWidths('{"week":"wide","month":-5}')).toEqual({ week: 420, month: 720 });
    expect(parsePanelWidths('{"week":10,"month":1e9}')).toEqual({ week: 420, month: 720 });
  });
});
