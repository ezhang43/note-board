import { describe, expect, it, vi } from 'vitest';
import { paginateEvents } from './api';

describe('paginateEvents', () => {
  it('reads a single page without pageToken and reports hasMore false', async () => {
    const seen: string[] = [];
    const fetchPage = vi.fn(async (params: URLSearchParams) => {
      seen.push(params.toString());
      return { items: [{ id: '1' }, { id: '2' }] };
    });

    const result = await paginateEvents({
      fetchPage,
      params: { singleEvents: 'true', maxResults: '250' },
      maxPages: 4,
      mapItem: (raw) => (raw as { id: string }).id,
    });

    expect(result).toEqual({ items: ['1', '2'], pages: 1, hasMore: false });
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(['singleEvents=true&maxResults=250']);
  });

  it('follows nextPageToken across pages without mutating base params and stops on empty token', async () => {
    const seen: URLSearchParams[] = [];
    const pages = [
      { items: [1, 2], nextPageToken: 'p2' },
      { items: [3], nextPageToken: 'p3' },
      { items: [4], nextPageToken: '' },
    ];
    let i = 0;
    const baseParams = { q: 'dentist', maxResults: '250' };

    const result = await paginateEvents({
      fetchPage: async (params) => {
        seen.push(params);
        return pages[i++];
      },
      params: baseParams,
      maxPages: 5,
      mapItem: (raw) => (typeof raw === 'number' ? raw : null),
    });

    expect(result).toEqual({ items: [1, 2, 3, 4], pages: 3, hasMore: false });
    expect(seen.map((p) => p.get('pageToken'))).toEqual([null, 'p2', 'p3']);
    expect(baseParams).toEqual({ q: 'dentist', maxResults: '250' });
  });

  it('stops at maxPages and reports hasMore true when nextPageToken remains', async () => {
    const fetchPage = vi.fn(async () => ({ items: ['a'], nextPageToken: 'more' }));

    const result = await paginateEvents({
      fetchPage,
      params: { maxResults: '250' },
      maxPages: 2,
      mapItem: (raw) => String(raw),
    });

    expect(result).toEqual({ items: ['a', 'a'], pages: 2, hasMore: true });
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('skips null mapped items and tolerates missing or non-array items', async () => {
    const responses = [{ items: [1, null, 2, 'bad'] }, { items: 'not-an-array' }, {}];
    let i = 0;

    const result = await paginateEvents({
      fetchPage: async () => ({ ...responses[i], ...(i++ < 2 ? { nextPageToken: `t${i}` } : {}) }),
      params: {},
      maxPages: 5,
      mapItem: (raw) => (typeof raw === 'number' ? raw * 10 : null),
    });

    expect(result).toEqual({ items: [10, 20], pages: 3, hasMore: false });
  });

  it('propagates errors from fetchPage', async () => {
    await expect(
      paginateEvents({
        fetchPage: async () => {
          throw new Error('boom');
        },
        params: {},
        maxPages: 3,
        mapItem: (raw) => raw,
      }),
    ).rejects.toThrow('boom');
  });

  it('returns empty result without fetching when maxPages is 0', async () => {
    const fetchPage = vi.fn();
    const result = await paginateEvents({
      fetchPage,
      params: {},
      maxPages: 0,
      mapItem: (raw) => raw,
    });
    expect(result).toEqual({ items: [], pages: 0, hasMore: false });
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
