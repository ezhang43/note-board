import { addCard, deleteCard, updateCard } from './board';
import { createItem, newId, type MakeId } from './cards';
import type { Board, TodoCard, TodoItem } from './types';

// Checklist rules. Every function returns new data and never changes what it is given.
// Items form a tree up to 6 levels deep (depth 0 to 5). A ticked item stays where it is (owner
// request, 2026-10-23, job 200) until Clean up moves it into the board's Completed panel.

/** Deepest level an item can be at (0 = top level), so 6 levels in all. */
export const MAX_DEPTH = 5;

/** A list always has something to type in: an emptied list gets one blank item. */
export function refill(items: TodoItem[], makeId: MakeId = newId): TodoItem[] {
  return items.length ? items : [createItem(makeId('i'))];
}

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
function lastVisible(item: TodoItem): TodoItem {
  return item.children.length ? lastVisible(item.children[item.children.length - 1]) : item;
}

export function flatIds(items: TodoItem[]): string[] {
  return items.flatMap(subtreeIds);
}

/** True if any item, at any level, is ticked. */
export function hasTicked(items: TodoItem[]): boolean {
  return items.some((it) => it.done || hasTicked(it.children));
}

/**
 * Ctrl+Enter (owner request, 2026-10-15): after `id` is ticked (`before` → `after`), the open item
 * the cursor moves to: the nearest one that was below it, else the nearest above, else null.
 */
export function nextOpenItem(before: TodoItem[], after: TodoItem[], id: string): string | null {
  const stillOpen = new Set(flatIds(after).filter((x) => !findItem(after, x)!.item.done));
  const order = flatIds(before);
  const i = order.indexOf(id);
  return [...order.slice(i + 1), ...order.slice(0, Math.max(i, 0)).reverse()].find((x) => stillOpen.has(x)) ?? null;
}

/** Items shown from `a` to `b` inclusive (either way round), ticked ones included. */
export function itemRange(items: TodoItem[], a: string, b: string): string[] {
  const order = flatIds(items);
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
  return flatIds(items).filter((id) => picked.has(id) && !covered.has(id));
}

function cloned(items: TodoItem[]): TodoItem[] {
  return structuredClone(items);
}

/**
 * Enter in an item, like a text editor (owner request). `start`–`end` is the cursor or selection in
 * its text (a selection is removed first). `blank` is the new item to add.
 * - At the start of an item with text: `blank` goes right above it; the cursor stays with the text.
 * - Anywhere else: the text after the cursor moves into `blank` (one space at the split is dropped),
 *   directly below: as the item's first
 *   sub-item when it has sub-items (they stay where they are), otherwise right after it. A split
 *   ticked item stays ticked in both halves; an empty new item is never ticked.
 * Returns the new items and where the cursor goes (item id and offset).
 */
export function enterItem(
  items: TodoItem[],
  id: string,
  start: number,
  end: number,
  blank: TodoItem,
): { items: TodoItem[]; focus: string; offset: number } | null {
  const next = cloned(items);
  const loc = findItem(next, id);
  if (!loc) return null;
  const text = loc.item.text;
  const after = text.slice(end);
  // The new item looks like the one it came from (text formatting, owner request).
  if (loc.item.style) blank = { ...blank, style: loc.item.style };
  if (start === 0 && after !== '') {
    loc.item.text = after;
    loc.list.splice(loc.index, 0, blank);
    return { items: next, focus: id, offset: 0 };
  }
  let before = text.slice(0, start);
  let rest = after;
  // Splitting at a word gap: the gap's space is dropped, rather than starting the new item with it.
  if (rest.startsWith(' ')) rest = rest.slice(1);
  else if (rest && before.endsWith(' ')) before = before.slice(0, -1);
  loc.item.text = before;
  const added = { ...blank, text: rest, done: after !== '' && loc.item.done };
  if (loc.item.children.length) loc.item.children.unshift(added);
  else loc.list.splice(loc.index + 1, 0, added);
  return { items: next, focus: added.id, offset: 0 };
}

/**
 * Tab: nest an item (and its sub-items) under the item above it at the same level.
 * Nothing happens if there is no item above or the result would be more than 6 levels deep.
 */
