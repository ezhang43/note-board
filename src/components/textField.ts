import { useEffect, type RefObject } from 'react';
import { appStore } from '../store/appStore';

/** True while the user is typing in a text box (checkboxes don't count). */
export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === 'TEXTAREA') return true;
  return target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'checkbox';
}

/** True while a panel covers the board (Send feedback, Delete account): board keys then leave it alone. */
export const panelCovers = () => document.querySelector('[aria-modal="true"]') !== null;

/**
 * Whether this Escape is for the side panel or Version history (so it closes it), and not for
 * something else that answers it first: a text box, the shortcuts list, a "Delete …?" question
 * (or an event's card), an open menu (toolbar, Color, Share, ⋯) or a panel covering the board.
 * `textBoxToo`: a text box doesn't answer it (the boxes in an old version shown read-only don't).
 */
export function escapeIsForPanel(e: KeyboardEvent, textBoxToo = false): boolean {
  if (e.key !== 'Escape' || (!textBoxToo && isTextField(e.target)) || panelCovers()) return false;
  const { shortcutsOpen, confirm, deleteCompleted, colourMenuOpen } = appStore.getState().ui;
  if (shortcutsOpen || confirm || deleteCompleted || colourMenuOpen) return false;
  if (e.target instanceof Element && e.target.closest('[role="alertdialog"], .find-bar')) return false; // the search bar answers its own Escape
  return !document.querySelector('.cal-card, header.toolbar [aria-expanded="true"], [aria-haspopup][aria-expanded="true"]');
}

/**
 * While a panel covers the board, everything beside it is `inert`: Tab, clicks and Enter on a
 * focused button can't reach the board behind it, wherever focus is.
 * simple: only what is beside the panel when it opens; something that appears later stays live.
 */
export function useCoverBoard(panel: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const backdrop = panel.current;
    const others = [...(backdrop?.parentElement?.children ?? [])].filter((el): el is HTMLElement => el !== backdrop && el instanceof HTMLElement);
    others.forEach((el) => (el.inert = true));
    return () => others.forEach((el) => (el.inert = false));
  }, [panel]);
}
