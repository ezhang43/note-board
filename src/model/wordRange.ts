import { copyItems, findItem, flatIds, MAX_DEPTH, reopenAbove, selectionAsText } from './checklist';
import type { TodoItem } from './types';

// Word-style highlights across a list's items (owner request, 2026-11-01: "It should work like a word
// document editor"). A highlight runs from a letter in one item to a letter in another, in the order the
// items are shown, as if the list were one long text with a line break after every item. Pure: every
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
  const order = flatIds(items);
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
 * of a later item leaves that item out, as nothing of it is highlighted (only the line break before it).
 * Ticking, the trash, dragging by the grip and Tab act on these.
 */
export function touchedIds(items: TodoItem[], r: WordRange): string[] {
  const o = ordered(items, r);
  if (!o) return [];
  const order = flatIds(items);
  const i = order.indexOf(o.start.id);
  const j = order.indexOf(o.end.id);
  return order.slice(i, i < j && o.end.offset === 0 ? j : j + 1);
}

/**
 * Which letters of item `id` are highlighted: [from, to, and whether the highlight goes on past its end
 * (the line break after it)], or null when none of it is.
 */
export function marksOf(items: TodoItem[], r: WordRange, id: string): [number, number, boolean] | null {
  const o = ordered(items, r);
  if (!o) return null;
  const order = flatIds(items);
  const i = order.indexOf(o.start.id);
  const j = order.indexOf(o.end.id);
  const k = order.indexOf(id);
  if (k < i || k > j || k < 0) return null;
  const len = findItem(items, id)!.item.text.length;
  return [k === i ? o.start.offset : 0, k === j ? o.end.offset : len, k < j];
}

/**
 * Deletes the highlighted words, like a word processor (Delete, Backspace, cut; `insert` is a typed
 * letter that replaces them). What is left of the first and last items is joined into the first one,
 * which keeps its id, tick and look. The items between go, and so does the last one; the last item's
 * sub-items move up under the joined item, and any other sub-item that comes after the highlight but
 * whose parent went moves up into its parent's place (as cut does). No letter outside the highlight is
 * lost. Returns the new items and where the cursor goes, or null when the range no longer fits the list.
 */
export function deleteRange(items: TodoItem[], r: WordRange, insert = ''): { items: TodoItem[]; focus: ItemPoint } | null {
  const o = ordered(items, r);
  if (!o) return null;
  const order = flatIds(items);
  const i = order.indexOf(o.start.id);
  const j = order.indexOf(o.end.id);
  const next = structuredClone(items);
  const first = findItem(next, o.start.id)!.item;
  const last = findItem(next, o.end.id)!.item;
  const tail = last.text.slice(o.end.offset);
  first.text = first.text.slice(0, o.start.offset) + insert + tail;
  if (i === j) return { items: next, focus: { id: first.id, offset: o.start.offset + insert.length } };

  const kids = last.children;
  last.children = [];
  const gone = new Set(order.slice(i + 1, j + 1));
  const prune = (list: TodoItem[]): TodoItem[] => list.flatMap((it) => (gone.has(it.id) ? prune(it.children) : [{ ...it, children: prune(it.children) }]));
  const kept = prune(next);
  const joined = findItem(kept, first.id)!;
  if (joined.depth < MAX_DEPTH) {
    joined.item.children.unshift(...kids);
    fitDepth(joined.item.children, joined.depth + 1);
  } else {
    // The joined item is as deep as items go: its new sub-items sit right after it instead.
    joined.list.splice(joined.index + 1, 0, ...kids);
    fitDepth(joined.list, joined.depth);
  }
  for (const kid of kids) reopenAbove(kept, kid);
  return { items: kept, focus: { id: first.id, offset: o.start.offset + insert.length } };
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
  return cut ? copyItems(cut, touchedIds(items, r)) : [];
}

/** The highlighted words as plain text for other apps: one item a line, indented as copied items are. */
export function rangeAsText(items: TodoItem[], r: WordRange): string {
  const cut = trimmed(items, r);
  return cut ? selectionAsText(cut, touchedIds(items, r)) : '';
}
