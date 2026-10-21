import { DEFAULT_BOARD_NAME } from '../../model/constants';
import { newId } from '../../model/cards';
import { boardRights } from '../../model/sharing';
import { findTemplate, isBlank, templateBoard } from '../../model/templates';
import type { StoreContext } from '../core';

// Starting from a template (owner request, job #162, 2026-10-22). Kept apart from the boards actions on
// purpose: it only uses what is already there to change a board (commit) or add one (setOthers, openBoard).

export function templateActions(ctx: StoreContext) {
  return {
    /**
     * Makes a board from a template (or the example) and says what happened. An empty open board is
     * filled as one undo step, and named after the template unless the person already named it or may not rename it ('filled');
     * otherwise (a board with cards, an old version being shown), or when `separate` is set (the example), a new board on its own is made and opened ('opened').
     * Null for an id that is not a template, changing nothing.
     */
    startFromTemplate(id: string, separate = false): 'filled' | 'opened' | null {
      const template = findTemplate(id);
      if (!template) return null;
      const made = templateBoard(template);
      const { ui, boards } = ctx.state;
      // An old version being shown can't be changed, so then (like New board) a board of its own is made.
      if (!separate && !ui.preview && isBlank(ctx.state.board)) {
        // Naming the board is a rename: not allowed on a board someone shared with this person.
        const rename = boardRights(ui.shares, boards.open, boards.home).rename && (!ctx.state.board.name.trim() || ctx.state.board.name === DEFAULT_BOARD_NAME);
        const filled = ctx.commit((b) => ({
          ...b,
          name: rename ? made.name : b.name,
          cards: { ...b.cards, ...made.cards },
          columns: { ...b.columns, ...made.columns },
          order: [...b.order, ...made.order],
        }), { ui: { selection: [], itemSel: null } });
        return filled ? 'filled' : null;
      }
      const boardId = newId('b');
      ctx.setOthers((o) => ({ ...o, [boardId]: made }));
      ctx.openBoard(boardId);
      return 'opened';
    },
  };
}
