import * as B from '../../model/board';
import { createBoardCard, createCard, newId } from '../../model/cards';
import { CARD_W, NEW_BLOCK_H } from '../../model/constants';
import { JOURNAL_NAME, findJournalBoard, journalDateLine, journalSpot, todaysNote } from '../../model/journal';
import { blockRect, spotForNewBlock } from '../../model/layout';
import { viewShowing } from '../../model/view';
import type { Board, Rect } from '../../model/types';
import { boardNeighbor, pathTo, withoutBoard, type Workspace } from '../../model/workspace';
import { restorable } from '../../model/sharing';
import type { StoreContext } from '../core';

// Several boards, and boards inside boards (owner request, 2026-10-05): opening, adding and
// deleting boards. Undo belongs to each board; adding or deleting a board itself isn't undone
// (a deleted board can be brought back from Version history).

const blankBoard = (): Board => ({ ...B.createBoard(), name: '' });

export function boardActions(ctx: StoreContext) {
  const { commit, setOthers, openBoard } = ctx;

  /**
   * Add a board here: a new board inside this one, with a card on this board that opens it.
   * The card is placed like a new card (into the selected column, else the middle of the screen).
   */
  function addBoardCard(name = ''): string {
    const id = newId('b');
    setOthers((o) => ({ ...o, [id]: { ...blankBoard(), name } }));
    const card = createBoardCard(id);
    const { board, ui } = ctx.state;
    const selected = ui.selection.length === 1 ? ui.selection[0] : null;
    const place =
      B.placementForNewCard(board, selected) ??
      ({ type: 'loose', ...spotForNewBlock(board, CARD_W, NEW_BLOCK_H.board, ctx.screenCentre(), ctx.measured) } as const);
    commit((b) => B.addCard(b, card, place), { ui: { selection: [card.id], itemSel: null } });
    ctx.requestSettle([place.type === 'column' ? place.columnId : card.id]);
    return id;
  }

  return {
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
      const id = boardNeighbor(ctx.workspace(), ctx.state.boards.open, move);
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
    addBoardCard: () => addBoardCard(),
    /**
     * The Journal button (owner request, 2026-10-18): opens the person's own board called "Journal"
     * (made inside home the first time) and puts today's dated note at the top of it with the
     * cursor in it, or, if today's note is there, goes to it. Adding the note is one change on the
     * Journal board (Ctrl+Z); making the board is not undone, like any new board. Returns 'loading'
     * (changing nothing) while it isn't yet known which boards are shared: never uses one of those.
     */
    journal(): 'loading' | null {
      if (!ctx.state.ui.sharesKnown) return 'loading';
      ctx.updateUi({ preview: null, historyOpen: false, selection: [], itemSel: null }); // an old version being looked at is put away first
      let id = findJournalBoard(ctx.workspace(), ctx.state.ui.shares.flatMap((s) => s.boards));
      if (!id) {
        openBoard(ctx.state.boards.home); // the home board is never shared
        id = addBoardCard(JOURNAL_NAME);
      }
      const wasOpen = ctx.state.boards.open === id;
      openBoard(id);
      const line = journalDateLine(new Date());
      let noteId = todaysNote(ctx.state.board, line);
      if (noteId) {
        // The cursor goes in only when the note is drawn (not collapsed, nor in a collapsed container).
        const { board } = ctx.state;
        const drawn = !board.cards[noteId].collapsed && !B.columnOf(board, noteId)?.collapsed;
        ctx.updateUi({ selection: [noteId], itemSel: null, focusBlock: drawn ? noteId : null });
      } else {
        const note = { ...createCard('note'), text: `${line}\n\n` };
        noteId = note.id;
        commit((b) => B.addCard(b, note, { type: 'loose', ...journalSpot(b, ctx.measured, ctx.screenCentre()) }), {
          ui: { selection: [note.id], itemSel: null, focusBlock: note.id },
        });
        ctx.requestSettle([note.id]);
      }
      // Opening another board shows the whole of it; if it was already open, bring the note into view
      // (the container's place, if it is in one) unless it is all on screen already.
      const { board, view } = ctx.state;
      const rect = wasOpen && blockRect(board, B.columnOf(board, noteId)?.id ?? noteId, ctx.measured);
      const { width, height } = ctx.viewportSize();
      const seen = (r: Rect) =>
        r.x * view.zoom + view.panX >= 0 && r.y * view.zoom + view.panY >= 0 && (r.x + r.w) * view.zoom + view.panX <= width && (r.y + r.h) * view.zoom + view.panY <= height;
      if (rect && !seen(rect)) ctx.updateView((v) => viewShowing([rect], ctx.viewportSize(), v));
      return null;
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
     * Ctrl+Z undoes it), and any board deleted since comes back too. Other boards are left as they are,
     * and so are boards of a share someone else shared with this person (owner, 2026-10-06; see
     * restorable). Returns those shares' starting boards, or 'loading' (changing nothing) while it
     * isn't yet known which boards are shared (job #33).
     */
    restoreVersion(ws: Workspace): string[] | 'loading' {
      if (!ctx.state.ui.sharesKnown) return 'loading';
      ctx.updateUi({ preview: null });
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
