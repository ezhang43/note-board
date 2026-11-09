import { isTextField } from './textField';

/**
 * Job sync-keeps-cursor (owner OK, 2026-11-09). When something other than the person takes the text box being typed in
 * off the page (a change synced from another device redraws the list without it), the browser drops the cursor onto
 * the page with the block still selected, and the next Backspace or Delete would delete the block. This notes where in
 * a block the keyboard is (a text box: a checklist item, a title, a note; or a checklist item's tick box or buttons),
 * and forgets it only when the person leaves it on purpose: a click or tap that moves the focus, the focus going
 * somewhere else (Tab, another box), or a key the app answers by taking the cursor out (`leaveField`: Escape, an arrow
 * onto a card with no text box, Ctrl+A in a list).
 */
let held: HTMLElement | null = null;
/** When the person last pressed, moved a pressed pointer, let go or clicked: a focus move just after it is theirs. */
let pointerAt = -Infinity;
/** How long after a pointer event a focus move still counts as made by it (a tap moves the focus after it is let go). */
const POINTER_MS = 600;

const BLOCK = '[data-card-id], [data-col-id]';

function kept(el: EventTarget | null): HTMLElement | null {
  if (!(el instanceof HTMLElement) || !el.closest(BLOCK)) return null;
  return el.closest('[data-item-id]') || isTextField(el) ? el : null;
}

const onFocusIn = (e: FocusEvent) => (held = kept(e.target));
const onFocusOut = (e: FocusEvent) => {
  const el = e.target as HTMLElement;
  if (el !== held || performance.now() - pointerAt > POINTER_MS) return;
  // A press moved the focus away: the person's choice, unless the box was taken off the page (a change arriving
  // just after a click inside it). Read once the change is done: some browsers send this while removing it.
  queueMicrotask(() => {
    if (held === el && el.isConnected) held = null;
  });
};
const onPointer = (e: PointerEvent | MouseEvent) => {
  if (e.type === 'pointermove' && !e.buttons) return; // only a pressed pointer, as in a drag
  if (e.type === 'click' && !e.detail) return; // a click a key makes (Space on a tick box) is no press
  pointerAt = performance.now();
  if (e.type === 'pointerdown' && cursorLost()) held = null; // a click after the box went chooses what is selected
};
const POINTER_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'click'] as const;

/** Starts noting where the keyboard is in the blocks (one caller: the board's shortcuts); returns the function that stops it. */
export function watchLostCursor(): () => void {
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
  for (const type of POINTER_EVENTS) document.addEventListener(type, onPointer, true);
  return () => {
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
    for (const type of POINTER_EVENTS) document.removeEventListener(type, onPointer, true);
    held = null;
  };
}

/** Forgets the box the keyboard fell out of: the person moved on (switched boards from the keyboard). */
export function forgetLostCursor() {
  held = null;
}

/** Takes the cursor out of a text box on purpose (a key or button the app answers that way), so the selected block can be deleted. */
export function leaveField(el: HTMLElement) {
  if (el === held) held = null;
  el.blur();
}

/**
 * True when the keyboard was in a block and fell out of it without the person leaving it: the keys that delete blocks
 * then do nothing. It stays true for every later key until a click, a tap or a focus move, so a held or repeated
 * Backspace can't delete the block either.
 * simple: a box whose row is moved (taken out and put back) within 0.6s of the person's own press counts as left on purpose;
 * moves keep the cursor today (a browser test checks it), so this only matters if a redraw ever starts dropping it then.
 */
export function cursorLost(): boolean {
  return held !== null && document.activeElement !== held;
}

