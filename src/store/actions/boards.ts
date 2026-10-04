import * as B from '../../model/board';
import { createBoardCard, newId } from '../../model/cards';
import { CARD_W, NEW_BLOCK_H } from '../../model/constants';
import { spotForNewBlock } from '../../model/layout';
import type { Board } from '../../model/types';
import { pathTo, withoutBoard, type Workspace } from '../../model/workspace';
import type { StoreContext } from '../core';

// Several boards, and boards inside boards (owner request, 2026-10-05): opening, adding and
// deleting boards. Undo belongs to each board; adding or deleting a board itself isn't undone
// (a deleted board can be brought back from Version history).

const blankBoard = (): Board => ({ ...B.createBoard(), name: '' });

export function boardActions(ctx: StoreContext) {
  const { commit, setOthers, openBoard } = ctx;

  return {
    openBoard,
    /** A board's name ('' if unnamed or gone). */
    boardName(id: string): string {
      const { board, boards } = ctx.state;
      return id === boards.open ? board.name : (boards.others[id]?.name ?? '');
    },
    /** The boards from the top down to the open one, for going back up. */
    pathToOpen: () => pathTo(ctx.workspace(), ctx.state.boards.open),
    /** New board: a fresh, unnamed board on its own (not inside another), opened straight away. */
    newBoard(): string {
      const id = newId('b');
      setOthers((o) => ({ ...o, [id]: blankBoard() }));
      openBoard(id);
      return id;
    },
    /**
     * Add a board here: a new board inside this one, with a card on this board that opens it.
     * The card is placed like a new card (into the selected column, else the middle of the screen).
     */
    addBoardCard(): string {
      const id = newId('b');
      setOthers((o) => ({ ...o, [id]: blankBoard() }));
      const card = createBoardCard(id);
      const { board, ui } = ctx.state;
      const selected = ui.selection.length === 1 ? ui.selection[0] : null;
      const place =
        B.placementForNewCard(board, selected) ??
        ({ type: 'loose', ...spotForNewBlock(board, CARD_W, NEW_BLOCK_H.board, ctx.screenCentre(), ctx.measured) } as const);
      commit((b) => B.addCard(b, card, place), { ui: { selection: [card.id], itemSel: null } });
      ctx.requestSettle([place.type === 'column' ? place.columnId : card.id]);
      return id;
    },
    /**
     * Delete a board and every card that opens it (the home board never). If it is open, the board
     * above it opens first. Boards inside it are kept and then stand alone.
     */
    deleteBoard(id: string) {
      const ws = ctx.workspace();
      if (id === ws.home || !ws.boards[id]) return;
      if (ctx.state.boards.open === id) {
        const path = pathTo(ws, id);
        openBoard(path.length > 1 ? path[path.length - 2] : ws.home);
      }
      const after = withoutBoard(ctx.workspace(), id);
      const open = ctx.state.boards.open;
      // The cards on the open board go as an ordinary change (Ctrl+Z shows them as deleted boards).
      if (after.boards[open] !== ctx.state.board) {
        commit((b) => B.deleteBlocks(b, Object.values(b.cards).filter((c) => c.kind === 'board' && c.boardId === id).map((c) => c.id)), { ui: { selection: [] } });
      }
      setOthers(() => {
        const others = { ...after.boards };
        delete others[open];
        return others;
      });
    },
    /**
     * Put an old version back (version history): the open board as it was then (one change, so
     * Ctrl+Z undoes it), and any board deleted since comes back too. Other boards are left as they are.
     */
    restoreVersion(ws: Workspace) {
      ctx.updateUi({ preview: null });
      const open = ctx.state.boards.open;
      const missing = Object.keys(ws.boards).filter((id) => id !== open && !ctx.workspace().boards[id]);
      if (missing.length) setOthers((o) => ({ ...o, ...Object.fromEntries(missing.map((id) => [id, ws.boards[id]])) }));
      const then = ws.boards[open];
      if (then) commit(() => then, { ui: { historyOpen: false, selection: [], itemSel: null } });
      else ctx.updateUi({ historyOpen: false });
    },
  };
}
