import type { Board } from '../../model/types';
import type { StoreContext } from '../core';
import type { CompletedStep } from '../types';

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

export function completedPanelActions(ctx: StoreContext, { checklist, restoreOn, undo, redo }: Deps) {
  const board = (id: string): Board | undefined => (id === ctx.state.boards.open ? ctx.state.board : ctx.state.boards.others[id]);
  const panelOpen = () => ctx.state.ui.sidePanel === 'completed';
  /** Whether a remembered step can still be taken back here: its board is the open one or the Main checklist, just as the step left it. */
  const current = (s: CompletedStep) => (s.board === ctx.state.boards.open || s.board === checklist()) && board(s.board) === s.after;
  const readOnly = () => ctx.state.ui.preview !== null || ctx.viewOnly();

  /**
   * One Ctrl+Z (`back`) or Ctrl+Y in the Completed panel. The newest remembered step that is still current says
   * which board (steps whose board changed since, here or by sync, are passed over and forgotten), so nothing
   * done elsewhere since is ever taken back from here; with none, it is the open board's, as everywhere else.
   * Only a step that changed a board is remembered, for the way back.
   */
  function step(back: boolean) {
    const s = ctx.state.ui.completedSteps ?? { undo: [], redo: [] };
    const from = [...(back ? s.undo : s.redo)];
    while (from.length && !current(from.at(-1)!)) from.pop();
    const id = from.pop()?.board ?? ctx.state.boards.open;
    const before = board(id);
    if (id === ctx.state.boards.open) (back ? undo : redo)();
    else ctx.undoOn(id, back ? 'undo' : 'redo');
    const after = board(id);
    const other = back ? s.redo : s.undo;
    const moved = after && after !== before ? [...other, { board: id, after }] : other;
    if (panelOpen()) ctx.updateUi({ completedSteps: back ? { undo: from, redo: moved } : { undo: moved, redo: from } });
  }

  return {
    /** Whether the Completed panel's rows are read-only: the open board is view-only, or an old version is shown. */
    completedReadOnly: readOnly,
    /**
     * Untick an item in the Completed panel: it goes back to its list, on the Main checklist (`fromChecklist`) or the
     * open board. Nothing while the panel is read-only.
     */
    untickCompleted(itemId: string, fromChecklist: boolean) {
      if (readOnly()) return;
      const id = fromChecklist ? checklist() : ctx.state.boards.open;
      if (!id) return;
      const before = board(id);
      restoreOn(id, itemId);
      const after = board(id);
      if (!after || after === before || !panelOpen()) return;
      const s = ctx.state.ui.completedSteps ?? { undo: [], redo: [] };
      ctx.updateUi({ completedSteps: { undo: [...s.undo, { board: id, after }], redo: [] } });
    },
    /**
     * Ctrl+Z in the Completed panel.
     * simple: the toolbar's Undo (and a phone's bottom bar) still act on the open board only, so a checklist untick
     * is taken back only with Ctrl+Z here; give those buttons this route too if the owner asks.
     */
    undoCompleted: () => step(true),
    /** Ctrl+Y in the Completed panel. */
    redoCompleted: () => step(false),
  };
}
