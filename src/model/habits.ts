import { addDays, addMonths, MONTHS, MONTH_NAMES, weekDays, weekStart, type DayKey } from './calendar';
import { newId } from './cards';
import { isBold, type BoldKey } from './palette';
import type { Board, Card, TodoCard, TodoItem } from './types';
import { boardTree, type Workspace } from './workspace';

// Habits (owner request, 2026-10-19): the Habits button opens a side panel of daily habits, kept
// like the journal on an ordinary board, called "Habits", so saving, sync, undo and backups work as
// for any board. Each habit is a checklist card (its title is the habit's name) and each ticked day
// is one item on it, whose text is that day ("2026-10-19", local time).

/** The board the Habits panel uses. */
export const HABITS_NAME = 'Habits';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A day item; it is a tick while done (it can be unticked on the Habits board itself). */
const isDay = (i: TodoItem) => DAY.test(i.text);
const isTick = (i: TodoItem) => i.done && isDay(i);

/**
 * A habit: a checklist whose items are all days. A blank item is allowed too, since a new
 * checklist has one blank item (as one saved with none loads); it is not a tick.
 */
export const isHabit = (c: Card): c is TodoCard => c.kind === 'todo' && c.items.every((i) => !i.children.length && (isDay(i) || (!i.text && !i.done)));

/** The first board named exactly "Habits" among the person's own boards (not one a share holds), or null. */
export function findHabitsBoard(ws: Workspace, shared: string[]): string | null {
  // simple: with several boards named Habits the first in the menu is used; they are not merged.
  return boardTree(ws).find(({ id }) => ws.boards[id].name === HABITS_NAME && !shared.includes(id))?.id ?? null;
}

/** The habits on a board, in board order (a container's cards in its place). */
export function habitList(board: Board): TodoCard[] {
  return board.order
    .flatMap((id) => board.columns[id]?.cardIds ?? [id])
    .map((id) => board.cards[id])
    .filter((c): c is TodoCard => !!c && isHabit(c));
}

/** The days ticked, each once (on a board in a share, two devices ticking the same day leave two items once merged). */
export const tickedDays = (habit: TodoCard): Set<DayKey> => new Set(habit.items.filter(isTick).map((i) => i.text));

/** The habit with `day` ticked (`on`) or not; unchanged if it already is. */
export function withDay(habit: TodoCard, day: DayKey, on: boolean): TodoCard {
  if (tickedDays(habit).has(day) === on) return habit;
  if (!on) return { ...habit, items: habit.items.filter((i) => i.text !== day) };
  // A day unticked on the board itself is ticked again, rather than adding a second item for it.
  const left = habit.items.findIndex((i) => i.text === day);
  const items = left < 0 ? [...habit.items, { id: newId('i'), text: day, done: true, children: [] }] : habit.items.map((i, n) => (n === left ? { ...i, done: true } : i));
  return { ...habit, items };
}

/** What the panel shows for each habit (view state, not board data): a week, a month or a year. */
export type HabitView = 'week' | 'month' | 'year';

/** The view's day (any day in it) moved `step` weeks, months or years; a short month clamps the day. */
export const moveHabitView = (view: HabitView, key: DayKey, step: number): DayKey =>
  view === 'week' ? addDays(key, 7 * step) : addMonths(key, view === 'month' ? step : 12 * step);

/** "19–25 Oct 2026", "28 Sep – 4 Oct 2026", "28 Dec 2026 – 3 Jan 2027", "October 2026", "2026". */
export function habitViewLabel(view: HabitView, key: DayKey): string {
  if (view === 'year') return key.slice(0, 4);
  if (view === 'month') return `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
  const from = weekStart(key);
  const to = addDays(from, 6);
  const part = (k: DayKey, year = false) => `${Number(k.slice(8))} ${MONTHS[Number(k.slice(5, 7)) - 1]}${year ? ` ${k.slice(0, 4)}` : ''}`;
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${part(from, true)} – ${part(to, true)}`;
  if (from.slice(5, 7) !== to.slice(5, 7)) return `${part(from)} – ${part(to, true)}`;
  return `${Number(from.slice(8))}–${part(to, true)}`;
}

/** Whether the view holds `today` (the panel offers a Today button when it doesn't). */
export function isHabitViewNow(view: HabitView, key: DayKey, today: DayKey): boolean {
  if (view === 'week') return weekStart(key) === weekStart(today);
  const n = view === 'month' ? 7 : 4;
  return key.slice(0, n) === today.slice(0, n);
}

