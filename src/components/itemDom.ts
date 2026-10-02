import { dropOnRow } from '../model/checklist';
import type { ItemDrag, ItemHint } from '../store/store';
import { appStore } from '../store/appStore';
import { clientToBoard, isOverCanvas } from './canvasDom';

// Reading checklist rows from the screen while selecting or dragging items.

/** The checklist row under the pointer, if it belongs to `cardId`. */
export function rowUnder(clientX: number, clientY: number, cardId: string): string | null {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const row = el.closest<HTMLElement>('[data-item-id]');
    if (!row) continue;
    return row.closest<HTMLElement>('[data-card-id]')?.dataset.cardId === cardId ? row.dataset.itemId! : null;
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
export function itemHintAt(clientX: number, clientY: number, d: ItemDrag): ItemHint | null {
  const { board, view } = appStore.getState();
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const row = el.closest<HTMLElement>('[data-item-id]');
    if (row) {
      const cardId = row.closest<HTMLElement>('[data-card-id]')!.dataset.cardId!;
      const card = board.cards[cardId];
      if (card?.kind !== 'todo') return null;
      const r = row.getBoundingClientRect();
      const at = { xInRow: (clientX - r.left) / view.zoom, lowerHalf: clientY >= r.top + r.height / 2 };
      const result = dropOnRow(card.items, row.dataset.itemId!, at, { ids: d.allIds, height: d.height });
      return result && { cardId, ...result };
    }
    const list = el.closest<HTMLElement>('[data-todo-of]');
    if (list) return { cardId: list.dataset.todoOf!, drop: { mode: 'append' }, markId: null, markMode: null };
    if (el.closest('[data-card-id], [data-col-id], [data-testid="canvas"]')) break;
  }
  if (!isOverCanvas(clientX, clientY)) return null;
  const p = clientToBoard(clientX, clientY);
  return { newList: { x: p.x - 20, y: p.y - 20 } };
}
