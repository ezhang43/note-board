process.env.TZ = 'America/New_York';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MINUTES,
  fixedEvents,
  freeSlots,
  repack as repackWith,
  type RepackOptions,
  type ScheduleEvent,
  type Task,
} from './schedule';

// Day scheduler (the "wow" plan, job 9): the pure part. Free gaps between fixed events, and a plan
// that packs the app's own blocks and new tasks into them. Times are local 'YYYY-MM-DDTHH:MM'.
// New York is used because it has clock changes: 2026-03-08 (spring forward), 2026-11-01 (fall back).

const D = '2026-11-11';
const at = (hhmm: string, day = D) => new Date(`${day}T${hhmm}:00`);
const ev = (id: string, s: string, e: string, over: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  id,
  title: id,
  allDay: false,
  start: `${D}T${s}`,
  end: `${D}T${e}`,
  editable: true,
  link: 'https://calendar.google.com/',
  series: null,
  guests: [],
  timeZone: null,
  moved: false,
  ...over,
});
const block = (id: string, s: string, e: string, cardId = `card-${id}`, over: Partial<ScheduleEvent> = {}) =>
  ev(id, s, e, { block: { cardId }, ...over });
const task = (cardId: string, minutes: number): Task => ({ cardId, title: cardId, minutes });
// Most cases below count without a gap; the default gap has its own cases.
const repack = (
  blocks: ScheduleEvent[],
  tasks: Task[],
  fixed: ScheduleEvent[],
  now: Date,
  dayEnd: Date,
  opts: RepackOptions = { gapMinutes: 0 },
) => repackWith(blocks, tasks, fixed, now, dayEnd, opts);
const slot = (s: string, e: string, day = D) => ({ start: `${day}T${s}`, end: `${day}T${e}` });

describe('fixedEvents', () => {
  it('keeps timed events that are not editable blocks and drops all-day ones', () => {
    const all: ScheduleEvent[] = [
      ev('meeting', '10:00', '11:00'),
      block('mine', '12:00', '13:00'),
      block('locked', '14:00', '15:00', 'c', { editable: false }),
      ev('holiday', '00:00', '00:00', { allDay: true }),
    ];
    expect(fixedEvents(all).map((e) => e.id)).toEqual(['meeting', 'locked']);
  });
});

describe('freeSlots', () => {
  it('an empty day is one slot from now (rounded up to 5 minutes) to the day end', () => {
    expect(freeSlots([], at('09:02'), at('17:00'))).toEqual([slot('09:05', '17:00')]);
    expect(freeSlots([], at('09:05'), at('17:00'))).toEqual([slot('09:05', '17:00')]);
  });

  it('splits around back-to-back meetings', () => {
    const events = [ev('a', '10:00', '11:00'), ev('b', '11:00', '12:00')];
    expect(freeSlots(events, at('09:00'), at('17:00'))).toEqual([slot('09:00', '10:00'), slot('12:00', '17:00')]);
  });

  it('merges overlapping meetings and ignores the order they come in', () => {
    const events = [ev('b', '10:30', '12:00'), ev('a', '10:00', '11:00'), ev('c', '10:15', '10:45')];
    expect(freeSlots(events, at('09:00'), at('13:00'))).toEqual([slot('09:00', '10:00'), slot('12:00', '13:00')]);
  });

  it('ignores all-day events and treats a movable block as free time', () => {
    const events = [ev('holiday', '00:00', '00:00', { allDay: true }), block('b', '10:00', '11:00')];
    expect(freeSlots(events, at('09:00'), at('12:00'))).toEqual([slot('09:00', '12:00')]);
  });

  it('treats an uneditable block and an untagged event as busy', () => {
    const events = [block('locked', '10:00', '11:00', 'c', { editable: false }), ev('plain', '12:00', '13:00')];
    expect(freeSlots(events, at('09:00'), at('14:00'))).toEqual([
      slot('09:00', '10:00'),
      slot('11:00', '12:00'),
      slot('13:00', '14:00'),
    ]);
  });

  it('starts after a meeting that is already running and skips meetings that are over', () => {
    const events = [ev('over', '07:00', '08:00'), ev('now', '08:30', '09:30')];
    expect(freeSlots(events, at('09:02'), at('12:00'))).toEqual([slot('09:30', '12:00')]);
  });

  it('cuts at the day end and ignores a meeting on another day', () => {
    const tomorrow = ev('tomorrow', '09:00', '10:00', { start: '2026-11-12T09:00', end: '2026-11-12T10:00' });
    const events = [ev('late', '16:30', '18:00'), tomorrow];
    expect(freeSlots(events, at('09:00'), at('17:00'))).toEqual([slot('09:00', '16:30')]);
  });

  it('keeps slot edges on 5 minutes: starts round up, ends round down', () => {
    const events = [ev('odd', '10:03', '10:47')];
    expect(freeSlots(events, at('09:00'), at('12:00'))).toEqual([slot('09:00', '10:00'), slot('10:50', '12:00')]);
  });

  it('drops a gap that rounding squeezes to nothing', () => {
    const events = [ev('a', '10:00', '10:02'), ev('b', '10:04', '11:00')];
    expect(freeSlots(events, at('09:00'), at('12:00'))).toEqual([slot('09:00', '10:00'), slot('11:00', '12:00')]);
  });

  it('gives nothing when the day end is before now', () => {
    expect(freeSlots([], at('18:00'), at('17:00'))).toEqual([]);
    expect(freeSlots([], at('17:00'), at('17:00'))).toEqual([]);
  });

  it('skips events with times it cannot read', () => {
    const bad = ev('bad', '10:00', '11:00', { start: 'nope', end: 'nope' });
    expect(freeSlots([bad], at('09:00'), at('10:00'))).toEqual([slot('09:00', '10:00')]);
  });
});

