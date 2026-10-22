import { useEffect, useState } from 'react';
import { appStore, useAppState } from '../store/appStore';
import type { UndoToast as Toast } from '../store/types';

/** How long the Undo message stays (ms), not counting while the pointer or keyboard is on it. */
const UNDO_TOAST_MS = 6000;

/**
 * After a delete (job 170): "Deleted 1 card · Undo" at the bottom center. Undo is the same undo as
 * Ctrl+Z; the message goes when anything else changes (the store stops offering it), after 6 seconds,
 * or on Undo. It is said aloud by the page's live region (the store announces it).
 */
export function UndoToast() {
  const toast = useAppState(() => appStore.undoToast());
  // A new delete starts afresh (6 seconds, not held), even while the pointer is still where the last one was.
  return toast && <Pill key={toast.edits} toast={toast} />;
}

function Pill({ toast }: { toast: Toast }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const held = hovered || focused;
  useEffect(() => {
    if (held) return;
    const t = setTimeout(appStore.dismissUndoToast, UNDO_TOAST_MS);
    return () => clearTimeout(t);
  }, [held]);
  return (
    <div className="undo-toast" onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
      <span>{toast.text}</span>
      <button type="button" onClick={appStore.undoDelete}>
        Undo
      </button>
    </div>
  );
}
