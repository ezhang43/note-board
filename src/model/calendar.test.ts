import { describe, expect, it } from 'vitest';
import {
  ACCESS_KEY,
  dropAccess,
  keepAccess,
  readAccess,
  PANEL_DEFAULT,
  PANEL_STEP,
  clampPanelWidth,
  readWidths,
  SIDE_DEFAULT,
  addDays,
  addMonths,
  canChangeSeries,
  cellLines,
  cellTime,
  clockLabel,
  dayKey,
  dayLabel,
  draftBody,
  draftFor,
  dragDraft,
  emailGuests,
  eventsOnDay,
  exceptionChange,
  guestChanges,
  isEmail,
  monthGrid,
  myAnswer,
  isMeeting,
  greenLook,
  matchesSearch,
  mergeSearchResults,
  moveDraftStart,
  moveDraftStartTime,
  endTimeOptions,
  nearestTimeOption,
  parseTypedTime,
  startTimeOptions,
  timeText,
  moveView,
  newDraft,
  parseEvent,
  rangeLabel,
  safeLink,
  searchDayLabel,
  searchGroups,
  savedEvent,
  seriesDraft,
  timeLabel,
  BAD_TIMES,
  REPEAT_SERIES_ONLY,
  validateDraft,
  viewRange,
  weekDays,
  sundayStart,
  withGuest,
  type CalEvent,
} from './calendar';

// Google Calendar side panel (owner request, 2026-10-06): the pure part. Days are 'YYYY-MM-DD'
// keys in the person's own time zone; the calendar's weeks run Sunday to Saturday.

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
  moved: false,
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

  it('weekDays is seven days from the day given', () => {
    expect(weekDays('2026-10-15')).toEqual(['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21']);
    expect(weekDays('2026-12-29')[6]).toBe('2027-01-04');
  });

  it('the calendar week starts on the Sunday on or before the day', () => {
    expect(sundayStart('2026-10-18')).toBe('2026-10-18'); // a Sunday
    expect(sundayStart('2026-10-19')).toBe('2026-10-18'); // Monday
    expect(sundayStart('2026-10-24')).toBe('2026-10-18'); // Saturday
    expect(sundayStart('2027-01-01')).toBe('2026-12-27'); // over New Year
  });

  it('a month grid is whole Sunday-to-Saturday weeks covering every day of the month', () => {
    const grid = monthGrid('2026-10-20');
    expect(grid[0][0]).toBe('2026-09-27');
    expect(grid[grid.length - 1][6]).toBe('2026-10-31');
    expect(grid.every((w) => w.length === 7 && new Date(`${w[0]}T12:00:00Z`).getUTCDay() === 0)).toBe(true);
    expect(grid.length).toBe(5);
    expect(monthGrid('2027-02-10').length).toBe(5); // Feb 2027 starts on a Monday and ends on a Sunday
  });

  it('a month that starts on a Sunday has no days of the month before', () => {
    const grid = monthGrid('2026-11-10'); // 1 Nov 2026 is a Sunday
    expect(grid[0][0]).toBe('2026-11-01');
    expect(grid[grid.length - 1][6]).toBe('2026-12-05');
    expect(monthGrid('2026-03-10')[0][0]).toBe('2026-03-01');
  });

  it('a month grid can still start on Monday (Habits)', () => {
    const grid = monthGrid('2026-10-20', 'mon');
    expect(grid[0][0]).toBe('2026-09-28');
    expect(grid[grid.length - 1][6]).toBe('2026-11-01');
  });

  it('the range to fetch is the days shown, the end day not included', () => {
    expect(viewRange('week', '2026-10-21')).toEqual({ from: '2026-10-18', to: '2026-10-25' });
    expect(viewRange('week', '2026-10-18')).toEqual({ from: '2026-10-18', to: '2026-10-25' });
    expect(viewRange('week', '2026-10-17')).toEqual({ from: '2026-10-11', to: '2026-10-18' });
    expect(viewRange('month', '2026-10-06')).toEqual({ from: '2026-09-27', to: '2026-11-01' });
  });

  it('back and forward move a week or a month', () => {
    expect(moveView('week', '2026-10-06', 1)).toBe('2026-10-13');
    expect(moveView('week', '2026-10-06', -1)).toBe('2026-09-29');
    expect(moveView('month', '2026-10-06', 1)).toBe('2026-11-06');
  });

  it('labels days and ranges', () => {
    expect(dayLabel('2026-10-06')).toBe('Tue 6 Oct');
    expect(rangeLabel('week', '2026-10-21')).toBe('18–24 Oct 2026');
    expect(rangeLabel('week', '2026-10-18')).toBe('18–24 Oct 2026');
    expect(rangeLabel('week', '2026-10-24')).toBe('18–24 Oct 2026');
    expect(rangeLabel('week', '2026-09-30')).toBe('27 Sep – 3 Oct 2026');
    expect(rangeLabel('week', '2026-12-30')).toBe('27 Dec 2026 – 2 Jan 2027');
    expect(rangeLabel('month', '2026-10-06')).toBe('October 2026');
  });
});

