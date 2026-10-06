import { useEffect } from 'react';
import { completedSectionCount } from '../model/completed';
import { appStore, useAppState } from '../store/appStore';

/** How long "No completed items on this board" shows (ms). */
const NONE_MS = 2500;

/**
 * Ctrl+Shift+Backspace (owner request): "Delete 12 completed items?" · Keep · Delete, in the same
 * style as the column × confirmation; or, with nothing completed, a short note that goes by itself.
 */
export function DeleteCompleted() {
  const mode = useAppState((s) => s.ui.deleteCompleted);
  const count = useAppState((s) => (s.ui.deleteCompleted === 'ask' ? completedSectionCount(s.board) : 0));
  // Also when the items went while asking (deleted on another device, say).
  const none = mode === 'none' || (mode === 'ask' && !count);
  useEffect(() => {
    if (!none) return;
    const t = setTimeout(appStore.cancelDeleteCompleted, NONE_MS);
    return () => clearTimeout(t);
  }, [none]);
  if (none) {
    return (
      <p className="notice-banner delete-completed-note" role="status">
        No completed items on this board
      </p>
    );
  }
  if (mode !== 'ask') return null;
  return (
    <div className="confirm delete-completed" role="alertdialog" aria-label="Delete completed items?">
      <div className="confirm-title">{`Delete ${count} completed ${count === 1 ? 'item' : 'items'}?`}</div>
      <div className="confirm-actions">
        <button type="button" className="confirm-cancel" autoFocus onClick={appStore.cancelDeleteCompleted}>
          Keep
        </button>
        <button type="button" className="confirm-delete" onClick={appStore.confirmDeleteCompleted}>
          Delete
        </button>
      </div>
    </div>
  );
}
