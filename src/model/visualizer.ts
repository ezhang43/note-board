import { addDays, weekStart } from './calendar';
import { CATEGORIES, categoryIndex, categoryOf, isTimeWord, type Categorizer } from './categorize';
import { completedCardOf } from './completed';
import type { TodoItem } from './types';
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

/** One cleaned-up item: an entry of a Completed panel, or, when the entry has completed sub-items (nested ones too), each of those instead (the parent is not an item then). */
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
  /** For a completed sub-item: the words of the items it sat under, nearest first (they help to categorize it). Empty for an entry's own item. */
  context?: string[];
  /** A Google Calendar event that has passed or was deleted (not board data; never saved or sent to AI). See vizCalendar. */
  event?: true;
}

/** A real day key: four-digit year, as `addDays` writes it back (so 2026-13-45, 0001-01-01 and "soon" are not). */
export const isDay = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;

export const UNTITLED_BOARD = 'Untitled board';
export const UNTITLED_LIST = 'List';

/** Every completed sub-item under `item`, nested ones too (top to bottom), with the words of what they sit under, nearest first. */
function doneUnder(item: TodoItem, above: string[]): { item: TodoItem; context: string[] }[] {
  const context = [item.text.trim(), ...above].filter(Boolean);
  return item.children.flatMap((c) => [...(c.done && c.text.trim() && !isTimeWord(c.text) ? [{ item: c, context }] : []), ...doneUnder(c, context)]);
}

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
        const subs = doneUnder(e.item, []);
        // An item that is only a time word ("Today", "daily") is never an item itself; its completed sub-items still are.
        for (const { item, context } of subs.length ? subs : isTimeWord(e.item.text) ? [] : [{ item: e.item, context: [] }]) {
          out.push({ id: `${boardId}:${item.id}`, text: item.text.trim(), boardId, boardName: board.name.trim() || UNTITLED_BOARD, list: e.fromTitle.trim() || UNTITLED_LIST, date: g.date, boardRank, order: order++, context });
        }
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

const sameWords = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((w, k) => w === b[k]);

/** `next` when it differs from `prev`, else `prev` itself, so a redraw from an unrelated board change keeps the same list and the loop does not start over. */
export function keepIfSame(prev: DoneItem[] | undefined, next: DoneItem[]): DoneItem[] {
  if (!prev || prev.length !== next.length) return next;
  const same = prev.every((p, i) => p.id === next[i].id && p.text === next[i].text && p.list === next[i].list && p.boardName === next[i].boardName && p.date === next[i].date && sameWords(p.context, next[i].context));
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

/** Where this device remembers the Calm button (owner, 2026-11-13: the Visualizer always plays full motion unless Calm is on). */
export const VIZ_CALM_KEY = 'note-board:viz-calm';
/** Calm as saved on this device: on only for "1"; anything else, or nothing, is off. */
export const parseCalm = (saved: string | null): boolean => saved === '1';

/** Where this device remembers Sort with AI's "Sort automatically" box (owner request 2026-11-13, job "viz-ai-autosort"). */
export const VIZ_AI_AUTO_KEY = 'note-board:viz-ai-auto';
/** The box as saved on this device: off only for "0"; anything else, or nothing, is on (the default). */
export const parseAutoSort = (saved: string | null): boolean => saved !== '0';

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
  // Calendar events (owner, 2026-11-13) are always their own "Calendar" wedge, last, never folded into Other boards.
  const events = items.filter((i) => i.event);
  const boards = new Map<string, { name: string; rank: number; items: DoneItem[] }>();
  for (const i of items) {
    if (i.event) continue;
    const b = boards.get(i.boardId) ?? { name: i.boardName, rank: i.boardRank, items: [] };
    b.items.push(i);
    boards.set(i.boardId, b);
  }
  const all = [...boards].map(([key, b]) => ({ key, ...b }));
  const kept = all.length > MAX_WEDGES ? [...all].sort((a, b) => b.items.length - a.items.length || a.rank - b.rank).slice(0, MAX_WEDGES - 1) : all;
  const groups: (Group & { rank: number })[] = kept.sort((a, b) => a.rank - b.rank);
  if (kept.length < all.length) groups.push({ key: '', name: OTHER_BOARDS, rank: Infinity, items: all.filter((b) => !kept.includes(b)).flatMap((b) => b.items) });
  if (events.length) groups.push({ key: events[0].boardId, name: events[0].boardName, rank: Infinity, items: events });
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
// A steady stream (owner request 2026-11-13, "I don't want there to be really any pauses. essentially things should
// always be flowing in"): items launch one after another at an even beat, round and round the list, so there is
// never a moment with nothing in the air. No loop length, no wave, no rest at the end.

/** How many trips are in the air together once the stream is going (owner 2026-11-13, "slower... but with more things coming in"; below MAX_FLYING, so none is cut short). */
export const STREAM_FLYING = 20;
/** Launches are never further apart than this, however long a trip is. */
export const MAX_LAUNCH_GAP_MS = 1000;
/** The most beams and fountains drawn at once, so a very busy stream stays inside the frame (the oldest are cut short). */
export const MAX_FLYING = 24;

/** Time between one launch and the next: a trip shared out over STREAM_FLYING launches (about 200ms for a 4s trip), at most a second. */
export const launchGapMs = (flight: number): number => Math.min(MAX_LAUNCH_GAP_MS, flight / STREAM_FLYING);

/** When launch number `k` (0, 1, 2, ... counted round and round the list, so item `k % n`) starts, in ms from the start. */
export const startOf = (k: number, flight: number): number => k * launchGapMs(flight);

/**
 * Where the stream is `t` ms after it started: how many launches have landed so far (counted without end; launch
 * `k` is item `k % n`), and which trips are still animating (with how far along, 0 to 1; at most MAX_FLYING, the
 * newest). A launch has "landed" `strike` ms into its `flight` ms trip (by default at the end of it): that is
 * when its cell lights and its row joins the feed, while its fountain may still be on the way to the core.
 * Every launch still lands when the stream is busy; only the drawing of the oldest is cut short.
 */
export function playhead(t: number, n: number, flight: number, strike: number = flight): { landed: number; flying: { index: number; progress: number }[] } {
  if (n <= 0 || t < 0) return { landed: 0, flying: [] };
  const gap = launchGapMs(flight);
  const startedBy = (offset: number) => (t < offset ? 0 : Math.floor((t - offset) / gap) + 1); // launches whose start plus `offset` is at or before t
  const started = startedBy(0);
  const done = startedBy(flight);
  const flying: { index: number; progress: number }[] = [];
  for (let k = Math.max(done, started - MAX_FLYING); k < started; k++) flying.push({ index: k % n, progress: (t - startOf(k, flight)) / flight });
  return { landed: startedBy(strike), flying };
}

/** The two lines on the small card that floats by the core for an item that just landed: its text, then "category · board" (or "list · board" By board). Plain text only. */
export function cardLines(item: DoneItem, wedgeName: string | undefined, by: VizGroupBy): [string, string] {
  return [item.text.trim() || 'Untitled item', [by === 'category' ? wedgeName : item.list, item.boardName].filter(Boolean).join(' · ')];
}
