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
  const own = after.cards[at.cardId];
  const moved = own?.kind === 'todo' && findItem(own.items, at.itemId) ? undefined : Object.keys(after.cards).find((id) => {
    const card = after.cards[id];
    return card.kind === 'todo' && findItem(card.items, at.itemId) && drawnItems(after, id).includes(at.itemId);
  });
  if (moved) return { cardId: moved, itemId: at.itemId };
  if (!now.length) return null;
  const left = new Set(now);
  const shown = drawnItems(before, at.cardId);
  const i = shown.indexOf(at.itemId);
  const near = i < 0 ? undefined : (shown.slice(0, i).reverse().find((x) => left.has(x)) ?? shown.slice(i + 1).find((x) => left.has(x)));
  return { cardId: at.cardId, itemId: near ?? now[0] };
}
