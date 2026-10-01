import { addCard, updateCard } from './board';
import { createItem, newId } from './cards';
import type { Board, TodoCard, TodoItem } from './types';

// Checklist rules. Every function returns new data and never changes what it is given.
// Items form a tree up to 6 levels deep (depth 0 to 5). Finished top-level items are shown in the
// "Completed" section, but they stay in the same list: the section is just a view of them.

/** Deepest level an item can be at (0 = top level), so 6 levels in all. */
export const MAX_DEPTH = 5;

type MakeId = (prefix: string) => string;

export interface ItemLocation {
  /** The list the item is in (the card's items, or its parent's children). */
  list: TodoItem[];
  index: number;
  parent: TodoItem | null;
  item: TodoItem;
  depth: number;
}

export function findItem(items: TodoItem[], id: string, parent: TodoItem | null = null, depth = 0): ItemLocation | null {
  for (let i = 0; i < items.length; i++) {
    if (items[i].id === id) return { list: items, index: i, parent, item: items[i], depth };
    const inner = findItem(items[i].children, id, items[i], depth + 1);
    if (inner) return inner;
  }
  return null;
}

/** The item and everything nested under it, top to bottom. */
export function subtreeIds(item: TodoItem): string[] {
  return [item.id, ...item.children.flatMap(subtreeIds)];
}

/** How many levels are nested under an item (0 = none). */
export function subtreeHeight(item: TodoItem): number {
  return item.children.reduce((h, c) => Math.max(h, 1 + subtreeHeight(c)), 0);
}

/** The bottom-most item shown under (or as) this item. */
export function lastVisible(item: TodoItem): TodoItem {
  return item.children.length ? lastVisible(item.children[item.children.length - 1]) : item;
}

export function flatIds(items: TodoItem[]): string[] {
  return items.flatMap(subtreeIds);
}

/** Top-level items split into the open list and the Completed section. */
export function sections(items: TodoItem[]) {
  return { open: items.filter((it) => !it.done), done: items.filter((it) => it.done) };
}

/** Every item in the order shown: open items, then the Completed section. */
export function displayOrder(items: TodoItem[]): string[] {
  const { open, done } = sections(items);
  return [...flatIds(open), ...flatIds(done)];
}

/** Items currently on screen, top to bottom: completed ones only while the Completed section is open. */
export function visibleOrder(items: TodoItem[], completedOpen: boolean): string[] {
  const { open, done } = sections(items);
  return [...flatIds(open), ...(completedOpen ? flatIds(done) : [])];
}

/** The item on screen just above (step -1) or below (step 1) this one, or null at the top / bottom. */
export function neighbourItem(items: TodoItem[], completedOpen: boolean, id: string, step: -1 | 1): string | null {
  const order = visibleOrder(items, completedOpen);
  const at = order.indexOf(id);
  return at === -1 ? null : (order[at + step] ?? null);
}

/** Items shown from `a` to `b` inclusive (either way round), across open and completed items. */
export function itemRange(items: TodoItem[], a: string, b: string): string[] {
  const order = displayOrder(items);
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  if (i === -1 || j === -1) return [];
  return order.slice(Math.min(i, j), Math.max(i, j) + 1);
}

/** The selected items that are not inside another selected item, in the order shown. */
export function rootsOf(items: TodoItem[], ids: string[]): string[] {
  const picked = new Set(ids);
  const covered = new Set<string>();
  for (const id of ids) {
    const loc = findItem(items, id);
    if (loc) loc.item.children.flatMap(subtreeIds).forEach((c) => covered.add(c));
  }
  return displayOrder(items).filter((id) => picked.has(id) && !covered.has(id));
}

function cloned(items: TodoItem[]): TodoItem[] {
  return structuredClone(items);
}

/** Enter: a new item right after this one, at the same level. */
export function addItemAfter(items: TodoItem[], afterId: string, item: TodoItem): TodoItem[] | null {
  const next = cloned(items);
  const loc = findItem(next, afterId);
  if (!loc) return null;
  loc.list.splice(loc.index + 1, 0, item);
  return next;
}

/**
 * Tab: nest an item (and its sub-items) under the item above it at the same level.
 * A top-level item only nests under one in the same section (open or completed).
 * Nothing happens if there is no item above or the result would be more than 6 levels deep.
 */
