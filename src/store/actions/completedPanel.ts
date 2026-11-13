import { announce } from '../announce';
import type { StoreContext } from '../core';
import type { CompletedSteps } from '../types';

// The Completed panel mixes the Main checklist's cleaned-up items in with the open board's (owner, 2026-11-13).
// Each record stays on its own board: an untick goes back to the board its row came from, as one undo step on
// that board's history, and Ctrl+Z / Ctrl+Y in the panel step back through the panel's own unticks, newest first,
// each on its own board. They never reach past them to other changes (owner, 2026-11-13: "Fix both, then ship").

interface Deps {
  /** The Main checklist board the panel mixes in (null: none, or it is the open board). */
  checklist: () => string | null;
  /** Unticks the entry `itemId` in the record of board `boardId` (restoreCompleted on that board). */
  restoreOn: (boardId: string, itemId: string) => void;
  /** Ctrl+Z / Ctrl+Y on the open board, as everywhere else (they tell screen readers). */
  undo: () => void;
  redo: () => void;
}

const none: CompletedSteps = { undo: [], redo: [], seen: {} };

export function completedPanelActions(ctx: StoreContext, { checklist, restoreOn, undo, redo }: Deps) {
  const panelOpen = () => ctx.state.ui.sidePanel === 'completed';
  /**
   * Whether board `id`'s remembered steps can still be taken back here: it is the open board or the Main checklist,
   * and its undo history is just as the panel left it. Judged by the history, not the board, so the automatic layout
   * tidy (which moves blocks outside undo) never makes a step look changed since; any edit, undo or sync makes a new history.
   */
  const current = (s: CompletedSteps, id: string) =>
    (id === ctx.state.boards.open || id === checklist()) && ctx.historyOf(id) !== undefined && ctx.historyOf(id) === s.seen[id];
  const readOnly = () => ctx.state.ui.preview !== null || ctx.viewOnly();

  /**
   * One Ctrl+Z (`back`) or Ctrl+Y in the Completed panel: the newest remembered step whose board is still as the panel
   * left it (steps on a board changed since are passed over and forgotten). With none, nothing happens, so a change
   * made elsewhere is never undone from here. Only a step that changed something is remembered for the way back.
   */
  function step(back: boolean) {
    const s = ctx.state.ui.completedSteps ?? none;
    const from = [...(back ? s.undo : s.redo)];
    while (from.length && !current(s, from.at(-1)!)) from.pop();
    const id = from.pop();
    const before = id ? ctx.historyOf(id) : undefined;
    if (id === ctx.state.boards.open) (back ? undo : redo)();
    else if (id) ctx.undoOn(id, back ? 'undo' : 'redo');
    const after = id ? ctx.historyOf(id) : undefined;
    const changed = !!id && !!after && after !== before;
    if (!changed) announce(back ? 'Nothing to undo here' : 'Nothing to redo here');
    else if (id !== ctx.state.boards.open) announce(back ? 'Undid the last change' : 'Redid the last change');
    if (!panelOpen()) return;
    const other = back ? s.redo : s.undo;
    const moved = changed ? [...other, id] : other;
    const seen = changed ? { ...s.seen, [id]: after } : s.seen;
    ctx.updateUi({ completedSteps: back ? { undo: from, redo: moved, seen } : { undo: moved, redo: from, seen } });
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
      const before = ctx.historyOf(id);
      restoreOn(id, itemId);
      const after = ctx.historyOf(id);
      if (!after || after === before || !panelOpen()) return;
      const s = ctx.state.ui.completedSteps ?? none;
      // This board's older steps, from before a change made elsewhere, can't be taken back from here any more.
      const undo = s.seen[id] === before ? s.undo : s.undo.filter((b) => b !== id);
      ctx.updateUi({ completedSteps: { undo: [...undo, id], redo: [], seen: { ...s.seen, [id]: after } } });
    },
    /**
     * Ctrl+Z in the Completed panel (see step).
     * simple: the toolbar's Undo (and a phone's bottom bar) still act on the open board only, so a checklist untick
     * is taken back only with Ctrl+Z here; give those buttons this route too if the owner asks.
     */
    undoCompleted: () => step(true),
    /** Ctrl+Y in the Completed panel. */
    redoCompleted: () => step(false),
  };
}
