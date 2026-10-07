import { addCard, placementForNewCard, setItemText } from '../src/model/board';
import { createCard, createItem } from '../src/model/cards';
import { editItems as changeItems, extractItems, findItem, insertItems, refill, rootsOf, setItemsDone as tick, type ItemDrop } from '../src/model/checklist';
import { CARD_W, GRID, NEW_BLOCK_H } from '../src/model/constants';
import { isDueDate, withDue } from '../src/model/due';
import { blockRect, spotForNewBlock, type MeasuredHeight } from '../src/model/layout';
import { estimateHeight } from '../src/model/milanote';
import type { Board, NoteCard, TodoCard, TodoItem } from '../src/model/types';
import type { Workspace } from '../src/model/workspace';

// The connector's changes to a board (pure: no network). Each tool's request becomes an Edit: a
// function from the boards to the changed boards and a plain list of what changed, made only
// with the app's own rules in src/model/. New ids are made when the Edit is made, so running it
// again on boards that already have the change changes nothing (the put-back check relies on it).

export type Edit = (ws: Workspace) => { ws: Workspace; changed: string[] } | { error: string };

class Refused extends Error {}
const refuse = (message: string): never => {
  throw new Refused(message);
};

/** Runs `change` on board `boardId`; a Refused becomes the Edit's error. */
function onBoard(boardId: string, change: (b: Board, changed: string[]) => Board): Edit {
  return (ws) => {
    const board = ws.boards[boardId];
    if (!board) return { error: `The board ${boardId} isn’t there any more.` };
    const changed: string[] = [];
    try {
      const next = change(board, changed);
      return { ws: next === board ? ws : { ...ws, boards: { ...ws.boards, [boardId]: next } }, changed };
    } catch (e) {
      if (e instanceof Refused) return { error: e.message };
      throw e;
    }
  };
}

const norm = (s: string) => s.trim().toLowerCase();
const short = (s: string) => (s.length > 60 ? `${s.slice(0, 59)}…` : s);
const listName = (c: TodoCard) => c.title.trim() || 'Untitled list';
const todos = (b: Board) => Object.values(b.cards).filter((c): c is TodoCard => c.kind === 'todo');

/** One line of item text: line breaks become spaces; blank is refused. */
function itemText(text: string): string {
  const t = text.replace(/\s*[\r\n]+\s*/g, ' ').trim();
  if (!t) refuse('Item text can’t be blank.');
  return t;
}

function checkDue(due: string | null | undefined) {
  if (due != null && !isDueDate(due)) refuse(`"${due}" isn’t a date: give due dates as a real day written YYYY-MM-DD.`);
}

/** A checklist on the board, by id or by its title when only one list has it. */
function findList(b: Board, query: string): TodoCard {
  const lists = todos(b);
  const byId = lists.find((c) => c.id === query.trim());
  if (byId) return byId;
  const named = lists.filter((c) => norm(listName(c)) === norm(query));
  if (named.length === 1) return named[0];
  const choices = (cs: TodoCard[]) => cs.map((c) => `- ${listName(c)} (id: ${c.id})`).join('\n');
  if (named.length > 1) return refuse(`${named.length} checklists are called "${listName(named[0])}". Say which by id:\n${choices(named)}`);
  return refuse(`No checklist called "${query.trim()}" on this board.${lists.length ? ` The checklists are:\n${choices(lists)}` : ' It has no checklists.'}`);
}

/** The list holding item `id` (items are named by id; read_board shows them). */
function listOf(b: Board, id: string): TodoCard {
  return todos(b).find((c) => findItem(c.items, id)) ?? refuse(`No item with id "${id}" on this board.`);
}

const withList = (b: Board, list: TodoCard, items: TodoItem[]) => changeItems(b, list.id, () => items);

export interface NewItem {
  text: string;
  due?: string;
  /** An item id in the list: the new item goes right after it (several keep their order). */
  after?: string;
  /** An item id in the list: the new item goes as its last sub-item. */
  under?: string;
}

