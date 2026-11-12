import { dropOnRow } from '../model/checklist';
import { DRAG_THRESHOLD } from '../model/constants';
import type { ItemDrag, ItemHint } from '../store/store';
import { appStore, storeOfCard } from '../store/appStore';
import { clientToBoard, clientToCanvas, isOverCanvas } from './canvasDom';
import { followEdges } from './edgeFollow';
import { isTextField } from './textField';
import { pressKind, type Touch } from '../model/tapZoom';
import { HOLD_MS, onLostFinger } from './touchHold';

// Reading checklist rows from the screen while selecting or dragging items.

/** The checklist row under the pointer, if it belongs to `cardId`. */
export function rowUnder(clientX: number, clientY: number, cardId: string): string | null {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    if (el.closest('.item-arrows')) continue; // the Move up / Move down pill floats over the row above: look through it
    const row = el.closest<HTMLElement>('[data-item-id]');
    if (!row) continue;
    return row.closest<HTMLElement>('[data-card-id]')?.dataset.cardId === cardId ? row.dataset.itemId! : null;
  }
  return null;
}

/** The checklist row under the pointer in any list, if any. */
export function rowAt(clientX: number, clientY: number): { cardId: string; itemId: string } | null {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    if (el.closest('.item-arrows')) continue; // the Move up / Move down pill floats over the row above: look through it
    const at = itemOf(el);
    if (at) return at;
  }
  return null;
}

/** The checklist row this element is in (its text, tick box or a button), with its list. */
export function itemOf(el: EventTarget | null): { cardId: string; itemId: string } | null {
  const row = el instanceof Element ? el.closest<HTMLElement>('[data-item-id]') : null;
  const cardId = row?.closest<HTMLElement>('[data-card-id]')?.dataset.cardId;
  return row && cardId ? { cardId, itemId: row.dataset.itemId! } : null;
}

/**
 * A tick box press (job 218). The box takes the keyboard (Safari and Firefox on a Mac don't do it
 * for a click), so Delete then removes its item, not the card; no focus ring for a click. But a tap
 * (finger or pen) while typing in a text box of the same card leaves the cursor there, so a phone's
 * on-screen keyboard stays up; that tap ticks the box on its touchend.
 */
let keepFor: Element | null = null; // the tick box label whose press keeps the focus where it is
let press: Touch = { x: 0, y: 0, t: 0 }; // where and when that press started
let pinched = false; // a second finger came down during that press: a pinch, never a tap
let stopWatching = () => {}; // stops listening for that second finger
const typingIn = (box: Element) => isTextField(document.activeElement) && document.activeElement!.closest('[data-card-id]') === box.closest('[data-card-id]');
type Point = { clientX: number; clientY: number };
export const tickBoxPress = {
  onPointerDown(e: Point & { pointerType: string; currentTarget: Element; preventDefault(): void }) {
    stopWatching();
    keepFor = e.pointerType !== 'mouse' && typingIn(e.currentTarget) ? e.currentTarget : null;
    press = { x: e.clientX, y: e.clientY, t: performance.now() };
    pinched = false;
    if (!keepFor) return;
    e.preventDefault(); // no mousedown, so no focus change (Chrome on Android)
    // A second finger anywhere cancels the tap, even if it lifts before this one (this finger's own pointerdown has passed the window).
    const second = (ev: PointerEvent) => {
      if (!ev.isPrimary) pinched = true;
    };
    window.addEventListener('pointerdown', second, true);
    stopWatching = () => window.removeEventListener('pointerdown', second, true);
  },
  onPointerCancel() {
    keepFor = null;
    stopWatching();
  },
  // Safari on an iPhone sends no click after that pointerdown, so a tap ticks here instead: cancelling the touchend
  // stops the browser's own click (no second tick, no focus change), and a click from the page doesn't move the focus.
  onTouchEnd(e: { currentTarget: Element; touches: { length: number }; changedTouches: ArrayLike<Point>; preventDefault(): void }) {
    if (keepFor !== e.currentTarget) return;
    const t = e.changedTouches[0];
    // Only a tap, by the same limits as a tap on the empty board (SPEC "Phone layout"): one finger the whole time, quick, and not moved.
    const tap = !pinched && e.touches.length === 0 && e.changedTouches.length === 1 && pressKind(press, { x: t.clientX, y: t.clientY, t: performance.now() }, false, HOLD_MS) === 'tap';
    e.preventDefault();
    if (tap) e.currentTarget.querySelector('input')?.click();
    keepFor = null;
    stopWatching();
  },
  onClick(e: { target: EventTarget; currentTarget: Element; preventDefault(): void }) {
    // A tap on the label around the box: the label would focus the box, so tick it through the box instead.
    if (keepFor === e.currentTarget && e.target === e.currentTarget) {
      e.preventDefault();
      e.currentTarget.querySelector('input')?.click(); // a click from the page doesn't move the focus
    }
  },
};
export function tickBoxClick(e: { currentTarget: HTMLElement }) {
  const box = e.currentTarget;
  if (document.activeElement === box || (keepFor === box.parentElement && typingIn(box))) return;
  box.focus({ preventScroll: true, focusVisible: false });
}

