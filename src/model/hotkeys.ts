import { shortcutKey } from './keys';

/**
 * Custom hotkeys (job 118): the keys for the block shortcuts can be changed in the
 * Keyboard shortcuts panel. A per-device view setting like the theme: kept under its own key, never
 * in board data, never synced, never undone. Undo, redo, zoom, the arrows and the rest stay fixed.
 */
export const HOTKEYS_KEY = 'note-board:hotkeys';

/** What a person can re-map, in the order the panel lists them, with the name used in messages. */
export const HOTKEY_NAMES = {
  selectAll: 'Select all',
  copy: 'Copy',
  paste: 'Paste',
  duplicate: 'Duplicate',
  delete: 'Delete selection',
} as const;

export type HotkeyAction = keyof typeof HOTKEY_NAMES;
const ACTIONS = Object.keys(HOTKEY_NAMES) as HotkeyAction[];

/** A key: its lowercase letter or symbol (or `delete`), with Ctrl (⌘ on a Mac counts the same) and Shift. */
export interface Binding {
  key: string;
  mod: boolean;
  shift: boolean;
}

export type Hotkeys = Record<HotkeyAction, Binding>;

export const DEFAULT_HOTKEYS: Hotkeys = {
  selectAll: { key: 'a', mod: true, shift: false },
  copy: { key: 'c', mod: true, shift: false },
  paste: { key: 'v', mod: true, shift: false },
  duplicate: { key: 'd', mod: true, shift: false },
  delete: { key: 'delete', mod: false, shift: false },
};

type KeyEventLike = { key: string; code: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean };

/** True when the key just pressed is this one (exactly: Ctrl and Shift must match; Delete ignores Shift, as it always has). */
export function matches(b: Binding, e: KeyEventLike): boolean {
  return shortcutKey(e) === b.key && (e.ctrlKey || e.metaKey) === b.mod && (b.key === 'delete' || e.shiftKey === b.shift);
}

/** How the panel and the tooltips write a key: `H`, `Ctrl+D`, `Ctrl+Shift+K`, `Delete`. */
export function labelOf(b: Binding): string {
  const key = b.key === 'delete' ? 'Delete' : b.key.toUpperCase();
  return `${b.mod ? 'Ctrl+' : ''}${b.shift ? 'Shift+' : ''}${key}`;
}

const same = (a: Binding, b: Binding) => a.key === b.key && a.mod === b.mod && a.shift === b.shift;

/** Used by the app for something that can't be re-mapped (see the panel's other rows). */
const APP_KEYS = new Set(['z', 'y', '=', '+', '-', '_', '0', 'b', 'i', 'f', 'x', '>', '<']);
/** Ctrl+A / C / V also work in checklists, so they stay with their own action. */
const CHECKLIST_KEYS: Record<string, HotkeyAction> = { a: 'selectAll', c: 'copy', v: 'paste' };

/** A key that is never free: the app's own, or one the browser keeps for itself. */
function reserved(b: Binding): string | null {
  const label = labelOf(b);
  if (b.mod && APP_KEYS.has(b.key)) return `${label} is already used by the app.`;
  if (!b.mod && ((b.shift && b.key === '!') || b.key === '?')) return `${label} is already used by the app.`;
  if (b.mod && /^[twnqrlpsoujhg1-9]$/.test(b.key)) return `${label} is kept by the browser.`;
  return null;
}

const checklistClash = (action: HotkeyAction, b: Binding) =>
  b.mod && !b.shift && CHECKLIST_KEYS[b.key] && CHECKLIST_KEYS[b.key] !== action ? `${labelOf(b)} is used in checklists.` : null;

/** Why `action` can't have key `b` (a short message), or null when it can. `hotkeys`: the keys as they are now. */
export function problemWith(hotkeys: Hotkeys, action: HotkeyAction, b: Binding): string | null {
  const other = ACTIONS.find((a) => a !== action && same(hotkeys[a], b));
  if (other) return `${labelOf(b)} is already used by ${HOTKEY_NAMES[other]}.`;
  return reserved(b) ?? checklistClash(action, b);
}

/**
 * The key a person pressed while recording: a Binding, an `{ error }` to show, or null to keep waiting
 * (only Ctrl, Shift, Alt or ⌘ is down). Only one character (or Delete) works as the key, and never with Alt.
 */
export function hotkeyFromEvent(e: KeyEventLike): Binding | { error: string } | null {
  if (/^(Shift|Control|Alt|Meta|AltGraph|CapsLock)$/.test(e.key)) return null;
  if (e.altKey) return { error: 'Alt isn’t available here: Alt+arrows jump between cards.' };
  const key = shortcutKey(e);
  const mod = e.ctrlKey || e.metaKey;
  if (e.shiftKey && !mod && e.code === 'Digit1') return { error: 'Shift+1 is already used by the app.' };
  if (key === 'delete' ? mod || e.shiftKey : key.length !== 1 || key === ' ') return { error: 'That key is used for something else.' };
  return { key, mod, shift: e.shiftKey };
}

const isBinding = (v: unknown): v is Binding => {
  const b = v as Binding | null;
  return typeof b === 'object' && b !== null && typeof b.mod === 'boolean' && typeof b.shift === 'boolean' && typeof b.key === 'string' && (b.key === 'delete' ? !b.mod && !b.shift : b.key.length === 1 && b.key !== ' ' && b.key === b.key.toLowerCase());
};

/**
 * The keys this device saved. Anything missing, damaged or not allowed falls back to that action's
 * default; if two actions then share a key the whole saved set is dropped (all defaults).
 */
export function startingHotkeys(saved: string | null): Hotkeys {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(saved ?? 'null');
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch {
    // Damaged: the defaults.
  }
  const out = { ...DEFAULT_HOTKEYS };
  for (const a of ACTIONS) {
    const b = data[a];
    if (isBinding(b) && !reserved(b) && !checklistClash(a, b)) out[a] = { key: b.key, mod: b.mod, shift: b.shift };
  }
  const clash = ACTIONS.some((a, i) => ACTIONS.some((o, j) => i < j && same(out[a], out[o])));
  return clash ? DEFAULT_HOTKEYS : out;
}
