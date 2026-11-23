import * as B from '../../model/board';
import { createBoardCard, newId } from '../../model/cards';
import { CARD_W, NEW_BLOCK_H } from '../../model/constants';
import { hiddenChecklist } from '../../model/mainChecklist';
import { hiddenHabits } from '../../model/habits';
import { hiddenJournal } from '../../model/journal';
import { spotForNewBlock } from '../../model/layout';
import type { Board } from '../../model/types';
import { boardNeighbor, pathTo, withoutBoard, type Workspace } from '../../model/workspace';
import { restorable } from '../../model/sharing';
import type { StoreContext } from '../core';

// Several boards, and boards inside boards (owner request, 2026-10-05): opening, adding and
// deleting boards. Undo belongs to each board; adding or deleting a board itself isn't undone
// (a deleted board can be brought back from Version history).

const blankBoard = (): Board => ({ ...B.createBoard(), name: '' });

export function boardActions(ctx: StoreContext) {
  const { commit, setOthers, openBoard } = ctx;
  const sharedIds = () => ctx.state.ui.shares.flatMap((s) => s.boards);
  /** The Journal, Habits and Main checklist boards left out of the Boards menu and Ctrl+arrows: never the open one, none until shares are known. */
  const hidden = (): string[] => {
    if (!ctx.state.ui.sharesKnown) return [];
    const ws = ctx.workspace();
    return [hiddenJournal(ws, sharedIds()), hiddenHabits(ws, sharedIds()), hiddenChecklist(ws, sharedIds())].filter((id): id is string => !!id && id !== ctx.state.boards.open);
  };

  return {
    hiddenBoards: hidden,
    openBoard,
    /** A board's name ('' if unnamed or gone). */
    boardName(id: string): string {
      const { board, boards } = ctx.state;
      return id === boards.open ? board.name : (boards.others[id]?.name ?? '');
    },
    /** The boards from the top down to the open one, for going back up. */
    pathToOpen: () => pathTo(ctx.workspace(), ctx.state.boards.open),
    /** Ctrl+arrow keys: opens the next / previous / parent / first inner board and returns its id; null (nothing opens) at an end. */
    moveBoard(move: Parameters<typeof boardNeighbor>[2]): string | null {
      // The hidden Journal, Habits and Main checklist boards are passed over, as in the Boards menu.
      const ws = ctx.workspace();
      const skip = hidden();
      let id = boardNeighbor(ws, ctx.state.boards.open, move);
      while (id && skip.includes(id)) id = boardNeighbor(ws, id, move);
      if (id) openBoard(id);
      return id && ctx.state.boards.open === id ? id : null;
    },
    /** New board: a fresh, unnamed board on its own (not inside another), opened straight away. */
    newBoard(): string {
      const id = newId('b');
      setOthers((o) => ({ ...o, [id]: blankBoard() }));
      openBoard(id);
      return id;
    },
    /**
     * Add a board here: a new board inside this one, with a card on this board that opens it ('' on a read-only board).
     * The card is placed like a new card (into the selected column, else the middle of the screen).
     */
    addBoardCard(): string {
      if (ctx.viewOnly()) return ''; // not on a read-only board (job 161), where the card couldn't go
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
      // A board in a share this person can only view or comment on stays (job 161).
      if (id === ws.home || !ws.boards[id] || ctx.viewOnly(id)) return;
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
     * Ctrl+Z undoes it), and any board deleted since comes back too. Other boards are left as they are,
     * and so are boards of a share someone else shared with this person (owner, 2026-10-06; see
     * restorable). Returns those shares' starting boards, or 'loading' (changing nothing) while it
     * isn't yet known which boards are shared (job #33).
     */
    restoreVersion(ws: Workspace): string[] | 'loading' {
      if (!ctx.state.ui.sharesKnown) return 'loading';
      ctx.updateUi({ preview: null });
      // The hidden Journal, Habits and Main checklist boards can't be opened to restore them on their own, so they
      // come back too (check of PR #94), each as one change on its own undo; a version without one leaves it as it is.
      for (const id of hidden()) if (ws.boards[id]) ctx.commitTo(id, () => ws.boards[id]);
      const open = ctx.state.boards.open;
      const missing = Object.keys(ws.boards).filter((id) => id !== open && !ctx.workspace().boards[id]);
      const { ids, kept } = restorable(ctx.state.ui.shares, ws.boards[open] ? [open, ...missing] : missing);
      const back = ids.filter((id) => id !== open);
      if (back.length) setOthers((o) => ({ ...o, ...Object.fromEntries(back.map((id) => [id, ws.boards[id]])) }));
      const then = ids.includes(open) ? ws.boards[open] : undefined;
      if (then) commit(() => then, { ui: { historyOpen: false, selection: [], itemSel: null } });
      else ctx.updateUi({ historyOpen: false });
      return kept;
    },
  };
}
