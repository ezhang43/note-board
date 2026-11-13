import { addDays, weekStart } from './calendar';
import { CATEGORIES, categoryIndex, categoryOf, type Categorizer } from './categorize';
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

/** A real day key: four-digit year, as `addDays` writes it back (so 2026-13-45, 0001-01-01 and "soon" are not). */
export const isDay = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;

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
      // A day that is not a real date (a shared board or an imported backup can hold anything) is left out.
      if (!isDay(g.date)) continue;
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

/** The chart never shows more than this many days (a stray very old date must not make a huge chart). */
// simple: the last two years, ending today. A longer history simply starts later on the chart; upgrade by bucketing weeks if that is missed.
export const MAX_CHART_DAYS = 730;

/** Done per day for the chart: every day of the range up to today, those with nothing as 0 (All starts on the first day anything was cleaned up, at most MAX_CHART_DAYS back). */
export function perDay(items: DoneItem[], range: VizRange, today: string): DayCount[] {
  if (range !== 'all' && !items.length) return [];
  const by = new Map<string, number>();
  for (const i of items) if (isDay(i.date) && i.date <= today) by.set(i.date, (by.get(i.date) ?? 0) + 1);
  const earliest = addDays(today, 1 - MAX_CHART_DAYS);
  const oldest = rangeStart(range, today) ?? [...by.keys()].sort()[0];
  if (oldest === undefined) return [];
  const days: DayCount[] = [];
  for (let d = oldest < earliest ? earliest : oldest; d <= today; d = addDays(d, 1)) days.push({ date: d, count: by.get(d) ?? 0 });
  return days;
}

/** `next` when it differs from `prev`, else `prev` itself, so a redraw from an unrelated board change keeps the same list and the loop does not start over. */
export function keepIfSame(prev: DoneItem[] | undefined, next: DoneItem[]): DoneItem[] {
  if (!prev || prev.length !== next.length) return next;
  const same = prev.every((p, i) => p.id === next[i].id && p.text === next[i].text && p.list === next[i].list && p.boardName === next[i].boardName && p.date === next[i].date);
  return same ? prev : next;
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
  /** The board's id, or the category's id (empty for the "Other boards" wedge). */
  key: string;
  name: string;
  count: number;
  cells: Cell[];
  /** Which of the nine `--viz-hue-*` colors it is drawn in (the ninth is the neutral one, for Other). */
  hue: number;
}

/** What the wedges are: the categories (the default), or the boards the items came from. */
export type VizGroupBy = 'category' | 'board';
export const VIZ_GROUPS: { id: VizGroupBy; label: string }[] = [
  { id: 'category', label: 'By category' },
  { id: 'board', label: 'By board' },
];
export const VIZ_DEFAULT_GROUP: VizGroupBy = 'category';
/** Where this device remembers the switch (a per-device view choice, like the text size: not board data, not synced). */
export const VIZ_GROUP_KEY = 'note-board:viz-group';

/** The switch as saved on this device, or By category. */
export const parseGroupBy = (saved: string | null): VizGroupBy => (saved === 'board' ? 'board' : VIZ_DEFAULT_GROUP);

/** The eight colors a board wedge goes round; categories use a ninth for Other. */
const BOARD_HUES = 8;

/**
 * The disc for `items` (given in loop order). By board: one wedge per board in menu order, the busiest
 * boards only past MAX_WEDGES (the rest share one "Other boards" wedge, last). By category: one wedge per
 * category that has items, in the categories' own order (Other last), each in its own fixed color. In a
 * wedge, one cell per list title (the busiest first, so the same title on two boards is one cell); past
 * MAX_CELLS the rest share "Other lists". `slots[i]` says which wedge and cell `items[i]` lands in.
 * `categorize` is asked once per item (see categorize.ts); an id it makes up is Other, a name it gives is a wedge of its own.
 */
export function discOf(items: DoneItem[], by: VizGroupBy = VIZ_DEFAULT_GROUP, categorize: Categorizer = categoryOf): { wedges: Wedge[]; slots: { wedge: number; cell: number }[] } {
  const groups = by === 'category' ? categoryGroups(items, categorize) : boardGroups(items);
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
    return { key: g.key, name: g.name, count: g.items.length, cells, hue: g.hue ?? wedge % BOARD_HUES };
  });
  return { wedges, slots: items.map((i) => where.get(i)!) };
}

interface Group {
  key: string;
  name: string;
  items: DoneItem[];
  hue?: number;
}

