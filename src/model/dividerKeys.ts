/**
 * The Journal's Alt+I, then R shortcut for a divider (owner request 2026-11-11, as in Google Docs). Hold Alt, press I,
 * then R within `DIVIDER_KEYS_WINDOW` ms, Alt still held or let go. Any other key cancels it; pressing a modifier key
 * does not. Keys are matched by `code` (the key's place), never by the character, so other layouts work and so does a
 * Mac, where Option+I types a dead-key character: both keys are always stopped, so no stray character shows.
 */
export const DIVIDER_KEYS_WINDOW = 1500;

type Key = { code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; repeat: boolean; isComposing?: boolean };

const MODIFIERS = new Set(['AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'CapsLock']);

/** One key press: `armed` is when Alt+I was pressed (null when it was not); returns the new `armed` and whether to stop the key and to insert the divider. */
export function dividerKeyStep(armed: number | null, e: Key, now: number): { armed: number | null; prevent: boolean; fire: boolean } {
  if (e.isComposing) return { armed: null, prevent: false, fire: false }; // an input method's own keys
  const plain = !e.ctrlKey && !e.metaKey && !e.shiftKey; // Shift+R is a capital letter, not the shortcut
  if (MODIFIERS.has(e.code)) return { armed, prevent: false, fire: false };
  if (plain && e.altKey && e.code === 'KeyI') return { armed: e.repeat && armed !== null ? armed : now, prevent: true, fire: false };
  if (plain && e.code === 'KeyR' && armed !== null && now - armed <= DIVIDER_KEYS_WINDOW) return { armed: null, prevent: true, fire: true };
  return { armed: null, prevent: false, fire: false };
}
