import { dropOnRow } from '../model/checklist';
import { DRAG_THRESHOLD } from '../model/constants';
import type { ItemDrag, ItemHint } from '../store/store';
import { appStore } from '../store/appStore';
import { clientToBoard, clientToCanvas, isOverCanvas } from './canvasDom';
import { followEdges } from './edgeFollow';

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
    const row = el.closest<HTMLElement>('[data-item-id]');
    const cardId = row?.closest<HTMLElement>('[data-card-id]')?.dataset.cardId;
    if (row && cardId) return { cardId, itemId: row.dataset.itemId! };
  }
  return null;
}

/**
 * Where dragged items would go if dropped at this point:
 * - on a row: before it (top half), after it (bottom half), or nested under it (bottom half, a bit to the right);
 * - on empty space in a list: at the end of that list;
 * - on empty board, a note, a link or a column: a new list there.
 * Null means "nowhere" (e.g. over the dragged items themselves, or off the board): dropping does nothing.
 */
function itemHintAt(clientX: number, clientY: number, d: ItemDrag): ItemHint | null {
  const { board } = appStore.getState();
  let columnId: string | undefined;
  // A lifted item (phone) has the rows slid aside: use the row where it sits without the slide, or the gap would move the hint and back.
  const slid = d.slide && rowWithoutSlide(clientX, clientY);
  if (slid) return hintOnRow(slid.row, slid.rect, clientX, clientY, d);
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    if (el.closest('.item-arrows')) continue; // the Move up / Move down pill floats over the row above: look through it
    const row = el.closest<HTMLElement>('[data-item-id]');
    if (row && !d.slide) return hintOnRow(row, row.getBoundingClientRect(), clientX, clientY, d);
    const list = el.closest<HTMLElement>('[data-todo-of]');
    if (list) return { cardId: list.dataset.todoOf!, drop: { mode: 'append' }, markId: null, markMode: null };
    // A collapsed list takes the items at its end (owner request); a collapsed column gets a new list at its end.
    const block = el.closest<HTMLElement>('[data-card-id], [data-col-id]');
    const card = board.cards[block?.dataset.cardId ?? ''];
    if (card?.kind === 'todo' && card.collapsed) return { cardId: card.id, drop: { mode: 'append' }, markId: null, markMode: null };
    const column = board.columns[block?.dataset.colId ?? ''];
    if (block || el.closest('[data-testid="canvas"]')) {
      if (column?.collapsed) columnId = column.id;
      break;
    }
  }
  if (!isOverCanvas(clientX, clientY)) return null;
  const p = clientToBoard(clientX, clientY);
  return { newList: { x: p.x - 20, y: p.y - 20 }, columnId };
}

/** The drop hint over one row of a list, from the row's box on screen. */
function hintOnRow(row: HTMLElement, r: { left: number; top: number; height: number }, clientX: number, clientY: number, d: ItemDrag): ItemHint | null {
  const { board, view } = appStore.getState();
  const cardId = row.closest<HTMLElement>('[data-card-id]')!.dataset.cardId!;
  const card = board.cards[cardId];
  if (card?.kind !== 'todo') return null;
  const at = { xInRow: (clientX - r.left) / view.zoom, lowerHalf: clientY >= r.top + r.height / 2 };
  const result = dropOnRow(card.items, row.dataset.itemId!, at, { ids: d.allIds, height: d.height });
  return result && { cardId, ...result };
}

/** The row at this point of its list as it is laid out without the slide (rows may still be gliding, so each one's current shift is taken off). */
function rowWithoutSlide(clientX: number, clientY: number) {
  const { zoom } = appStore.getState().view;
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
function measureLift(cardId: string, ids: string[]) {
  const { zoom } = appStore.getState().view;
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
  const onMove = (ev: { clientX: number; clientY: number }) => {
    if (!started) {
      if (!hold && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
      started = true;
      appStore.startItemDrag(cardId, itemId, clientToCanvas(ev.clientX, ev.clientY), hold && ((ids) => measureLift(cardId, ids)));
    }
    const d = appStore.getState().ui.itemDrag;
    if (d) appStore.moveItemDrag(clientToCanvas(ev.clientX, ev.clientY), itemHintAt(ev.clientX, ev.clientY, d));
  };
  // At the edge of the screen the board keeps moving, and the drag with it.
  const edges = followEdges((p) => started && onMove(p));
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
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    hold?.done();
    if (!started) return;
    if (ev.type === 'pointercancel') appStore.cancelItemDrag();
    else appStore.dropItems();
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
  if (hold) onMove({ clientX: hold.at.x, clientY: hold.at.y });
}
