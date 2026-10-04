import { describe, expect, it } from 'vitest';
import { addCard, addColumn, createBoard } from './board';
import { createCard, createColumn } from './cards';
import { KEEP_VERSIONS, LONG_SESSION_MS, VERSION_GAP_MS, contentHash, dayLabel, describeVersion, groupByDay, needsVersion, summarize, versionsToDrop, type VersionMeta } from './versions';

// Version history (owner request, like Google Docs): the board as it was is saved now and then.

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const meta = (id: string, savedAt: number): VersionMeta => ({ id, savedAt, cards: 1, columns: 0 });

describe('when a version is saved', () => {
  const t0 = at(2026, 10, 4, 9, 0);
  it('the first change ever saves one', () => {
    expect(needsVersion(null, null, t0)).toBe(true);
  });
  it('the first change since opening the board saves one if the newest version is 10 minutes old', () => {
    expect(VERSION_GAP_MS).toBe(10 * 60 * 1000);
    expect(needsVersion(t0, null, t0 + VERSION_GAP_MS - 1)).toBe(false);
    expect(needsVersion(t0, null, t0 + VERSION_GAP_MS)).toBe(true);
  });
  it('after that, only once editing starts again after 10 minutes away (counted from the last edit)', () => {
    // Edited 9 minutes ago, newest version 18 minutes old: still the same stretch of editing.
    expect(needsVersion(t0, t0 + 9 * 60_000, t0 + 18 * 60_000)).toBe(false);
    expect(needsVersion(t0, t0 + 9 * 60_000, t0 + 19 * 60_000)).toBe(true);
  });
  it('a long stretch of editing still gets one every hour', () => {
    expect(LONG_SESSION_MS).toBe(60 * 60 * 1000);
    expect(needsVersion(t0, t0 + LONG_SESSION_MS - 60_000, t0 + LONG_SESSION_MS - 1)).toBe(false);
    expect(needsVersion(t0, t0 + LONG_SESSION_MS - 60_000, t0 + LONG_SESSION_MS)).toBe(true);
  });
});

describe('telling versions apart without downloading them', () => {
  it('the same board gives the same short fingerprint; a different one, a different fingerprint', () => {
    expect(contentHash('{"a":1}')).toBe(contentHash('{"a":1}'));
    expect(contentHash('{"a":1}')).not.toBe(contentHash('{"a":2}'));
    expect(contentHash('x'.repeat(100_000)).length).toBeLessThan(24);
    // Two fingerprints made with different starting points, so a chance match is far less likely.
    expect(contentHash('abc').split('-')).toHaveLength(3);
  });
});

describe('what a version says about itself', () => {
  it('counts cards (in columns too) and columns', () => {
    let b = addColumn(createBoard(), createColumn('c1'));
    b = addCard(b, createCard('note', 'n1'), { type: 'column', columnId: 'c1', index: 0 });
    b = addCard(b, createCard('todo', 't1'), { type: 'loose', x: 0, y: 0 });
    expect(summarize(b)).toEqual({ cards: 2, columns: 1 });
  });
  it('reads as a short line', () => {
    expect(describeVersion({ id: 'a', savedAt: 0, cards: 12, columns: 3 })).toBe('12 cards · 3 columns');
    expect(describeVersion({ id: 'a', savedAt: 0, cards: 1, columns: 1 })).toBe('1 card · 1 column');
    expect(describeVersion({ id: 'a', savedAt: 0, cards: 0, columns: 0 })).toBe('Empty board');
  });
});

describe('the list of versions', () => {
  const now = at(2026, 10, 4, 15);
  it('names days like Google does: Today, Yesterday, then the date (with the year when not this year)', () => {
    expect(dayLabel(at(2026, 10, 4, 8), now)).toBe('Today');
    expect(dayLabel(at(2026, 10, 3, 23, 59), now)).toBe('Yesterday');
    expect(dayLabel(at(2026, 9, 28), now)).toBe('28 September');
    expect(dayLabel(at(2025, 12, 31), now)).toBe('31 December 2025');
  });
  it('is grouped by day, newest first', () => {
    const groups = groupByDay([meta('a', at(2026, 10, 3, 9)), meta('b', at(2026, 10, 4, 9)), meta('c', at(2026, 10, 4, 14))], now);
    expect(groups.map((g) => [g.label, g.versions.map((v) => v.id)])).toEqual([
      ['Today', ['c', 'b']],
      ['Yesterday', ['a']],
    ]);
  });
  it(`keeps the newest ${KEEP_VERSIONS}; older ones are dropped`, () => {
    const many = Array.from({ length: KEEP_VERSIONS + 3 }, (_, i) => meta(`v${i}`, i * 1000));
    expect(versionsToDrop(many).sort()).toEqual(['v0', 'v1', 'v2']);
    expect(versionsToDrop(many.slice(0, 5))).toEqual([]);
  });
});