/** The twelve months of the year `key` is in, each with its first day and all of its days. */
export function habitYear(key: DayKey): { month: DayKey; days: DayKey[] }[] {
  const year = Number(key.slice(0, 4));
  return Array.from({ length: 12 }, (_, m) => {
    const month = `${key.slice(0, 4)}-${String(m + 1).padStart(2, '0')}-01`;
    const length = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
    return { month, days: Array.from({ length }, (_, d) => `${month.slice(0, 8)}${String(d + 1).padStart(2, '0')}`) };
  });
}

/**
 * The Habits board kept out of the Boards menu: the one the panel uses, when no card opens it and
 * it holds only habits, so nothing on it is out of sight. Never the home board.
 */
export function hiddenHabits(ws: Workspace, shared: string[]): string | null {
  const id = findHabitsBoard(ws, shared);
  if (!id || id === ws.home) return null;
  const board = ws.boards[id];
  const cards = Object.values(board.cards);
  // A second Weight card (two devices) isn't read by the panel, so the board stays listed, to be seen.
  if (Object.keys(board.columns).length || !cards.every((c) => isHabit(c) || isOnlyWeights(c)) || cards.filter(isWeightCard).length > 1) return null;
  const opened = Object.values(ws.boards).some((b) => Object.values(b.cards).some((c) => c.kind === 'board' && c.boardId === id));
  return opened ? null : id;
}

// Weight (owner request, 2026-10-21): one checklist card titled "Weight" on the Habits board, one
// item per day, "2026-10-19 72.4" (local date, kg with one decimal). It is not a habit, and the
// Habits board stays hidden with it on. It is made when the first weight is entered, and goes when
// the last one is removed (a checklist with no weights would read as a habit named Weight).

export const WEIGHT_TITLE = 'Weight';
const WEIGHT = /^(\d{4}-\d{2}-\d{2}) (\d{2,3}\.\d)$/;
const MIN_KG = 20;
const MAX_KG = 400;

/** What was typed as kilograms (a dot or a comma), rounded to one decimal; null unless 20.0 to 400.0. */
export function parseKg(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d+)?$/.test(t)) return null;
  const kg = Math.round(Number(t) * 10) / 10;
  return kg >= MIN_KG && kg <= MAX_KG ? kg : null;
}

export const FIRST_WEIGHT_DAY = '2000-01-01';
/** Today or an earlier real day (from 2000 on): the days a weight can be entered for (job 177). */
export const isWeightDay = (day: string, today: DayKey) => /^\d{4}-\d{2}-\d{2}$/.test(day) && addDays(day, 0) === day && day >= FIRST_WEIGHT_DAY && day <= today;

/** A real day and a weight in range; a malformed item is simply not an entry. */
function entryOf(i: TodoItem): { day: DayKey; kg: number } | null {
  const m = WEIGHT.exec(i.text);
  if (!m || addDays(m[1], 0) !== m[1]) return null;
  const kg = parseKg(m[2]); // the same range as what is typed
  return kg === null ? null : { day: m[1], kg };
}
const weightText = (day: DayKey, kg: number) => `${day} ${kg.toFixed(1)}`;

/** The Weight card on a board: the first checklist titled Weight with at least one weight on it. */
const isWeightCard = (c: Card): c is TodoCard => c.kind === 'todo' && c.title === WEIGHT_TITLE && c.items.some((i) => entryOf(i));
export const weightCard = (board: Board): TodoCard | undefined => Object.values(board.cards).find(isWeightCard);

/** A Weight card with nothing on it but weights (and the blank item every checklist has), so none is out of sight. */
const isOnlyWeights = (c: Card) => isWeightCard(c) && c.items.every((i) => !i.children.length && (entryOf(i) || (!i.text && !i.done)));

/** Every weight on the card by day, oldest first; a day entered twice (two devices) counts as its last item. */
export function weightEntries(card: TodoCard | undefined): { day: DayKey; kg: number }[] {
  const byDay = new Map<DayKey, number>();
  for (const i of card?.items ?? []) {
    const e = entryOf(i);
    if (e) byDay.set(e.day, e.kg);
  }
  return [...byDay].map(([day, kg]) => ({ day, kg })).sort((a, b) => (a.day < b.day ? -1 : 1));
}

