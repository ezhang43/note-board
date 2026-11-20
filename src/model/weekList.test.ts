import { describe, expect, it } from 'vitest';
import { recenterOn, weekAtLine, weeksBetween } from './weekList';

// The scrolling Week list of the calendar (owner request, 2026-11-20).
describe('the scrolling Week list', () => {
  it('counts whole weeks between two Sundays, either way, across a clock change', () => {
    expect(weeksBetween('2026-11-15', '2026-11-22')).toBe(1);
    expect(weeksBetween('2026-11-15', '2026-08-23')).toBe(-12);
    // Daylight saving ends on 1 Nov 2026 in many places: still whole weeks.
    expect(weeksBetween('2026-10-25', '2026-11-08')).toBe(2);
    expect(weeksBetween('2026-11-15', '2026-11-15')).toBe(0);
  });

  it('the week looked at is the last one starting at or above the line, so a gap between weeks never loses it', () => {
    const tops: [string, number][] = [
      ['2026-11-08', -400],
      ['2026-11-15', -10],
      ['2026-11-22', 300],
    ];
    expect(weekAtLine(tops, 96)).toBe('2026-11-15');
    // The line in the 8px gap just above the next week: still the week above it.
    expect(weekAtLine([['2026-11-15', -300], ['2026-11-22', 100]], 96)).toBe('2026-11-15');
    expect(weekAtLine([['2026-11-22', 96]], 96)).toBe('2026-11-22');
    // Nothing above the line yet (the list's very top): the first week.
    expect(weekAtLine([['2026-11-15', 120], ['2026-11-22', 500]], 96)).toBe('2026-11-15');
    expect(weekAtLine([], 96)).toBeNull();
  });

  it('moves the drawn weeks once the week looked at is 3 or more weeks from the middle', () => {
    expect(recenterOn('2026-11-15', '2026-11-29')).toBe(false);
    expect(recenterOn('2026-11-15', '2026-12-06')).toBe(true);
    expect(recenterOn('2026-11-15', '2026-10-25')).toBe(true);
  });
});
