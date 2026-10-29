import { useEffect, useState } from 'react';
import { appStore, useAppState } from '../store/appStore';
import { calendar, useCalendar } from '../store/calendar';

/** How long the Undo message stays (ms), not counting while the pointer or keyboard is on it. */
const UNDO_TOAST_MS = 6000;

/**
 * After a delete (job 170): "Deleted 1 card · Undo" at the bottom center. Undo is the same undo as
 * Ctrl+Z; the message goes when anything else changes (the store stops offering it), after 6 seconds,
 * or on Undo. It is said aloud by the page's live region (the store announces it).
 * The Google Calendar panel's "Event added / saved / deleted · Undo" (job 217) is the same message,
 * one at a time: whichever came last shows.
 */
export function UndoToast() {
  const toast = useAppState(() => appStore.undoToast());
  const done = useCalendar().done;
  // The newer message replaces the other.
  useEffect(() => {
    if (toast) calendar.dismissDone();
  }, [toast]);
  useEffect(() => {
    if (done) appStore.dismissUndoToast();
  }, [done]);
  // A new delete starts afresh (6 seconds, not held), even while the pointer is still where the last one was.
  if (toast)
    return (
      <Pill
        key={toast.edits}
        text={toast.text}
        onDismiss={appStore.dismissUndoToast}
        onUndo={(kept) => {
          // The message goes with this button; focus moves to Redo (always there, and what comes next) instead of dropping to the top of the page.
          appStore.undoDelete();
          if (kept) document.querySelector<HTMLElement>('button[aria-label^="Redo"]')?.focus({ preventScroll: true });
        }}
      />
    );
  return (
    done && (
      <Pill
        key={`cal${done.n}`}
        text={done.text}
        onDismiss={calendar.dismissDone}
        onUndo={
          done.undo &&
          ((kept) => {
            // The keyboard goes to the side panel (the calendar, where the change shows) as the button goes.
            if (kept) document.querySelector<HTMLElement>('.side-panel')?.focus({ preventScroll: true });
            void calendar.undo();
          })
        }
      />
    )
  );
}

function Pill({ text, onUndo, onDismiss }: { text: string; onUndo: ((kept: boolean) => void) | null; onDismiss: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const held = hovered || focused;
  useEffect(() => {
    if (held) return;
    const t = setTimeout(onDismiss, UNDO_TOAST_MS);
    return () => clearTimeout(t);
  }, [held, onDismiss]);
  return (
    <div className="undo-toast" onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
      <span>{text}</span>
      {onUndo && (
        <button type="button" onClick={(e) => onUndo(document.activeElement === e.currentTarget)}>
          Undo
        </button>
      )}
    </div>
  );
}