/**
 * Delete or Backspace removed a checklist item (job 218): until a fresh press, the held key's
 * repeats do nothing in the item the cursor moved to, so they can't join or remove more items.
 */
let removedByKey = false;
type Key = { repeat: boolean; preventDefault(): void };
/** Removes an item for this key press (`remove` says whether it did); a repeat does nothing. */
export function removeItemByKey(e: Key, remove: () => boolean) {
  e.preventDefault();
  if (!e.repeat) removedByKey = remove();
}
/** A repeat of the key that just removed an item (asked on every Delete / Backspace in an item). */
export function heldAfterRemoving(e: Key): boolean {
  if (!e.repeat) removedByKey = false;
  return removedByKey;
}

/**
 * Where a drag happens: on the board (its rows scaled by the zoom), or in the Checklist panel (owner request,
 * 2026-11-12), whose rows are drawn at full size and whose items never leave its list.
 */
type DragPlace = { store: ReturnType<typeof storeOfCard>; zoom: number; panel: boolean };
function placeOf(cardId: string, start: { x: number; y: number }): DragPlace {
  // Where the press was, not which board the list is on: while the Main checklist board is itself open, its list is in both.
  const panel = !!document.elementFromPoint(start.x, start.y)?.closest('.checklist-panel');
  return { store: storeOfCard(cardId), zoom: panel ? 1 : appStore.getState().view.zoom, panel };
}

/**
 * Where dragged items would go if dropped at this point:
 * - on a row: before it (top half), after it (bottom half), or nested under it (bottom half, a bit to the right);
 * - anywhere else in a list's box (empty space under its items, title row, collapsed): at the end of that list;
 * - on empty board, a note, a link or a column: a new list there.
 * Null means "nowhere" (e.g. over the dragged items themselves, or off the board): dropping does nothing.
 * Items dragged in the Checklist panel go nowhere outside it, and items dragged on the board nowhere over it.
 */
function itemHintAt(clientX: number, clientY: number, d: ItemDrag, at: DragPlace): ItemHint | null {
  const { board } = at.store.getState();
  if (!!document.elementFromPoint(clientX, clientY)?.closest('.checklist-panel') !== at.panel) return null;
  let columnId: string | undefined;
  // A lifted item (phone) has the rows slid aside: use the row where it sits without the slide, or the gap would move the hint and back.
  const slid = d.slide && rowWithoutSlide(clientX, clientY, at.zoom);
  if (slid) return hintOnRow(slid.row, slid.rect, clientX, clientY, d, at);
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    if (el.closest('.item-arrows')) continue; // the Move up / Move down pill floats over the row above: look through it
    const row = el.closest<HTMLElement>('[data-item-id]');
    if (row && !d.slide) return hintOnRow(row, row.getBoundingClientRect(), clientX, clientY, d, at);
    const list = el.closest<HTMLElement>('[data-todo-of]');
    if (list) return board.cards[list.dataset.todoOf!] ? { cardId: list.dataset.todoOf!, drop: { mode: 'append' }, markId: null, markMode: null } : null;
    // Anywhere else inside a list's box (the empty space under its items too), or on a collapsed list, the items go in at its end
    // (owner requests); a collapsed column gets a new list at its end.
    const block = el.closest<HTMLElement>('[data-card-id], [data-col-id]');
    const card = board.cards[block?.dataset.cardId ?? ''];
    if (card?.kind === 'todo') return { cardId: card.id, drop: { mode: 'append' }, markId: null, markMode: null };
    const column = board.columns[block?.dataset.colId ?? ''];
    if (block || el.closest('[data-testid="canvas"]')) {
      if (column?.collapsed) columnId = column.id;
      break;
    }
  }
  if (at.panel || !isOverCanvas(clientX, clientY)) return null; // the panel's list is never dragged out into a new one
  const p = clientToBoard(clientX, clientY);
  return { newList: { x: p.x - 20, y: p.y - 20 }, columnId };
}

