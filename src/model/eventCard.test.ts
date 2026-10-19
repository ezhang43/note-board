import { describe, expect, it } from 'vitest';
import type { CalEvent } from './calendar';
import { cardPosition, whenLabel } from './eventCard';

// The small card a calendar event opens (owner request, 2026-10-19, job #108).

const ev = (patch: Partial<CalEvent>): CalEvent => ({
  id: 'e1',
  title: 'Dentist',
  allDay: false,
  start: '2026-10-15T10:00',
  end: '2026-10-15T11:00',
  editable: true,
  link: 'https://calendar.google.com/',
  series: null,
  guests: [],
  timeZone: null,
  moved: false,
  ...patch,
});

describe('when an event is, as the card says it', () => {
  it('a timed event on one day: the day, then its times', () => {
    expect(whenLabel(ev({}))).toBe('Thu 15 Oct · 10:00 – 11:00');
  });
  it('a timed event over midnight: each end with its own day', () => {
    expect(whenLabel(ev({ start: '2026-10-15T22:00', end: '2026-10-16T01:30' }))).toBe('Thu 15 Oct 22:00 – Fri 16 Oct 01:30');
  });
  it('an all-day event of one day (Google keeps the day after as its end)', () => {
    expect(whenLabel(ev({ allDay: true, start: '2026-10-15', end: '2026-10-16' }))).toBe('Thu 15 Oct · All day');
  });
  it('an all-day event over several days: its first and last day', () => {
    expect(whenLabel(ev({ allDay: true, start: '2026-10-15', end: '2026-10-18' }))).toBe('Thu 15 – Sat 17 Oct · All day');
  });
  it('an all-day event into the next month names both months', () => {
    expect(whenLabel(ev({ allDay: true, start: '2026-10-31', end: '2026-11-03' }))).toBe('Sat 31 Oct – Mon 2 Nov · All day');
  });
});

describe('where the card sits beside the panel', () => {
  // The panel's left edge at 1000, its top (just under the toolbar) at 56.
  const panel = { left: 1000, top: 56 };
  const screen = { height: 900 };
  const card = { width: 300, height: 200 };
  it('just left of the panel (clear of its resize strip), its top level with the event', () => {
    expect(cardPosition({ top: 300 }, panel, card, screen)).toEqual({ left: 692, top: 300 });
  });
  it('kept on screen at the bottom', () => {
    expect(cardPosition({ top: 850 }, panel, card, screen)).toEqual({ left: 692, top: 692 });
  });
  it('never above the panel, so it doesn’t cover the toolbar', () => {
    expect(cardPosition({ top: 20 }, panel, card, screen)).toEqual({ left: 692, top: 56 });
  });
  it('kept on screen at the left when the panel is wide', () => {
    expect(cardPosition({ top: 300 }, { left: 200, top: 56 }, card, screen)).toEqual({ left: 8, top: 300 });
  });
  it('a card taller than the screen starts at the panel’s top', () => {
    expect(cardPosition({ top: 300 }, panel, { width: 300, height: 1000 }, screen)).toEqual({ left: 692, top: 56 });
  });
});
