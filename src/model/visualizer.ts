import { addDays, weekStart } from './calendar';
import { completedCardOf } from './completed';
import { boardTree, type Workspace } from './workspace';

// The Visualizer (owner request, 2026-11-12): a looping, animated, read-only view of the items Clean up
// moved into the Completed panels. This file only reads boards: it groups, counts and orders what the
// screen draws, and changes nothing. Days are the "YYYY-MM-DD" keys the Completed groups already use
// (the day Clean up was clicked), so no time zone maths happens here.

export type VizRange = '7' | '30' | 'all';
export const VIZ_RANGES: { id: VizRange; label: string }[] = [
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: 'all', label: 'All' },
];
export const VIZ_DEFAULT_RANGE: VizRange = '30';

/** One cleaned-up item (an entry of a Completed panel; whatever was nested under it travels with it and isn't counted). */
export interface DoneItem {
  id: string;
  text: string;
  boardId: string;
  boardName: string;
  /** The title of the list it came from, as the Completed panel shows it ("List" when it had none). */
  list: string;
  /** The Completed day group it sits under. */
  date: string;
  /** Where its board is in the Boards menu order: breaks ties between boards on the same day. */
  boardRank: number;
  /** Its place in its board's panel, newest day first: breaks ties inside a board. */
  order: number;
}

export const UNTITLED_BOARD = 'Untitled board';
export const UNTITLED_LIST = 'List';

/**
 * Every cleaned-up item on every board in `ws`: the open one, the others, the Journal and Habits boards
 * the menu leaves out, and shared boards. Boards come in the Boards menu order, then any the menu skips.
 */
export function doneItems(ws: Workspace): DoneItem[] {
  const ids = boardTree(ws).map((r) => r.id);
  const out: DoneItem[] = [];
  ids.forEach((boardId, boardRank) => {
    const board = ws.boards[boardId];
    let order = 0;
    for (const g of completedCardOf(board)?.groups ?? []) {
      for (const e of g.entries) {
        out.push({ id: `${boardId}:${e.item.id}`, text: e.item.text.trim(), boardId, boardName: board.name.trim() || UNTITLED_BOARD, list: e.fromTitle.trim() || UNTITLED_LIST, date: g.date, boardRank, order: order++ });
      }
    }
  });
  return out;
}

/** The first day a range covers when it ends on `today`: null for All. */
export function rangeStart(range: VizRange, today: string): string | null {
  return range === 'all' ? null : addDays(today, range === '7' ? -6 : -29);
}

/** The items cleaned up within `range`, which ends on `today` (a day after today, from a clock that was wrong, is left out of 7 and 30 days). */
export function inRange(items: DoneItem[], range: VizRange, today: string): DoneItem[] {
  const from = rangeStart(range, today);
  return from === null ? items : items.filter((i) => i.date >= from && i.date <= today);
}

/** Oldest to newest (the order the loop plays them in); the same day: menu order of the board, then the panel's order. */
export function loopOrder(items: DoneItem[]): DoneItem[] {
  return [...items].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.boardRank - b.boardRank || a.order - b.order));
}

export interface VizCounts {
  today: number;
  /** This calendar week, Monday to today (as the Calendar and Habits count a week). */
  week: number;
  inRange: number;
}

/** The big numbers. `all` is every item (any range); `inRange` the ones in the range shown. */
export function counts(all: DoneItem[], inRangeItems: DoneItem[], today: string): VizCounts {
  const monday = weekStart(today);
  return {
    today: all.filter((i) => i.date === today).length,
    week: all.filter((i) => i.date >= monday && i.date <= today).length,
    inRange: inRangeItems.length,
  };
}

export interface DayCount {
  date: string;
  count: number;
}