function boardGroups(items: DoneItem[]): Group[] {
  const boards = new Map<string, { name: string; rank: number; items: DoneItem[] }>();
  for (const i of items) {
    const b = boards.get(i.boardId) ?? { name: i.boardName, rank: i.boardRank, items: [] };
    b.items.push(i);
    boards.set(i.boardId, b);
  }
  const all = [...boards].map(([key, b]) => ({ key, ...b }));
  const kept = all.length > MAX_WEDGES ? [...all].sort((a, b) => b.items.length - a.items.length || a.rank - b.rank).slice(0, MAX_WEDGES - 1) : all;
  const groups: (Group & { rank: number })[] = kept.sort((a, b) => a.rank - b.rank);
  if (kept.length < all.length) groups.push({ key: '', name: OTHER_BOARDS, rank: Infinity, items: all.filter((b) => !kept.includes(b)).flatMap((b) => b.items) });
  return groups;
}

/**
 * Built-in categories in their own order, each in its own fixed color. When the categorizer also names
 * categories of its own (Sort with AI), those come first, busiest first, and every wedge but Other takes the
 * next of the eight colors in turn (fixed colors would clash with the named ones); Other stays last and neutral.
 */
function categoryGroups(items: DoneItem[], categorize: Categorizer): Group[] {
  const by = new Map<number, DoneItem[]>();
  const named = new Map<string, DoneItem[]>();
  for (const i of items) {
    const c = categorize(i, i.list);
    if (typeof c === 'object') (named.get(c.name) ?? named.set(c.name, []).get(c.name)!).push(i);
    else {
      const at = categoryIndex(c);
      (by.get(at) ?? by.set(at, []).get(at)!).push(i);
    }
  }
  const builtIn = [...by].sort((a, b) => a[0] - b[0]).map(([c, list]): Group => ({ key: CATEGORIES[c].id, name: CATEGORIES[c].name, items: list, hue: c }));
  if (!named.size) return builtIn;
  const own = [...named].sort((a, b) => b[1].length - a[1].length).map(([name, list]): Group => ({ key: `ai:${name}`, name, items: list }));
  const other = CATEGORIES.length - 1;
  // simple: eight colors take turns, so with 8 AI wedges a leftover built-in wedge repeats a color (its name still tells it apart). Upgrade with more hues if that shows up often.
  return [...own, ...builtIn].map((g, k) => ({ ...g, hue: g.hue === other ? other : k % BOARD_HUES }));
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

/** Items land in waves (owner request 2026-11-13, "many arrivals overlap"): up to this many together, a moment apart. */
export const WAVE_MAX = 8;
/** The gap between the items of one wave (never more than the loop's own gap). */
export const WAVE_GAP_MS = 120;
/** The most beams and fountains drawn at once, so a very busy loop stays inside the frame (the oldest are cut short). */
export const MAX_FLYING = 8;

/** How many items land together: one at a time for a handful, up to WAVE_MAX for a long list (about a sixth of the items). */
export const waveSize = (n: number): number => Math.min(WAVE_MAX, Math.max(1, Math.round(n / 6)));

/** When item `i` of `n` starts its trip, in ms from the start of the loop: a wave starts each `waveSize * gapMs`, its items WAVE_GAP_MS apart. */
export function startOf(i: number, n: number): number {
  const wave = waveSize(n);
  const gap = gapMs(n);
  return Math.floor(i / wave) * wave * gap + (i % wave) * Math.min(WAVE_GAP_MS, gap);
}

/** How long one trip around the loop takes, rest included (flight is how long a spark takes to land). */
export const loopMs = (n: number, flight: number): number => (n ? startOf(n - 1, n) + flight + LOOP_REST_MS : 0);

/** How many of the `n` items have a start time (plus `offset`) at or before `t` ms; `startOf` only grows with `i`, so this halves the range each step. */
function startedBy(t: number, n: number, offset: number): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (startOf(mid, n) + offset <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Where the loop is `t` ms after it started: how many items have landed, which are still animating (with
 * how far along, 0 to 1; at most MAX_FLYING, the newest), and whether `t` has gone past the end (the caller
 * starts again at `t - loop`). An item has "landed" `strike` ms into its `flight` ms trip (by default at the
 * end of it): that is when its cell lights and its row joins the feed, while its fountain may still be on the
 * way to the core. Every item still lands when the loop is busy; only the drawing of the oldest is cut short.
 */
export function playhead(t: number, n: number, flight: number, strike: number = flight): { landed: number; flying: { index: number; progress: number }[]; wrapped: boolean } {
  const landed = startedBy(t, n, strike);
  const done = startedBy(t, n, flight); // whose whole trip is over
  const started = startedBy(t, n, 0);
  const flying: { index: number; progress: number }[] = [];
  for (let i = Math.max(done, started - MAX_FLYING); i < started; i++) flying.push({ index: i, progress: (t - startOf(i, n)) / flight });
  return { landed, flying, wrapped: t >= loopMs(n, flight) };
}

/** The two lines on the small card that floats by the core for an item that just landed: its text, then "category · board" (or "list · board" By board). Plain text only. */
export function cardLines(item: DoneItem, wedgeName: string | undefined, by: VizGroupBy): [string, string] {
  return [item.text.trim() || 'Untitled item', [by === 'category' ? wedgeName : item.list, item.boardName].filter(Boolean).join(' · ')];
}