/** The drop hint over one row of a list, from the row's box on screen. */
function hintOnRow(row: HTMLElement, r: { left: number; top: number; height: number }, clientX: number, clientY: number, d: ItemDrag, at: DragPlace): ItemHint | null {
  const { board } = at.store.getState();
  const cardId = row.closest<HTMLElement>('[data-card-id]')!.dataset.cardId!;
  const card = board.cards[cardId];
  if (card?.kind !== 'todo') return null;
  const where = { xInRow: (clientX - r.left) / at.zoom, lowerHalf: clientY >= r.top + r.height / 2, indent: parseFloat(getComputedStyle(row).paddingLeft) };
  const result = dropOnRow(card.items, row.dataset.itemId!, where, { ids: d.allIds, height: d.height });
  return result && { cardId, ...result };
}

/** The row at this point of its list as it is laid out without the slide (rows may still be gliding, so each one's current shift is taken off). */
function rowWithoutSlide(clientX: number, clientY: number, zoom: number) {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const card = el.closest<HTMLElement>('[data-card-id]');
    if (!card) continue;
    for (const row of card.querySelectorAll<HTMLElement>('[data-item-id]')) {
      const r = row.getBoundingClientRect();
      const top = r.top - new DOMMatrix(getComputedStyle(row).transform).m42 * zoom;
      if (clientY >= top && clientY < top + r.height && clientX >= r.left && clientX < r.right) return { row, rect: { left: r.left, top, height: r.height } };
    }
    return null;
  }
  return null;
}

/** How tall (board px) and wide (screen px) the rows about to be lifted are. */
function measureLift(cardId: string, ids: string[], zoom: number) {
  const rows = ids.flatMap((id) => document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(cardId)}"] [data-item-id="${CSS.escape(id)}"]`) ?? []);
  return {
    heights: Object.fromEntries(rows.map((r) => [r.dataset.itemId!, r.getBoundingClientRect().height / zoom])),
    width: rows[0]?.getBoundingClientRect().width ?? 0,
  };
}

/**
 * Drag a checklist item (with its sub-items, or all selected items) from `start`, with the finger or mouse `pointerId`: past 5px, or at
 * once after a press-and-hold on a phone (`hold`: where the finger is now, and `done` to call when
 * it lets go), when the item is lifted and the other rows slide aside. Letting go drops it.
 */
export function trackItemDrag(cardId: string, itemId: string, start: { x: number; y: number }, pointerId: number, hold?: { at: { x: number; y: number }; done: () => void }) {
  let started = false;
  const at = placeOf(cardId, start);
  const st = at.store;
  // In the panel the ghost is drawn on the page itself (it would be under the panel on the board's layer).
  const point = (x: number, y: number) => (at.panel ? { x, y } : clientToCanvas(x, y));
  const onMove = (ev: { clientX: number; clientY: number }) => {
    if (!started) {
      if (!hold && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
      started = true;
      st.startItemDrag(cardId, itemId, point(ev.clientX, ev.clientY), hold && ((ids) => measureLift(cardId, ids, at.zoom)), at.panel);
    }
    const d = st.getState().ui.itemDrag;
    if (d) st.moveItemDrag(point(ev.clientX, ev.clientY), itemHintAt(ev.clientX, ev.clientY, d, at));
  };
  // At the edge of the screen the board keeps moving, and the drag with it (not in the panel: the board stays put behind it).
  const edges = at.panel ? { track: () => {}, stop: () => {} } : followEdges((p) => started && onMove(p));
  // Only the finger that pressed drags; a second one touching or lifting does not move or drop it.
  // (By id, not isPrimary: a pinch cancels this finger with a made-up event, which is not primary.)
  const onPointerMove = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    edges.track(ev);
    onMove(ev);
  };
  const finish = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    edges.stop();
    stopLost();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    hold?.done();
    if (!started) return;
    if (ev.type === 'pointercancel') st.cancelItemDrag();
    else st.dropItems();
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
  // A finger lost without its lift-off reaching the page ends the drag as cancelled: the items stay where they were (job 197).
  const stopLost = onLostFinger(pointerId, finish);
  if (hold) onMove({ clientX: hold.at.x, clientY: hold.at.y });
}
