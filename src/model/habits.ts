import { addDays, weekDays, weekStart, type DayKey } from './calendar';
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

/** The days ticked, each once (two devices ticking the same day leave two items once combined). */
export const tickedDays = (habit: TodoCard): Set<DayKey> => new Set(habit.items.filter(isTick).map((i) => i.text));

/** The habit with `day` ticked (`on`) or not; unchanged if it already is. */
export function withDay(habit: TodoCard, day: DayKey, on: boolean): TodoCard {
  if (tickedDays(habit).has(day) === on) return habit;
  const items = on ? [...habit.items, { id: newId('i'), text: day, done: true, children: [] }] : habit.items.filter((i) => i.text !== day);
  return { ...habit, items };
}

/** This week, Monday to Sunday, as in the calendar's month grid. */
export const thisWeek = (today: DayKey): DayKey[] => weekDays(weekStart(today));

/**
 * Days ticked in a row, ending today, or ending yesterday while today isn't ticked yet (the day
 * isn't over, so that doesn't break the streak). Days ahead of today don't count.
 */
export function streak(days: Set<DayKey>, today: DayKey): number {
  let day = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  for (; days.has(day); day = addDays(day, -1)) n++;
  return n;
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
