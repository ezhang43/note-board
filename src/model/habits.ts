import { addDays, addMonths, MONTHS, MONTH_NAMES, weekStart, type DayKey } from './calendar';
import { newId } from './cards';
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
  if (Object.keys(board.columns).length || !Object.values(board.cards).every(isHabit)) return null;
  const opened = Object.values(ws.boards).some((b) => Object.values(b.cards).some((c) => c.kind === 'board' && c.boardId === id));
  return opened ? null : id;
}
