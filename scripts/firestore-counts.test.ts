import { describe, expect, it } from 'vitest';
import { COUNTS, compareReports, countRequest, docsUrl, fingerprint, formatReport, parseReport, readCount } from './firestore-counts.mjs';

// The read-only count script for moving Firestore to the US (job #40, route C of
// docs/plans/firestore-us-move-plan.md). Only the pure parts are tested here; the network part
// is a thin layer in main().

describe('database address', () => {
  it('builds the documents address for (default) and a named database', () => {
    expect(docsUrl('(default)')).toBe('https://firestore.googleapis.com/v1/projects/note-board-a672a/databases/(default)/documents');
    expect(docsUrl('us-check')).toBe('https://firestore.googleapis.com/v1/projects/note-board-a672a/databases/us-check/documents');
  });

  it('refuses anything that is not a database id', () => {
    for (const bad of ['', 'US', '../x', 'a/b', 'us check', '(default)/x', 'ab'])
      expect(() => docsUrl(bad), bad).toThrow(/database/i);
  });
});

describe('count queries', () => {
  it('counts every path listed in the plan', () => {
    expect(COUNTS.map((c) => c.name)).toEqual(['boards', 'versions', 'versionData', 'boards/*/shared', 'shared', 'members']);
  });

  it('asks for a COUNT of one top-level collection', () => {
    expect(countRequest('boards', false)).toEqual({
      structuredAggregationQuery: {
        structuredQuery: { from: [{ collectionId: 'boards', allDescendants: false }] },
        aggregations: [{ alias: 'n', count: {} }],
      },
    });
  });

  it('asks for a COUNT across every collection of that name (collection group)', () => {
    expect(countRequest('versions', true).structuredAggregationQuery.structuredQuery.from).toEqual([{ collectionId: 'versions', allDescendants: true }]);
  });

  it('reads the number from the answer', () => {
    expect(readCount([{ result: { aggregateFields: { n: { integerValue: '42' } } }, readTime: '2026-10-07T00:00:00Z' }])).toBe(42);
    expect(readCount([{ result: { aggregateFields: { n: { integerValue: '0' } } } }])).toBe(0);
  });

  it('refuses an answer without a number', () => {
    expect(() => readCount([{ readTime: 'x' }])).toThrow();
    expect(() => readCount({})).toThrow();
  });
});

describe('fingerprints', () => {
  const doc = (fields: Record<string, unknown>, updateTime = '2026-10-07T01:00:00Z') => ({
    name: 'projects/note-board-a672a/databases/(default)/documents/boards/u1',
    fields,
    createTime: '2026-01-01T00:00:00Z',
    updateTime,
  });

  it('gives the path, the length of the board text and a hash', () => {
    const f = fingerprint(doc({ data: { stringValue: '{"a":1}' }, client: { stringValue: 'c1' } }));
    expect(f.path).toBe('boards/u1');
    expect(f.dataLength).toBe(7);
    expect(f.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('does not change when only the update time or the field order changes', () => {
    const a = fingerprint(doc({ data: { stringValue: 'x' }, rev: { integerValue: '3' } }, '2026-10-07T01:00:00Z'));
    const b = fingerprint(doc({ rev: { integerValue: '3' }, data: { stringValue: 'x' } }, '2026-11-01T09:00:00Z'));
    expect(b).toEqual(a);
  });

  it('changes when any field changes, even inside a map', () => {
    const base = fingerprint(doc({ data: { stringValue: 'x' }, m: { mapValue: { fields: { k: { stringValue: '1' } } } } }));
    expect(fingerprint(doc({ data: { stringValue: 'y' }, m: { mapValue: { fields: { k: { stringValue: '1' } } } } })).hash).not.toBe(base.hash);
    expect(fingerprint(doc({ data: { stringValue: 'x' }, m: { mapValue: { fields: { k: { stringValue: '2' } } } } })).hash).not.toBe(base.hash);
    expect(fingerprint(doc({ data: { stringValue: 'x' } })).hash).not.toBe(base.hash);
  });

  it('has no board text length when there is no data field', () => {
    expect(fingerprint(doc({ owner: { stringValue: 'u1' } })).dataLength).toBe(-1);
  });
});

describe('report', () => {
  const report = {
    database: '(default)',
    counts: { boards: 2, versions: 10, versionData: 10, 'boards/*/shared': 1, shared: 1, members: 2 },
    docs: [
      { path: 'boards/u1', dataLength: 120, hash: 'aaaaaaaaaaaaaaaa' },
      { path: 'shared/s1', dataLength: 50, hash: 'bbbbbbbbbbbbbbbb' },
    ],
  };

  it('prints counts and fingerprints that read back the same', () => {
    const text = formatReport(report);
    expect(text).toContain('count boards 2');
    expect(text).toContain('doc boards/u1 120 aaaaaaaaaaaaaaaa');
    expect(parseReport(text)).toEqual({ counts: report.counts, docs: report.docs });
  });

  it('reads a report even with Windows line endings and blank lines', () => {
    const text = '\r\n' + formatReport(report).replace(/\n/g, '\r\n') + '\r\n\r\n';
    expect(parseReport(text).counts.boards).toBe(2);
  });

  it('refuses a file that is not a report', () => {
    expect(() => parseReport('hello\nworld\n')).toThrow(/count script/);
  });

  it('says MATCH when counts and contents are the same, whatever the database', () => {
    const before = formatReport(report);
    const after = formatReport({ ...report, database: 'us-check' });
    expect(compareReports(before, after)).toEqual(['MATCH: every count and every board is the same.']);
  });

  it('names each difference in plain words', () => {
    const before = formatReport(report);
    const after = formatReport({
      ...report,
      counts: { ...report.counts, versions: 9 },
      docs: [
        { path: 'boards/u1', dataLength: 121, hash: 'cccccccccccccccc' },
        { path: 'shared/s2', dataLength: 5, hash: 'dddddddddddddddd' },
      ],
    });
    const lines = compareReports(before, after);
    expect(lines[0]).toMatch(/^DIFFERENT/);
    expect(lines).toContain('versions: 10 before, 9 after');
    expect(lines).toContain('boards/u1: contents changed');
    expect(lines).toContain('shared/s1: missing after');
    expect(lines).toContain('shared/s2: new after (not there before)');
  });
});
