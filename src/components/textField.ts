import { useEffect, useState, type RefObject } from 'react';
import { appStore } from '../store/appStore';

/** True while the user is typing in a text box (checkboxes don't count). */
export function isTextField(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === 'TEXTAREA') return true;
  return target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'checkbox';
}

/**
 * For the Undo and Redo buttons (owner, 2026-11-09): pressed with a pointer while typing in a block (a checklist item, a note,
 * a title), they leave the cursor there, as Ctrl+Z does, so the undo can put it back where it belongs and a Backspace after
 * it edits text, never deleting the selected card. Reached with Tab, a button still takes the keyboard focus and shows its ring.
 * Text boxes outside the board (a panel's, the board name) lose the cursor as before: some save on leaving.
 */
function keepBlockCursor(e: { preventDefault(): void }) {
  const el = document.activeElement;
  if (isTextField(el) && el.closest('[data-card-id], [data-col-id]')) e.preventDefault();
}
export const keepsBlockCursor = { onPointerDown: keepBlockCursor, onMouseDown: keepBlockCursor };

/**
 * True while a panel covers the board (Send feedback, Delete account), or a calendar event is being
 * dragged (`body.cal-dragging`, whose Escape is the drag's): board keys then leave it alone.
 */
export const panelCovers = () => document.querySelector('[aria-modal="true"], body.cal-dragging') !== null;

/**
 * Whether this Escape is for the side panel or Version history (so it closes it), and not for
 * something else that answers it first: a text box, the shortcuts list, a "Delete …?" question
 * (or an event's card), an open menu (toolbar, Color, Share, ⋯) or a panel covering the board.
 * `textBoxToo`: a text box doesn't answer it (the boxes in an old version shown read-only don't).
 */
export function escapeIsForPanel(e: KeyboardEvent, textBoxToo = false): boolean {
  // In the Checklist panel on the left, Escape is that panel's (escapeIsForChecklist): one press closes one panel.
  return taken(e, escapeIsFree(e, textBoxToo) && !(e.target instanceof Element && e.target.closest('.checklist-panel')));
}

/** The Escape presses that already closed a panel: one press closes one panel, whichever listener hears it first. */
const closedOne = new WeakSet<Event>();
const taken = (e: Event, mine: boolean) => {
  if (!mine || closedOne.has(e)) return false;
  closedOne.add(e);
  return true;
};

/**
 * Whether this Escape closes the Checklist panel (owner request, 2026-11-12): pressed in it, or, while no panel
 * is open on the right, anywhere else on the page; with one open there, Escape outside the Checklist closes that one.
 */
export function escapeIsForChecklist(e: KeyboardEvent): boolean {
  // Items selected in it: this Escape drops the selection (as on the board); the next one closes the panel.
  if (!escapeIsFree(e) || document.querySelector('.checklist-panel .todo-item.picked')) return false;
  return taken(e, (e.target instanceof Element && e.target.closest('.checklist-panel') !== null) || !document.querySelector('.history-panel'));
}

/** Escape that nothing else answers first (escapeIsForPanel). */
function escapeIsFree(e: KeyboardEvent, textBoxToo = false): boolean {
  if (e.key !== 'Escape' || (!textBoxToo && isTextField(e.target)) || panelCovers()) return false;
  const { shortcutsOpen, confirm, deleteCompleted, colourMenuOpen } = appStore.getState().ui;
  if (shortcutsOpen || confirm || deleteCompleted || colourMenuOpen) return false;
  if (e.target instanceof Element && e.target.closest('[role="alertdialog"], .find-bar, .format-bar')) return false; // the search bar and the format bar answer their own Escape
  return !document.querySelector('.cal-card, header.toolbar [aria-expanded="true"], [aria-haspopup][aria-expanded="true"]');
}

/**
 * While a panel covers the board, everything beside it is `inert`: Tab, clicks and Enter on a
 * focused button can't reach the board behind it, wherever focus is.
 * simple: only what is beside the panel when it opens; something that appears later stays live.
 */
export function useCoverBoard(panel: RefObject<HTMLElement | null>) {
  // What had focus when the panel opened (read while drawing, before a field inside it takes focus).
  const [opener] = useState(() => document.activeElement);
  useEffect(() => {
    const backdrop = panel.current;
    const others = [...(backdrop?.parentElement?.children ?? [])].filter((el): el is HTMLElement => el !== backdrop && el instanceof HTMLElement);
    others.forEach((el) => (el.inert = true));
    return () => {
      others.forEach((el) => (el.inert = false));
      // Closing gives focus back, if that is still on the page (it isn't when its menu closed on the way in).
      // Only when the panel really went: in development React runs this once at the start too, with the panel still there.
      if (backdrop && !backdrop.isConnected && opener instanceof HTMLElement && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
    };
  }, [panel, opener]);
}