/** add_items: `ids` are the new items' ids, one per item. */
export function addItems(boardId: string, listQuery: string, newItems: NewItem[], ids: string[]): Edit {
  return onBoard(boardId, (b, changed) => {
    const list = findList(b, listQuery);
    let items = list.items;
    const lastAfter: Record<string, string> = {};
    newItems.forEach((n, i) => {
      const id = ids[i];
      // Already there: this Edit ran before (the put-back check).
      if (todos(b).some((c) => findItem(c.items, id))) return;
      const text = itemText(n.text);
      checkDue(n.due);
      if (n.after && n.under) refuse('Give only one of after and under for an item.');
      const anchor = n.after ?? n.under;
      const target = anchor ? findItem(items, anchor) : null;
      if (anchor && !target) refuse(`No item with id "${anchor}" in ${listName(list)}.`);
      let drop: ItemDrop = { mode: 'append' };
      if (n.after) drop = { mode: 'after', targetId: lastAfter[n.after] ?? n.after };
      else if (target) {
        const kids = target.item.children;
        drop = kids.length ? { mode: 'after', targetId: kids[kids.length - 1].id } : { mode: 'nest', targetId: target.item.id };
      }
      const item: TodoItem = { ...createItem(id), text, ...(n.due ? { due: n.due } : {}) };
      items = insertItems(items, drop, [item]) ?? refuse('That would nest items deeper than 6 levels.');
      if (n.after) lastAfter[n.after] = id;
      changed.push(`Added "${short(text)}" (id: ${id}${n.due ? `, due ${n.due}` : ''}) to ${listName(list)}`);
    });
    return changed.length ? withList(b, list, items) : b;
  });
}

export interface ItemChange {
  item: string;
  text?: string;
  /** A day, or null to remove the due date. */
  due?: string | null;
}

/** edit_items: new text and / or due dates for items. */
export function editItems(boardId: string, changes: ItemChange[]): Edit {
  return onBoard(boardId, (b, changed) => {
    for (const ch of changes) {
      if (ch.text === undefined && ch.due === undefined) refuse(`Say what to change for item "${ch.item}": text, due, or both.`);
      const list = listOf(b, ch.item);
      const old = findItem(list.items, ch.item)!.item;
      if (ch.text !== undefined) {
        const text = itemText(ch.text);
        if (text !== old.text) {
          b = setItemText(b, list.id, ch.item, text);
          changed.push(`Changed "${short(old.text)}" to "${short(text)}"`);
        }
      }
      if (ch.due !== undefined) {
        checkDue(ch.due);
        const items = withDue((b.cards[list.id] as TodoCard).items, ch.item, ch.due);
        if (items) {
          b = withList(b, list, items);
          const name = short(findItem(items, ch.item)!.item.text);
          changed.push(ch.due ? `Set "${name}" due ${ch.due}` : `Removed the due date from "${name}"`);
        }
      }
    }
    return b;
  });
}

/** set_items_done: tick (or untick) items, as clicking their boxes in the app does. */
export function setItemsDone(boardId: string, ids: string[], done: boolean): Edit {
  return onBoard(boardId, (b, changed) => {
    for (const id of ids) {
      const list = listOf(b, id);
      const it = findItem(list.items, id)!.item;
      if (it.done === done) continue;
      b = withList(b, list, tick(list.items, [id], done));
      changed.push(`${done ? 'Ticked' : 'Unticked'} "${short(it.text)}"`);
    }
    return b;
  });
}

export interface MoveTo {
  list: string;
  after?: string;
  before?: string;
  under?: string;
}

/**
 * move_items: items (with their sub-items) to a place in a list on the same board, in the order
 * they are shown, as when dragging them. A list left empty keeps one blank item: the connector
 * never deletes anything (in the app, dragging the last item out removes the list).
 */
export function moveItems(boardId: string, ids: string[], to: MoveTo): Edit {
  return onBoard(boardId, (b, changed) => {
    const places = [to.after, to.before, to.under].filter((p) => p !== undefined);
    if (places.length > 1) refuse('Give only one of after, before and under.');
    const dest = findList(b, to.list);
    // Take the items out of every list they are in (the destination too), in the order shown.
    const moving: TodoItem[] = [];
    const sources = new Map<string, TodoItem[]>();
    // Lists in the order their items were given (each list's items in the order shown).
    const lists = [...new Set(ids.map((id) => listOf(b, id)))];
    for (const list of lists) {
      const mine = ids.filter((id) => findItem(list.items, id));
      if (!mine.length) continue;
      const { rest, moving: out } = extractItems(list.items, rootsOf(list.items, mine));
      moving.push(...out);
      sources.set(list.id, rest);
    }
    const anchor = to.after ?? to.before ?? to.under;
    const base = sources.get(dest.id) ?? dest.items;
    const target = anchor ? findItem(base, anchor) : null;
    if (anchor && !target) {
      if (findItem(dest.items, anchor)) refuse('Items can’t be moved next to or under themselves.');
      refuse(`No item with id "${anchor}" in ${listName(dest)}.`);
    }
    let drop: ItemDrop = { mode: 'append' };
    if (to.after) drop = { mode: 'after', targetId: to.after };
    else if (to.before) drop = { mode: 'before', targetId: to.before };
    else if (target) {
      const kids = target.item.children;
      drop = kids.length ? { mode: 'after', targetId: kids[kids.length - 1].id } : { mode: 'nest', targetId: target.item.id };
    }
    const placed = insertItems(base, drop, moving) ?? refuse('That would nest items deeper than 6 levels.');
    for (const [listId, rest] of sources) if (listId !== dest.id) b = withList(b, b.cards[listId] as TodoCard, refill(rest));
    const next = withList(b, dest, placed);
    if (JSON.stringify((next.cards[dest.id] as TodoCard).items) === JSON.stringify(dest.items) && sources.size === 1 && sources.has(dest.id)) return b;
    const where = to.after ? ` (after "${short(findItem(placed, to.after)!.item.text)}")` : to.before ? ` (before "${short(findItem(placed, to.before)!.item.text)}")` : to.under ? ` (under "${short(target!.item.text)}")` : '';
    for (const m of moving) changed.push(`Moved "${short(m.text)}" to ${listName(dest)}${where}`);
    return next;
  });
}

