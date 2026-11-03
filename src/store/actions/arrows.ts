import { addArrow, removeArrow } from '../../model/arrows';
import { newId } from '../../model/cards';
import type { StoreContext } from '../core';

// Arrows between cards and containers (job card-arrows). Drawing or deleting one is one undo step;
// which arrow is selected is view state, like selected blocks.

export function arrowActions(ctx: StoreContext) {
  const { commit, updateUi } = ctx;
  return {
    /** Draw an arrow from one block to another. False when it can't be drawn (see addArrow) or the board can't be changed. */
    addArrow: (from: string, to: string): boolean => commit((b) => addArrow(b, from, to, newId('a'))) !== null,
    /** Select an arrow (clicked); any selected blocks or items are let go. */
    selectArrow: (id: string) => updateUi({ arrowSel: id, selection: [], itemSel: null, colourMenuOpen: false, confirm: null }),
    /** Delete an arrow (Delete or Backspace while it is selected). */
    deleteArrow: (id: string): boolean => commit((b) => removeArrow(b, id), { ui: { arrowSel: null } }) !== null,
  };
}
