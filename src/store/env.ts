// Small bridges to the browser, each safe where there is none (as in unit tests).

/** Runs a function soon, after the current work (and, in the browser, after drawing). */
export type Schedule = (fn: () => void) => void;
export const later: Schedule = (fn) => setTimeout(fn, 0);

/** True when the computer is set to reduce motion (or there is no screen, as in unit tests). */
export function reducedMotion(): boolean {
  return typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Puts text on the computer's clipboard, so it can be pasted into other apps (does nothing without one). */
export function copyText(text: string) {
  try {
    void globalThis.navigator?.clipboard?.writeText(text).catch(() => {});
  } catch {
    // No clipboard access: copying within the board still works.
  }
}

/** Whether the computer is set to dark mode (false where there is no browser, as in unit tests). */
export function prefersDark(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  } catch {
    return false;
  }
}
