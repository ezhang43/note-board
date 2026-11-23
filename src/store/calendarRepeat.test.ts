import { describe, expect, it } from 'vitest';
import { draftFor, newDraft, parseEvent, type CalEvent, type EventBody } from '../model/calendar';
import { createCalendar as createWithAhead, REPEAT_SERIES_ONLY, type CalendarApi } from './calendar';

const createCalendar: typeof createWithAhead = (api, today, storage) => createWithAhead(api, today, storage, false);
const today = () => '2026-11-15';

const ev = (id: string, over: Partial<CalEvent> = {}): CalEvent => ({
  id,
  title: id,
  allDay: false,
  start: '2026-11-15T10:00',
  end: '2026-11-15T11:00',
  editable: true,
  link: 'https://calendar.google.com/',
  series: null,
  guests: [],
  timeZone: null,
  moved: false,
  ...over,
});

function fakeApi(initial: CalEvent[] = [ev('dentist', { title: 'Dentist' })]) {
  let events = [...initial];
  const calls: string[] = [];
  const bodies: Partial<EventBody>[] = [];
  const api: CalendarApi & { calls: string[]; bodies: Partial<EventBody>[]; series: Partial<CalEvent> } = {
    calls,
    bodies,
    series: { recurrence: ['RRULE:FREQ=DAILY'] },
    async list(from, to) {
      calls.push(`list ${from} ${to}`);
      return events;
    },
    async listWide(from, to) {
      calls.push(`wide ${from} ${to}`);
      return { events, covered: to };
    },
    async search() {
      return [];
    },
    async get(id) {
      calls.push(`get ${id}`);
      return ev(id, {
        start: '2026-11-01T09:00',
        end: '2026-11-01T09:15',
        editable: false,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...api.series,
      });
    },
    async create(body) {
      calls.push(`create ${body.summary}`);
      bodies.push(body);
      return 'ser1';
    },
    async update(id, body) {
      calls.push(`update ${id}`);
      bodies.push(body);
    },
    async remove(id) {
      calls.push(`remove ${id}`);
      events = events.filter((e) => e.id !== id && e.series !== id);
      return true;
    },
    async restore(id) {
      calls.push(`restore ${id}`);
    },
  };
  return api;
}

