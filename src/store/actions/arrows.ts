import { addArrow, removeArrow } from '../../model/arrows';
import { newId } from '../../model/cards';
import type { StoreContext } from '../core';

// Arrows between cards and columns (owner request, 2026-10-05). Drawing or deleting one is one
// undo step; which arrow is selected is view state, like selected blocks.

export function arrowActions(ctx: StoreContext) {
  const { commit, updateUi } = ctx;
  return {
    /** Draw an arrow from one block to another. False when it can't be drawn (see addArrow). */
    addArrow: (from: string, to: string): boolean => commit((b) => addArrow(b, from, to, newId('a'))) !== null,
    /** Select an arrow (clicked); any selected blocks or items are let go. */
    selectArrow: (id: string) => updateUi({ arrowSel: id, selection: [], itemSel: null, colourMenuOpen: false }),
    /** Delete an arrow (Delete key or its × button). */
    deleteArrow: (id: string): boolean => commit((b) => removeArrow(b, id), { ui: { arrowSel: null } }) !== null,
  };
}
