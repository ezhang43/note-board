import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  dayKey,
  dayLabel,
  draftBody,
  draftFor,
  eventsOnDay,
  monthGrid,
  moveDraftStart,
  moveView,
  newDraft,
  parseEvent,
  rangeLabel,
  safeLink,
  timeLabel,
  viewRange,
  weekDays,
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

  it('a week runs Monday to Sunday', () => {
    expect(weekDays('2026-10-06')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    expect(weekDays('2026-10-11')[0]).toBe('2026-10-05'); // Sunday belongs to the week before
    expect(weekDays('2026-10-12')[0]).toBe('2026-10-12');
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
    expect(viewRange('week', '2026-10-06')).toEqual({ from: '2026-10-05', to: '2026-10-12' });
    expect(viewRange('month', '2026-10-06')).toEqual({ from: '2026-09-28', to: '2026-11-02' });
  });

  it('back and forward move a week or a month', () => {
    expect(moveView('week', '2026-10-06', 1)).toBe('2026-10-13');
    expect(moveView('week', '2026-10-06', -1)).toBe('2026-09-29');
    expect(moveView('month', '2026-10-06', 1)).toBe('2026-11-06');
  });

  it('labels days and ranges', () => {
    expect(dayLabel('2026-10-06')).toBe('Tue 6 Oct');
    expect(rangeLabel('week', '2026-10-06')).toBe('5 – 11 Oct 2026');
    expect(rangeLabel('week', '2026-09-30')).toBe('28 Sep – 4 Oct 2026');
    expect(rangeLabel('week', '2026-12-30')).toBe('28 Dec 2026 – 3 Jan 2027');
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
    });
  });

  it('reads an all-day event (its end day is not included)', () => {
    const ev = parseEvent({ ...simple, start: { date: '2026-10-08' }, end: { date: '2026-10-10' } });
    expect(ev).toMatchObject({ allDay: true, start: '2026-10-08', end: '2026-10-10', editable: true });
  });

  it('repeating events, events with guests, custom reminders and others’ events are read-only', () => {
    expect(parseEvent({ ...simple, recurringEventId: 'r1' })?.editable).toBe(false);
    expect(parseEvent({ ...simple, recurrence: ['RRULE:FREQ=DAILY'] })?.editable).toBe(false);
    expect(parseEvent({ ...simple, attendees: [{ email: 'sam@example.com' }] })?.editable).toBe(false);
    expect(parseEvent({ ...simple, reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] } })?.editable).toBe(false);
    expect(parseEvent({ ...simple, organizer: { email: 'boss@example.com' } })?.editable).toBe(false);
    expect(parseEvent({ ...simple, eventType: 'outOfOffice' })?.editable).toBe(false);
    // No guests and only the calendar's default reminders: still simple.
    expect(parseEvent({ ...simple, attendees: [], eventType: 'default', reminders: { useDefault: false, overrides: [] } })?.editable).toBe(true);
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

describe('editing an event', () => {
  it('a new event is an hour from 9:00 on the chosen day', () => {
    expect(newDraft('2026-10-07')).toEqual({ title: '', allDay: false, startDate: '2026-10-07', startTime: '09:00', endDate: '2026-10-07', endTime: '10:00' });
  });

  it('fills the form from an event (an all-day event’s last day is shown, not the day after)', () => {
    expect(draftFor(timed())).toEqual({ title: 'Dentist', allDay: false, startDate: '2026-10-06', startTime: '10:00', endDate: '2026-10-06', endTime: '11:00' });
    expect(draftFor(timed({ allDay: true, start: '2026-10-08', end: '2026-10-10' }))).toMatchObject({ allDay: true, startDate: '2026-10-08', endDate: '2026-10-09' });
  });

  it('moving the start day moves the end day with it', () => {
    const d = { title: 'Trip', allDay: true, startDate: '2026-10-08', startTime: '09:00', endDate: '2026-10-09', endTime: '10:00' };
    expect(moveDraftStart(d, '2026-10-20')).toMatchObject({ startDate: '2026-10-20', endDate: '2026-10-21' });
    expect(moveDraftStart(d, '')).toBe(d);
  });

  it('turns a timed draft into what Google takes, in the person’s time zone', () => {
    const body = draftBody({ title: ' Dentist ', allDay: false, startDate: '2026-10-06', startTime: '10:00', endDate: '2026-10-06', endTime: '11:30' }, 'Europe/London');
    expect(body).toEqual({
      summary: 'Dentist',
      start: { dateTime: '2026-10-06T10:00:00', timeZone: 'Europe/London' },
      end: { dateTime: '2026-10-06T11:30:00', timeZone: 'Europe/London' },
    });
  });

  it('turns an all-day draft into dates, the end day after the last', () => {
    const body = draftBody({ title: 'Holiday', allDay: true, startDate: '2026-10-08', startTime: '', endDate: '2026-10-09', endTime: '' }, 'Europe/London');
    expect(body).toEqual({ summary: 'Holiday', start: { date: '2026-10-08' }, end: { date: '2026-10-10' } });
  });

  it('refuses an end before the start, or a missing date or time', () => {
    const d = { title: 'X', allDay: false, startDate: '2026-10-06', startTime: '10:00', endDate: '2026-10-06', endTime: '10:00' };
    expect(draftBody(d, 'UTC')).toBeNull();
    expect(draftBody({ ...d, endTime: '09:00' }, 'UTC')).toBeNull();
    expect(draftBody({ ...d, endDate: '2026-10-07', endTime: '09:00' }, 'UTC')).not.toBeNull(); // overnight is fine
    expect(draftBody({ ...d, startTime: '' }, 'UTC')).toBeNull();
    expect(draftBody({ ...d, allDay: true, endDate: '2026-10-05' }, 'UTC')).toBeNull();
    expect(draftBody({ ...d, allDay: true, startDate: '' }, 'UTC')).toBeNull();
  });

  it('an empty title is saved as "(No title)" in the list, but sent empty', () => {
    const body = draftBody({ title: '  ', allDay: true, startDate: '2026-10-08', startTime: '', endDate: '2026-10-08', endTime: '' }, 'UTC');
    expect(body?.summary).toBe('');
  });
});
