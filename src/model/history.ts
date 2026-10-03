import type { Board } from './types';

/** Undo keeps this many steps. */
export const HISTORY_LIMIT = 100;
/** Typing in the same field within this long of the last keystroke joins the same undo step. */
export const TYPING_MERGE_MS = 1200;

export interface History {
  /** Boards before each change, oldest first. */
  past: Board[];
  /** Boards undone, most recently undone last. */
  future: Board[];
  /** The field last typed in (e.g. "text:k_123"), so a burst of typing is one step. */
  mergeKey: string | null;
  mergeAt: number;
}

export const emptyHistory: History = { past: [], future: [], mergeKey: null, mergeAt: 0 };

/**
 * Remember `before` as an undo step for a change that just happened.
 * `key` names the text field being typed in; repeated typing in it (without a pause) is one step.
 */
export function recordChange(h: History, before: Board, key: string | null, now: number): History {
  if (key && key === h.mergeKey && now - h.mergeAt < TYPING_MERGE_MS) return { ...h, mergeAt: now };
  return { past: [...h.past, before].slice(-HISTORY_LIMIT), future: [], mergeKey: key, mergeAt: now };
}

export function undo(h: History, current: Board): { history: History; board: Board } | null {
  if (!h.past.length) return null;
  return {
    board: h.past[h.past.length - 1],
    history: { past: h.past.slice(0, -1), future: [...h.future, current], mergeKey: null, mergeAt: 0 },
  };
}

export function redo(h: History, current: Board): { history: History; board: Board } | null {
  if (!h.future.length) return null;
  return {
    board: h.future[h.future.length - 1],
    history: { past: [...h.past, current], future: h.future.slice(0, -1), mergeKey: null, mergeAt: 0 },
  };
}
