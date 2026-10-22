import { useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore } from 'react';

// The app's own question before something that can't simply be undone (job 170, owner's option 3A):
// a modal card (a bottom sheet on a phone) in place of the browser's confirm(). Screen state only,
// not board data.

export interface Question {
  title: string;
  body: string;
  /** The action button's words ("Delete board"); the safe button's are `cancel` ("Cancel"). */
  action: string;
  cancel?: string;
  /** Red for deleting or removing; otherwise the accent color (something Version history can give back). */
  danger?: boolean;
}

let open: (Question & { answer: (yes: boolean) => void; back: Element | null }) | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

/** Asks `q` in the app; true when the action was chosen, false for the safe button, Escape or a click beside it. */
export function ask(q: Question): Promise<boolean> {
  // Focus goes back where it was (if that is still on the page) once it is answered; asked while
  // another question is open, where that one would have sent it.
  const active = document.activeElement;
  const back = open && active?.closest('dialog.ask') ? open.back : active;
  open?.answer(false); // only one question at a time
  return new Promise((resolve) => {
    const answer = (yes: boolean) => {
      if (open?.answer !== answer) return;
      open = null;
      changed();
      resolve(yes);
    };
    open = { ...q, answer, back };
    changed();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** The one place a question shows; mounted once in the app. */
export function ConfirmDialog() {
  const q = useSyncExternalStore(subscribe, () => open);
  const ref = useRef<HTMLDialogElement>(null);
  const safe = useRef<HTMLButtonElement>(null);
  const pressedScrim = useRef(false);
  const id = useId();
  // If the app goes away with a question open (signed out in another tab), it is answered no, not asked again on the way back in.
  useEffect(() => () => open?.answer(false), []);
  // The browser's modal dialog: it keeps Tab inside, makes the rest of the page inert and shows the scrim.
  // Opened before it is drawn, with the safe button focused (so a stray Enter never deletes).
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!q || !dialog) return;
    dialog.showModal();
    safe.current?.focus();
    return () => {
      dialog.close();
      if (q.back instanceof HTMLElement && q.back.isConnected) q.back.focus();
    };
  }, [q]);
  if (!q) return null;
  return (
    <dialog
      ref={ref}
      className="ask"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`${id}-t`}
      aria-describedby={`${id}-d`}
      onCancel={(e) => {
        e.preventDefault(); // Escape: answered here, so the dialog closes the React way
        q.answer(false);
      }}
      // A press on the scrim (the dialog itself, outside its card) is the same as the safe button;
      // not a text selection that started in the card and ended beside it.
      onPointerDown={(e) => (pressedScrim.current = e.target === e.currentTarget)}
      onClick={(e) => e.target === e.currentTarget && pressedScrim.current && q.answer(false)}
      // Board keys never act behind it (Enter and Space still press its buttons).
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="ask-card">
        <h2 id={`${id}-t`}>{q.title}</h2>
        <p id={`${id}-d`}>{q.body}</p>
        <div className="confirm-actions">
          <button ref={safe} type="button" className="confirm-cancel" onClick={() => q.answer(false)}>
            {q.cancel ?? 'Cancel'}
          </button>
          <button type="button" className={q.danger ? 'confirm-delete' : 'confirm-send'} onClick={() => q.answer(true)}>
            {q.action}
          </button>
        </div>
      </div>
    </dialog>
  );
}
