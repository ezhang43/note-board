import { describe, expect, it, vi } from 'vitest';
import { newDraft, type CalEvent } from '../model/calendar';
import { CalendarApiError, calendarApi, createCalendar as createWithAhead, NOT_CONNECTED, type CalendarApi, type SearchItem } from './calendar';

const createCalendar: typeof createWithAhead = (api, today, storage) => createWithAhead(api, today, storage, false);
const today = () => '2026-11-15';

const ev = (id: string, title: string, start = '2026-11-15T10:00', over: Partial<CalEvent> = {}): CalEvent => ({
  id,
  title,
  allDay: false,
  start,
  end: start.replace('10:00', '11:00'),
  editable: true,
  link: 'https://calendar.google.com/',
  series: null,
  guests: [],
  timeZone: null,
  moved: false,
  ...over,
});

function fakeApi(index: SearchItem[]) {
  const calls: string[] = [];
  let qResults: CalEvent[] = [];
  let failQ = false;
  let failIndex = false;
  let who: string | null = 'u1';
  const api: CalendarApi & {
    calls: string[];
    setQResults: (r: CalEvent[]) => void;
    setFailQ: (b: boolean) => void;
    setFailIndex: (b: boolean) => void;
    setPerson: (p: string | null) => void;
    setIndex: (items: SearchItem[]) => void;
  } = {
    calls,
    setQResults: (r) => (qResults = r),
    setFailQ: (b) => (failQ = b),
    setFailIndex: (b) => (failIndex = b),
    setPerson: (p) => (who = p),
    setIndex: (items) => (index = items),
    person: () => who,
    async list(from, to) {
      calls.push(`list ${from} ${to}`);
      return [];
    },
    async listWide(_from, to) {
      return { events: [], covered: to };
    },
    async search(text, day) {
      calls.push(`search ${text} ${day}`);
      if (failQ) throw new CalendarApiError(500);
      return qResults;
    },
    async listForSearch(day) {
      calls.push(`listForSearch ${day}`);
      if (failIndex) throw new CalendarApiError(500);
      return index;
    },
    async get() {
      return null;
    },
    async create() {
      return 'new1';
    },
    async update() {},
    async remove() {
      return true;
    },
    async restore() {},
  };
  return api;
}

