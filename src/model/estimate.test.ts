import { describe, expect, it } from 'vitest';
import { MAX_ESTIMATE, estimateLabel, readDay, readEstimate, tickedOn } from './estimate';

// Time estimates on notes and checklist items, and the day an item was ticked (job saved-estimate-doneon).

describe('readEstimate: only whole minutes from 1 to a day', () => {
  it('keeps whole minutes from 1 to 24 hours', () => {
    expect(MAX_ESTIMATE).toBe(24 * 60);
    for (const m of [1, 5, 30, 90, MAX_ESTIMATE]) expect(readEstimate(m)).toBe(m);
  });

  it('drops anything else (nothing, zero, negative, part minutes, over a day, text, NaN, Infinity)', () => {
    for (const v of [undefined, null, 0, -5, 1.5, MAX_ESTIMATE + 1, '30', NaN, Infinity, true, {}, []]) expect(readEstimate(v)).toBeUndefined();
  });
});

describe('readDay: a real "YYYY-MM-DD" day', () => {
  it('keeps real days', () => {
    for (const d of ['2026-11-11', '2024-02-29', '1999-12-31']) expect(readDay(d)).toBe(d);
  });

  it('drops days that don’t exist and anything that isn’t a day', () => {
    for (const v of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '2026-11-00', '2026-1-1', '20261111', '2026-11-11T10:00', ' 2026-11-11', 20261111, null, undefined, {}]) {
      expect(readDay(v)).toBeUndefined();
    }
  });
});

describe('estimateLabel', () => {
  it('minutes under an hour, hours, and hours with minutes', () => {
    expect(estimateLabel(5)).toBe('5m');
    expect(estimateLabel(45)).toBe('45m');
    expect(estimateLabel(60)).toBe('1h');
    expect(estimateLabel(90)).toBe('1h 30m');
    expect(estimateLabel(MAX_ESTIMATE)).toBe('24h');
  });
});

describe('tickedOn: the day an item was ticked, only while it is ticked', () => {
  const item = { id: 'a', text: 'a', children: [] };
  it('a ticked item with a day gives the day', () => {
    expect(tickedOn({ ...item, done: true, doneOn: '2026-11-11' })).toBe('2026-11-11');
  });
  it('ticked with no day (a habit, an import, an older save) gives null', () => {
    expect(tickedOn({ ...item, done: true })).toBeNull();
  });
  it('a day left on an open item (another device unticked it at the same time) counts for nothing', () => {
    expect(tickedOn({ ...item, done: false, doneOn: '2026-11-11' })).toBeNull();
  });
});
