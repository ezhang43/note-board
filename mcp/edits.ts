import { addCard, addColumn, createBoard, deleteBlocks, placementForNewCard, setItemText, shownName, topLevelOf } from '../src/model/board';
import { createBoardCard, createCard, createColumn, createItem, isPermanent, type MakeId } from '../src/model/cards';
import { editItems as changeItems, deleteItems, extractItems, findItem, flatIds, insertItems, refill, rootsOf, setItemsDone as tick, type ItemDrop } from '../src/model/checklist';
import { CARD_W, COLUMN_W, GRID, NEW_BLOCK_H } from '../src/model/constants';
import { blockRect, spotForNewBlock, type MeasuredHeight } from '../src/model/layout';
import { estimateHeight } from '../src/model/milanote';
import type { Board, Card, NoteCard, TodoCard, TodoItem } from '../src/model/types';
import { boardLinks, pathTo, withoutBoard, type Workspace } from '../src/model/workspace';

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
      const item: TodoItem = { ...createItem(id), text };
      items = insertItems(items, drop, [item]) ?? refuse('That would nest items deeper than 6 levels.');
      if (n.after) lastAfter[n.after] = id;
      changed.push(`Added "${short(text)}" (id: ${id}) to ${listName(list)}`);
    });
    return changed.length ? withList(b, list, items) : b;
  });
}

export interface ItemChange {
  item: string;
  text: string;
}

