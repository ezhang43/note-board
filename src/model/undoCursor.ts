import { columnOf } from './board';
import { findItem } from './checklist';
import { visibleItems } from './multiSelect';
import type { Board } from './types';

// Undo or redo while typing in a checklist item (job undo-keeps-cursor, 2026-11-09): where the cursor goes when
// the change takes that item off the screen, so it never drops to the page (where Backspace would delete the card).

export interface ItemAt {
  cardId: string;
  itemId: string;
}

/** The item being typed in, with `caret`, where the cursor is in its text, and `end`, where highlighted letters end (if any). */
export interface TypingAt extends ItemAt {
  caret?: number;
  end?: number;
}

/** Where a cursor or highlight goes in a text box: a place in its text, a [start, end] highlight, or null for the end of the text. */
export type TextSpot = number | [number, number] | null;

/**
 * The checklist items whose rows are drawn in this list, top to bottom: none for a collapsed card or one in a
 * collapsed container. Which rows a list draws is `visibleItems`'s to say (a folded item's hidden ones, say).
 */
export function drawnItems(board: Board, cardId: string): string[] {
  const card = board.cards[cardId];
  if (card?.kind !== 'todo' || columnOf(board, cardId)?.collapsed) return [];
  return visibleItems(card);
}

/**
 * Where the cursor in item `at` goes when `before` became `after`: the item itself while it is drawn (an undo can move it to
 * another list), else the nearest item still drawn in its list, the one above it, else the one below (else the list's first,
 * when none of those it had is left). null when that list draws none. The same rule as focusAfterRemoving, but over the rows
 * drawn after the change, which that one doesn't know (a list collapsed by the undo draws none).
 */
export function cursorAfterStep(before: Board, after: Board, at: ItemAt): ItemAt | null {
  const now = drawnItems(after, at.cardId);
  if (now.includes(at.itemId)) return at;
  const has = (b: Board, id: string) => {
    const card = b.cards[id];
    return card?.kind === 'todo' && !!findItem(card.items, at.itemId);
  };
  // Moved: into a list that didn't have it before (not one whose own item only shares the id).
  const moved = has(after, at.cardId) ? undefined : Object.keys(after.cards).find((id) => has(after, id) && !has(before, id) && drawnItems(after, id).includes(at.itemId));
  if (moved) return { cardId: moved, itemId: at.itemId };
  if (!now.length) return null;
  const left = new Set(now);
  const shown = drawnItems(before, at.cardId);
  const i = shown.indexOf(at.itemId);
  const near = i < 0 ? undefined : (shown.slice(0, i).reverse().find((x) => left.has(x)) ?? shown.slice(i + 1).find((x) => left.has(x)));
  return { cardId: at.cardId, itemId: near ?? now[0] };
}

const textOf = (board: Board, at: ItemAt) => {
  const card = board.cards[at.cardId];
  return card?.kind === 'todo' ? findItem(card.items, at.itemId)?.item.text : undefined;
};

/**
 * Where in its text the cursor goes when it stays in item `at` (now at `to`): where it was, highlighted letters too, while the
 * step leaves the text as it was; at the end when the step changed the text, as the browser does when a text box's text is
 * replaced (so a redo of typing leaves the cursor after it, owner 2026-11-09). The end too for any other item it moves to.
 */
export function caretAfterStep(before: Board, after: Board, at: TypingAt, to: ItemAt): TextSpot {
  if (to.itemId !== at.itemId || at.caret === undefined || textOf(before, at) !== textOf(after, to)) return null;
  return at.end !== undefined && at.end !== at.caret ? [at.caret, at.end] : at.caret;
}
