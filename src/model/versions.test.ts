import { describe, expect, it } from 'vitest';
import { addCard, addColumn, createBoard } from './board';
import { createCard, createColumn } from './cards';
import { KEEP_VERSIONS, VERSION_GAP_MS, dayLabel, describeVersion, groupByDay, needsVersion, summarize, versionsToDrop, type VersionMeta } from './versions';

// Version history (owner request, like Google Docs): the board as it was is saved now and then.

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const meta = (id: string, savedAt: number): VersionMeta => ({ id, savedAt, cards: 1, columns: 0 });

describe('when a version is saved', () => {
  it('the first change ever saves one', () => {
    expect(needsVersion(null, at(2026, 10, 4))).toBe(true);
  });
  it('again only after a quiet spell of 10 minutes since the last one', () => {
    const last = at(2026, 10, 4, 9, 0);
    expect(VERSION_GAP_MS).toBe(10 * 60 * 1000);
    expect(needsVersion(last, last + VERSION_GAP_MS - 1)).toBe(false);
    expect(needsVersion(last, last + VERSION_GAP_MS)).toBe(true);
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
