import { describe, expect, it } from 'vitest';
import {
  customFrom,
  expandRecurrence,
  parseRecurrence,
  presetLabels,
  repeatSummary,
  sameRepeat,
  toRecurrence,
  validateRepeat,
  type Repeat,
} from './calendarRepeat';

describe('calendarRepeat: presets & labels', () => {
  it('formats Google Calendar preset labels from the start date', () => {
    // 2026-11-15 is the 3rd Sunday of November 2026.
    expect(presetLabels('2026-11-15')).toEqual({
      none: 'Does not repeat',
      daily: 'Daily',
      weekly: 'Weekly on Sunday',
      'monthly-weekday': 'Monthly on the third Sunday',
      yearly: 'Annually on November 15',
      weekday: 'Every weekday',
      custom: 'Custom…',
    });
    // 2026-11-01 is the 1st Sunday.
    expect(presetLabels('2026-11-01')['monthly-weekday']).toBe('Monthly on the first Sunday');
    // 2026-11-29 is the 5th (last) Sunday.
    expect(presetLabels('2026-11-29')['monthly-weekday']).toBe('Monthly on the last Sunday');
    // 2026-11-22 is the 4th Sunday.
    expect(presetLabels('2026-11-22')['monthly-weekday']).toBe('Monthly on the fourth Sunday');
  });
});

