import { addDays, eventsOnDay, weekDays, weekStart, type CalEvent, type DayKey } from './calendar';
import { findHabitsBoard, habitList, isHabit, tickedDays, weekCount } from './habits';
import { findJournalBoard, journalDayKey, journalEntries } from './journal';
import type { Board, TodoItem } from './types';
import { boardTree, type Workspace } from './workspace';

// The weekly review's data (plan job 7; no screen yet). Pure: it reads the boards and the calendar's
// events it is given and changes nothing. Weeks run Monday to Sunday, as in the calendar.

/** An item ticked this week, and where it is. */
export interface DoneItem {
  cardId: string;
  cardTitle: string;
  itemId: string;
  text: string;
  doneOn: DayKey;
}

export interface HabitWeek {
  cardId: string;
  title: string;
  /** The days of the week the habit was ticked on, each once, in order. */
  days: DayKey[];
  /** `days.length`. Shown as "4 of 7 days"; there is no streak (owner, 2026-10-20). */
  count: number;
}

export interface WeekReview {
  /** The week reviewed: its Monday and its Sunday. */
  week: { from: DayKey; to: DayKey };
  /** Items ticked this week, by board (boards with none are left out). */
  done: { boardId: string; boardName: string; items: DoneItem[] }[];
  /** Each habit's week, or null when there is no Habits board of the person's own. */
  habits: HabitWeek[] | null;
  /** The seven days of the week after, each with its events, or null when there is no calendar to read. */
  nextWeek: { day: DayKey; events: CalEvent[] }[] | null;
  /** How many of this week's days have a dated Journal note (0 with no Journal board). */
  journalCount: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The day an item was ticked, when it has one. `doneOn` is a planned optional field on to-do items
 * (plan job 6) that isn't saved yet, so it is read here if present; items without it are not counted.
 */
function doneOn(item: TodoItem): DayKey | null {
  const day = (item as { doneOn?: unknown }).doneOn;
  return item.done && typeof day === 'string' && DAY.test(day) ? day : null;
}

function doneIn(board: Board, from: DayKey, to: DayKey): DoneItem[] {
  const out: DoneItem[] = [];
  const walk = (items: TodoItem[], cardId: string, cardTitle: string) => {
    for (const i of items) {
      const day = doneOn(i);
      if (day && day >= from && day <= to) out.push({ cardId, cardTitle, itemId: i.id, text: i.text, doneOn: day });
      walk(i.children, cardId, cardTitle);
    }
  };
  // A habit's items are its ticked days, not things done.
  for (const c of Object.values(board.cards)) {
    if (c.kind !== 'todo') continue;
    const habit: boolean = isHabit(c); // (a plain boolean: as a type guard, "not a habit" would narrow c to never)
    if (!habit) walk(c.items, c.id, c.title);
  }
  return out;
}

/**
 * The review for the week `day` is in. `events` is the calendar's events (null with no access), which
 * must cover next week. `shared` is the ids of boards a share holds, which are not the person's own
 * Habits or Journal (as for the panels).
 */
export function weekReview(ws: Workspace, events: CalEvent[] | null, day: DayKey, shared: string[] = []): WeekReview {
  const from = weekStart(day);
  const to = addDays(from, 6);
  const done = boardTree(ws)
    .map(({ id }) => ({ boardId: id, boardName: ws.boards[id].name, items: doneIn(ws.boards[id], from, to) }))
    .filter((g) => g.items.length);

  const habitsId = findHabitsBoard(ws, shared);
  const habits = habitsId
    ? habitList(ws.boards[habitsId]).map((h) => {
        const ticked = tickedDays(h);
        const days = weekDays(from).filter((d) => ticked.has(d));
        return { cardId: h.id, title: h.title, days, count: weekCount(h, from) };
      })
    : null;

  const nextWeek = events ? weekDays(addDays(from, 7)).map((d) => ({ day: d, events: eventsOnDay(events, d) })) : null;

  const journalId = findJournalBoard(ws, shared);
  const journalCount = journalId
    ? journalEntries(ws.boards[journalId]).filter((e) => {
        const d = journalDayKey(e.date);
        return d !== null && d >= from && d <= to;
      }).length
    : 0;

  return { week: { from, to }, done, habits, nextWeek, journalCount };
}
