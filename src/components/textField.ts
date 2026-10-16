import { useEffect, type RefObject } from 'react';

/** True while the user is typing in a text box (checkboxes don't count). */
export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === 'TEXTAREA') return true;
  return target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'checkbox';
}

/** True while a panel covers the board (Send feedback, Delete account): board keys then leave it alone. */
export const panelCovers = () => document.querySelector('[aria-modal="true"]') !== null;

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