export function indentItem(items: TodoItem[], id: string): TodoItem[] | null {
  const next = cloned(items);
  return indentIn(next, id) ? next : null;
}

/** Nests the item in place (`items` must be a copy). False if it can't move. */
function indentIn(items: TodoItem[], id: string): boolean {
  const loc = findItem(items, id);
  if (!loc || loc.depth + 1 + subtreeHeight(loc.item) > MAX_DEPTH) return false;
  const above = loc.list[loc.index - 1];
  if (!above) return false;
  loc.list.splice(loc.index, 1);
  above.children.push(loc.item);
  reopenAbove(items, loc.item);
  return true;
}

/** Shift+Tab: move an item out one level, to just after the item it was nested under. */
export function outdentItem(items: TodoItem[], id: string): TodoItem[] | null {
  const next = cloned(items);
  return outdentIn(next, id) ? next : null;
}

/** Moves the item out in place (`items` must be a copy). False if it can't move. */
function outdentIn(items: TodoItem[], id: string): boolean {
  const loc = findItem(items, id);
  if (!loc || !loc.parent) return false;
  const parentLoc = findItem(items, loc.parent.id)!;
  loc.list.splice(loc.index, 1);
  parentLoc.list.splice(parentLoc.index + 1, 0, loc.item);
  return true;
}

/**
 * Tab with several items selected: every selected item (with its sub-items) moves in one level,
 * each as Tab would move it. One that can't (e.g. the first item of a list, with nothing above it)
 * stays, and the ones after it nest under it. Null if none of them can move.
 * The list is copied once, then changed in place (a copy per item made 1,000 items take seconds).
 */
export function indentItems(items: TodoItem[], ids: string[]): TodoItem[] | null {
  const next = cloned(items);
  let moved = false;
  for (const id of rootsOf(items, ids)) moved = indentIn(next, id) || moved;
  return moved ? next : null;
}

/** Shift+Tab with several items selected: every selected item that can moves out one level. */
export function outdentItems(items: TodoItem[], ids: string[]): TodoItem[] | null {
  const next = cloned(items);
  let moved = false;
  // Bottom one first, so items that end up side by side keep their order.
  for (const id of rootsOf(items, ids).reverse()) moved = outdentIn(next, id) || moved;
  return moved ? next : null;
}

/**
 * Delete at the very end of an item: the item shown below it is pulled up into it. Its text is added
 * to the end of this item's text, and its sub-items move up one level into its place (as when a
 * blank item is deleted). Nothing happens at the end of the list. Returns the new items and where
 * the cursor goes (the join point).
 */
