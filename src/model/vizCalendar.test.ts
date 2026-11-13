import { describe, expect, it } from 'vitest';
import { CAL_BOARD_ID, CAL_BOARD_NAME, CAL_RANK, calendarDoneItems, vizWindow } from './vizCalendar';
import { aiEntry, makeAiCategorizer, ownBoards, toSend } from './aiCategories';
import { discOf, type DoneItem } from './visualizer';

// Past and deleted Google Calendar events in the Visualizer (owner request, 2026-11-13). Pure: this turns
// the raw events Google sends into DoneItem-like entries, deciding which have passed or were deleted, which
// day they land on, and that calendar event titles are never part of what Sort with AI sends to Anthropic.

const TODAY = '2026-11-13';
// Local noon today, so "ended" and "deleted after it started" are tested against a fixed moment.
const NOW = new Date(2026, 10, 13, 12, 0).getTime();

const iso = (day: string, h: number, m: number) => {
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m).toISOString();
};
const timed = (day: string, h: number, m: number) => ({ dateTime: iso(day, h, m) });
const allDay = (day: string) => ({ date: day });
/** A day `n` days from today (negative = past). */
const ago = (n: number) => {
  const d = new Date(2026, 10, 13 + n);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const mine = { organizer: { self: true } };
const items = (raw: unknown[], range: '7' | '30' | 'all' = '30') => calendarDoneItems(raw, range, TODAY, NOW);
const only = (raw: unknown) => items([raw]);

describe('calendarDoneItems — which events count', () => {
  it('a confirmed timed event that has ended lands on its end day, marked as a calendar event', () => {
    const out = only({ ...mine, id: 'a', summary: 'Kayaking lesson', start: timed(ago(-1), 10, 0), end: timed(ago(-1), 11, 0) });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ text: 'Kayaking lesson', date: ago(-1), event: true, boardId: CAL_BOARD_ID, boardName: CAL_BOARD_NAME, list: '', boardRank: CAL_RANK });
    expect(out[0].id).toContain('a');
  });

  it('an all-day event lands on its last day (Google’s end is the day after)', () => {
    const out = only({ ...mine, id: 'b', summary: 'Holiday', start: allDay(ago(-2)), end: allDay(ago(-1)) });
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe(ago(-2));
  });

  it('leaves out an event that has not ended yet', () => {
    expect(only({ ...mine, id: 'future', summary: 'Later', start: timed(ago(1), 9, 0), end: timed(ago(1), 10, 0) })).toHaveLength(0);
    // Today, but ends this evening (after now): not yet.
    expect(only({ ...mine, id: 'tonight', summary: 'Dinner', start: timed(TODAY, 19, 0), end: timed(TODAY, 20, 0) })).toHaveLength(0);
  });

  it('counts an event earlier today that has already ended', () => {
    const out = only({ ...mine, id: 'am', summary: 'Standup', start: timed(TODAY, 9, 0), end: timed(TODAY, 9, 15) });
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe(TODAY);
  });

  it('lands a timed event that ends exactly at midnight on the day it was happening, not the next day', () => {
    // Last night 22:00 to 00:00: it belongs to yesterday, not today.
    const out = only({ ...mine, id: 'late', summary: 'Night shift', start: timed(ago(-1), 22, 0), end: timed(TODAY, 0, 0) });
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe(ago(-1));
  });

  it('counts own events and accepted invites, skips declined and no-reply invites', () => {
    const base = { id: 'x', summary: 'Meeting', start: timed(ago(-1), 10, 0), end: timed(ago(-1), 11, 0) };
    const guest = (status: string) => ({ ...base, organizer: { email: 'boss@x.com' }, attendees: [{ email: 'boss@x.com', organizer: true, responseStatus: 'accepted' }, { email: 'me@x.com', self: true, responseStatus: status }] });
    expect(only({ ...base, ...mine })).toHaveLength(1); // own event
    expect(only(guest('accepted'))).toHaveLength(1);
    expect(only(guest('declined'))).toHaveLength(0);
    expect(only(guest('needsAction'))).toHaveLength(0);
    expect(only(guest('tentative'))).toHaveLength(0);
  });

  it('skips working-location / out-of-office / birthday event types', () => {
    for (const eventType of ['workingLocation', 'outOfOffice', 'focusTime', 'birthday']) {
      expect(only({ ...mine, id: eventType, eventType, summary: eventType, start: timed(ago(-1), 9, 0), end: timed(ago(-1), 17, 0) })).toHaveLength(0);
    }
  });
});