/**
 * Blocks' drawn heights, guessed (the connector never sees the board drawn): a card from its
 * contents, a column from its title and cards. The app moves blocks apart if a guess was short.
 */
function guessedHeights(b: Board): MeasuredHeight {
  return (id) => {
    const col = b.columns[id];
    if (col) return Math.max(NEW_BLOCK_H.column, COLUMN_TITLE_GUESS + col.cardIds.reduce((h, c) => h + (b.cards[c] ? estimateHeight(b.cards[c]) + GRID : 0), 0));
    const card = b.cards[id];
    return card ? (card.h ?? estimateHeight(card)) : undefined;
  };
}
const COLUMN_TITLE_GUESS = 60;

/**
 * add_note: a note at the end of a column (by id or title), just below a card in a column (`near`),
 * beside a loose card or column (`near`), or else loose near the board's top left; never over
 * another block. `id` is the new note's id.
 */
export function addNote(boardId: string, text: string, where: { column?: string; near?: string }, id: string): Edit {
  return onBoard(boardId, (b, changed) => {
    if (b.cards[id]) return b; // already there: this Edit ran before
    if (!text.trim()) refuse('A note’s text can’t be blank.');
    if (where.column !== undefined && where.near !== undefined) refuse('Give only one of column and near.');
    const note: NoteCard = { ...(createCard('note', id) as NoteCard), text };
    const preview = `"${short(text.trim().split('\n')[0])}"`;
    if (where.column !== undefined) {
      const cols = Object.values(b.columns);
      const name = (t: string) => t.trim() || 'Untitled column';
      const byId = b.columns[where.column.trim()];
      const named = byId ? [byId] : cols.filter((c) => norm(name(c.title)) === norm(where.column!));
      const choices = (cs: typeof cols) => cs.map((c) => `- ${name(c.title)} (id: ${c.id})`).join('\n');
      if (named.length > 1) refuse(`${named.length} columns are called "${name(named[0].title)}". Say which by id:\n${choices(named)}`);
      if (!named.length) refuse(`No column called "${where.column.trim()}" on this board.${cols.length ? ` The columns are:\n${choices(cols)}` : ''}`);
      const col = named[0];
      changed.push(`Added a note (id: ${id}) to the column ${name(col.title)}: ${preview}`);
      return addCard(b, note, { type: 'column', columnId: col.id, index: col.cardIds.length });
    }
    const near = where.near?.trim();
    if (near !== undefined && !b.cards[near] && !b.columns[near]) refuse(`No card or column with id "${near}" on this board.`);
    // Near a card in a column: just below it in the column. Near a column or a loose card: beside it.
    const inColumn = near && b.cards[near] ? placementForNewCard(b, near) : null;
    if (inColumn) {
      changed.push(`Added a note (id: ${id}) to a column, below the card: ${preview}`);
      return addCard(b, note, inColumn);
    }
    const h = estimateHeight(note);
    const measured = guessedHeights(b);
    const r = near ? blockRect(b, near, measured) : null;
    const centre = r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : { x: 40 + CARD_W / 2, y: 40 + h / 2 };
    const spot = spotForNewBlock(b, CARD_W, h, centre, measured);
    changed.push(`Added a note (id: ${id}) on the board: ${preview}`);
    return addCard(b, note, { type: 'loose', ...spot });
  });
}
