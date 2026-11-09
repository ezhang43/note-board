import { newId } from './cards';
import { copyItems, findItem, isFolded, MAX_DEPTH, removeExactly, reopenAbove, selectionAsText, shownIds } from './checklist';
import type { TodoItem } from './types';

// Word-style highlights across a list's items (owner request, 2026-11-01: "It should work like a word
// document editor"). A highlight runs from a letter in one item to a letter in another, in the order the
// items are shown, as if the list were one long text with a line break after every item. A folded item's
// hidden sub-items are not rows of that text: they go with their folded item (removeExactly takes them). Pure: every
// function returns new data and never changes what it is given.

/** A spot in a list's text: just before letter `offset` of item `id` (its text's length = after its last letter). */
export interface ItemPoint {
  id: string;
  offset: number;
}

/** A highlight: where it was started (`anchor`, which stays put) and where it reaches now (`focus`). */
export interface WordRange {
  anchor: ItemPoint;
  focus: ItemPoint;
}

/** The two ends in the order shown (start before end), or null if either item is gone. */
export function ordered(items: TodoItem[], r: WordRange): { start: ItemPoint; end: ItemPoint } | null {
  const order = shownIds(items);
  const a = order.indexOf(r.anchor.id);
  const f = order.indexOf(r.focus.id);
  if (a < 0 || f < 0) return null;
  const anchorFirst = a < f || (a === f && r.anchor.offset <= r.focus.offset);
  const [start, end] = anchorFirst ? [r.anchor, r.focus] : [r.focus, r.anchor];
  // An offset past the end (the text changed under it) is read as the end.
  const clamp = (p: ItemPoint) => ({ id: p.id, offset: Math.max(0, Math.min(p.offset, findItem(items, p.id)!.item.text.length)) });
  return { start: clamp(start), end: clamp(end) };
}

/**
 * The items the highlight touches, as shown: from its first item to its last. An end at the very start
 * of a later item leaves that item out, and so does a start at the very end of an earlier (non-empty) one,
 * as nothing of it is highlighted (only the line break). Ticking, the trash, dragging by the grip and Tab
 * act on these. Only a line break highlighted touches none (the store then selects the first of the two).
 */
export function touchedIds(items: TodoItem[], r: WordRange): string[] {
  const o = ordered(items, r);
  if (!o) return [];
  const order = shownIds(items);
  const i = order.indexOf(o.start.id);
  const j = order.indexOf(o.end.id);
  if (i === j) return [o.start.id];
  // An empty first item is not "at its end": the highlight starts at its letter 0, so it goes whole (deleteRange).
  const fromEnd = o.start.offset > 0 && o.start.offset === findItem(items, o.start.id)!.item.text.length;
  return order.slice(fromEnd ? i + 1 : i, o.end.offset === 0 ? j : j + 1);
}

/** Nothing is highlighted: its two ends meet. */
export function isEmpty(items: TodoItem[], r: WordRange): boolean {
  const o = ordered(items, r);
  return !!o && o.start.id === o.end.id && o.start.offset === o.end.offset;
}

/**
 * Which letters of item `id` are highlighted: [from, to, and whether the highlight goes on past its end
 * (the line break after it)], or null when none of it is.
 */
export function marksOf(items: TodoItem[], r: WordRange, id: string): [number, number, boolean] | null {
  const o = ordered(items, r);
  if (!o) return null;
  const order = shownIds(items);
  const i = order.indexOf(o.start.id);
  const j = order.indexOf(o.end.id);
  const k = order.indexOf(id);
  if (k < i || k > j || k < 0) return null;
  const len = findItem(items, id)!.item.text.length;
  return [k === i ? o.start.offset : 0, k === j ? o.end.offset : len, k < j];
}

/**
 * Deletes the highlighted words, like a word processor (Delete, Backspace, cut; `insert` is a typed
 * letter that replaces them). No letter outside the highlight is lost. Like Backspace and Delete at an
 * item's edge (owner decision 2026-11-02):
 * - Normally what is left of the first and last items is joined into the first one, which keeps its id,
 *   level and look, and stays ticked only if both were (as Delete at the end of an item, job 200; a last
 *   item highlighted to its very end goes whole, so its tick doesn't count). The
 *   items between go, and so does the last one; the last item's sub-items move up under the joined item.
 * - A highlight from letter 0 of its first item removes the items before the last one whole; the last
 *   item stays, with its own id, tick, level, look and sub-items, keeping its text after the highlight
 *   (or the typed letter). When none of its text is left and nothing is typed it goes whole too.
 * Any other sub-item that comes after the highlight but whose parent went moves up into its parent's
 * place (as cut does). Returns the new items, where the cursor goes and how many items went whole (for
 * the Undo message), or null when the range no longer fits the list.
 */