describe('calendar repeat options in the store', () => {
  it('parseEvent keeps recurrence strings on a series master record', () => {
    const parsed = parseEvent({
      id: 'standup',
      summary: 'Team stand-up',
      recurrence: ['RRULE:FREQ=DAILY'],
      start: { dateTime: '2026-11-01T09:00:00Z', timeZone: 'UTC' },
      end: { dateTime: '2026-11-01T09:15:00Z', timeZone: 'UTC' },
      organizer: { self: true },
    });
    expect(parsed?.recurrence).toEqual(['RRULE:FREQ=DAILY']);
    expect(parsed?.editable).toBe(false);
  });

  it('adds a new repeating event, reloads so all occurrences show, and Undo/Redo remove and restore the series', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    const note = await cal.save(null, { ...newDraft('2026-11-15'), title: 'Gym', repeat: { kind: 'weekly' } });
    expect(note).toBeNull();
    await cal.settled();
    expect(api.bodies[0].recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=SU']);
    // Reloaded after create because a series produces multiple occurrences.
    expect(api.calls.filter((c) => c.startsWith('list ')).length).toBeGreaterThanOrEqual(2);
    expect(cal.get().done?.text).toBe('Event added');
    // Undo removes the series; Redo restores it.
    await cal.undoLast();
    expect(api.calls.at(-2)).toBe('remove ser1');
    await cal.redo();
    expect(api.calls.at(-2)).toBe('restore ser1');
  });

  it('turns a one-off event into a repeating event, and Undo clears recurrence back to []', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    await cal.open();
    const dentist = cal.get().events![0];
    const note = await cal.save(dentist, { ...draftFor(dentist), repeat: { kind: 'daily' } });
    expect(note).toBeNull();
    await cal.settled();
    expect(api.bodies[0].recurrence).toEqual(['RRULE:FREQ=DAILY']);
    expect(api.calls.filter((c) => c.startsWith('list ')).length).toBeGreaterThanOrEqual(2);
    await cal.undoLast();
    expect(api.bodies[1].recurrence).toEqual([]);
    await cal.redo();
    expect(api.bodies[2].recurrence).toEqual(['RRULE:FREQ=DAILY']);
  });

  it('updates the repeat rule on an existing series and Undo puts the old rule back', async () => {
    const one = ev('standup_1', { title: 'Team stand-up', series: 'standup', start: '2026-11-15T09:00', end: '2026-11-15T09:15' });
    const api = fakeApi([one]);
    const cal = createCalendar(api, today);
    await cal.open();
    const note = await cal.save(one, { ...draftFor(one), repeat: { kind: 'weekday' } }, { all: true });
    expect(note).toBeNull();
    await cal.settled();
    expect(api.bodies[0].recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR']);
    await cal.undoLast();
    expect(api.bodies[1].recurrence).toEqual(['RRULE:FREQ=DAILY']);
    await cal.redo();
    expect(api.bodies[2].recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR']);
  });

  it('turns an existing repeating series into Does not repeat (recurrence: []) and Undo puts the rule back', async () => {
    const one = ev('standup_1', { title: 'Team stand-up', series: 'standup', start: '2026-11-15T09:00', end: '2026-11-15T09:15' });
    const api = fakeApi([one]);
    const cal = createCalendar(api, today);
    await cal.open();
    const note = await cal.save(one, { ...draftFor(one), repeat: { kind: 'none' } }, { all: true });
    expect(note).toBeNull();
    await cal.settled();
    expect(api.bodies[0].recurrence).toEqual([]);
    await cal.undoLast();
    expect(api.bodies[1].recurrence).toEqual(['RRULE:FREQ=DAILY']);
  });

  it('leaves an unsupported repeat rule untouched when saving other fields on a series', async () => {
    const one = ev('standup_1', { title: 'Team stand-up', series: 'standup', start: '2026-11-15T09:00', end: '2026-11-15T09:15' });
    const api = fakeApi([one]);
    api.series = { recurrence: ['RRULE:FREQ=MONTHLY;BYSETPOS=-1;BYDAY=MO,TU,WE,TH,FR'] };
    const cal = createCalendar(api, today);
    await cal.open();
    const note = await cal.save(
      one,
      { ...draftFor(one), title: 'Monthly wrap', repeat: { kind: 'unsupported', raw: api.series.recurrence! } },
      { all: true },
    );
    expect(note).toBeNull();
    await cal.settled();
    expect(api.bodies[0].summary).toBe('Monthly wrap');
    expect('recurrence' in api.bodies[0]).toBe(false);
  });

  it('refuses invalid custom repeat inputs and refuses repeat change on a moved series instance', async () => {
    const one = ev('standup_1', { title: 'Team stand-up', series: 'standup', start: '2026-11-15T09:00', end: '2026-11-15T09:15' });
    const api = fakeApi([one]);
    const cal = createCalendar(api, today);
    await cal.open();
    const bad = await cal.save(null, {
      ...newDraft('2026-11-15'),
      title: 'Bad',
      repeat: { kind: 'custom', rule: { interval: 1, unit: 'day', end: { kind: 'on', date: '2026-11-10' } } },
    });
    expect(bad).toBeTruthy();
    expect(api.bodies).toHaveLength(0);

    // Changing both day and repeat on a repeating event is refused.
    const moved = await cal.save(one, { ...draftFor(one), startDate: '2026-11-16', endDate: '2026-11-16', repeat: { kind: 'weekday' } }, { all: true });
    expect(moved).toBe(REPEAT_SERIES_ONLY);
    expect(api.bodies).toHaveLength(0);
  });

  it('getSeries fetches the series master including its recurrence', async () => {
    const api = fakeApi();
    const cal = createCalendar(api, today);
    const s = await cal.getSeries('standup');
    expect(s?.recurrence).toEqual(['RRULE:FREQ=DAILY']);
  });

  it('anchors existing-series repeat rules to the series start date (including -1SU on a 4-week month)', async () => {
    // Series started Sun 2026-11-29 (5th/last Sunday) with -1SU; opened on 2026-12-27 (4th/last Sunday).
    const dec = ev('monthly_2', { title: 'Monthly review', series: 'monthly', start: '2026-12-27T09:00', end: '2026-12-27T10:00' });
    const api = fakeApi([dec]);
    api.series = { title: 'Monthly review', start: '2026-11-29T09:00', end: '2026-11-29T10:00', recurrence: ['RRULE:FREQ=MONTHLY;BYDAY=-1SU'] };
    const cal = createCalendar(api, () => '2026-12-27');
    await cal.open();
    // Changing title only on All events should NOT re-send recurrence or overwrite -1SU.
    const note = await cal.save(dec, { ...draftFor(dec), title: 'Month wrap', repeat: { kind: 'monthly-weekday' } }, { all: true });
    expect(note).toBeNull();
    await cal.settled();
    expect(api.bodies[0].summary).toBe('Month wrap');
    expect('recurrence' in api.bodies[0]).toBe(false);
    // Changing a daily series starting on Nov 29 to monthly-weekday from a Dec 27 instance emits -1SU (anchored to Nov 29, not 4SU).
    api.series = { title: 'Monthly review', start: '2026-11-29T09:00', end: '2026-11-29T10:00', recurrence: ['RRULE:FREQ=DAILY'] };
    const note2 = await cal.save(dec, { ...draftFor(dec), repeat: { kind: 'monthly-weekday' } }, { all: true });
    expect(note2).toBeNull();
    await cal.settled();
    expect(api.bodies[1].recurrence).toEqual(['RRULE:FREQ=MONTHLY;BYDAY=-1SU']);
  });

  it('allows moving a single occurrence of a repeating series past its UNTIL date', async () => {
    const one = ev('standup_1', { title: 'Team stand-up', series: 'standup', start: '2026-11-15T09:00', end: '2026-11-15T09:15' });
    const api = fakeApi([one]);
    api.series = { start: '2026-11-01T09:00', end: '2026-11-01T09:15', recurrence: ['RRULE:FREQ=DAILY;UNTIL=20261116'] };
    const cal = createCalendar(api, today);
    await cal.open();
    const note = await cal.save(
      one,
      {
        ...draftFor(one),
        startDate: '2026-11-20',
        endDate: '2026-11-20',
        repeat: { kind: 'custom', rule: { interval: 1, unit: 'day', end: { kind: 'on', date: '2026-11-16' } } },
      },
      { all: false },
    );
    expect(note).toBeNull();
    await cal.settled();
    expect(api.calls).toContain('update standup_1');
  });

  it('does not patch an exception instance separately when changing a series repeat rule, so Undo succeeds cleanly', async () => {
    const moved = ev('standup_moved', { title: 'Team stand-up', series: 'standup', start: '2026-11-15T10:00', end: '2026-11-15T10:15', moved: true });
    const api = fakeApi([moved]);
    const cal = createCalendar(api, today);
    await cal.open();
    const note = await cal.save(moved, { ...draftFor(moved), title: 'Weekday stand-up', repeat: { kind: 'weekday' } }, { all: true });
    expect(note).toBeNull();
    await cal.settled();
    // Only the series master is patched (not standup_moved, which regenerating recurrence would drop).
    expect(api.calls.filter((c) => c.startsWith('update '))).toEqual(['update standup']);
    await cal.undoLast();
    expect(api.calls.filter((c) => c.startsWith('update '))).toEqual(['update standup', 'update standup']);
    expect(api.bodies.at(-1)?.recurrence).toEqual(['RRULE:FREQ=DAILY']);
  });

  it('does not cache a null getSeries result for save()', async () => {
    const one = ev('standup_1', { title: 'Team stand-up', series: 'standup', start: '2026-11-15T09:00', end: '2026-11-15T09:15' });
    const api = fakeApi([one]);
    let tries = 0;
    const origGet = api.get.bind(api);
    api.get = async (id) => (++tries === 1 ? null : origGet(id));
    const cal = createCalendar(api, today);
    await cal.open();
    expect(await cal.getSeries('standup')).toBeNull();
    const note = await cal.save(one, { ...draftFor(one), title: 'Renamed' }, { all: true });
    expect(note).toBeNull();
    expect(tries).toBe(2);
  });
});
