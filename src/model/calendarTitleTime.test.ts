import { describe, expect, it } from 'vitest';
import { newDraft, type Draft } from './calendar';
import { titleTime } from './calendarTitleTime';

// A time typed in an event's title sets its start on Save (owner request, 2026-11-22).
const draft = (title: string, more: Partial<Draft> = {}): Draft => ({ ...newDraft('2026-11-15'), title, ...more });
const when = (d: Draft) => [d.title, d.startTime, d.endTime, d.endDate];

describe('titleTime', () => {
  it.each([
    ['Dinner 8pm', 'Dinner', '20:00', '21:00'],
    ['Dinner 8 pm', 'Dinner', '20:00', '21:00'],
    ['Dinner 8:30pm', 'Dinner', '20:30', '21:30'],
    ['Dinner 8p', 'Dinner', '20:00', '21:00'],
    ['Gym 10am', 'Gym', '10:00', '11:00'],
    ['Lunch 12pm', 'Lunch', '12:00', '13:00'],
    ['Late 12am', 'Late', '00:00', '01:00'],
    ['Dinner at 8pm', 'Dinner', '20:00', '21:00'],
    ['Dinner AT 8PM', 'Dinner', '20:00', '21:00'],
    ['8pm dinner', 'dinner', '20:00', '21:00'],
    ['Call at 10 a.m. with Sam', 'Call with Sam', '10:00', '11:00'],
    ['Movie 9P.M.', 'Movie', '21:00', '22:00'],
  ])('%s', (title, name, start, end) => {
    expect(when(titleTime(draft(title)))).toEqual([name, start, end, '2026-11-15']);
  });

  it('keeps the length', () => {
    expect(when(titleTime(draft('Swim 7am', { startTime: '12:00', endTime: '12:45' })))).toEqual(['Swim', '07:00', '07:45', '2026-11-15']);
  });

  it.each([
    ['Party 8-9pm', '20:00', '21:00'],
    ['Party 8pm-10pm', '20:00', '22:00'],
    ['Party 8:30-9pm', '20:30', '21:00'],
    ['Party 8 pm – 10 pm', '20:00', '22:00'],
    ['Party 10am-2pm', '10:00', '14:00'],
    ['Party 11-1pm', '11:00', '13:00'],
    ['Party at 8-9pm', '20:00', '21:00'],
  ])('a range sets start and end: %s', (title, start, end) => {
    expect(when(titleTime(draft(title)))).toEqual(['Party', start, end, '2026-11-15']);
  });

  it('a range on an event over several days ends on its first day', () => {
    expect(when(titleTime(draft('Party 8-9pm', { endDate: '2026-11-17' })))).toEqual(['Party', '20:00', '21:00', '2026-11-15']);
  });

  it('a range whose end is at or before its start keeps the length instead', () => {
    expect(when(titleTime(draft('Party 9pm-8pm')))).toEqual(['Party', '21:00', '22:00', '2026-11-15']);
    expect(when(titleTime(draft('Party 9pm-9pm')))).toEqual(['Party', '21:00', '22:00', '2026-11-15']);
  });

  it.each(['Dinner 8', 'Room 101', 'Meet 8:30', '8 people', 'Pick up 2 apples', 'Flight 13pm', 'Shift 0am', 'Tea 1230pm', 'Q4pm review', 'Run 5 a day', 'Buy 2 p', ''])(
    'leaves "%s" alone',
    (title) => {
      const d = draft(title);
      expect(titleTime(d)).toBe(d);
    },
  );

  it('a range with no am / pm at its end keeps only the start: "8pm-9" leaves "-9" as words', () => {
    expect(when(titleTime(draft('Party 8pm-9')))).toEqual(['Party -9', '20:00', '21:00', '2026-11-15']);
  });

  it('only the first time counts; the rest stay as words', () => {
    expect(when(titleTime(draft('Dinner 8pm then bar 10pm')))).toEqual(['Dinner then bar 10pm', '20:00', '21:00', '2026-11-15']);
  });

  it('tidies the title: doubled spaces collapsed, ends trimmed', () => {
    expect(titleTime(draft('  Dinner   at 8pm   with  Sam ')).title).toBe('Dinner with Sam');
  });

  it.each([
    ['Dinner (8pm)', 'Dinner'],
    ['Dinner, 8pm', 'Dinner'],
    ['Dinner @ 8pm', 'Dinner'],
    ['Dinner - 8pm', 'Dinner'],
    ['8pm: Dinner', 'Dinner'],
    ['Dinner (8pm) with Sam', 'Dinner with Sam'],
  ])('punctuation left at an end, or empty brackets, go too: %s', (title, name) => {
    expect(titleTime(draft(title)).title).toBe(name);
  });

  it('a title that is only a time becomes empty', () => {
    expect(when(titleTime(draft('at 8pm')))).toEqual(['', '20:00', '21:00', '2026-11-15']);
  });

  it('leaves an all-day event alone', () => {
    const d = draft('Holiday 8pm', { allDay: true });
    expect(titleTime(d)).toBe(d);
  });

  it('"at" inside a word is not removed; a time inside a word is not read', () => {
    expect(titleTime(draft('Chat 8pm')).title).toBe('Chat');
    const d = draft('Bat8pm');
    expect(titleTime(d)).toBe(d);
  });
});
