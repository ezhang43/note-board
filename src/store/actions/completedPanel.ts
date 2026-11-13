import type { StoreContext } from '../core';

// The Completed panel mixes the Main checklist's cleaned-up items in with the open board's (owner, 2026-11-13).
// Each record stays on its own board: an untick goes back to the board its row came from, as one undo step on
// that board's history, and Ctrl+Z / Ctrl+Y in the panel step whichever board the panel's last untick changed.

interface Deps {
  /** The Main checklist board the panel mixes in (null: none, or it is the open board). */
  checklist: () => string | null;
  /** Unticks the entry `itemId` in the record of board `boardId` (restoreCompleted on that board). */
  restoreOn: (boardId: string, itemId: string) => void;
  /** Ctrl+Z / Ctrl+Y on the open board, as everywhere else. */
  undo: () => void;
  redo: () => void;
}

export function completedPanelActions(
  ctx: StoreContext,
  { checklist, restoreOn, undo, redo }: Deps,
) {
  const board = (id: string) => ctx.workspace().boards[id];
  const steps = () =>
    ctx.state.ui.completedSteps ?? { undo: [], redo: [], checklist: null };

  /**
   * One Ctrl+Z (`back`) or Ctrl+Y in the Completed panel. The newest of the panel's unticks (or of those it undid)
   * says which board: the Main checklist's history is stepped only while that board is just as the panel left it,
   * so nothing typed in the Checklist panel since is ever taken back from here; otherwise, and once the panel's own
   * unticks run out, it is the open board's undo, as before.
   */
  function step(back: boolean) {
    let s = steps();
    const list = checklist();
    // A checklist entry whose board has changed since is dropped, with everything the panel recorded.
    if (
      (back ? s.undo : s.redo).at(-1) === list &&
      board(list!) !== s.checklist
    )
      s = { undo: [], redo: [], checklist: null };
    const from = back ? s.undo : s.redo;
    const other = back ? s.redo : s.undo;
    // With no untick of its own left, the step is the open board's, and is remembered as such for the way back.
    const id = from.at(-1) ?? ctx.state.boards.open;
    const onList = id === list;
    if (onList) ctx.undoOn(id, back ? 'undo' : 'redo');
    else (back ? undo : redo)();
    const rest = from.slice(0, -1);
    const moved = [...other, id];
    ctx.updateUi({
      completedSteps: {
        undo: back ? rest : moved,
        redo: back ? moved : rest,
        checklist: onList ? board(id) : s.checklist,
      },
    });
  }

  return {
    /**
     * Untick an item in the Completed panel: it goes back to its list, on the Main checklist (`fromChecklist`) or the
     * open board. Nothing while the open board is read-only or an old version is shown (the panel is read-only then).
     */
    untickCompleted(itemId: string, fromChecklist: boolean) {
      if (ctx.state.ui.preview || ctx.viewOnly()) return;
      const id = fromChecklist ? checklist() : ctx.state.boards.open;
      if (!id) return;
      const before = board(id);
      restoreOn(id, itemId);
      if (board(id) === before) return;
      const s = steps();
      ctx.updateUi({
        completedSteps: {
          undo: [...s.undo, id],
          redo: [],
          checklist: fromChecklist ? board(id) : s.checklist,
        },
      });
    },
    /** Ctrl+Z in the Completed panel. */
    undoCompleted: () => step(true),
    /** Ctrl+Y in the Completed panel. */
    redoCompleted: () => step(false),
  };
}