describe('calendarRepeat: toRecurrence & parseRecurrence', () => {
  it('serializes and round-trips every preset', () => {
    const day = '2026-11-15'; // 3rd Sunday
    const cases: [Repeat, string[]][] = [
      [{ kind: 'none' }, []],
      [{ kind: 'daily' }, ['RRULE:FREQ=DAILY']],
      [{ kind: 'weekly' }, ['RRULE:FREQ=WEEKLY;BYDAY=SU']],
      [{ kind: 'monthly-weekday' }, ['RRULE:FREQ=MONTHLY;BYDAY=3SU']],
      [{ kind: 'yearly' }, ['RRULE:FREQ=YEARLY']],
      [{ kind: 'weekday' }, ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR']],
    ];
    for (const [repeat, expected] of cases) {
      expect(toRecurrence(repeat, day, false)).toEqual(expected);
      expect(parseRecurrence(expected, day)).toEqual(repeat);
    }
    // 5th occurrence of a weekday in a month uses -1 (last).
    expect(toRecurrence({ kind: 'monthly-weekday' }, '2026-11-29', false)).toEqual(['RRULE:FREQ=MONTHLY;BYDAY=-1SU']);
    expect(parseRecurrence(['RRULE:FREQ=MONTHLY;BYDAY=-1SU'], '2026-11-29')).toEqual({ kind: 'monthly-weekday' });
  });

  it('accepts Google Calendar WKST and implicit BYDAY on parse', () => {
    expect(parseRecurrence(['RRULE:FREQ=WEEKLY;WKST=SU;BYDAY=SU'], '2026-11-15')).toEqual({ kind: 'weekly' });
    expect(parseRecurrence(['RRULE:FREQ=WEEKLY'], '2026-11-15')).toEqual({ kind: 'weekly' });
    expect(parseRecurrence(['RRULE:FREQ=WEEKLY;WKST=MO;BYDAY=MO,TU,WE,TH,FR'], '2026-11-15')).toEqual({ kind: 'weekday' });
    expect(parseRecurrence(undefined, '2026-11-15')).toEqual({ kind: 'none' });
    expect(parseRecurrence([], '2026-11-15')).toEqual({ kind: 'none' });
  });

  it('serializes and round-trips custom rules (intervals, weekdays, monthly modes, ends)', () => {
    const day = '2026-11-15';
    const r1: Repeat = { kind: 'custom', rule: { interval: 3, unit: 'day', end: { kind: 'after', count: 5 } } };
    expect(toRecurrence(r1, day, false)).toEqual(['RRULE:FREQ=DAILY;INTERVAL=3;COUNT=5']);
    expect(parseRecurrence(['RRULE:FREQ=DAILY;INTERVAL=3;COUNT=5'], day)).toEqual(r1);

    const r2: Repeat = { kind: 'custom', rule: { interval: 2, unit: 'week', days: ['MO', 'WE', 'FR'], end: { kind: 'never' } } };
    expect(toRecurrence(r2, day, false)).toEqual(['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR']);
    expect(parseRecurrence(['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=FR,MO,WE'], day)).toEqual(r2);

    const r3: Repeat = { kind: 'custom', rule: { interval: 1, unit: 'month', monthlyBy: 'day', end: { kind: 'on', date: '2027-03-15' } } };
    // All-day uses DATE value for UNTIL.
    expect(toRecurrence(r3, day, true)).toEqual(['RRULE:FREQ=MONTHLY;UNTIL=20270315']);
    expect(parseRecurrence(['RRULE:FREQ=MONTHLY;UNTIL=20270315'], day)).toEqual(r3);
    // Timed uses UTC date-time for UNTIL and round-trips back to the same local date.
    const timed = toRecurrence(r3, day, false)!;
    expect(timed[0]).toMatch(/^RRULE:FREQ=MONTHLY;UNTIL=\d{8}T\d{6}Z$/);
    expect(parseRecurrence(timed, day)).toEqual(r3);

    const r4: Repeat = { kind: 'custom', rule: { interval: 2, unit: 'month', monthlyBy: 'weekday', end: { kind: 'never' } } };
    expect(toRecurrence(r4, day, false)).toEqual(['RRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=3SU']);
    expect(parseRecurrence(['RRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=3SU'], day)).toEqual(r4);

    const r5: Repeat = { kind: 'custom', rule: { interval: 2, unit: 'year', end: { kind: 'after', count: 4 } } };
    expect(toRecurrence(r5, day, false)).toEqual(['RRULE:FREQ=YEARLY;INTERVAL=2;COUNT=4']);
    expect(parseRecurrence(['RRULE:FREQ=YEARLY;INTERVAL=2;COUNT=4'], day)).toEqual(r5);
  });

  it('keeps a Monday weekly series as custom Monday when opened from a moved Tuesday instance', () => {
    const parsed = parseRecurrence(['RRULE:FREQ=WEEKLY;BYDAY=MO'], '2026-11-17'); // Tuesday
    expect(parsed).toEqual({ kind: 'custom', rule: { interval: 1, unit: 'week', days: ['MO'], end: { kind: 'never' } } });
    expect(toRecurrence(parsed, '2026-11-17', false)).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO']);
  });

  it('marks unreadable or unsupported rules as unsupported so they stay read-only and untouched', () => {
    const cases = [
      ['RRULE:FREQ=DAILY', 'EXDATE;VALUE=DATE:20261116'],
      ['RDATE;VALUE=DATE:20261120'],
      ['RRULE:FREQ=MONTHLY;BYSETPOS=-1;BYDAY=MO,TU,WE,TH,FR'],
      ['RRULE:FREQ=HOURLY;INTERVAL=2'],
      ['RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=1MO'],
      ['RRULE:FREQ=DAILY;COUNT=5;UNTIL=20261130'],
      ['RRULE:FREQ=MONTHLY;BYDAY=2TU'], // doesn't match 3rd Sunday
      ['RRULE:FREQ=MONTHLY;BYDAY=-1SU'], // 2026-11-22 is 4th Sunday, not 5th (avoid silently changing -1SU to 4SU)
      ['RRULE:FREQ=MONTHLY;BYMONTHDAY=20'], // doesn't match day 15
      ['RRULE:FREQ=WEEKLY;INTERVAL=2;WKST=MO;BYDAY=MO'], // non-SU WKST with interval > 1
    ];
    for (const raw of cases) {
      const day = raw[0].includes('-1SU') ? '2026-11-22' : '2026-11-15';
      expect(parseRecurrence(raw, day)).toEqual({ kind: 'unsupported', raw });
      expect(toRecurrence({ kind: 'unsupported', raw }, day, false)).toBeNull();
    }
  });
});

describe('calendarRepeat: validation, equality, conversion, summary', () => {
  it('validates custom repeat inputs', () => {
    const start = '2026-11-15';
    expect(validateRepeat({ kind: 'daily' }, start)).toBeNull();
    expect(validateRepeat({ kind: 'custom', rule: { interval: 0, unit: 'day', end: { kind: 'never' } } }, start)).toBeTruthy();
    expect(validateRepeat({ kind: 'custom', rule: { interval: 100, unit: 'day', end: { kind: 'never' } } }, start)).toBeTruthy();
    expect(validateRepeat({ kind: 'custom', rule: { interval: 1, unit: 'week', days: [], end: { kind: 'never' } } }, start)).toBeTruthy();
    expect(validateRepeat({ kind: 'custom', rule: { interval: 1, unit: 'day', end: { kind: 'on', date: '2026-11-14' } } }, start)).toBeTruthy();
    expect(validateRepeat({ kind: 'custom', rule: { interval: 1, unit: 'day', end: { kind: 'on', date: '2026-11-15' } } }, start)).toBeNull();
    expect(validateRepeat({ kind: 'custom', rule: { interval: 1, unit: 'day', end: { kind: 'after', count: 0 } } }, start)).toBeTruthy();
    expect(validateRepeat({ kind: 'custom', rule: { interval: 1, unit: 'day', end: { kind: 'after', count: 1000 } } }, start)).toBeTruthy();
  });

  it('compares repeats by their effective recurrence', () => {
    expect(sameRepeat({ kind: 'daily' }, { kind: 'custom', rule: { interval: 1, unit: 'day', end: { kind: 'never' } } }, '2026-11-15', false)).toBe(true);
    expect(sameRepeat({ kind: 'daily' }, { kind: 'weekly' }, '2026-11-15', false)).toBe(false);
    expect(sameRepeat({ kind: 'unsupported', raw: ['RRULE:X'] }, { kind: 'unsupported', raw: ['RRULE:X'] }, '2026-11-15', false)).toBe(true);
  });

  it('builds sensible custom defaults from any preset', () => {
    expect(customFrom({ kind: 'none' }, '2026-11-15')).toEqual({ interval: 1, unit: 'week', days: ['SU'], end: { kind: 'never' } });
    expect(customFrom({ kind: 'weekday' }, '2026-11-15')).toEqual({ interval: 1, unit: 'week', days: ['MO', 'TU', 'WE', 'TH', 'FR'], end: { kind: 'never' } });
    expect(customFrom({ kind: 'monthly-weekday' }, '2026-11-15')).toEqual({ interval: 1, unit: 'month', monthlyBy: 'weekday', end: { kind: 'never' } });
  });

  it('summarizes repeat rules in plain English', () => {
    expect(repeatSummary({ kind: 'none' }, '2026-11-15')).toBe('Does not repeat');
    expect(repeatSummary({ kind: 'daily' }, '2026-11-15')).toBe('Daily');
    expect(repeatSummary({ kind: 'custom', rule: { interval: 2, unit: 'week', days: ['MO', 'WE'], end: { kind: 'after', count: 6 } } }, '2026-11-15')).toContain('Every 2 weeks');
    expect(repeatSummary({ kind: 'unsupported', raw: ['RRULE:FREQ=HOURLY'] }, '2026-11-15')).toContain('Google Calendar');
  });
});

describe('calendarRepeat: expandRecurrence (used by devServer)', () => {
  it('expands daily, interval, and COUNT rules', () => {
    expect(expandRecurrence('2026-11-15', ['RRULE:FREQ=DAILY;INTERVAL=2;COUNT=3'], '2026-11-15', '2026-11-30')).toEqual([
      '2026-11-15',
      '2026-11-17',
      '2026-11-19',
    ]);
  });

  it('expands weekly rules with multiple weekdays and UNTIL', () => {
    expect(expandRecurrence('2026-11-15', ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261125'], '2026-11-15', '2026-12-01')).toEqual([
      '2026-11-16',
      '2026-11-18',
      '2026-11-23',
      '2026-11-25',
    ]);
    // Every 2 weeks on Sunday and Tuesday starting Sun 2026-11-15.
    expect(expandRecurrence('2026-11-15', ['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,TU;COUNT=4'], '2026-11-15', '2026-12-31')).toEqual([
      '2026-11-15',
      '2026-11-17',
      '2026-11-29',
      '2026-12-01',
    ]);
  });

  it('expands monthly by day, monthly by nth/last weekday, and yearly', () => {
    expect(expandRecurrence('2026-11-15', ['RRULE:FREQ=MONTHLY;BYDAY=3SU;COUNT=3'], '2026-11-01', '2027-03-01')).toEqual([
      '2026-11-15',
      '2026-12-20',
      '2027-01-17',
    ]);
    expect(expandRecurrence('2026-11-29', ['RRULE:FREQ=MONTHLY;BYDAY=-1SU;COUNT=3'], '2026-11-01', '2027-03-01')).toEqual([
      '2026-11-29',
      '2026-12-27',
      '2027-01-31',
    ]);
    // Day 31 skips months without 31 days.
    expect(expandRecurrence('2026-01-31', ['RRULE:FREQ=MONTHLY;COUNT=3'], '2026-01-01', '2026-06-01')).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
    ]);
    expect(expandRecurrence('2026-11-15', ['RRULE:FREQ=YEARLY;COUNT=2'], '2026-11-01', '2028-12-01')).toEqual([
      '2026-11-15',
      '2027-11-15',
    ]);
  });
});
