import { sections } from './checklist';
import type { Board, TodoItem } from './types';
import type { Workspace } from './workspace';

// Due dates on checklist items (owner request, 2026-10-05): a day, "YYYY-MM-DD", with no time and
// no reminders. The Due list shows what is due today or overdue, from every board.

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The day as a date at midnight UTC (so adding days never trips over clock changes). */
function utc(day: string): Date {
  const [, y, m, d] = DAY.exec(day)!;
  return new Date(Date.UTC(+y, +m - 1, +d));
}

const keyOf = (d: Date) => d.toISOString().slice(0, 10);

/** A real calendar day written YYYY-MM-DD. */
export function isDueDate(v: unknown): v is string {
  return typeof v === 'string' && DAY.test(v) && keyOf(utc(v)) === v;
}

/** The day `n` days after `day` (before it when negative). */
export function addDays(day: string, n: number): string {
  const d = utc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return keyOf(d);
}

const daysBetween = (from: string, to: string) => Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000);

export type DueState = 'overdue' | 'today' | 'later';

export function dueState(due: string, today: string): DueState {
  return due < today ? 'overdue' : due === today ? 'today' : 'later';
}

/** "Today", "Tomorrow", "Yesterday", a weekday within the next six days ("Fri"), else "Tue 20 Oct" (with the year when not this year). */
export function dueLabel(due: string, today: string): string {
  const n = daysBetween(today, due);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  const d = utc(due);
  const weekday = WEEKDAYS[d.getUTCDay()];
  if (n > 1 && n < 7) return weekday;
  const year = due.slice(0, 4) === today.slice(0, 4) ? '' : ` ${d.getUTCFullYear()}`;
  return `${weekday} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year}`;
}

/** The items with item `id` given due date `due` (null: no due date); null when nothing changes. */
export function withDue(items: TodoItem[], id: string, due: string | null): TodoItem[] | null {
  let changed = false;
  const walk = (list: TodoItem[]): TodoItem[] =>
    list.map((it) => {
      if (it.id === id) {
        if ((it.due ?? null) === due) return it;
        changed = true;
        const next = { ...it };
        if (due) next.due = due;
        else delete next.due;
        return next;
      }
      const children = walk(it.children);
      return children.some((c, i) => c !== it.children[i]) ? { ...it, children } : it;
    });
  const result = walk(items);
  return changed ? result : null;
}

/** An item that is due today or overdue, and where it is. */
export interface DueItem {
  boardId: string;
  boardName: string;
  cardId: string;
  listTitle: string;
  itemId: string;
  text: string;
  due: string;
  state: 'overdue' | 'today';
}

/** Lists in board order: columns left to right (their cards top to bottom), then loose lists. */
function listsOf(board: Board) {
  const ids: string[] = [];
  const columns = board.order.filter((id) => board.columns[id]).sort((a, b) => board.columns[a].x - board.columns[b].x || board.columns[a].y - board.columns[b].y);
  for (const id of columns) ids.push(...board.columns[id].cardIds);
  ids.push(...board.order.filter((id) => board.cards[id]).sort((a, b) => board.cards[a].y - board.cards[b].y || board.cards[a].x - board.cards[b].x));
  return ids.map((id) => board.cards[id]).filter((c) => c?.kind === 'todo');
}

/**
 * Every unticked item due today or before, on every board (the home board's first), overdue ones
 * first (oldest first), then today's; within a day in board order. A ticked item's sub-items count
 * as done.
 */
export function dueItems(ws: Workspace, today: string): DueItem[] {
  const out: DueItem[] = [];
  const boardIds = [ws.home, ...Object.keys(ws.boards).filter((id) => id !== ws.home)];
  for (const boardId of boardIds) {
    const board = ws.boards[boardId];
    for (const card of listsOf(board)) {
      if (card.kind !== 'todo') continue;
      const walk = (items: TodoItem[]) => {
        for (const it of items) {
          if (it.done) continue;
          if (it.due && it.due <= today) {
            out.push({ boardId, boardName: board.name, cardId: card.id, listTitle: card.title, itemId: it.id, text: it.text, due: it.due, state: it.due < today ? 'overdue' : 'today' });
          }
          walk(it.children);
        }
      };
      walk(sections(card.items).open);
    }
  }
  return out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}