export function indentItem(items: TodoItem[], id: string): TodoItem[] | null {
  const next = cloned(items);
  const loc = findItem(next, id);
  if (!loc || loc.depth + 1 + subtreeHeight(loc.item) > MAX_DEPTH) return null;
  let above: TodoItem | null = null;
  for (let i = loc.index - 1; i >= 0; i--) {
    if (loc.parent || loc.list[i].done === loc.item.done) {
      above = loc.list[i];
      break;
    }
  }
  if (!above) return null;
  loc.list.splice(loc.index, 1);
  above.children.push(loc.item);
  return next;
}

/** Shift+Tab: move an item out one level, to just after the item it was nested under. */
export function outdentItem(items: TodoItem[], id: string): TodoItem[] | null {
  const next = cloned(items);
  const loc = findItem(next, id);
  if (!loc || !loc.parent) return null;
  const parentLoc = findItem(next, loc.parent.id)!;
  loc.list.splice(loc.index, 1);
  parentLoc.list.splice(parentLoc.index + 1, 0, loc.item);
  return next;
}

const isBlank = (it: TodoItem) => it.text.trim() === '';

/** True if any of these items, or anything nested under them, has text. */
function anyText(items: TodoItem[]): boolean {
  return items.some((it) => !isBlank(it) || anyText(it.children));
}

/**
 * Removes one item from a (cloned) list, in place. Normally its sub-items go with it; but when the
 * item itself is blank and something under it has text, its sub-items are kept and move up one
 * level into its place (owner's rule), unless `keepChildren` is false.
 */
function removeItemInPlace(items: TodoItem[], id: string, keepChildren = true) {
  const loc = findItem(items, id);
  if (!loc) return;
  const promote = keepChildren && isBlank(loc.item) && anyText(loc.item.children);
  loc.list.splice(loc.index, 1, ...(promote ? loc.item.children : []));
}

/**
 * Backspace in an empty item deletes it, and the cursor goes to the item shown above it.
 * Its sub-items stay (moving up a level) if any of them has text; otherwise they go too.
 * Never empties the list: a list's last item can't be deleted this way.
 */
export function removeEmptyItem(items: TodoItem[], id: string): { items: TodoItem[]; focus: string | null } | null {
  const loc = findItem(items, id);
  if (!loc || loc.item.text !== '') return null;
  const next = cloned(items);
  removeItemInPlace(next, id);
  if (!next.length) return null;
  const order = displayOrder(items);
  const at = order.indexOf(id);
  const left = new Set(flatIds(next));
  // The nearest item above that is still there; failing that, the nearest one below.
  const focus = order.slice(0, at).reverse().find((x) => left.has(x)) ?? order.slice(at + 1).find((x) => left.has(x)) ?? null;
  return { items: next, focus };
}

/**
 * Deletes items and everything nested under them (except that a blank item's sub-items with text
 * are kept, moving up a level; pass keepChildren = false to remove them too, e.g. when cutting).
 * An emptied list gets one blank item.
 */
export function deleteItems(items: TodoItem[], ids: string[], makeId: MakeId = newId, keepChildren = true): TodoItem[] {
  const next = cloned(items);
  for (const id of ids) removeItemInPlace(next, id, keepChildren);
  return next.length ? next : [createItem(makeId('i'))];
}

/** Tick or untick items. A ticked top-level item moves (with its sub-items) to the Completed section. */
export function setItemsDone(items: TodoItem[], ids: string[], done: boolean): TodoItem[] {
  const next = cloned(items);
  for (const id of ids) {
    const loc = findItem(next, id);
    if (loc) loc.item.done = done;
  }
  return next;
}

/** Copies of the selected items (with their sub-items), for the clipboard. */
export function copyItems(items: TodoItem[], ids: string[]): TodoItem[] {
  return rootsOf(items, ids).map((id) => structuredClone(findItem(items, id)!.item));
}

/** Copies with brand-new ids throughout, ready to paste. */
export function freshCopies(items: TodoItem[], makeId: MakeId = newId): TodoItem[] {
  return items.map((it) => ({ ...it, id: makeId('i'), children: freshCopies(it.children, makeId) }));
}