export function mergeNextItem(items: TodoItem[], id: string): { items: TodoItem[]; caret: number } | null {
  const order = flatIds(items);
  const at = order.indexOf(id);
  const nextId = at < 0 ? undefined : order[at + 1];
  if (!nextId) return null;
  const next = cloned(items);
  const cur = findItem(next, id)!.item;
  const below = findItem(next, nextId)!;
  const caret = cur.text.length;
  cur.text += below.item.text;
  // Ticked only if both were (job 200: they can now be side by side), and never open under a ticked item (job 183).
  cur.done = cur.done && below.item.done;
  below.list.splice(below.index, 1, ...below.item.children);
  for (const it of [cur, ...below.item.children]) reopenAbove(next, it);
  return { items: next, caret };
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
 * Never empties the list: a list's last item, or its last open one, can't be deleted this way (the
 * cursor always has an open item to go to).
 */
export function removeEmptyItem(items: TodoItem[], id: string): { items: TodoItem[]; focus: string | null } | null {
  const loc = findItem(items, id);
  if (!loc || loc.item.text !== '') return null;
  const next = cloned(items);
  removeItemInPlace(next, id);
  if (!next.some((it) => !it.done)) return null;
  return { items: next, focus: focusAfterRemoving(flatIds(items), next, [id]) };
}

/**
 * Where the cursor goes after `gone` were removed: the nearest item above the first of them that is
 * still there, else the nearest one below. Only items in `shown` (the ids on screen, top to bottom,
 * before the change) count, so the cursor never lands in a collapsed card. A list emptied
 * by the delete has a new blank item, which takes the cursor.
 */
export function focusAfterRemoving(shown: string[], after: TodoItem[], gone: string[]): string | null {
  const left = new Set(flatIds(after));
  const at = shown.findIndex((x) => gone.includes(x));
  if (at < 0) return null; // nothing that was on screen went
  return (
    shown.slice(0, at).reverse().find((x) => left.has(x)) ??
    shown.slice(at + 1).find((x) => left.has(x)) ??
    flatIds(after).find((x) => !shown.includes(x) && findItem(after, x)!.item.text === '' && !findItem(after, x)!.item.done) ??
    null
  );
}

/**
 * Deletes items and everything nested under them (except that a blank item's sub-items with text
 * are kept, moving up a level; pass keepChildren = false to remove them too, e.g. when cutting).
 * An emptied list gets one blank item.
 */
export function deleteItems(items: TodoItem[], ids: string[], makeId: MakeId = newId, keepChildren = true): TodoItem[] {
  const next = cloned(items);
  for (const id of ids) removeItemInPlace(next, id, keepChildren);
  return refill(next, makeId);
}

/** The items an item is nested in, outermost first. */
function ancestorsOf(items: TodoItem[], id: string): TodoItem[] {
  for (const it of items) {
    if (it.id === id) return [];
    const inner = ancestorsOf(it.children, id);
    if (inner.length || it.children.some((c) => c.id === id)) return [it, ...inner];
  }
  return [];
}

/**
 * An open item can't sit under a ticked one (Clean up would sweep it away unticked): in a copy of the
 * list, untick the items an open `item` is nested in (owner decision, 2026-10-22, job 183).
 */
function reopenAbove(items: TodoItem[], item: TodoItem): void {
  if (!item.done) for (const a of ancestorsOf(items, item.id)) a.done = false;
}

/**
 * Tick or untick items; they stay where they are. Owner's rule: when ticking leaves every sub-item of
 * an item ticked, that item is ticked too (and so on upwards). Unticking a sub-item unticks the items
 * it is nested in.
 */
export function setItemsDone(items: TodoItem[], ids: string[], done: boolean): TodoItem[] {
  const next = cloned(items);
  for (const id of ids) {
    const loc = findItem(next, id);
    if (loc) loc.item.done = done;
  }
  for (const id of ids) {
    const above = ancestorsOf(next, id).reverse(); // innermost first
    for (const it of above) {
      if (!done) it.done = false;
      else if (it.children.every((c) => c.done)) it.done = true;
      else break;
    }
  }
  return next;
}

/**
 * Copies of exactly the selected items, for the clipboard: each keeps only the sub-items that are
 * selected too (sub-items that weren't highlighted are left out).
 */
export function copyItems(items: TodoItem[], ids: string[]): TodoItem[] {
  const picked = new Set(ids);
  const keep = (it: TodoItem): TodoItem => ({ ...structuredClone(it), children: it.children.filter((c) => picked.has(c.id)).map(keep) });
  return rootsOf(items, ids).map((id) => keep(findItem(items, id)!.item));
}

/**
 * Cut: removes exactly the selected items. A sub-item that wasn't selected stays, moving up into
 * the place of the removed item it was under. An emptied list gets one blank item.
 */
export function removeExactly(items: TodoItem[], ids: string[], makeId: MakeId = newId): TodoItem[] {
  const picked = new Set(ids);
  const prune = (list: TodoItem[]): TodoItem[] =>
    list.flatMap((it) => (picked.has(it.id) ? prune(it.children) : [{ ...it, children: prune(it.children) }]));
  return refill(prune(items), makeId);
}

/**
 * The selected items as plain text for other apps, exactly as highlighted: one per line in the
 * order shown, indented two spaces per level below the least-indented selected item.
 */
export function selectionAsText(items: TodoItem[], ids: string[]): string {
  const picked = new Set(ids);
  const rows = flatIds(items)
    .filter((id) => picked.has(id))
    .map((id) => findItem(items, id)!);
  const top = Math.min(...rows.map((r) => r.depth));
  return rows.map((r) => '  '.repeat(r.depth - top) + r.item.text).join('\n');
}

/** Copies with brand-new ids throughout, ready to paste. */
export function freshCopies(items: TodoItem[], makeId: MakeId = newId): TodoItem[] {
  return items.map((it) => ({ ...it, id: makeId('i'), children: freshCopies(it.children, makeId) }));
}

/**
 * Pastes items right after `afterId` (at its level), or at the end if it isn't found. If that would
 * go past 6 levels, they go after the nearest item above `afterId` that leaves room.
 */
export function pasteItemsAfter(items: TodoItem[], afterId: string, pasted: TodoItem[]): TodoItem[] {
  const next = cloned(items);
  const height = pasted.reduce((h, p) => Math.max(h, subtreeHeight(p)), 0);
  let loc = findItem(next, afterId);
  while (loc && loc.depth + height > MAX_DEPTH) loc = loc.parent && findItem(next, loc.parent.id);
  if (loc) loc.list.splice(loc.index + 1, 0, ...structuredClone(pasted));
  else next.push(...structuredClone(pasted));
  return next;
}

/** Where dragged items go in a list: before / after / nested under an item, or at the end. */
export type ItemDrop = { mode: 'before' | 'after' | 'nest'; targetId: string } | { mode: 'append' };

/** How far each level of sub-items is indented (board pixels). */
export const ITEM_INDENT = 22;
/** Dropping this far right of a row's own indent (board pixels) nests under it. */
export const NEST_ZONE = 56;

/**
 * Where dragged items go when dropped on a row: before it (top half), after it (bottom half), or
 * nested under it (bottom half, far enough right). `xInRow` is how far right of the row's left edge
 * the pointer is. The teal mark shows where they will go: after an item with sub-items, under its
 * last sub-item. Null (dropping does nothing) over the dragged items themselves, or past 6 levels.
 */
export function dropOnRow(
  items: TodoItem[],
  targetId: string,
  at: { xInRow: number; lowerHalf: boolean },
  dragged: { ids: string[]; height: number },
): { drop: ItemDrop; markId: string; markMode: 'before' | 'after' | 'nest' } | null {
  if (dragged.ids.includes(targetId)) return null;
  const t = findItem(items, targetId);
  if (!t) return null;
  const inNestZone = at.xInRow > t.depth * ITEM_INDENT + NEST_ZONE;
  if (at.lowerHalf && inNestZone && t.depth + 1 + dragged.height <= MAX_DEPTH) {
    return { drop: { mode: 'nest', targetId }, markId: targetId, markMode: 'nest' };
  }
  if (t.depth + dragged.height > MAX_DEPTH) return null;
  const mode = at.lowerHalf ? 'after' : 'before';
  const markId = at.lowerHalf && t.item.children.length ? lastVisible(t.item).id : targetId;
  return { drop: { mode, targetId }, markId, markMode: mode };
}

/**
 * Phone press-and-hold: the row that must move down to open the gap where lifted items would go.
 * `order` is the list's rows as shown. A "before" mark opens it before that row; "after" and "nest"
 * (nested items go first under their parent) open it before the next row not being lifted. Null: at the end.
 */
export function gapBefore(
  order: string[],
  mark: { markId: string; markMode: 'before' | 'after' | 'nest' },
  lifted: string[],
): string | null {
  if (mark.markMode === 'before') return mark.markId;
  return order.slice(order.indexOf(mark.markId) + 1).find((id) => !lifted.includes(id)) ?? null;
}

/**
 * How far (px, up is negative) each row slides while items are lifted: up to close the space of
 * lifted rows (`lifted`: row id -> height) above it, down by `gap` to open the space before `before`.
 * Lifted rows themselves are not moved (they are hidden). Rows that stay put have no entry.
 */
export function slideOffsets(order: string[], lifted: Record<string, number>, before: string | null, gap: number): Record<string, number> {
  const slide: Record<string, number> = {};
  let closed = 0;
  let opened = 0;
  for (const id of order) {
    if (id in lifted) closed += lifted[id];
    else {
      if (id === before) opened = gap;
      if (opened !== closed) slide[id] = opened - closed;
    }
  }
  return slide;
}

/**
 * Ctrl+Shift+Up / Down: move an item (with its sub-items) past the item above (`dir` -1) or below
 * (1) at the same level, ticked or not. Null when there is nothing to pass.
 */
export function moveItemBy(items: TodoItem[], id: string, dir: -1 | 1): TodoItem[] | null {
  const next = cloned(items);
  const loc = findItem(next, id);
  const j = loc && passTarget(loc, dir);
  if (!loc || j === null) return null;
  const { list, index, item } = loc;
  const passed = list[j];
  list.splice(index, 1);
  const k = list.indexOf(passed);
  list.splice(dir < 0 ? k : k + 1, 0, item);
  return next;
}

/** Whether `moveItemBy` would move the item: the hover arrows fade when it would not. */
export function canMoveItem(items: TodoItem[], id: string, dir: -1 | 1): boolean {
  const loc = findItem(items, id);
  return !!loc && passTarget(loc, dir) !== null;
}

/** The index of the neighbour an item would pass, or null. */
function passTarget({ list, index }: ItemLocation, dir: -1 | 1): number | null {
  const j = index + dir;
  return j < 0 || j >= list.length ? null : j;
}

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
  for (const m of moving) reopenAbove(next, m);
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

/**
 * Where dragged items are dropped: into a list, or as a new list: loose on the board, or at the end
 * of a column (items dropped on a collapsed column).
 */
export type ItemDestination = { cardId: string; drop: ItemDrop } | { newList: { id: string; x: number; y: number; columnId?: string } };

/**
 * Moves items (with their sub-items) from one list to a drop position, possibly in another list,
 * or as a new untitled list in the source list's colour. A list emptied this way is removed, title
 * or not (owner request, 2026-10-06). Returns the same board if the move isn't allowed.
 */
export function moveItems(board: Board, fromCardId: string, rootIds: string[], to: ItemDestination): Board {
  const src = board.cards[fromCardId];
  if (!src || src.kind !== 'todo') return board;
  const { rest, moving } = extractItems(src.items, rootIds);
  if (!moving.length) return board;
  if ('cardId' in to && to.cardId === fromCardId) {
    const items = insertItems(rest, to.drop, moving);
    return items ? editItems(board, fromCardId, () => items) : board;
  }
  const leftBehind = (b: Board) => (rest.length ? editItems(b, fromCardId, () => rest) : deleteCard(b, fromCardId));

  if ('newList' in to) {
    const { id, x, y, columnId } = to.newList;
    if (columnId && !board.columns[columnId]) return board; // the column went meanwhile: nothing moves
    const card: TodoCard = { id, kind: 'todo', color: src.color, collapsed: false, x, y, w: null, h: null, title: '', items: moving, completedOpen: true };
    // Into a column: at its end (addCard opens a collapsed column, as dropping a card into one does).
    const place = columnId ? { type: 'column' as const, columnId, index: Infinity } : { type: 'loose' as const, x, y };
    return addCard(leftBehind(board), card, place);
  }

  const dst = board.cards[to.cardId];
  if (!dst || dst.kind !== 'todo') return board;
  const items = insertItems(dst.items, to.drop, moving);
  if (!items) return board;
  return leftBehind(editItems(board, to.cardId, () => items));
}

/**
 * A whole list dropped onto another (owner request, 2026-10-06): its items, with their sub-items and
 * ticks, go to the end of the target in their own order,
 * leaving out blank items; the dropped list and its title are gone. Only between two checklists.
 */
export function pourList(board: Board, fromCardId: string, toCardId: string): Board {
  const src = board.cards[fromCardId];
  const dst = board.cards[toCardId];
  if (fromCardId === toCardId || src?.kind !== 'todo' || dst?.kind !== 'todo') return board;
  const moving = src.items.filter((it) => !isBlank(it) || anyText(it.children));
  return deleteCard(editItems(board, toCardId, (items) => [...items, ...structuredClone(moving)]), fromCardId);
}