describe('month grids at New Year and in a leap February (job #156)', () => {
  it('a month grid over New Year runs from the Sunday before to the Saturday after', () => {
    const grid = monthGrid('2027-01-15');
    expect(grid[0][0]).toBe('2026-12-27');
    expect(grid[grid.length - 1][6]).toBe('2027-02-06');
    expect(grid.length).toBe(6);
    expect(viewRange('month', '2027-01-15')).toEqual({ from: '2026-12-27', to: '2027-02-07' });
  });

  it('February in a leap year has its 29th', () => {
    const grid = monthGrid('2028-02-10');
    expect(grid[0][0]).toBe('2028-01-30');
    expect(grid[grid.length - 1][6]).toBe('2028-03-04');
    expect(grid.length).toBe(5);
    expect(grid.flat()).toContain('2028-02-29');
  });

  it('an all-day event over New Year (Google’s end is the day after) is on its own days only', () => {
    const e = timed({ allDay: true, start: '2026-12-31', end: '2027-01-02' });
    expect(eventsOnDay([e], '2026-12-30')).toEqual([]);
    expect(eventsOnDay([e], '2026-12-31')).toHaveLength(1);
    expect(eventsOnDay([e], '2027-01-01')).toHaveLength(1);
    expect(eventsOnDay([e], '2027-01-02')).toEqual([]);
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
      moved: false,
      answer: 'going',
    });
  });

  it('knows an event of a series moved on its own: its start isn’t where the series put it (review, 2026-10-17)', () => {
    const one = { ...simple, recurringEventId: 's', originalStartTime: { dateTime: '2026-10-06T10:00:00' } };
    expect(parseEvent(one)?.moved).toBe(false);
    expect(parseEvent({ ...one, originalStartTime: { dateTime: '2026-10-05T10:00:00' } })?.moved).toBe(true);
    expect(parseEvent({ ...one, originalStartTime: 'nonsense' })?.moved).toBe(false);
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

  it('shows times the way Google Calendar does (job #131)', () => {
    expect(timeLabel(timed())).toBe('10 – 11am');
    expect(timeLabel(timed({ start: '2026-10-06T11:30', end: '2026-10-06T13:00' }))).toBe('11:30am – 1pm');
    expect(timeLabel(timed({ start: '2026-10-06T09:00', end: '2026-10-06T09:15' }))).toBe('9 – 9:15am');
    expect(timeLabel(timed({ start: '2026-10-06T18:00', end: '2026-10-06T19:30' }))).toBe('6 – 7:30pm');
    expect(timeLabel(timed({ start: '2026-10-06T23:00', end: '2026-10-07T00:00' }))).toBe('11pm – 12am');
    expect(timeLabel(allDay)).toBe('All day');
  });

  it('writes one time as 10am, 10:30am, 12pm, 12am', () => {
    expect(clockLabel('10:00')).toBe('10am');
    expect(clockLabel('10:30')).toBe('10:30am');
    expect(clockLabel('00:00')).toBe('12am');
    expect(clockLabel('00:05')).toBe('12:05am');
    expect(clockLabel('12:00')).toBe('12pm');
    expect(clockLabel('12:45')).toBe('12:45pm');
    expect(clockLabel('13:00')).toBe('1pm');
    expect(clockLabel('23:59')).toBe('11:59pm');
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
    expect(cellTime(overnight, '2026-10-06')).toBe('10pm');
    expect(cellTime(overnight, '2026-10-07')).toBe('');
    expect(cellTime(timed({ allDay: true, start: '2026-10-08', end: '2026-10-09' }), '2026-10-08')).toBe('');
  });
});

