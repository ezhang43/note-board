process.env.TZ = 'Australia/Sydney';

import { describe, expect, it } from 'vitest';
import { dayLabel, groupByDay } from './versions';

// Version history's day headings across Sydney's clock changes (a 23-hour and a 25-hour day) and
// the New Year, where a day is not 24 hours long. The line above sets the zone for this file only.

const at = (iso: string) => new Date(iso).getTime();

describe('day headings in Sydney', () => {
  it('is really in use', () => {
    expect(new Date(2026, 9, 5).getTimezoneOffset()).toBe(-660);
    expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(-600);
  });

  it('yesterday is still "Yesterday" over the 23-hour day when the clocks go forward (4 to 5 Oct 2026)', () => {
    // 4 Oct 01:30 (before the change) seen from 5 Oct 09:00 (after it).
    expect(dayLabel(at('2026-10-03T15:30:00Z'), at('2026-10-04T22:00:00Z'))).toBe('Yesterday');
    // 3 Oct, two local days before.
    expect(dayLabel(at('2026-10-02T15:30:00Z'), at('2026-10-04T22:00:00Z'))).toBe('3 October');
  });

  it('a day is "Today" until local midnight, including the 25-hour day when the clocks go back (5 Apr 2026)', () => {
    // 5 Apr 00:30 (still summer time) and 5 Apr 23:30 (winter time) are the same day.
    expect(dayLabel(at('2026-04-04T13:30:00Z'), at('2026-04-05T13:30:00Z'))).toBe('Today');
    // 4 Apr 23:30 seen from 5 Apr 00:30.
    expect(dayLabel(at('2026-04-04T12:30:00Z'), at('2026-04-04T13:30:00Z'))).toBe('Yesterday');
  });

  it('New Year: 31 Dec 23:00 is "Yesterday" at 1 Jan 13:00, and an earlier day shows its year', () => {
    expect(dayLabel(at('2025-12-31T12:00:00Z'), at('2026-01-01T02:00:00Z'))).toBe('Yesterday');
    expect(dayLabel(at('2025-12-29T13:00:00Z'), at('2026-01-01T02:00:00Z'))).toBe('30 December 2025');
  });

  it('groups by local day, not by 24-hour blocks', () => {
    const v = (id: string, iso: string) => ({ id, savedAt: at(iso), cards: 0, columns: 0 });
    const groups = groupByDay(
      [v('a', '2026-10-04T22:00:00Z'), v('b', '2026-10-04T14:30:00Z'), v('c', '2026-10-03T15:30:00Z'), v('d', '2026-10-03T13:00:00Z')],
      at('2026-10-04T22:30:00Z'),
    );
    // a: 5 Oct 09:00, b: 5 Oct 01:30 (after the change), c: 4 Oct 01:30, d: 3 Oct 23:00.
    expect(groups.map((g) => [g.label, g.versions.map((x) => x.id)])).toEqual([
      ['Today', ['a', 'b']],
      ['Yesterday', ['c']],
      ['3 October', ['d']],
    ]);
  });
});