/** Done per day for the chart: every day of the range, those with nothing as 0 (All starts on the first day anything was cleaned up). */
export function perDay(items: DoneItem[], range: VizRange, today: string): DayCount[] {
  if (range !== 'all' && !items.length) return [];
  const by = new Map<string, number>();
  for (const i of items) by.set(i.date, (by.get(i.date) ?? 0) + 1);
  const first = rangeStart(range, today) ?? [...by.keys()].sort()[0];
  if (first === undefined) return [];
  const last = [...by.keys()].reduce((m, d) => (d > m ? d : m), today);
  const days: DayCount[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push({ date: d, count: by.get(d) ?? 0 });
  return days;
}

/** The chart as drawn in a `w` x `h` box: a line and a closed area under it (nothing when there are fewer than two days). */
export function chartPath(days: DayCount[], w: number, h: number): { line: string; area: string; x: (i: number) => number } {
  const x = (i: number) => (days.length < 2 ? 0 : (i / (days.length - 1)) * w);
  if (days.length < 2) return { line: '', area: '', x };
  const top = Math.max(1, ...days.map((d) => d.count));
  const pts = days.map((d, i) => `${+x(i).toFixed(1)} ${+(h - (d.count / top) * h).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  return { line, area: `${line} L${w} ${h} L0 ${h} Z`, x };
}

// ---- The disc: boards are wedges, the lists items came from are the cells in a wedge ----

export const MAX_WEDGES = 16;
export const MAX_CELLS = 18;
export const OTHER_BOARDS = 'Other boards';
export const OTHER_LISTS = 'Other lists';

export interface Cell {
  list: string;
  count: number;
}

export interface Wedge {
  boardId: string;
  name: string;
  count: number;
  cells: Cell[];
}

/**
 * The disc for `items` (given in loop order): one wedge per board in menu order, the busiest boards
 * only past MAX_WEDGES (the rest share one "Other boards" wedge, last), and in a wedge one cell per list
 * title, the busiest first, past MAX_CELLS the rest share "Other lists". `slots[i]` says which wedge and
 * cell `items[i]` lands in.
 */
export function discOf(items: DoneItem[]): { wedges: Wedge[]; slots: { wedge: number; cell: number }[] } {
  const boards = new Map<string, { name: string; rank: number; items: DoneItem[] }>();
  for (const i of items) {
    const b = boards.get(i.boardId) ?? { name: i.boardName, rank: i.boardRank, items: [] };
    b.items.push(i);
    boards.set(i.boardId, b);
  }
  const all = [...boards].map(([boardId, b]) => ({ boardId, ...b }));
  const kept = all.length > MAX_WEDGES ? [...all].sort((a, b) => b.items.length - a.items.length || a.rank - b.rank).slice(0, MAX_WEDGES - 1) : all;
  const groups: { boardId: string; name: string; rank: number; items: DoneItem[] }[] = kept.sort((a, b) => a.rank - b.rank);
  if (kept.length < all.length) {
    const rest = all.filter((b) => !kept.includes(b));
    groups.push({ boardId: '', name: OTHER_BOARDS, rank: Infinity, items: rest.flatMap((b) => b.items) });
  }
  const where = new Map<DoneItem, { wedge: number; cell: number }>();
  const wedges = groups.map((g, wedge): Wedge => {
    const byList = new Map<string, number>();
    for (const i of g.items) byList.set(i.list, (byList.get(i.list) ?? 0) + 1);
    const ranked = [...byList].sort((a, b) => b[1] - a[1]); // a stable sort: equal counts stay in the order they first landed
    const keptLists = ranked.length > MAX_CELLS ? ranked.slice(0, MAX_CELLS - 1) : ranked;
    const cells: Cell[] = keptLists.map(([list, count]) => ({ list, count }));
    if (keptLists.length < ranked.length) cells.push({ list: OTHER_LISTS, count: ranked.slice(keptLists.length).reduce((n, [, c]) => n + c, 0) });
    const at = new Map(keptLists.map(([list], cell) => [list, cell]));
    for (const i of g.items) where.set(i, { wedge, cell: at.get(i.list) ?? cells.length - 1 });
    return { boardId: g.boardId, name: g.name, count: g.items.length, cells };
  });
  return { wedges, slots: items.map((i) => where.get(i)!) };
}

/** A summary in words for a screen reader (the disc is a picture): "12 items: Home 8, Garage 4". */
export function summaryOf(wedges: Wedge[], total: number): string {
  if (!total) return 'Nothing cleaned up in this range.';
  return `${total} ${total === 1 ? 'item' : 'items'} cleaned up: ${wedges.map((w) => `${w.name} ${w.count}`).join(', ')}.`;
}

// ---- Pace ----

export const MIN_GAP_MS = 60;
export const MAX_GAP_MS = 1000;
/** A loop with plenty of items lasts about this long. */
export const LOOP_TARGET_MS = 45000;
/** After the last item lands, the disc rests this long before the loop starts again. */
export const LOOP_REST_MS = 2500;

/** Time between one item and the next: about a second each, quicker when there are many so a loop lasts about 45 seconds. */
export const gapMs = (n: number): number => Math.min(MAX_GAP_MS, Math.max(MIN_GAP_MS, LOOP_TARGET_MS / Math.max(1, n)));

/** How long one trip around the loop takes, rest included (flight is how long a spark takes to land). */
export const loopMs = (n: number, flight: number): number => (n ? (n - 1) * gapMs(n) + flight + LOOP_REST_MS : 0);

/**
 * Where the loop is `t` ms after it started: how many items have landed, which are still flying (with
 * how far along, 0 to 1), and whether `t` has gone past the end (the caller starts again at `t - loop`).
 */
export function playhead(t: number, n: number, flight: number): { landed: number; flying: { index: number; progress: number }[]; wrapped: boolean } {
  const gap = gapMs(n);
  const landed = t < flight ? 0 : Math.min(n, Math.floor((t - flight) / gap) + 1);
  const flying: { index: number; progress: number }[] = [];
  for (let i = landed; i < n && t - i * gap >= 0; i++) flying.push({ index: i, progress: (t - i * gap) / flight });
  return { landed, flying, wrapped: t >= loopMs(n, flight) };
}
