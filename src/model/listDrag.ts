// Dragging one sheet of a list up or down (the Journal's general notes, owner request 2026-11-21).
// Pure: the panel reads the sheets' places and the pointer; this says where the sheet lands and
// how far each sheet is shifted while it is dragged.

/** A sheet's place on the screen when the drag began. */
export type Span = { top: number; height: number };

/** The place the sheet `from` lands in, moved `dy` px: the number of other sheets whose middle is above its middle. */
export function dropPlace(rects: readonly Span[], from: number, dy: number): number {
  const middle = rects[from].top + rects[from].height / 2 + dy;
  return rects.filter((r, i) => i !== from && r.top + r.height / 2 < middle).length;
}

/** A drag under way: the sheet's place when it began, the place it would land in, how far it went and its height. */
export type ListDrag = { from: number; to: number; dy: number; h: number };

/** How far sheet `i` is shifted: the dragged one follows the pointer, those it passed make room (its height and the `gap`). */
export function sortShift(i: number, drag: ListDrag | null, gap: number): number {
  if (!drag) return 0;
  if (i === drag.from) return drag.dy;
  const room = drag.h + gap;
  if (drag.from < drag.to && i > drag.from && i <= drag.to) return -room;
  if (drag.to < drag.from && i >= drag.to && i < drag.from) return room;
  return 0;
}

/**
 * The place `key` goes to in the list as it is now (`ids`), for a drop at place `to` among `others`
 * (the other sheets when the drag began): before the same neighbour, or after the last, so a note
 * another device added meanwhile doesn't shift it. With that neighbour gone, the place `to`.
 */
export function placeAmong(ids: readonly string[], key: string, others: readonly string[], to: number): number {
  const rest = ids.filter((k) => k !== key);
  if (to < others.length) {
    const i = rest.indexOf(others[to]);
    return i < 0 ? Math.min(to, rest.length) : i;
  }
  const i = others.length ? rest.indexOf(others[others.length - 1]) : -1;
  return i < 0 ? rest.length : i + 1;
}