/** edit_items: new text for items. */
export function editItems(boardId: string, changes: ItemChange[]): Edit {
  return onBoard(boardId, (b, changed) => {
    for (const ch of changes) {
      const list = listOf(b, ch.item);
      const old = findItem(list.items, ch.item)!.item;
      const text = itemText(ch.text);
      if (text !== old.text) {
        b = setItemText(b, list.id, ch.item, text);
        changed.push(`Changed "${short(old.text)}" to "${short(text)}"`);
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
 * they are shown, as when dragging them. A list left empty keeps one blank item: moving
 * never deletes a list (in the app, dragging the last item out removes the list).
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


// ---------- making things ----------

/** Where a new card goes: the end of a column (by id or title), or near a card or column. */
export interface Where {
  column?: string;
  near?: string;
}

/**
 * Puts a new card on the board: at the end of a column, just below a card in a column (`near`),
 * beside a loose card or column (`near`), or else loose near the board's top left; never over
 * another block. `place` says where, for the reply.
 */
function placeCard(b: Board, card: Card, where: Where): { board: Board; place: string } {
  if (where.column !== undefined && where.near !== undefined) refuse('Give only one of column and near.');
  if (where.column !== undefined) {
    const cols = Object.values(b.columns);
    const name = (t: string) => t.trim() || 'Untitled column';
    const byId = b.columns[where.column.trim()];
    const named = byId ? [byId] : cols.filter((c) => norm(name(c.title)) === norm(where.column!));
    const choices = (cs: typeof cols) => cs.map((c) => `- ${name(c.title)} (id: ${c.id})`).join('\n');
    if (named.length > 1) refuse(`${named.length} columns are called "${name(named[0].title)}". Say which by id:\n${choices(named)}`);
    if (!named.length) refuse(`No column called "${where.column.trim()}" on this board.${cols.length ? ` The columns are:\n${choices(cols)}` : ''}`);
    const col = named[0];
    return { board: addCard(b, card, { type: 'column', columnId: col.id, index: col.cardIds.length }), place: `to the column ${name(col.title)}` };
  }
  const near = nearBlock(b, where.near);
  // Near a card in a column: just below it in the column. Near a column or a loose card: beside it.
  const inColumn = near && b.cards[near] ? placementForNewCard(b, near) : null;
  if (inColumn) return { board: addCard(b, card, inColumn), place: 'to a column, below the card' };
  const spot = looseSpot(b, near, CARD_W, estimateHeight(card));
  return { board: addCard(b, card, { type: 'loose', ...spot }), place: 'on the board' };
}

/** The id of a card or column to place beside (refused when it isn't on the board). */
function nearBlock(b: Board, near: string | undefined): string | undefined {
  const id = near?.trim();
  if (id !== undefined && !b.cards[id] && !b.columns[id]) refuse(`No card or column with id "${id}" on this board.`);
  return id;
}

/** A free spot for a loose block w by h: beside block `near`, or near the board's top left. */
function looseSpot(b: Board, near: string | undefined, w: number, h: number) {
  const measured = guessedHeights(b);
  const r = near ? blockRect(b, topLevelOf(b, near), measured) : null; // a card in a column: beside its column
  const centre = r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : { x: 40 + w / 2, y: 40 + h / 2 };
  return spotForNewBlock(b, w, h, centre, measured);
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
const firstLine = (text: string) => short(text.trim().split('\n')[0].trim());

/** add_note: a note placed as placeCard says. `id` is the new note's id. */
export function addNote(boardId: string, text: string, where: Where, id: string): Edit {
  return onBoard(boardId, (b, changed) => {
    if (b.cards[id]) return b; // already there: this Edit ran before
    if (!text.trim()) refuse('A note’s text can’t be blank.');
    const note: NoteCard = { ...(createCard('note', id) as NoteCard), text };
    const { board, place } = placeCard(b, note, where);
    changed.push(`Added a note (id: ${id}) ${place}: "${firstLine(text)}"`);
    return board;
  });
}

/** add_checklist: a checklist with these items (one blank item when none, as in the app). */
export function addChecklist(boardId: string, title: string, items: string[], where: Where, id: string, itemIds: string[]): Edit {
  return onBoard(boardId, (b, changed) => {
    if (b.cards[id]) return b;
    const t = title.replace(/\s*[\r\n]+\s*/g, ' ').trim();
    if (!t) refuse('A checklist’s title can’t be blank.');
    const list: TodoCard = {
      ...(createCard('todo', id) as TodoCard),
      title: t,
      items: items.length ? items.map((text, i) => ({ ...createItem(itemIds[i]), text: itemText(text) })) : [createItem(itemIds[0])],
    };
    const { board, place } = placeCard(b, list, where);
    changed.push(`Added the checklist "${short(t)}" (id: ${id})${items.length ? ` with ${plural(items.length, 'item')}` : ''} ${place}`);
    return board;
  });
}

/** add_column: an empty column, loose, beside block `near` or near the top left. */
export function newColumn(boardId: string, title: string, near: string | undefined, id: string): Edit {
  return onBoard(boardId, (b, changed) => {
    if (b.columns[id]) return b;
    const t = title.replace(/\s*[\r\n]+\s*/g, ' ').trim();
    if (!t) refuse('A column’s title can’t be blank.');
    const spot = looseSpot(b, nearBlock(b, near), COLUMN_W, NEW_BLOCK_H.column);
    changed.push(`Added the column "${short(t)}" (id: ${id}) on the board`);
    return addColumn(b, { ...createColumn(id), title: t, ...spot });
  });
}

/**
 * create_board: a new, named, empty board in the person's own boards: inside another board (with a
 * board card opening it there, as the app's Board card does) or on its own (as New board does).
 */
export function newBoard(name: string, inside: { boardId: string; where: Where } | undefined, id: string, cardId: string): Edit {
  return (ws) => {
    if (ws.boards[id]) return { ws, changed: [] }; // already there: this Edit ran before
    const n = name.replace(/\s*[\r\n]+\s*/g, ' ').trim();
    if (!n) return { error: 'A board’s name can’t be blank.' };
    const board: Board = { ...createBoard(), name: n };
    if (!inside) return { ws: { ...ws, boards: { ...ws.boards, [id]: board } }, changed: [`Made the board "${short(n)}" (id: ${id}), on its own (no board opens it)`] };
    const r = onBoard(inside.boardId, (b, changed) => {
      const { board: parent, place } = placeCard(b, createBoardCard(id, cardId), inside.where);
      changed.push(`Made the board "${short(n)}" (id: ${id}) inside ${shownName(b.name)}, with a board card (id: ${cardId}) ${place}`);
      return parent;
    })(ws);
    return 'error' in r ? r : { ws: { ...r.ws, boards: { ...r.ws.boards, [id]: board } }, changed: r.changed };
  };
}

// ---------- deleting ----------

/** Whether `id` (a board inside, column, card or item) is still there to delete. */
function isThere(ws: Workspace, b: Board, id: string): boolean {
  return Boolean(ws.boards[id] || b.columns[id] || b.cards[id] || todos(b).some((c) => findItem(c.items, id)));
}

/**
 * What a delete removes, read from the boards before and after it (so it is exactly what goes):
 * whole boards first, then on each board its columns (with their cards counted), cards and items.
 */
function whatWent(before: Workspace, after: Workspace, boardId: string): string[] {
  const lines: string[] = [];
  const nameOf = (id: string) => shownName(before.boards[id]?.name ?? '');
  for (const [id, b] of Object.entries(before.boards)) {
    if (after.boards[id]) continue;
    const kept = boardLinks(b).filter((to) => to !== id && after.boards[to]);
    lines.push(`the board "${nameOf(id)}" (id: ${id}), with ${plural(Object.keys(b.cards).length, 'card')}${kept.length ? ` (the boards inside it are kept and then stand alone: ${kept.map(nameOf).join(', ')})` : ''}`);
  }
  const ids = [boardId, ...Object.keys(before.boards).filter((id) => id !== boardId)];
  for (const id of ids) {
    const was = before.boards[id];
    const now = after.boards[id];
    if (!was || !now || was === now) continue;
    const on = `on ${nameOf(id)}`;
    const inGoneColumn = new Set<string>();
    for (const col of Object.values(was.columns)) {
      if (now.columns[col.id]) continue;
      col.cardIds.forEach((c) => inGoneColumn.add(c));
      const gone = col.cardIds.filter((c) => !now.cards[c]).length;
      lines.push(`the column "${short(col.title.trim() || 'Untitled column')}" (id: ${col.id}) ${on}, with ${plural(gone, 'card')}`);
    }
    for (const card of Object.values(was.cards)) {
      if (now.cards[card.id] || inGoneColumn.has(card.id)) continue;
      if (card.kind === 'todo') lines.push(`the checklist "${short(listName(card))}" (id: ${card.id}) ${on}, with ${plural(flatIds(card.items).length, 'item')}`);
      else if (card.kind === 'note') lines.push(`the note "${firstLine(card.text)}" (id: ${card.id}) ${on}`);
      else if (card.kind === 'link') lines.push(`the link "${short(card.title.trim() || card.url)}" (id: ${card.id}) ${on}`);
      else if (card.kind === 'board') {
        const opens = before.boards[card.boardId] ? nameOf(card.boardId) : 'a board not among your own (shared with you, or gone)';
        const kept = after.boards[card.boardId] ? ` (the board ${opens} itself is kept)` : '';
        lines.push(`the board card (id: ${card.id}) ${on}, which opens ${opens}${kept}`);
      } else lines.push(`the card (id: ${card.id}) ${on}`);
    }
    for (const card of todos(was)) {
      const still = now.cards[card.id];
      if (still?.kind !== 'todo') continue;
      const left = new Set(flatIds(still.items));
      for (const itemId of flatIds(card.items)) {
        if (!left.has(itemId)) lines.push(`the item "${short(findItem(card.items, itemId)!.item.text.trim())}" (id: ${itemId}) from ${short(listName(card))} ${on}`);
      }
    }
  }
  return lines;
}

/**
 * Everything a delete removes, in full (whole boards, columns, cards with their items, items with
 * their sub-items), so confirm_delete can tell whether any of it changed since the preview, even
 * where the preview's lines don't show it (a note's second line, a column's cards).
 */
function fingerprint(before: Workspace, after: Workspace): string {
  const gone: unknown[] = [];
  for (const [id, b] of Object.entries(before.boards)) {
    const now = after.boards[id];
    if (!now) gone.push(['board', id, b]);
    if (!now || now === b) continue;
    for (const col of Object.values(b.columns)) if (!now.columns[col.id]) gone.push(['column', id, col]);
    for (const card of Object.values(b.cards)) {
      const still = now.cards[card.id];
      if (!still) gone.push(['card', id, card]);
      else if (card.kind === 'todo' && still.kind === 'todo') {
        const left = new Set(flatIds(still.items));
        for (const itemId of flatIds(card.items)) if (!left.has(itemId)) gone.push(['item', id, findItem(card.items, itemId)!.item]);
      }
    }
  }
  return JSON.stringify(gone);
}

/**
 * preview_delete's plan: the boards after deleting `ids` (items, cards, columns, and boards inside
 * this one, by the id read_board shows), made with the app's own delete functions, and a line for
 * each thing that would go. Refuses the home board, a top-level board, the Completed card, and any
 * delete that would change a board in `shared`.
 */
export function planDelete(ws: Workspace, boardId: string, ids: string[], shared: Set<string>, makeId: MakeId): { ws: Workspace; lines: string[]; print: string } | { error: string } {
  const board = ws.boards[boardId];
  if (!board) return { error: `The board ${boardId} isn’t there any more.` };
  const name = shownName(board.name);
  const blocks: string[] = [];
  const items = new Map<string, string[]>();
  const boards: string[] = [];
  const seen = new Set<string>();
  const links = boardLinks(board);
  for (const raw of ids) {
    const id = raw.trim();
    if (seen.has(id)) return { error: `The id "${id}" is given twice.` };
    seen.add(id);
    if (id === ws.home) return { error: 'The home board is never deleted.' };
    if (id === boardId) return { error: `${name} can’t be deleted from itself: preview it from the board it sits inside.` };
    const card = board.cards[id];
    if (card && isPermanent(card)) return { error: 'The Completed card is never deleted.' };
    if (card || board.columns[id]) {
      blocks.push(id);
      continue;
    }
    const list = todos(board).find((c) => findItem(c.items, id));
    if (list) {
      items.set(list.id, [...(items.get(list.id) ?? []), id]);
      continue;
    }
    if (links.includes(id) && ws.boards[id]) {
      if (pathTo(ws, id).length <= 1) return { error: `${shownName(ws.boards[id].name)} is a top-level board: the connector never deletes a whole top-level board.` };
      boards.push(id);
      continue;
    }
    return { error: `No item, card, column or board inside ${name} with id "${id}".` };
  }
  let b = board;
  for (const [listId, gone] of items) b = changeItems(b, listId, (its) => deleteItems(its, gone, makeId));
  b = deleteBlocks(b, blocks);
  let next: Workspace = { ...ws, boards: { ...ws.boards, [boardId]: b } };
  for (const id of boards) next = withoutBoard(next, id);
  for (const id of shared) {
    if (ws.boards[id] && ws.boards[id] !== next.boards[id]) {
      return { error: `Nothing would be deleted: it would change ${shownName(ws.boards[id].name)}, a shared board, and shared boards are read-only for this connector.` };
    }
  }
  const lines = whatWent(ws, next, boardId);
  if (!lines.length) return { error: 'Nothing would be deleted.' };
  return { ws: next, lines, print: fingerprint(ws, next) };
}

/**
 * confirm_delete: makes the delete the preview listed, only if it would still delete exactly that
 * (`expected` is the preview's print). Run again once it is done, it changes nothing.
 */
export function deleteThings(boardId: string, ids: string[], shared: Set<string>, expected: string, seed: string): Edit {
  return (ws) => {
    const board = ws.boards[boardId];
    if (!board) return { error: `Nothing was deleted: the board ${boardId} isn’t there any more.` };
    const there = ids.filter((id) => isThere(ws, board, id.trim()));
    if (!there.length) return { ws, changed: [] }; // already done: this Edit ran before
    const changedSince = { error: 'Nothing was deleted: the board has changed since the preview, so it would no longer delete exactly what the preview listed. Preview it again.' };
    if (there.length < ids.length) return changedSince;
    let n = 0;
    const r = planDelete(ws, boardId, ids, shared, (p) => `${p}_${seed}${n++ || ''}`);
    if ('error' in r) return { error: `Nothing was deleted: ${r.error}` };
    if (r.print !== expected) return changedSince;
    return { ws: r.ws, changed: r.lines.map((l) => `Deleted ${l}`) };
  };
}