describe('repack', () => {
  const now = at('09:00');
  const end = at('17:00');

  it('on an empty day places tasks one after another, in order, from now', () => {
    const plan = repack([], [task('a', 30), task('b', 45)], [], at('09:02'), end);
    expect(plan.creates).toEqual([
      { cardId: 'a', title: 'a', start: `${D}T09:05`, end: `${D}T09:35` },
      { cardId: 'b', title: 'b', start: `${D}T09:35`, end: `${D}T10:20` },
    ]);
    expect(plan.moves).toEqual([]);
    expect(plan.drops).toEqual([]);
  });

  it('rounds each length up to 5 minutes', () => {
    const plan = repack([], [task('a', 32), task('b', 1)], [], now, end);
    expect(plan.creates.map((c) => [c.start, c.end])).toEqual([
      [`${D}T09:00`, `${D}T09:35`],
      [`${D}T09:35`, `${D}T09:40`],
    ]);
  });

  it('leaves the gap between blocks when asked, and none by default', () => {
    const plan = repack([], [task('a', 30), task('b', 30)], [], now, end, { gapMinutes: 5 });
    expect(plan.creates.map((c) => c.start)).toEqual([`${D}T09:00`, `${D}T09:35`]);
    const odd = repack([], [task('a', 30), task('b', 30)], [], now, end, { gapMinutes: 3 });
    expect(odd.creates.map((c) => c.start)).toEqual([`${D}T09:00`, `${D}T09:35`]); // gap rounds up to 5
    const none = repack([], [task('a', 30), task('b', 30)], [], now, end);
    expect(none.creates.map((c) => c.start)).toEqual([`${D}T09:00`, `${D}T09:30`]);
  });

  it('leaves 5 minutes between blocks unless told otherwise', () => {
    const plan = repackWith([], [task('a', 30), task('b', 30)], [], now, end);
    expect(plan.creates.map((c) => c.start)).toEqual([`${D}T09:00`, `${D}T09:35`]);
    const blocks = [block('b1', '10:00', '10:30'), block('b2', '11:00', '11:30')];
    expect(repackWith(blocks, [], [], now, end).moves.map((m) => m.start)).toEqual([`${D}T09:00`, `${D}T09:35`]);
    // the gap is only between blocks, not after a meeting
    const fixed = [ev('m', '09:00', '10:00')];
    expect(repackWith([], [task('a', 30)], fixed, now, end).creates[0].start).toBe(`${D}T10:00`);
  });

  it('never places before the day start, even when now is earlier', () => {
    const opts = { gapMinutes: 0, dayStart: at('09:00') };
    const plan = repack([block('b', '07:30', '08:30')], [task('t', 30)], [], at('07:12'), end, opts);
    expect(plan.moves).toEqual([{ eventId: 'b', start: `${D}T09:00`, end: `${D}T10:00` }]);
    expect(plan.creates[0].start).toBe(`${D}T10:00`);
    expect(freeSlots([], at('07:12'), end, { dayStart: at('09:00') })).toEqual([slot('09:00', '17:00')]);
    // a day start in the past changes nothing
    expect(freeSlots([], at('10:02'), end, { dayStart: at('09:00') })).toEqual([slot('10:05', '17:00')]);
  });

  it('counts a task with no estimate as 30 minutes', () => {
    const plan = repack([], [{ cardId: 'a', title: 'a' }, { cardId: 'b', title: 'b', minutes: null }], [], now, end);
    expect(DEFAULT_MINUTES).toBe(30);
    expect(plan.creates.map((c) => [c.start, c.end])).toEqual([
      [`${D}T09:00`, `${D}T09:30`],
      [`${D}T09:30`, `${D}T10:00`],
    ]);
  });

  it('treats a block whose card is gone as fixed', () => {
    const gone = block('gone', '09:00', '10:00', 'card-gone');
    const kept = block('kept', '12:00', '13:00', 'card-kept');
    const opts = { gapMinutes: 0, knownCards: ['card-kept'] };
    const plan = repack([gone, kept], [task('t', 30)], [], now, end, opts);
    expect(plan.moves).toEqual([{ eventId: 'kept', start: `${D}T10:00`, end: `${D}T11:00` }]);
    expect(plan.creates[0].start).toBe(`${D}T11:00`);
    expect(plan.drops).toEqual([]);
    expect(freeSlots([gone, kept], now, end, { knownCards: ['card-kept'] })).toEqual([slot('10:00', '17:00')]);
    expect(fixedEvents([gone, kept], new Set(['card-kept'])).map((e) => e.id)).toEqual(['gone']);
    // with no list, every card counts as known
    expect(repack([gone], [], [], now, end).moves).toEqual([]);
  });

  it('packs around back-to-back meetings and never touches them', () => {
    const fixed = [ev('m1', '10:00', '11:00'), ev('m2', '11:00', '12:00')];
    const plan = repack([], [task('a', 45), task('b', 45), task('c', 60)], fixed, now, end);
    expect(plan.creates.map((c) => [c.cardId, c.start, c.end])).toEqual([
      ['a', `${D}T09:00`, `${D}T09:45`],
      ['b', `${D}T12:00`, `${D}T12:45`],
      ['c', `${D}T12:45`, `${D}T13:45`],
    ]);
    expect(plan.moves).toEqual([]);
  });

  it('moves a block that runs into a meeting to the next gap that holds it', () => {
    const fixed = [ev('m', '09:45', '10:45')];
    const plan = repack([block('b', '09:30', '10:30')], [], fixed, now, end);
    expect(plan.moves).toEqual([{ eventId: 'b', start: `${D}T10:45`, end: `${D}T11:45` }]);
    expect(plan.drops).toEqual([]);
  });

  it('leaves a block that already sits right out of the moves', () => {
    const plan = repack([block('b', '09:00', '09:30')], [], [], now, end);
    expect(plan.moves).toEqual([]);
    expect(plan.creates).toEqual([]);
  });

  it('closes up the day: a later block moves earlier into freed time, in order', () => {
    const blocks = [block('b1', '10:00', '10:30'), block('b2', '11:00', '11:45')];
    const plan = repack(blocks, [], [], now, end);
    expect(plan.moves).toEqual([
      { eventId: 'b1', start: `${D}T09:00`, end: `${D}T09:30` },
      { eventId: 'b2', start: `${D}T09:30`, end: `${D}T10:15` },
    ]);
  });

  it('puts blocks first, in start order (ties by id), then new tasks', () => {
    const blocks = [block('late', '14:00', '14:30'), block('b', '13:00', '13:30'), block('a', '13:00', '13:30')];
    const plan = repack(blocks, [task('new', 30)], [], now, end);
    expect(plan.moves.map((m) => m.eventId)).toEqual(['a', 'b', 'late']);
    expect(plan.creates[0].start).toBe(`${D}T10:30`);
  });

  it('never places anything in the past, including a block that is running now', () => {
    const blocks = [block('over', '08:00', '09:00'), block('running', '08:30', '09:30')];
    const plan = repack(blocks, [task('t', 30)], [], at('09:02'), end);
    // 'over' ended before now, so it is history and left alone
    expect(plan.moves).toEqual([{ eventId: 'running', start: `${D}T09:05`, end: `${D}T10:05` }]);
    expect(plan.creates[0].start).toBe(`${D}T10:05`);
  });

  it('never moves an uneditable block, an untagged event or an all-day event', () => {
    const locked = block('locked', '09:00', '10:00', 'c', { editable: false });
    const plan = repack([locked], [task('t', 60)], fixedEvents([locked, ev('m', '10:00', '11:00')]), now, end);
    expect(plan.moves).toEqual([]);
    expect(plan.creates[0].start).toBe(`${D}T11:00`);
    const allDay = repack([ev('x', '00:00', '00:00', { allDay: true })], [task('t', 30)], [], now, end);
    expect(allDay.moves).toEqual([]);
    expect(allDay.creates[0].start).toBe(`${D}T09:00`);
  });

  it('a task longer than any gap goes to drops, and a shorter one after it still fits', () => {
    const fixed = [ev('m1', '10:00', '11:00')];
    const plan = repack([], [task('long', 120), task('short', 30)], fixed, now, at('12:00'));
    expect(plan.drops).toEqual(['long']);
    expect(plan.creates.map((c) => [c.cardId, c.start])).toEqual([['short', `${D}T09:00`]]);
  });

  it('what runs past the day end goes to drops, in order', () => {
    const plan = repack([], [task('a', 120), task('b', 120), task('c', 120)], [], now, at('13:00'));
    expect(plan.creates.map((c) => c.cardId)).toEqual(['a', 'b']);
    expect(plan.drops).toEqual(['c']);
  });

  it('keeps order: an item that skips a small gap is not overtaken by a later one', () => {
    const fixed = [ev('m', '09:30', '10:00')];
    const plan = repack([], [task('big', 60), task('small', 15)], fixed, now, end);
    expect(plan.creates.map((c) => [c.cardId, c.start])).toEqual([
      ['big', `${D}T10:00`],
      ['small', `${D}T11:00`],
    ]);
  });

  it('a block that does not fit is dropped by its card and stays where it is', () => {
    const blocks = [block('b', '15:00', '17:00', 'card-b')];
    const plan = repack(blocks, [], [ev('m', '09:00', '15:30')], now, end);
    expect(plan.moves).toEqual([]);
    expect(plan.drops).toEqual(['card-b']);
  });

  it('with the day end before now, everything is dropped and nothing moves', () => {
    const plan = repack([block('b', '16:30', '18:30', 'card-b')], [task('t', 30)], [], at('18:00'), at('17:00'));
    expect(plan).toEqual({ moves: [], creates: [], drops: ['card-b', 't'] });
  });

  it('ignores blocks that start on a later day', () => {
    const tomorrow = block('b', '09:00', '10:00', 'c', { start: '2026-11-12T09:00', end: '2026-11-12T10:00' });
    expect(repack([tomorrow], [], [], now, end)).toEqual({ moves: [], creates: [], drops: [] });
  });

  it('drops tasks with no usable length', () => {
    const plan = repack([], [task('zero', 0), task('nan', NaN), task('neg', -5), task('ok', 10)], [], now, end);
    expect(plan.drops).toEqual(['zero', 'nan', 'neg']);
    expect(plan.creates.map((c) => c.cardId)).toEqual(['ok']);
  });

  it('is stable: the same input gives the same plan, whatever order blocks come in, and nothing is changed', () => {
    const blocks = [block('b2', '11:00', '11:45'), block('b1', '10:00', '10:30'), block('b3', '10:00', '10:30')];
    const tasks = [task('x', 25), task('y', 400)];
    const fixed = [ev('m', '09:00', '09:30')];
    const copy = JSON.parse(JSON.stringify({ blocks, tasks, fixed }));
    const first = repack(blocks, tasks, fixed, now, end);
    expect(repack(blocks, tasks, fixed, now, end)).toEqual(first);
    expect(repack([...blocks].reverse(), tasks, [...fixed], now, end)).toEqual(first);
    expect({ blocks, tasks, fixed }).toEqual(copy);
  });

  describe('on days the clock changes', () => {
    it('spring forward: lengths count real minutes across the missing hour', () => {
      const day = '2026-03-08';
      // 01:00 EST; 90 real minutes later it is 03:30 EDT (02:00 to 03:00 never happens)
      const plan = repack([], [task('a', 90)], [], at('01:00', day), at('08:00', day));
      expect(plan.creates).toEqual([{ cardId: 'a', title: 'a', start: `${day}T01:00`, end: `${day}T03:30` }]);
    });

    it('spring forward: the missing hour is not free time', () => {
      const day = '2026-03-08';
      const m = ev('m', '03:30', '04:00', { start: `${day}T03:30`, end: `${day}T04:00` });
      expect(freeSlots([m], at('01:00', day), at('05:00', day))).toEqual([
        slot('01:00', '03:30', day),
        slot('04:00', '05:00', day),
      ]);
      // 01:00 to 03:30 is only 90 real minutes, so a 2 hour task skips it
      const plan = repack([], [task('a', 120)], [m], at('01:00', day), at('05:00', day));
      expect(plan.drops).toEqual(['a']);
    });

    it('fall back: the extra hour is free time', () => {
      const day = '2026-11-01';
      // 00:00 to 04:00 is five real hours: 300 minutes fit, 305 do not
      expect(repack([], [task('a', 300)], [], at('00:00', day), at('04:00', day)).creates[0]).toMatchObject({
        start: `${day}T00:00`,
        end: `${day}T04:00`,
      });
      expect(repack([], [task('a', 305)], [], at('00:00', day), at('04:00', day)).drops).toEqual(['a']);
    });
  });
});