describe('editing an event', () => {
  it('a new event is an hour from 12:00 PM (noon) on the chosen day', () => {
    expect(newDraft('2026-10-07')).toEqual({ title: '', allDay: false, startDate: '2026-10-07', startTime: '12:00', endDate: '2026-10-07', endTime: '13:00', guests: [] });
  });

  it('fills the form from an event (an all-day event’s last day is shown, not the day after)', () => {
    expect(draftFor(timed())).toEqual({ title: 'Dentist', allDay: false, startDate: '2026-10-06', startTime: '10:00', endDate: '2026-10-06', endTime: '11:00', guests: [] });
    expect(draftFor(timed({ allDay: true, start: '2026-10-08', end: '2026-10-10' }))).toMatchObject({ allDay: true, startDate: '2026-10-08', startTime: '12:00', endDate: '2026-10-09', endTime: '13:00' });
  });

  it('an untitled event opens with an empty title, so "(No title)" is never sent as its name (2026-10-17)', () => {
    const untitled = parseEvent({ id: 'u', start: { date: '2026-10-08' }, end: { date: '2026-10-09' } })!;
    expect(untitled.title).toBe('(No title)');
    expect(draftFor(untitled).title).toBe('');
    expect(draftBody(draftFor(untitled), 'UTC')?.summary).toBe('');
  });

  describe('dragging an event onto another day (owner request 2026-11-11)', () => {
    it('a timed event keeps its time of day and length on the new day', () => {
      const d = dragDraft(timed(), '2026-10-06', '2026-10-09');
      expect(d).toMatchObject({ startDate: '2026-10-09', startTime: '10:00', endDate: '2026-10-09', endTime: '11:00', title: 'Dentist', allDay: false });
      expect(draftBody(d!, 'UTC')).toMatchObject({ start: { dateTime: '2026-10-09T10:00:00' }, end: { dateTime: '2026-10-09T11:00:00' } });
    });

    it('a timed event over midnight keeps its end on the day after', () => {
      const d = dragDraft(timed({ start: '2026-10-06T23:00', end: '2026-10-07T01:00' }), '2026-10-06', '2026-10-20');
      expect(d).toMatchObject({ startDate: '2026-10-20', startTime: '23:00', endDate: '2026-10-21', endTime: '01:00' });
    });

    it('an all-day event moves with its one day', () => {
      const d = dragDraft(timed({ allDay: true, start: '2026-10-09', end: '2026-10-10' }), '2026-10-09', '2026-10-12');
      expect(d).toMatchObject({ allDay: true, startDate: '2026-10-12', endDate: '2026-10-12' });
      expect(draftBody(d!, 'UTC')).toMatchObject({ start: { date: '2026-10-12' }, end: { date: '2026-10-13' } });
    });

    it('a multi-day event keeps its number of days', () => {
      const trip = timed({ allDay: true, start: '2026-10-08', end: '2026-10-11' }); // 8th to 10th
      const d = dragDraft(trip, '2026-10-08', '2026-10-15');
      expect(draftBody(d!, 'UTC')).toMatchObject({ start: { date: '2026-10-15' }, end: { date: '2026-10-18' } });
    });

    it('moves by the days between where it was picked up and where it was dropped, so a middle day of a multi-day event can be the handle', () => {
      const trip = timed({ allDay: true, start: '2026-10-08', end: '2026-10-11' });
      // Picked up on the 10th, dropped on the 12th: two days later, not onto the 12th as its first day.
      expect(draftBody(dragDraft(trip, '2026-10-10', '2026-10-12')!, 'UTC')).toMatchObject({ start: { date: '2026-10-10' }, end: { date: '2026-10-13' } });
      // And earlier.
      expect(draftBody(dragDraft(trip, '2026-10-10', '2026-10-09')!, 'UTC')).toMatchObject({ start: { date: '2026-10-07' }, end: { date: '2026-10-10' } });
    });

    it('works across months, years and a clock change', () => {
      expect(dragDraft(timed({ start: '2026-10-30T09:00', end: '2026-10-30T10:00' }), '2026-10-30', '2026-11-02')).toMatchObject({ startDate: '2026-11-02', endDate: '2026-11-02' });
      expect(dragDraft(timed({ start: '2026-12-31T09:00', end: '2026-12-31T10:00' }), '2026-12-31', '2027-01-01')).toMatchObject({ startDate: '2027-01-01', endDate: '2027-01-01' });
      expect(dragDraft(timed({ start: '2026-03-28T09:00', end: '2026-03-28T10:00' }), '2026-03-28', '2026-04-04')).toMatchObject({ startDate: '2026-04-04', startTime: '09:00' });
    });

    it('dropping on the day it was picked up on moves nothing', () => {
      expect(dragDraft(timed(), '2026-10-06', '2026-10-06')).toBeNull();
    });

    it('keeps the guests (the person themself left out) and the title', () => {
      const lunch = timed({ title: 'Lunch', guests: [{ email: 'me@example.com', self: true }, { email: 'sam@example.com' }] });
      expect(dragDraft(lunch, '2026-10-06', '2026-10-07')).toMatchObject({ title: 'Lunch', guests: ['sam@example.com'] });
    });

    it('an untitled event stays untitled', () => {
      expect(dragDraft(timed({ title: '(No title)' }), '2026-10-06', '2026-10-07')?.title).toBe('');
    });
  });

  it('moving the start day moves the end day with it', () => {
    const d = { title: 'Trip', allDay: true, startDate: '2026-10-08', startTime: '09:00', endDate: '2026-10-09', endTime: '10:00', guests: [] };
    expect(moveDraftStart(d, '2026-10-20')).toMatchObject({ startDate: '2026-10-20', endDate: '2026-10-21' });
    expect(moveDraftStart(d, '')).toBe(d);
  });

  it('changing the start time moves the end time by as much, keeping the length (job 216)', () => {
    const d = { title: '', allDay: false, startDate: '2026-10-07', startTime: '10:00', endDate: '2026-10-07', endTime: '11:00', guests: [] };
    expect(moveDraftStartTime(d, '14:00')).toMatchObject({ startTime: '14:00', endTime: '15:00', endDate: '2026-10-07' });
    expect(moveDraftStartTime(d, '09:15')).toMatchObject({ startTime: '09:15', endTime: '10:15' });
    // A length the person set by changing the end is kept on the next start change.
    const long = { ...d, endTime: '16:00' };
    expect(moveDraftStartTime(long, '15:00')).toMatchObject({ startTime: '15:00', endTime: '21:00' });
  });

  it('a one-day event whose end would pass midnight ends at 23:59 instead (job 216)', () => {
    const d = { title: '', allDay: false, startDate: '2026-10-07', startTime: '10:00', endDate: '2026-10-07', endTime: '11:00', guests: [] };
    expect(moveDraftStartTime(d, '23:30')).toMatchObject({ startTime: '23:30', endTime: '23:59', endDate: '2026-10-07' });
  });

  it('an event over several days moves its end across midnight (job 216)', () => {
    const d = { title: '', allDay: false, startDate: '2026-10-07', startTime: '22:00', endDate: '2026-10-08', endTime: '01:00', guests: [] };
    expect(moveDraftStartTime(d, '23:00')).toMatchObject({ endTime: '02:00', endDate: '2026-10-08' });
    expect(moveDraftStartTime(d, '10:00')).toMatchObject({ endTime: '13:00', endDate: '2026-10-07' });
  });

  it('a time box that is empty or not a time changes only the start (job 216)', () => {
    const d = { title: '', allDay: false, startDate: '2026-10-07', startTime: '10:00', endDate: '2026-10-07', endTime: '11:00', guests: [] };
    expect(moveDraftStartTime(d, '')).toEqual({ ...d, startTime: '' });
    expect(moveDraftStartTime({ ...d, startTime: '' }, '12:00')).toEqual({ ...d, startTime: '12:00' });
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

  it('a title changed only by spaces is not a new title for the series (2026-10-17)', () => {
    const series = { title: 'Stand-up', allDay: false, startDate: '2026-09-01', startTime: '09:00', endDate: '2026-09-01', endTime: '09:15', guests: [] };
    const renamed = { ...series, title: 'Planning', startDate: '2026-10-16', endDate: '2026-10-16' };
    expect(seriesDraft({ ...renamed, title: 'Planning ', startTime: '09:30', endTime: '09:45' }, renamed, series).title).toBe('Stand-up');
  });

  it('an event changed on its own also gets the new title and guests, keeping its own time (finding 2, 2026-10-17)', () => {
    const series = timed({ id: 'su', title: 'Stand-up', start: '2026-09-01T09:00', end: '2026-09-01T09:15', editable: false });
    const usual = timed({ id: 'su_1016', title: 'Stand-up', series: 'su', start: '2026-10-16T09:00', end: '2026-10-16T09:15' });
    // Just like the rest of the series: the series' change reaches it, so nothing more is sent.
    expect(exceptionChange(usual, { ...draftFor(usual), title: 'Daily sync' }, series)).toBeNull();
    // Moved to 10:00 on its own: the new title goes on it too, but no time.
    const moved = { ...usual, start: '2026-10-16T10:00', end: '2026-10-16T10:15' };
    expect(exceptionChange(moved, { ...draftFor(moved), title: 'Daily sync', startTime: '11:00', endTime: '11:15' }, series)).toEqual({ summary: 'Daily sync' });
    // Moved on its own to another day, at the series' time: still changed on its own (review, 2026-10-17).
    const otherDay = { ...usual, start: '2026-10-17T09:00', end: '2026-10-17T09:15', moved: true };
    expect(exceptionChange(otherDay, { ...draftFor(otherDay), title: 'Daily sync' }, series)).toEqual({ summary: 'Daily sync' });
    // Renamed on its own: a new time alone sends it nothing; a stray space isn't a new title.
    const renamed = { ...usual, title: 'Planning' };
    expect(exceptionChange(renamed, { ...draftFor(renamed), startTime: '09:30', endTime: '09:45' }, series)).toBeNull();
    expect(exceptionChange(renamed, { ...draftFor(renamed), title: ' Planning ' }, series)).toBeNull();
    // Guests changed here go on it as on its own list.
    const sam = { email: 'sam@example.com', responseStatus: 'accepted' };
    expect(exceptionChange(renamed, { ...draftFor(renamed), guests: ['sam@example.com'] }, series)).toEqual({ attendees: [{ email: 'sam@example.com' }] });
    const withSam = { ...usual, guests: [sam] };
    expect(exceptionChange(withSam, { ...draftFor(withSam), title: 'Daily sync' }, series)).toEqual({ summary: 'Daily sync' });
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
    expect(readWidths('{"week":500,"month":900}', PANEL_DEFAULT)).toEqual({ week: 500, month: 900 });
    expect(readWidths('{"week":500}', PANEL_DEFAULT)).toEqual({ week: 500, month: 720 });
    expect(readWidths(null, PANEL_DEFAULT)).toEqual({ week: 420, month: 720 });
    expect(readWidths('junk', PANEL_DEFAULT)).toEqual({ week: 420, month: 720 });
    expect(readWidths('[1,2]', PANEL_DEFAULT)).toEqual({ week: 420, month: 720 });
    expect(readWidths('{"week":"wide","month":-5}', PANEL_DEFAULT)).toEqual({ week: 420, month: 720 });
    expect(readWidths('{"week":10,"month":1e9}', PANEL_DEFAULT)).toEqual({ week: 420, month: 720 });
  });
});

describe('the widths of the other side panels (job #127)', () => {
  const usual = { history: 300, pomodoro: 300, completed: 300, journal: 420, habits: 420, checklist: 420 };

  it('start at 300px; the Journal and Habits at 420px, the calendar’s Week width (owner decision 2026-11-12)', () => {
    expect(SIDE_DEFAULT.journal).toBe(PANEL_DEFAULT.week);
    expect(SIDE_DEFAULT.habits).toBe(PANEL_DEFAULT.week);
    expect(SIDE_DEFAULT).toEqual(usual);
    expect(readWidths(null, SIDE_DEFAULT)).toEqual(usual);
  });

  it('the Checklist panel on the left starts at 420px too; a width saved before it existed keeps the others (owner request, 2026-11-12)', () => {
    expect(SIDE_DEFAULT.checklist).toBe(420);
    expect(readWidths('{"journal":600}', SIDE_DEFAULT)).toEqual({ ...usual, journal: 600 });
    expect(readWidths('{"checklist":500}', SIDE_DEFAULT).checklist).toBe(500);
  });

  it('reads each panel’s remembered width, and uses the usual one for anything missing or bad', () => {
    expect(readWidths('{"journal":600,"habits":340}', SIDE_DEFAULT)).toEqual({ ...usual, journal: 600, habits: 340 });
    expect(readWidths('junk', SIDE_DEFAULT)).toEqual(usual);
    expect(readWidths('[1,2]', SIDE_DEFAULT)).toEqual(usual);
    expect(readWidths('{"journal":"wide","habits":-5,"completed":1e9,"history":10}', SIDE_DEFAULT)).toEqual(usual);
  });
});

describe('calendar access kept for this tab (owner choice, 2026-10-19)', () => {
  const now = 1_000_000_000_000;
  const tab = () => {
    const data = new Map<string, string>();
    return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
  };
  const access = { token: 'tok', expiresAt: now + 3_600_000, user: 'u1' };

  it('gives back the kept access for the same person while over a minute is left', () => {
    const s = tab();
    keepAccess(() => s, access);
    expect(JSON.parse(s.data.get(ACCESS_KEY)!)).toEqual(access);
    expect(readAccess(() => s, 'u1', now)).toEqual(access);
    expect(readAccess(() => s, 'u1', now + 3_600_000 - 61_000)).toEqual(access);
  });

  it('drops it when it belongs to someone else, or no one is signed in', () => {
    for (const who of ['u2', null]) {
      const s = tab();
      keepAccess(() => s, access);
      expect(readAccess(() => s, who, now)).toBeNull();
      expect(s.data.has(ACCESS_KEY)).toBe(false);
    }
  });

  it('drops it with a minute or less left, or expired', () => {
    for (const at of [now + 3_600_000 - 60_000, now + 3_600_000, now + 9_999_999]) {
      const s = tab();
      keepAccess(() => s, access);
      expect(readAccess(() => s, 'u1', at)).toBeNull();
      expect(s.data.has(ACCESS_KEY)).toBe(false);
    }
  });

  it('drops anything damaged or of the wrong shape', () => {
    const bad = [
      '{',
      'null',
      '[]',
      '"tok"',
      '{"token":"","expiresAt":9e15,"user":"u1"}',
      '{"token":5,"expiresAt":9e15,"user":"u1"}',
      '{"token":"t","expiresAt":"9e15","user":"u1"}',
      '{"token":"t","user":"u1"}',
      '{"token":"t","expiresAt":9e15,"user":5}',
      '{"token":"t","expiresAt":9e15}',
      '{"token":"t","expiresAt":1e999,"user":"u1"}', // reads as Infinity: never "never runs out"
    ];
    for (const raw of bad) {
      const s = tab();
      s.setItem(ACCESS_KEY, raw);
      expect(readAccess(() => s, 'u1', now)).toBeNull();
      expect(s.data.has(ACCESS_KEY)).toBe(false);
    }
    expect(readAccess(() => tab(), 'u1', now)).toBeNull();
  });

  it('dropAccess removes it', () => {
    const s = tab();
    keepAccess(() => s, access);
    dropAccess(() => s);
    expect(s.data.has(ACCESS_KEY)).toBe(false);
  });

  it('never throws when the storage is blocked, full or missing', () => {
    const blocked = () => {
      throw new Error('SecurityError');
    };
    const broken = { getItem: blocked, setItem: blocked, removeItem: blocked };
    for (const s of [blocked, () => broken, () => null]) {
      expect(() => keepAccess(s, access)).not.toThrow();
      expect(readAccess(s, 'u1', now)).toBeNull();
      expect(() => dropAccess(s)).not.toThrow();
    }
  });
});

// A time picker like Google Calendar's (job 219): a list every 15 minutes, typed times read as people write them.
describe('time picker', () => {
  it('writes a time as 12-hour text, "2:00 PM"', () => {
    expect(timeText('14:00')).toBe('2:00 PM');
    expect(timeText('00:15')).toBe('12:15 AM');
    expect(timeText('12:00')).toBe('12:00 PM');
    expect(timeText('09:05')).toBe('9:05 AM');
    expect(timeText('23:59')).toBe('11:59 PM');
    expect(timeText('')).toBe('');
  });

  it('reads typed times: 12-hour, 24-hour, a bare hour', () => {
    for (const [typed, hhmm] of [
      ['2:10pm', '14:10'], ['2:10 PM', '14:10'], ['2:10p', '14:10'], ['14:10', '14:10'], ['9', '09:00'], ['9am', '09:00'], ['9 pm', '21:00'],
      ['12am', '00:00'], ['12pm', '12:00'], ['12:30 AM', '00:30'], ['930', '09:30'], ['1410', '14:10'], ['0:05', '00:05'], ['  7:45  ', '07:45'], ['9.30am', '09:30'],
    ]) {
      expect(parseTypedTime(typed), typed).toBe(hhmm);
    }
  });

  it('refuses what is not a time', () => {
    for (const typed of ['', 'abc', '25:00', '13pm', '0pm', '9:60', '24:00', '9:5', '2:10 xm', '99']) expect(parseTypedTime(typed), typed).toBeNull();
  });

  it('the start list has a time every 15 minutes, all day', () => {
    const list = startTimeOptions();
    expect(list).toHaveLength(96);
    expect(list[0]).toEqual({ value: '00:00', text: '12:00 AM' });
    expect(list[57]).toEqual({ value: '14:15', text: '2:15 PM' });
    expect(list[95]).toEqual({ value: '23:45', text: '11:45 PM' });
  });

  it('the end list starts at the first slot after the start, each with its length', () => {
    const list = endTimeOptions('14:00', true);
    expect(list.slice(0, 3)).toEqual([
      { value: '14:15', text: '2:15 PM', hint: '15 mins' },
      { value: '14:30', text: '2:30 PM', hint: '30 mins' },
      { value: '14:45', text: '2:45 PM', hint: '45 mins' },
    ]);
    expect(list.find((o) => o.value === '15:00')!.hint).toBe('1 hr');
    expect(list.find((o) => o.value === '15:30')!.hint).toBe('1.5 hrs');
    expect(list.find((o) => o.value === '16:00')!.hint).toBe('2 hrs');
    expect(list.find((o) => o.value === '16:30')!.hint).toBe('2.5 hrs');
    expect(list.find((o) => o.value === '15:15')!.hint).toBe('1 hr 15 mins');
    expect(list.at(-1)).toEqual({ value: '23:45', text: '11:45 PM', hint: '9 hrs 45 mins' });
  });

  it('the end list from a start off the 15-minute grid, or late in the day', () => {
    expect(endTimeOptions('16:10', true)[0]).toEqual({ value: '16:15', text: '4:15 PM', hint: '5 mins' });
    expect(endTimeOptions('23:45', true)).toEqual([]);
    expect(endTimeOptions('', true)).toHaveLength(96);
  });

  it('finds the slot nearest a time, to open the list at', () => {
    const list = startTimeOptions();
    expect(nearestTimeOption(list, '14:00')).toBe(56);
    expect(nearestTimeOption(list, '14:10')).toBe(57);
    expect(nearestTimeOption(list, '14:06')).toBe(56);
    expect(nearestTimeOption(list, '14:23')).toBe(58);
    expect(nearestTimeOption(list, '23:59')).toBe(95);
    expect(nearestTimeOption(endTimeOptions('14:00', true), '14:00')).toBe(0);
    expect(nearestTimeOption(list, '')).toBe(0);
    expect(nearestTimeOption([], '14:00')).toBe(-1);
  });

  it('the end list on a later day than the start is the whole day, without lengths', () => {
    const list = endTimeOptions('14:00', false);
    expect(list).toHaveLength(96);
    expect(list[0]).toEqual({ value: '00:00', text: '12:00 AM' });
  });
});

describe('a change shown before Google answers (owner request 2026-11-17)', () => {
  const zone = 'Europe/London';
  it('a changed event shows its new title, times and guests, keeping its id, link and series', () => {
    const was = timed({ id: 'su_1', series: 'su', link: 'https://calendar.google.com/x', guests: [{ email: 'me@example.com', self: true }] });
    const body = draftBody({ ...draftFor(was), title: 'Stand-up', startTime: '11:00', endTime: '11:30' }, zone)!;
    expect(savedEvent(was, body, 'su_1')).toEqual({ ...was, title: 'Stand-up', start: '2026-10-06T11:00', end: '2026-10-06T11:30', timeZone: zone });
    const sam = { email: 'sam@example.com' };
    expect(savedEvent(was, { ...body, attendees: [sam] }, 'su_1').guests).toEqual([sam]);
  });

  it('a new event gets the id it is given, and an untitled or all-day one shows as Google would', () => {
    const body = draftBody({ title: '  ', allDay: true, startDate: '2026-10-08', startTime: '09:00', endDate: '2026-10-09', endTime: '10:00', guests: [] }, zone)!;
    expect(savedEvent(null, body, 'local-1')).toEqual({
      id: 'local-1',
      title: '(No title)',
      allDay: true,
      start: '2026-10-08',
      end: '2026-10-10',
      editable: true,
      link: 'https://calendar.google.com/',
      series: null,
      guests: [],
      timeZone: null,
      moved: false,
      answer: 'going',
    });
  });
});

describe('the person’s answer to an event, for its color (owner request, 2026-11-21)', () => {
  const ev = (over: Record<string, unknown> = {}) => ({ id: 'x', organizer: { email: 'me@example.com', self: true }, ...over });
  const invite = (responseStatus?: string) =>
    ev({ organizer: { email: 'pat@example.com' }, attendees: [{ email: 'pat@example.com', organizer: true, responseStatus: 'accepted' }, { email: 'me@example.com', self: true, ...(responseStatus && { responseStatus }) }] });

  it('the person’s own event is going, with or without guests', () => {
    expect(myAnswer(ev())).toBe('going');
    expect(myAnswer({ id: 'x' })).toBe('going'); // no organizer given: it is on their own calendar
    expect(myAnswer({ id: 'x', attendees: [{ email: 'me@example.com', self: true }] })).toBe('going');
    // No organizer given, but their own entry says they haven't answered: it still waits for a reply.
    expect(myAnswer({ id: 'x', attendees: [{ email: 'me@example.com', self: true, responseStatus: 'needsAction' }] })).toBe('unsure');
    expect(myAnswer(ev({ attendees: [{ email: 'me@example.com', self: true, organizer: true, responseStatus: 'accepted' }, { email: 'sam@example.com', responseStatus: 'needsAction' }] }))).toBe('going');
  });

  it('an invite they accepted is going; a maybe or no reply yet is unsure; one they said no to is declined', () => {
    expect(myAnswer(invite('accepted'))).toBe('going');
    expect(myAnswer(invite('tentative'))).toBe('unsure');
    expect(myAnswer(invite('needsAction'))).toBe('unsure');
    expect(myAnswer(invite())).toBe('unsure');
    expect(myAnswer(invite('declined'))).toBe('declined');
  });

  it('someone else’s event with no guest list (or without the person on it) is going: there is nothing to answer', () => {
    expect(myAnswer(ev({ organizer: { email: 'pat@example.com' } }))).toBe('going');
    expect(myAnswer(ev({ organizer: { email: 'pat@example.com' }, attendees: [{ email: 'pat@example.com' }] }))).toBe('going');
  });

  it('Google’s special kinds (birthdays, out of office, focus time, working location) keep their usual look', () => {
    for (const eventType of ['birthday', 'outOfOffice', 'focusTime', 'workingLocation', 'fromGmail']) expect(myAnswer(ev({ eventType }))).toBeNull();
    expect(myAnswer(ev({ eventType: 'default' }))).toBe('going');
  });

  it('odd guest lists from outside are read safely', () => {
    expect(myAnswer(ev({ organizer: { email: 'pat@example.com' }, attendees: 'everyone' }))).toBe('going');
    expect(myAnswer(ev({ organizer: { email: 'pat@example.com' }, attendees: [null, 5, { self: true, responseStatus: 'declined' }] }))).toBe('declined');
  });

  it('is kept on the event read from Google, and a changed event keeps its answer', () => {
    expect(parseEvent({ ...invite('tentative'), start: { dateTime: '2026-10-06T10:00:00' }, end: { dateTime: '2026-10-06T11:00:00' } })?.answer).toBe('unsure');
    const was = timed({ answer: 'unsure' });
    const body = draftBody(draftFor(was), 'Europe/London')!;
    expect(savedEvent(was, body, 'e1').answer).toBe('unsure');
  });
});

describe('only meetings are green; the person’s own reminders stay blue (owner request, 2026-11-22)', () => {
  const span = { start: { dateTime: '2026-10-06T10:00:00' }, end: { dateTime: '2026-10-06T11:00:00' } };
  const mine = { id: 'x', organizer: { email: 'me@example.com', self: true }, ...span };
  const me = (responseStatus?: string) => ({ email: 'me@example.com', self: true, ...(responseStatus && { responseStatus }) });
  const invite = (responseStatus?: string) => ({
    id: 'x',
    ...span,
    organizer: { email: 'pat@example.com' },
    attendees: [{ email: 'pat@example.com', organizer: true, responseStatus: 'accepted' }, me(responseStatus)],
  });
  const look = (raw: Record<string, unknown>) => greenLook(parseEvent(raw)!);

  it('the person’s own event without guests is not a meeting: blue', () => {
    expect(isMeeting(mine)).toBe(false);
    expect(isMeeting({ id: 'x' })).toBe(false); // no organizer given: on their own calendar
    expect(look(mine)).toBeNull();
    expect(look({ id: 'x', ...span })).toBeNull();
  });

  it('their own event with only themself on the guest list is not a meeting: blue', () => {
    const solo = { ...mine, attendees: [{ ...me('accepted'), organizer: true }] };
    expect(isMeeting(solo)).toBe(false);
    expect(look(solo)).toBeNull();
  });

  it('their own event with a guest is a meeting: green', () => {
    const withSam = { ...mine, attendees: [{ ...me('accepted'), organizer: true }, { email: 'sam@example.com', responseStatus: 'needsAction' }] };
    expect(isMeeting(withSam)).toBe(true);
    expect(look(withSam)).toBe('green');
  });

  it('an invite they accepted is green; one with no reply or a maybe is green and dashed', () => {
    expect(isMeeting(invite('accepted'))).toBe(true);
    expect(look(invite('accepted'))).toBe('green');
    expect(look(invite('needsAction'))).toBe('unsure');
    expect(look(invite())).toBe('unsure');
    expect(look(invite('tentative'))).toBe('unsure');
    // Invited with only themself listed (the organizer left off the list) is still an invite.
    expect(isMeeting({ id: 'x', organizer: { email: 'pat@example.com' }, attendees: [me('needsAction')] })).toBe(true);
  });

  it('a booked room, a guest without an email, or a copied/imported event with no guest list is not a meeting (code review)', () => {
    const room = { email: 'conf-3@resource.calendar.google.com', resource: true, responseStatus: 'accepted' };
    expect(isMeeting({ ...mine, attendees: [{ ...me('accepted'), organizer: true }, room] })).toBe(false);
    expect(isMeeting({ ...mine, attendees: [me('accepted'), { displayName: 'No email' }] })).toBe(false);
    // An .ics import or a copy from another calendar: someone else's organizer, but nobody invited.
    expect(isMeeting({ id: 'x', organizer: { email: 'other-calendar@group.calendar.google.com' } })).toBe(false);
    // A drag of such an own event keeps its color: the shown change reads the same guest list.
    const roomed = parseEvent({ ...mine, attendees: [me('accepted'), room] })!;
    expect(greenLook(savedEvent(roomed, draftBody(draftFor(roomed), 'Europe/London')!, 'x'))).toBeNull();
  });

  it('declined stays as it is (the read-only gray), and so do Google’s special kinds', () => {
    expect(look(invite('declined'))).toBeNull();
    expect(parseEvent(invite('declined'))?.answer).toBe('declined');
    expect(look({ ...invite('accepted'), eventType: 'outOfOffice' })).toBeNull();
  });

  it('odd guest lists from outside are read safely', () => {
    expect(isMeeting({ ...mine, attendees: 'everyone' })).toBe(false);
    expect(isMeeting({ ...mine, attendees: [null, 5, me()] })).toBe(false);
  });

  it('an event changed here follows its new guest list', () => {
    const solo = parseEvent(mine)!;
    const body = draftBody(draftFor(solo), 'Europe/London')!;
    expect(greenLook(savedEvent(solo, body, 'x'))).toBeNull();
    expect(greenLook(savedEvent(solo, { ...body, attendees: [{ email: 'sam@example.com' }] }, 'x'))).toBe('green');
    expect(greenLook(savedEvent(null, body, 'new'))).toBeNull();
  });
});

describe('search results (owner request, 2026-11-19)', () => {
  const at = (id: string, start: string, over: Partial<CalEvent> = {}) => timed({ id, title: id, start, end: start, ...over });
  const today = '2026-10-10';

  it('puts upcoming days first, soonest at the top, then past days, most recent first', () => {
    const events = [
      at('old', '2026-01-05T09:00'),
      at('later', '2026-12-01T09:00'),
      at('last-week', '2026-10-03T09:00'),
      at('soon', '2026-10-12T09:00'),
    ];
    expect(searchGroups(events, today).map((g) => g.day)).toEqual(['2026-10-12', '2026-12-01', '2026-10-03', '2026-01-05']);
  });

  it('counts today as upcoming, even for an event that has already started', () => {
    const groups = searchGroups([at('yesterday', '2026-10-09T09:00'), at('now', '2026-10-10T08:00')], today);
    expect(groups.map((g) => g.day)).toEqual(['2026-10-10', '2026-10-09']);
  });

  it('groups a day’s events, all-day first, then by time, in every group', () => {
    const events = [at('b', '2026-10-03T15:00'), at('a', '2026-10-03T08:00'), at('hol', '2026-10-03', { allDay: true, end: '2026-10-04' })];
    const [group] = searchGroups(events, today);
    expect(group.events.map((e) => e.id)).toEqual(['hol', 'a', 'b']);
  });

  it('groups a many-day event under the day it starts, and lists an event once', () => {
    const trip = at('trip', '2026-10-20', { allDay: true, end: '2026-10-25' });
    const groups = searchGroups([trip, trip], today);
    expect(groups).toEqual([{ day: '2026-10-20', events: [trip] }]);
  });

  it('gives no groups for no events', () => {
    expect(searchGroups([], today)).toEqual([]);
  });

  it('adds the year to a heading only when it is not this year', () => {
    expect(searchDayLabel('2026-10-12', today)).toBe('Mon 12 Oct');
    expect(searchDayLabel('2025-10-12', today)).toBe('Sun 12 Oct 2025');
    expect(searchDayLabel('2027-01-04', today)).toBe('Mon 4 Jan 2027');
  });

  it('matchesSearch matches partial substrings, case-insensitively, across all terms and fields', () => {
    expect(matchesSearch(['Dentist'], 'dent')).toBe(true);
    expect(matchesSearch(['Dentist'], 'IST')).toBe(true);
    expect(matchesSearch(['Kayaking lesson'], 'yak')).toBe(true);
    expect(matchesSearch(['Kayaking lesson'], 'kayak less')).toBe(true);
    expect(matchesSearch(['Lunch with Sam', 'sam@example.com'], 'sam@ex')).toBe(true);
    expect(matchesSearch(['Lunch with Sam', 'Room 4B'], 'lunch 4b')).toBe(true);
    expect(matchesSearch(['Dentist'], 'dent xyz')).toBe(false);
    expect(matchesSearch(['Dentist'], '   ')).toBe(false);
    expect(matchesSearch([], 'dent')).toBe(false);
  });

  it('mergeSearchResults deduplicates and caps upcoming (soonest) and past (most recent) events', () => {
    const u1 = at('u1', '2026-10-12T09:00');
    const u2 = at('u2', '2026-10-15T09:00');
    const u3 = at('u3', '2026-10-20T09:00');
    const p1 = at('p1', '2026-10-01T09:00');
    const p2 = at('p2', '2026-10-05T09:00');
    const p3 = at('p3', '2026-10-08T09:00');
    // Cap 2 each way: keeps soonest 2 upcoming (u1, u2) and most recent 2 past (p2, p3), deduping u2.
    const merged = mergeSearchResults([u2, p1], [u1, u2, u3, p2, p3], today, 2);
    expect(merged.map((e) => e.id)).toEqual(['u1', 'u2', 'p2', 'p3']);
    // Non-positive cap returns empty (including past events).
    expect(mergeSearchResults([u1, p1], [u2, p2], today, 0)).toEqual([]);
  });
});

describe('validateDraft', () => {
  const base = () => newDraft('2026-10-06');
  const seriesEvent = () => timed({ series: 's1' });

  it('accepts a valid timed or all-day draft', () => {
    expect(validateDraft(base(), { event: null, repeatChanged: false, repeatAnchor: '2026-10-06' })).toBeNull();
    expect(validateDraft({ ...base(), allDay: true }, { event: null, repeatChanged: false, repeatAnchor: '2026-10-06' })).toBeNull();
  });

  it('rejects an end not after the start', () => {
    expect(validateDraft({ ...base(), endTime: '12:00' }, { event: null, repeatChanged: false, repeatAnchor: '2026-10-06' })).toBe(BAD_TIMES);
    expect(validateDraft({ ...base(), endTime: '11:00' }, { event: null, repeatChanged: false, repeatAnchor: '2026-10-06' })).toBe(BAD_TIMES);
    expect(validateDraft({ ...base(), allDay: true, endDate: '2026-10-05' }, { event: null, repeatChanged: false, repeatAnchor: '2026-10-06' })).toBe(BAD_TIMES);
  });

  it('validates custom repeat rules for new events and non-series events', () => {
    const badInterval = { ...base(), repeat: { kind: 'custom' as const, rule: { interval: 0, unit: 'day' as const, end: { kind: 'never' as const } } } };
    expect(validateDraft(badInterval, { event: null, repeatChanged: false, repeatAnchor: '2026-10-06' })).toMatch(/interval/i);
    const badEnd = { ...base(), repeat: { kind: 'custom' as const, rule: { interval: 1, unit: 'day' as const, end: { kind: 'on' as const, date: '2026-10-01' } } } };
    expect(validateDraft(badEnd, { event: timed(), repeatChanged: false, repeatAnchor: '2026-10-06' })).toMatch(/end date/i);
  });

  it('skips repeat validation on a series when the repeat setting did not change', () => {
    const e = seriesEvent();
    const d = { ...draftFor(e), repeat: { kind: 'custom' as const, rule: { interval: 0, unit: 'day' as const, end: { kind: 'never' as const } } } };
    expect(validateDraft(d, { event: e, repeatChanged: false, repeatAnchor: '2026-10-01' })).toBeNull();
  });

  it('validates repeat against the series anchor when a series repeat changed', () => {
    const e = seriesEvent();
    const d = { ...draftFor(e), repeat: { kind: 'custom' as const, rule: { interval: 1, unit: 'day' as const, end: { kind: 'on' as const, date: '2026-10-02' } } } };
    expect(validateDraft(d, { event: e, repeatChanged: true, repeatAnchor: '2026-10-05' })).toMatch(/end date/i);
    expect(validateDraft(d, { event: e, repeatChanged: true, repeatAnchor: '2026-10-01' })).toBeNull();
  });

  it('rejects changing repeat on a series if the day or all-day setting also changed', () => {
    const e = seriesEvent();
    const movedDay = { ...draftFor(e), startDate: '2026-10-07', endDate: '2026-10-07', repeat: { kind: 'daily' as const } };
    expect(validateDraft(movedDay, { event: e, repeatChanged: true, repeatAnchor: '2026-10-01' })).toBe(REPEAT_SERIES_ONLY);
    const toggledAllDay = { ...draftFor(e), allDay: true, repeat: { kind: 'daily' as const } };
    expect(validateDraft(toggledAllDay, { event: e, repeatChanged: true, repeatAnchor: '2026-10-01' })).toBe(REPEAT_SERIES_ONLY);
    // Moving a single occurrence without changing repeat is still allowed.
    expect(validateDraft(movedDay, { event: e, repeatChanged: false, repeatAnchor: '2026-10-01' })).toBeNull();
  });
});