describe('calendarDoneItems — deleted events', () => {
  const deleted = (over: Record<string, unknown>) => ({ ...mine, id: 'del', status: 'cancelled', summary: 'Pottery workshop', start: timed(ago(-2), 10, 0), end: timed(ago(-2), 11, 0), ...over });

  it('counts a deleted event when it was deleted after it started', () => {
    const out = only(deleted({ updated: iso(ago(-2), 12, 0) })); // deleted 2h after it started
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ text: 'Pottery workshop', event: true, date: ago(-2) });
  });

  it('skips a deleted event deleted before it started (a cancellation, not a done thing)', () => {
    expect(only(deleted({ updated: iso(ago(-3), 9, 0) }))).toHaveLength(0);
  });

  it('counts a multi-day event deleted mid-run, on the day it started', () => {
    // A 3-day all-day event started yesterday, deleted today: it was happening, so it counts, on its start day.
    const out = only({ ...mine, id: 'trip', status: 'cancelled', summary: 'Conference', start: allDay(ago(-1)), end: allDay(ago(2)), updated: iso(TODAY, 10, 0) });
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe(ago(-1));
  });

  it('skips a deleted event with no usable title or deletion time, rather than guessing', () => {
    expect(only(deleted({ updated: iso(ago(-2), 12, 0), summary: '   ' }))).toHaveLength(0); // no title
    expect(only(deleted({ updated: undefined }))).toHaveLength(0); // no deletion time
    // A deleted repeating instance Google only gave id + originalStartTime for.
    expect(only({ id: 'inst', status: 'cancelled', recurringEventId: 'series', originalStartTime: timed(ago(-2), 9, 0) })).toHaveLength(0);
  });
});

describe('calendarDoneItems — range, order and window', () => {
  it('keeps only events whose day is within the range', () => {
    const e = { ...mine, id: 'old', summary: 'Old', start: timed(ago(-10), 10, 0), end: timed(ago(-10), 11, 0) };
    expect(items([e], '7')).toHaveLength(0);
    expect(items([e], '30')).toHaveLength(1);
  });

  it('orders events on the same day by start time and ranks them after board items', () => {
    const out = items([
      { ...mine, id: 'late', summary: 'Late', start: timed(ago(-1), 15, 0), end: timed(ago(-1), 16, 0) },
      { ...mine, id: 'early', summary: 'Early', start: timed(ago(-1), 8, 0), end: timed(ago(-1), 9, 0) },
    ]);
    expect(out.map((i) => i.text)).toEqual(['Early', 'Late']);
    expect(out.every((i) => i.boardRank === CAL_RANK)).toBe(true);
    expect(out[0].order).toBeLessThan(out[1].order);
  });

  it('vizWindow covers the range up to the end of today', () => {
    const w = vizWindow('7', TODAY);
    expect(w.timeMin).toBe(new Date(2026, 10, 7).toISOString());
    expect(w.timeMax).toBe(new Date(2026, 10, 14).toISOString()); // exclusive: start of tomorrow
  });
});

describe('calendar events never reach Anthropic and group on their own', () => {
  const ev: DoneItem = { id: 'cal:a', text: 'Kayaking lesson', boardId: CAL_BOARD_ID, boardName: CAL_BOARD_NAME, list: '', date: TODAY, boardRank: CAL_RANK, order: 0, event: true };
  const board: DoneItem = { id: 'b:1', text: 'buy milk', boardId: 'b', boardName: 'Home', list: 'Groceries', date: TODAY, boardRank: 0, order: 0 };

  it('aiEntry returns null for a calendar event', () => {
    expect(aiEntry(ev)).toBeNull();
    expect(aiEntry(board)).not.toBeNull();
  });

  it('toSend never includes a calendar event', () => {
    const isOwn = ownBoards([], true);
    const { entries, total } = toSend([board, ev], () => false, isOwn);
    expect(total).toBe(1);
    expect(entries.map((e) => e.text)).toEqual(['buy milk']);
  });

  it('makeAiCategorizer gives an event a built-in category, never an AI label', () => {
    const categorize = makeAiCategorizer([board, ev], () => 'Fun', ownBoards([], true));
    // The lookup would say "Fun" for everything, but the event must not get it.
    expect(categorize(ev, ev.list)).not.toEqual({ name: 'Fun' });
  });

  it('By board puts calendar events in their own Calendar wedge', () => {
    const { wedges } = discOf([board, ev], 'board');
    const cal = wedges.find((w) => w.name === CAL_BOARD_NAME);
    expect(cal).toBeTruthy();
    expect(cal!.count).toBe(1);
  });
});