describe('partial-match calendar search (owner request, 2026-11-23)', () => {
  it('finds partial matches from listForSearch even when Google q returns empty, and caches the index across searches', async () => {
    const dentist = ev('d1', 'Dentist');
    const kayak = ev('k1', 'Kayaking lesson', '2026-11-12T10:00');
    const lunch = ev('l1', 'Lunch with Sam', '2026-11-16T10:00');
    const api = fakeApi([
      { event: dentist, fields: ['Dentist'] },
      { event: kayak, fields: ['Kayaking lesson', 'River dock'] },
      { event: lunch, fields: ['Lunch with Sam', 'sam@example.com'] },
    ]);
    const cal = createCalendar(api, today);
    await cal.open();

    // Google q returns nothing for partial word "dent", but partial search finds Dentist.
    cal.openSearch();
    cal.setSearchText('dent');
    await cal.searchNow();
    expect(cal.get().search?.results?.map((e) => e.id)).toEqual(['d1']);

    // Second search reuses the cached index without calling listForSearch again.
    cal.setSearchText('yak dock');
    await cal.searchNow();
    expect(cal.get().search?.results?.map((e) => e.id)).toEqual(['k1']);
    expect(api.calls.filter((c) => c.startsWith('listForSearch'))).toHaveLength(1);

    // Partial guest email matches too.
    cal.setSearchText('sam@ex');
    await cal.searchNow();
    expect(cal.get().search?.results?.map((e) => e.id)).toEqual(['l1']);
  });

  it('merges Google q hits (e.g. from 4 years ago) with partial hits without duplicates', async () => {
    const oldHit = ev('old1', 'Tax filing', '2022-04-10T10:00');
    const nearHit = ev('d1', 'Dentist');
    const api = fakeApi([{ event: nearHit, fields: ['Dentist'] }]);
    api.setQResults([oldHit, nearHit]);
    const cal = createCalendar(api, today);
    await cal.open();
    cal.openSearch();
    cal.setSearchText('dent');
    await cal.searchNow();
    expect(cal.get().search?.results?.map((e) => e.id)).toEqual(['d1', 'old1']);
  });

  it('clears the cached search index after a change, a fresh open, or a person switch', async () => {
    const api = fakeApi([{ event: ev('d1', 'Dentist'), fields: ['Dentist'] }]);
    const cal = createCalendar(api, today);
    await cal.open();
    cal.openSearch();
    cal.setSearchText('dent');
    await cal.searchNow();
    expect(api.calls.filter((c) => c.startsWith('listForSearch'))).toHaveLength(1);

    // Adding an event forgets the cached index, so the next search reads fresh.
    api.setIndex([
      { event: ev('d1', 'Dentist'), fields: ['Dentist'] },
      { event: ev('n1', 'Dental hygienist'), fields: ['Dental hygienist'] },
    ]);
    await cal.save(null, { ...newDraft('2026-11-15'), title: 'Dental hygienist' });
    await cal.settled();
    cal.setSearchText('dent');
    await cal.searchNow();
    expect(api.calls.filter((c) => c.startsWith('listForSearch'))).toHaveLength(2);
    expect(cal.get().search?.results?.map((e) => e.id)).toEqual(['d1', 'n1']);

    // Opening afresh clears the cached index too.
    await cal.open();
    cal.openSearch();
    cal.setSearchText('dent');
    await cal.searchNow();
    expect(api.calls.filter((c) => c.startsWith('listForSearch'))).toHaveLength(3);

    // Switching to another person clears the cached index and reloads the panel for the new person.
    const listsBefore = api.calls.filter((c) => c.startsWith('list ')).length;
    api.setPerson('u2');
    api.setIndex([{ event: ev('u2e', 'Dentist U2'), fields: ['Dentist U2'] }]);
    cal.setSearchText('dent');
    await cal.searchNow();
    // Account switch cleared search and triggered a reload for u2 without running u1's search.
    expect(cal.get().search).toBeNull();
    expect(api.calls.filter((c) => c.startsWith('list ')).length).toBe(listsBefore + 1);
    expect(api.calls.filter((c) => c.startsWith('listForSearch'))).toHaveLength(3);
    // A new search as u2 fetches fresh index for u2 as soon as the box opens.
    cal.openSearch();
    cal.setSearchText('dent');
    await cal.searchNow();
    expect(api.calls.filter((c) => c.startsWith('listForSearch'))).toHaveLength(4);
    expect(cal.get().search?.results?.map((e) => e.id)).toEqual(['u2e']);
  });

  it('preloads on openSearch and shows matching results synchronously while typing (0ms lag); 0 local hits wait for Google', async () => {
    vi.useFakeTimers();
    try {
      const romance = ev('r1', 'my siblings romance', '2023-06-10T10:00');
      const api = fakeApi([{ event: romance, fields: ['my siblings romance'] }]);
      const cal = createCalendar(api, today);
      await cal.open();

      // Opening the search box starts preloading the index immediately, before any typing.
      cal.openSearch();
      expect(api.calls.filter((c) => c.startsWith('listForSearch'))).toHaveLength(1);
      await Promise.resolve();
      await Promise.resolve();

      // Typing a partial match shows results immediately (0ms, before debounce or api.search).
      cal.setSearchText('roman');
      expect(cal.get().search?.results?.map((e) => e.id)).toEqual(['r1']);
      expect(api.calls.filter((c) => c.startsWith('search '))).toEqual([]);

      // Typing something with 0 local hits keeps results: null ("Searching…") until Google finishes.
      cal.setSearchText('zzz');
      expect(cal.get().search?.results).toBeNull();
      await vi.advanceTimersByTimeAsync(300);
      expect(cal.get().search?.results).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still returns Google q matches if listForSearch fails, and still fails when Google search fails', async () => {
    const hit = ev('d1', 'Dentist');
    const api = fakeApi([{ event: hit, fields: ['Dentist'] }]);
    api.setQResults([hit]);
    api.setFailIndex(true);
    const cal = createCalendar(api, today);
    await cal.open();
    cal.openSearch();
    cal.setSearchText('Dentist');
    await cal.searchNow();
    expect(cal.get().search?.results?.map((e) => e.id)).toEqual(['d1']);

    // Next search retries listForSearch because the failed one was not cached.
    api.setFailIndex(false);
    api.setQResults([]);
    cal.setSearchText('dent');
    await cal.searchNow();
    expect(cal.get().search?.results?.map((e) => e.id)).toEqual(['d1']);
    expect(api.calls.filter((c) => c.startsWith('listForSearch'))).toHaveLength(2);

    // If Google q search fails, the search reports the usual error note.
    api.setFailQ(true);
    cal.setSearchText('dent');
    await cal.searchNow();
    expect(cal.get().search).toMatchObject({ results: null, note: NOT_CONNECTED });
  });

  it('calendarApi.listForSearch fetches future and per-year past windows without q, follows nextPageToken up to 2 pages, and guards untrusted fields', async () => {
    const urls: URL[] = [];
    const fn = vi.fn(async (url: string) => {
      const u = new URL(url);
      urls.push(u);
      const from = new Date(u.searchParams.get('timeMin')!).getTime();
      const page = u.searchParams.get('pageToken');
      if (from === new Date(2026, 10, 15).getTime()) {
        if (!page) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 'e1',
                  summary: 'Dentist',
                  description: 'Bring insurance card',
                  location: 'Main St Clinic',
                  attendees: [{ email: 'dr@clinic.test', displayName: 'Dr Patel' }, null, { email: 123 }],
                  start: { dateTime: '2026-11-16T10:00:00Z' },
                  end: { dateTime: '2026-11-16T11:00:00Z' },
                  organizer: { self: true },
                },
                {
                  id: 'gone',
                  status: 'cancelled',
                  summary: 'Deleted event',
                  start: { dateTime: '2026-11-16T12:00:00Z' },
                  end: { dateTime: '2026-11-16T13:00:00Z' },
                },
              ],
              nextPageToken: 'p2',
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'e2',
                summary: 'Checkup',
                attendees: 'not-an-array',
                start: { dateTime: '2026-11-20T10:00:00Z' },
                end: { dateTime: '2026-11-20T11:00:00Z' },
                organizer: { self: true },
              },
            ],
            nextPageToken: 'p3-ignored',
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    });
    const api = calendarApi({ base: 'https://api.test/calendar/v3', token: async () => 'tok', forget: () => {} }, fn as unknown as typeof fetch);
    const items = await api.listForSearch!('2026-11-15');
    // 2 pages for future (5y) + 1 page each for 5 past years = 7 requests (stops at PARTIAL_PAGES=2).
    expect(urls.length).toBe(7);
    expect(urls.some((u) => u.searchParams.get('pageToken') === 'p2')).toBe(true);
    expect(urls.some((u) => u.searchParams.get('pageToken') === 'p3-ignored')).toBe(false);
    // Covers 5 years forward and 5 past years a year at a time.
    expect(urls.some((u) => new Date(u.searchParams.get('timeMin')!).getTime() === new Date(2026, 10, 15).getTime() && new Date(u.searchParams.get('timeMax')!).getTime() === new Date(2031, 10, 15).getTime())).toBe(true);
    expect(urls.some((u) => new Date(u.searchParams.get('timeMin')!).getTime() === new Date(2025, 10, 15).getTime() && new Date(u.searchParams.get('timeMax')!).getTime() === new Date(2026, 10, 15).getTime())).toBe(true);
    expect(urls.some((u) => new Date(u.searchParams.get('timeMin')!).getTime() === new Date(2021, 10, 15).getTime() && new Date(u.searchParams.get('timeMax')!).getTime() === new Date(2022, 10, 15).getTime())).toBe(true);
    for (const u of urls) {
      expect(u.searchParams.has('q')).toBe(false);
      expect(u.searchParams.get('singleEvents')).toBe('true');
      expect(u.searchParams.get('maxResults')).toBe('2500');
    }
    expect(items.map((i) => i.event.id)).toEqual(['e1', 'e2']);
    expect(items[0].fields).toEqual(['Dentist', 'Bring insurance card', 'Main St Clinic', 'dr@clinic.test', 'Dr Patel']);
    expect(items[1].fields).toEqual(['Checkup']);
  });
});
