// Day scheduler (the "wow" plan, job 9): the pure part, no UI. Finds the free gaps in the rest of the
// day and packs the app's own time blocks and new tasks into them. Nothing here changes the calendar;
// it only says what a later step could do (the Plan). Times are the calendar model's local
// 'YYYY-MM-DDTHH:MM' strings; lengths are real elapsed minutes, so a clock-change day counts right.
import type { CalEvent } from './calendar';

/** An event the app made for a card (tagged), or any other calendar event. Only an editable block may be moved. */
export type ScheduleEvent = CalEvent & { block?: { cardId: string } };

/** A free gap, 'YYYY-MM-DDTHH:MM' to 'YYYY-MM-DDTHH:MM', on whole 5-minute marks. */
export interface Slot {
  start: string;
  end: string;
}

/** A card to give a block that doesn't have one yet. */
export interface Task {
  cardId: string;
  title: string;
  minutes: number;
}

export interface Plan {
  /** Existing blocks to put somewhere else, in the order they will sit. A block already in place is left out. */
  moves: { eventId: string; start: string; end: string }[];
  /** New blocks, one per task that fits. */
  creates: { cardId: string; title: string; start: string; end: string }[];
  /** Cards that don't fit in what is left of the day ("move to tomorrow"). Their events are not moved. */
  drops: string[];
}

export interface RepackOptions {
  /** Minutes left free between two placed blocks, rounded up to 5. Default 0. */
  gapMinutes?: number;
}

const MIN = 60_000;
const STEP = 5 * MIN;
const pad = (n: number) => String(n).padStart(2, '0');

// simple: the 5-minute marks are counted from the epoch, which is the same as on the clock for every
// time zone whose offset is a multiple of 5 minutes (all of them in use today).
const up5 = (ms: number) => Math.ceil(ms / STEP) * STEP;
const down5 = (ms: number) => Math.floor(ms / STEP) * STEP;

/** A local 'YYYY-MM-DDTHH:MM' as a moment; NaN when it isn't one. */
function parse(s: string): number {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/.exec(s);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : NaN;
}

// simple: in the repeated hour when the clocks go back, two moments share one 'HH:MM' and the later
// one reads back as the earlier. Upgrade (carry the offset) if calendar times ever gain one.
function format(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Events that stay where they are: timed events that aren't the app's own editable blocks. */
export function fixedEvents(events: ScheduleEvent[]): ScheduleEvent[] {
  return events.filter((e) => !e.allDay && !(e.block && e.editable));
}

type Span = [start: number, end: number];

/** The gaps between `busy` events inside [now, dayEnd], now rounded up and the day end down to 5 minutes. */
function gaps(busy: ScheduleEvent[], now: Date, dayEnd: Date): Span[] {
  const from = up5(now.getTime());
  const to = down5(dayEnd.getTime());
  if (!(from < to)) return [];
  const spans = busy
    .map((e): Span => [parse(e.start), parse(e.end)])
    .filter(([s, e]) => s < e) // also drops anything unreadable (NaN)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Span[] = [];
  let cursor = from;
  const add = (s: number, e: number) => {
    const a = up5(s);
    const b = down5(e);
    if (a < b) out.push([a, b]);
  };
  for (const [s, e] of spans) {
    if (e <= cursor) continue;
    if (s >= to) break;
    if (s > cursor) add(cursor, s);
    cursor = e;
  }
  if (cursor < to) add(cursor, to);
  return out;
}

/** The free gaps in the rest of the day. All-day events are ignored; a movable block counts as free time. */
export function freeSlots(events: ScheduleEvent[], now: Date, dayEnd: Date): Slot[] {
  return gaps(fixedEvents(events), now, dayEnd).map(([s, e]) => ({ start: format(s), end: format(e) }));
}

interface Item {
  cardId: string;
  length: number;
  block: ScheduleEvent | null;
  title: string;
}

/**
 * Packs the movable `blocks` (in start order, ties by id) and then the `tasks` (in the order given) into
 * the free gaps from now to the day end, each at the earliest spot after the one before it, so the order
 * is kept. Lengths round up to 5 minutes. A fixed event is never moved and nothing is placed before now.
 * What has no room goes to `drops`. The same input always gives the same plan, and nothing is changed.
 */
export function repack(
  blocks: ScheduleEvent[],
  tasks: Task[],
  fixed: ScheduleEvent[],
  now: Date,
  dayEnd: Date,
  opts: RepackOptions = {},
): Plan {
  const nowMs = now.getTime();
  const endMs = dayEnd.getTime();
  const gap = Math.ceil(Math.max(0, opts.gapMinutes || 0) / 5) * STEP;
  // Fixed events, plus any app block the person can't edit (it counts as fixed).
  const slots = gaps(fixedEvents([...fixed, ...blocks]), now, dayEnd);

  // Movable blocks that aren't over yet (a block already over is history) and start before the day ends.
  const items: Item[] = blocks
    .filter((e) => e.block && e.editable && !e.allDay)
    .map((e) => ({ e, s: parse(e.start), end: parse(e.end) }))
    .filter(({ s, end }) => s < end && end > nowMs && s < endMs)
    .sort((a, b) => a.s - b.s || (a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0))
    .map(({ e, s, end }) => ({ cardId: e.block!.cardId, length: Math.max(STEP, up5(end - s)), block: e, title: e.title }));

  for (const t of tasks) {
    const ok = Number.isFinite(t.minutes) && t.minutes > 0;
    items.push({ cardId: t.cardId, length: ok ? Math.ceil(t.minutes / 5) * STEP : NaN, block: null, title: t.title });
  }

  const plan: Plan = { moves: [], creates: [], drops: [] };
  let last: number | null = null; // end of the block placed just before
  for (const it of items) {
    const found: Span | null = Number.isFinite(it.length) ? place(slots, last, it.length, gap) : null;
    if (!found) {
      plan.drops.push(it.cardId);
      continue;
    }
    last = found[1];
    const start = format(found[0]);
    const end = format(found[1]);
    if (!it.block) plan.creates.push({ cardId: it.cardId, title: it.title, start, end });
    else if (it.block.start !== start || it.block.end !== end) plan.moves.push({ eventId: it.block.id, start, end });
  }
  return plan;
}

/** The earliest spot of `length` in the gaps, no sooner than `gap` after `last`. */
function place(slots: Span[], last: number | null, length: number, gap: number): Span | null {
  const earliest = last === null ? -Infinity : up5(last + gap);
  for (const [from, to] of slots) {
    const s = Math.max(from, earliest);
    if (s + length <= to) return [s, s + length];
  }
  return null;
}
