process.env.TZ = 'Australia/Sydney';

import { describe, expect, it, vi } from 'vitest';
import { addDays, dayKey, draftFor, eventsOnDay, exceptionChange, parseEvent, weekDays, type CalEvent } from './calendar';
import { dayKey as completedDayKey } from './completed';
import { journalDateLine, journalDayKey } from './journal';
import { calendarApi } from '../store/calendar';

// Dates and daily panels, guards (job #156). Every test here runs in Sydney's time zone, which has
// a clock change in both April (back) and October (forward) and sits on the far side of UTC, so it
// catches any day or time worked out in UTC by mistake. The line above sets the zone for this file
// only; nothing here depends on the computer's own zone.

describe('Sydney time zone', () => {
  it('is really in use (daylight time in January, standard time in July)', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-660);
    expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(-600);
  });

  it('names the local day around the clock changes', () => {
    // 4 Oct 2026 02:00 AEST jumps to 03:00 AEDT (16:00Z on 3 Oct is 03:00 AEDT on the 4th).
    expect(dayKey(new Date('2026-10-03T15:59:00Z'))).toBe('2026-10-04');
    expect(dayKey(new Date('2026-10-03T13:59:00Z'))).toBe('2026-10-03');
    // 5 Apr 2026 03:00 AEDT goes back to 02:00 AEST.
    expect(dayKey(new Date('2026-04-04T13:00:00Z'))).toBe('2026-04-05');
    expect(dayKey(new Date('2026-04-04T12:59:00Z'))).toBe('2026-04-04');
    for (let h = 0; h < 24; h++) expect(dayKey(new Date(2026, 9, 4, h, 30))).toBe('2026-10-04');
  });

  it('reads Google’s offsets into local clock time', () => {
    const at = (dt: string) => parseEvent({ id: 'x', start: { dateTime: dt }, end: { dateTime: dt } })!.start;
    expect(at('2026-10-04T03:30:00+11:00')).toBe('2026-10-04T03:30');
    expect(at('2026-04-05T02:30:00+10:00')).toBe('2026-04-05T02:30');
    expect(at('2026-10-06T10:00:00Z')).toBe('2026-10-06T21:00');
    expect(at('2026-12-31T13:30:00Z')).toBe('2027-01-01T00:30'); // New Year
  });

  it('asks Google for the days shown from local midnight to local midnight', async () => {
    const urls: string[] = [];
    const fetchFn = vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const api = calendarApi({ base: 'https://api.test/calendar/v3', token: async () => 'tok', forget: () => {} }, fetchFn);
    const window = (i: number) => {
      const p = new URL(urls[i]).searchParams;
      return [p.get('timeMin'), p.get('timeMax')];
    };
    await api.list('2026-10-04', '2026-10-11');
    expect(window(0)).toEqual(['2026-10-03T14:00:00.000Z', '2026-10-10T13:00:00.000Z']);
    await api.list('2026-04-05', '2026-04-06');
    expect(window(1)).toEqual(['2026-04-04T13:00:00.000Z', '2026-04-05T14:00:00.000Z']);
  });

  it('steps by whole days over a clock change', () => {
    expect(weekDays('2026-10-01')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']);
    expect(addDays('2026-04-04', 1)).toBe('2026-04-05');
    expect(addDays('2026-04-05', 1)).toBe('2026-04-06');
  });

  it('writes and reads the Journal date line on clock-change days, and the two day keys agree', () => {
    expect(journalDateLine(new Date(2026, 9, 4, 0, 30))).toBe('Sun 4 Oct 2026');
    expect(journalDateLine(new Date(2026, 3, 5, 2, 30))).toBe('Sun 5 Apr 2026');
    expect(journalDayKey('Sun 4 Oct 2026')).toBe('2026-10-04');
    expect(completedDayKey(new Date(2026, 9, 4, 0, 30))).toBe('2026-10-04');
    expect(completedDayKey(new Date('2026-10-03T15:59:00Z'))).toBe('2026-10-04');
  });

  it('an event over the clock jump is listed on its own day only', () => {
    const e: CalEvent = { id: 'j', title: 'Jump', allDay: false, start: '2026-10-04T01:00', end: '2026-10-04T04:00', editable: true, link: '', series: null, guests: [], timeZone: null, moved: false };
    expect(eventsOnDay([e], '2026-10-04')).toHaveLength(1);
    expect(eventsOnDay([e], '2026-10-03')).toHaveLength(0);
    expect(eventsOnDay([e], '2026-10-05')).toHaveLength(0);
  });

  it('a daily series kept in Sydney is the same series time in winter and summer, not a changed event', () => {
    const series = parseEvent({
      id: 's',
      summary: 'Stand',
      recurrence: ['RRULE:FREQ=DAILY'],
      organizer: { self: true },
      start: { dateTime: '2026-09-01T09:00:00+10:00', timeZone: 'Australia/Sydney' },
      end: { dateTime: '2026-09-01T09:15:00+10:00', timeZone: 'Australia/Sydney' },
    })!;
    const one = parseEvent({
      id: 's_1',
      summary: 'Stand',
      recurringEventId: 's',
      originalStartTime: { dateTime: '2026-10-06T09:00:00+11:00' },
      organizer: { self: true },
      start: { dateTime: '2026-10-06T09:00:00+11:00', timeZone: 'Australia/Sydney' },
      end: { dateTime: '2026-10-06T09:15:00+11:00', timeZone: 'Australia/Sydney' },
    })!;
    expect(one.moved).toBe(false);
    expect(series.timeZone).toBe('Australia/Sydney');
    expect(exceptionChange(one, { ...draftFor(one), title: 'Daily' }, series)).toBeNull();
  });
});