/** The card with `kg` on `day`, replacing that day's weight where it stands (or added at the end). */
export function withWeight(card: TodoCard, day: DayKey, kg: number): TodoCard {
  const text = weightText(day, kg);
  const same = (i: TodoItem) => entryOf(i)?.day === day;
  const first = card.items.findIndex(same);
  if (first < 0) return { ...card, items: [...card.items, { id: newId('i'), text, done: false, children: [] }] };
  return { ...card, items: card.items.filter((i, n) => n === first || !same(i)).map((i) => (same(i) ? { ...i, text } : i)) };
}

/** The card without `day`'s weight; unchanged if it has none. */
export function withoutWeight(card: TodoCard, day: DayKey): TodoCard {
  const items = card.items.filter((i) => entryOf(i)?.day !== day);
  return items.length === card.items.length ? card : { ...card, items };
}

/** The first and last day (both included) of the week, month or year `key` is in. */
export function habitViewRange(view: HabitView, key: DayKey): { from: DayKey; to: DayKey } {
  if (view === 'week') return { from: weekStart(key), to: addDays(weekStart(key), 6) };
  if (view === 'year') return { from: `${key.slice(0, 4)}-01-01`, to: `${key.slice(0, 4)}-12-31` };
  const from = `${key.slice(0, 7)}-01`;
  return { from, to: addDays(addMonths(from, 1), -1) };
}

/**
 * The chart for a view: the weights inside it, each placed from 0 to 1 across the days shown (x)
 * and from the lowest (0) to the highest (1) weight (y; a lone weight sits at 0.5).
 */
export function weightChart(entries: { day: DayKey; kg: number }[], view: HabitView, key: DayKey) {
  const { from, to } = habitViewRange(view, key);
  const inView = entries.filter((e) => e.day >= from && e.day <= to);
  const kgs = inView.map((e) => e.kg);
  const min = kgs.length ? Math.min(...kgs) : null;
  const max = kgs.length ? Math.max(...kgs) : null;
  const span = (a: DayKey, b: DayKey) => Math.round((Date.parse(`${b}T12:00Z`) - Date.parse(`${a}T12:00Z`)) / 86400000);
  const points = inView.map((e) => ({ ...e, x: span(from, e.day) / span(from, to), y: max === min ? 0.5 : (e.kg - min!) / (max! - min!) }));
  return { from, to, points, min, max };
}

// Habits redesign (owner picks, 2026-10-22, jobs 166 + 167): a color for each habit and the counts the Ledger shows.

/** The color a habit's ticks use: one of the 8 bold swatches it was given (its card's title color), or null for the default green. */
export function habitColor(habit: TodoCard): BoldKey | null {
  return isBold(habit.titleColor) ? (habit.titleColor as BoldKey) : null;
}

/** The habit with `color` (one of the 8 bold swatches, or null for the default); unchanged if it has it already or the color isn't one of the 8. */
export function withHabitColor(habit: TodoCard, color: BoldKey | null): TodoCard {
  if (color !== null && !isBold(color)) return habit;
  // A title color that isn't one of the 8 counts as none, but "Default" clears it all the same.
  return (habit.titleColor ?? null) === color ? habit : { ...habit, titleColor: color };
}

/** How many days of the week `key` is in (Monday to Sunday) the habit was ticked on. */
export const weekCount = (habit: TodoCard, key: DayKey): number => {
  const done = tickedDays(habit);
  return weekDays(weekStart(key)).filter((d) => done.has(d)).length;
};

/**
 * The ticks in the month or year `key` is in, and how many days of it have come by `today`
 * (all of a past one, none of one ahead): "18 of 21 days".
 */
export function periodCount(habit: TodoCard, view: 'month' | 'year', key: DayKey, today: DayKey): { ticked: number; of: number } {
  const { from, to } = habitViewRange(view, key);
  const ticked = [...tickedDays(habit)].filter((d) => d >= from && d <= to).length;
  const last = to < today ? to : today;
  const of = from > today ? 0 : Math.round((Date.parse(`${last}T12:00Z`) - Date.parse(`${from}T12:00Z`)) / 86400000) + 1;
  return { ticked, of };
}

/** How many of the habits are ticked on `day`. */
export const doneToday = (habits: TodoCard[], day: DayKey): number => habits.filter((h) => tickedDays(h).has(day)).length;