/** Pastes items right after `afterId` (at its level), or at the end if it isn't found. */
export function pasteItemsAfter(items: TodoItem[], afterId: string, pasted: TodoItem[]): TodoItem[] {
  const next = cloned(items);
  const loc = findItem(next, afterId);
  if (loc) loc.list.splice(loc.index + 1, 0, ...structuredClone(pasted));
  else next.push(...structuredClone(pasted));
  return next;
}

/** Where dragged items go in a list: before / after / nested under an item, or at the end. */
export type ItemDrop = { mode: 'before' | 'after' | 'nest'; targetId: string } | { mode: 'append' };

/** Take items (with their sub-items) out of a list. */
export function extractItems(items: TodoItem[], rootIds: string[]): { rest: TodoItem[]; moving: TodoItem[] } {
  const rest = cloned(items);
  const moving: TodoItem[] = [];
  for (const id of rootIds) {
    const loc = findItem(rest, id);
    if (!loc) continue;
    loc.list.splice(loc.index, 1);
    moving.push(loc.item);
  }
  return { rest, moving };
}

/** Put items into a list at a drop position. Null if that would break the 6-level limit or the target is gone. */
export function insertItems(items: TodoItem[], drop: ItemDrop, moving: TodoItem[]): TodoItem[] | null {
  const next = cloned(items);
  const height = moving.reduce((h, m) => Math.max(h, subtreeHeight(m)), 0);
  if (drop.mode === 'append') {
    next.push(...moving);
    return next;
  }
  const t = findItem(next, drop.targetId);
  if (!t) return null;
  if (drop.mode === 'nest') {
    if (t.depth + 1 + height > MAX_DEPTH) return null;
    t.item.children.unshift(...moving);
  } else {
    if (t.depth + height > MAX_DEPTH) return null;
    t.list.splice(t.index + (drop.mode === 'after' ? 1 : 0), 0, ...moving);
  }
  return next;
}

// ---------- on the board ----------

/** Change one to-do list's items. `change` returns null when nothing should happen. */
export function editItems(board: Board, cardId: string, change: (items: TodoItem[]) => TodoItem[] | null): Board {
  return updateCard(board, cardId, (card) => {
    if (card.kind !== 'todo') return card;
    const items = change(card.items);
    return items ? { ...card, items } : card;
  });
}

export function toggleCompletedSection(board: Board, cardId: string): Board {
  return updateCard(board, cardId, (c) => (c.kind === 'todo' ? { ...c, completedOpen: !c.completedOpen } : c));
}

/** Where dragged items are dropped: into a list, or onto the board as a new list. */
export type ItemDestination = { cardId: string; drop: ItemDrop } | { newList: { id: string; x: number; y: number } };

/**
 * Moves items (with their sub-items) from one list to a drop position, possibly in another list,
 * or onto empty board as a new "New list" in the source list's colour. A list left empty gets one
 * blank item. Returns the same board if the move isn't allowed.
 */
export function moveItems(board: Board, fromCardId: string, rootIds: string[], to: ItemDestination, makeId: MakeId = newId): Board {
  const src = board.cards[fromCardId];
  if (!src || src.kind !== 'todo') return board;
  const { rest, moving } = extractItems(src.items, rootIds);
  if (!moving.length) return board;
  const refill = (list: TodoItem[]) => (list.length ? list : [createItem(makeId('i'))]);

  if ('newList' in to) {
    const card: TodoCard = {
      id: to.newList.id,
      kind: 'todo',
      color: src.color,
      collapsed: false,
      x: to.newList.x,
      y: to.newList.y,
      w: null,
      h: null,
      title: 'New list',
      items: moving,
      completedOpen: true,
    };
    const b = editItems(board, fromCardId, () => refill(rest));
    return addCard(b, card, { type: 'loose', x: card.x, y: card.y });
  }

  if (to.cardId === fromCardId) {
    const items = insertItems(rest, to.drop, moving);
    return items ? editItems(board, fromCardId, () => items) : board;
  }
  const dst = board.cards[to.cardId];
  if (!dst || dst.kind !== 'todo') return board;
  const items = insertItems(dst.items, to.drop, moving);
  if (!items) return board;
  return editItems(editItems(board, fromCardId, () => refill(rest)), to.cardId, () => items);
}