export function deleteRange(items: TodoItem[], r: WordRange, insert = ''): { items: TodoItem[]; focus: ItemPoint; removed: number } | null {
  const o = ordered(items, r);
  if (!o) return null;
  const order = shownIds(items);
  const i = order.indexOf(o.start.id);
  const j = order.indexOf(o.end.id);
  const next = structuredClone(items);
  const first = findItem(next, o.start.id)!.item;
  const last = findItem(next, o.end.id)!.item;
  const tail = last.text.slice(o.end.offset);
  if (i === j) {
    first.text = first.text.slice(0, o.start.offset) + insert + tail;
    return { items: next, focus: { id: first.id, offset: o.start.offset + insert.length }, removed: 0 };
  }
  if (o.start.offset === 0) {
    // The earlier items go whole; the last one stays as it was, less its highlighted letters. With none of its text
    // left and nothing typed it goes too, as in the other case below (owner call 2026-11-02); its sub-items move up.
    const lastGoes = !insert && !tail;
    if (!lastGoes) last.text = insert + tail;
    // A folded last item's hidden sub-items move up like its shown ones would.
    const kept = removeExactly(next, order.slice(i, lastGoes ? j + 1 : j), newId, [last.id]);
    const removed = j - i + (lastGoes ? 1 : 0);
    if (!lastGoes) return { items: kept, focus: { id: last.id, offset: insert.length }, removed };
    // The cursor goes where the words were: the start of the next item, else the end of the one before (or the blank one left).
    const left = new Set(shownIds(kept));
    const after = order.slice(j + 1).find((id) => left.has(id));
    const before = order.slice(0, i).reverse().find((id) => left.has(id));
    const id = after ?? before ?? shownIds(kept)[0];
    return { items: kept, focus: { id, offset: after || !before ? 0 : findItem(kept, id)!.item.text.length }, removed };
  }

  first.text = first.text.slice(0, o.start.offset) + insert + tail;
  // Ticked only if both were, when the last item's text joins on; a last item highlighted to its end goes whole.
  if (tail) first.done = first.done && last.done;
  const kids = last.children;
  last.children = [];
  // A folded first item keeps its hidden sub-items (they come before the last item's in the list).
  const firstFolded = isFolded(first);
  const kept = removeExactly(next, order.slice(i + 1, j + 1));
  const joined = findItem(kept, first.id)!;
  if (joined.depth < MAX_DEPTH) {
    if (firstFolded) joined.item.children.push(...kids);
    else joined.item.children.unshift(...kids);
    if (kids.length) delete joined.item.folded; // the sub-items it takes over stay in sight
    fitDepth(joined.item.children, joined.depth + 1);
  } else {
    // The joined item is as deep as items go: its new sub-items sit right after it instead.
    joined.list.splice(joined.index + 1, 0, ...kids);
    fitDepth(joined.list, joined.depth);
  }
  // Never open under a ticked item (job 183).
  for (const it of [joined.item, ...kids]) reopenAbove(kept, it);
  // The last item went whole too when none of its text was left to join on.
  return { items: kept, focus: { id: first.id, offset: o.start.offset + insert.length }, removed: j - i - (tail ? 1 : 0) };
}

/** Items deeper than the 6 levels allow move out to sit beside their parent, in the same order (in place). */
function fitDepth(list: TodoItem[], depth: number) {
  for (let n = 0; n < list.length; n++) {
    const it = list[n];
    if (depth >= MAX_DEPTH && it.children.length) {
      const lifted = it.children;
      it.children = [];
      list.splice(n + 1, 0, ...lifted);
    } else fitDepth(it.children, depth + 1);
  }
}

/** The list with the first and last items' text cut to the highlighted part (for copying). */
function trimmed(items: TodoItem[], r: WordRange): TodoItem[] | null {
  const o = ordered(items, r);
  if (!o) return null;
  const next = structuredClone(items);
  const first = findItem(next, o.start.id)!.item;
  const last = findItem(next, o.end.id)!.item;
  if (first === last) first.text = first.text.slice(o.start.offset, o.end.offset);
  else {
    first.text = first.text.slice(o.start.offset);
    last.text = last.text.slice(0, o.end.offset);
  }
  return next;
}

/**
 * Exactly the highlighted words, as items for the item clipboard (#228 / #229): a partial first and last
 * item, the ones between in whole, each with its own tick and look, at their levels.
 */
export function sliceRange(items: TodoItem[], r: WordRange): TodoItem[] {
  const cut = trimmed(items, r);
  return cut ? copyItems(cut, touchedIds(items, r), endsOf(items, r)) : [];
}

/** The highlighted words as plain text for other apps: one item a line, indented as copied items are. */
export function rangeAsText(items: TodoItem[], r: WordRange): string {
  const cut = trimmed(items, r);
  return cut ? selectionAsText(cut, touchedIds(items, r), endsOf(items, r)) : '';
}

/** The items a highlight only partly takes (a first one from partway, and the last one): their hidden sub-items stay in the list, so they aren't copied. */
function endsOf(items: TodoItem[], r: WordRange): string[] {
  const o = ordered(items, r);
  return o ? [o.end.id, ...(o.start.offset > 0 ? [o.start.id] : [])] : [];
}

