import { COLUMN_DROP_REACH } from '../model/constants';
import { columnAt, insertIndex } from '../model/geometry';
import { screenToBoard } from '../model/view';
import { appStore } from '../store/appStore';

// Reading positions from what is drawn on screen. Kept here so components stay simple.

let canvasEl: HTMLElement | null = null;

export function setCanvasElement(el: HTMLElement | null) {
  canvasEl = el;
}

/** Screen (client) coordinates → board coordinates. */
export function clientToBoard(clientX: number, clientY: number) {
  const r = canvasEl?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return screenToBoard(appStore.getState().view, { x: clientX - r.left, y: clientY - r.top });
}

/** Screen (client) coordinates → pixels from the canvas's top-left corner. */
export function clientToCanvas(clientX: number, clientY: number) {
  const r = canvasEl?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return { x: clientX - r.left, y: clientY - r.top };
}

/** True if the point is over the board (not the toolbar or outside the window). */
export function isOverCanvas(clientX: number, clientY: number) {
  const r = canvasEl?.getBoundingClientRect();
  return !!r && clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

/** Drawn sizes (board pixels) of every block except `block` and anything inside it. */
export function otherBlockSizes(block: HTMLElement) {
  if (!canvasEl) return [];
  return Array.from(canvasEl.querySelectorAll<HTMLElement>('[data-card-id], [data-col-id]'))
    .filter((el) => el !== block && !block.contains(el))
    .map((el) => ({ id: (el.dataset.cardId ?? el.dataset.colId)!, w: el.offsetWidth, h: el.offsetHeight }));
}

function columnElements(): HTMLElement[] {
  return canvasEl ? Array.from(canvasEl.querySelectorAll<HTMLElement>('[data-col-id]')) : [];
}

/** The column under the pointer, for dropping a card into. */
export function columnUnder(clientX: number, clientY: number): string | null {
  const cols = columnElements().map((el) => {
    const r = el.getBoundingClientRect();
    return { id: el.dataset.colId!, rect: { x: r.left, y: r.top, w: r.width, h: r.height } };
  });
  return columnAt({ x: clientX, y: clientY }, cols, COLUMN_DROP_REACH * appStore.getState().view.zoom);
}

/** Where in a column a card dropped at this height goes. */
export function dropIndex(columnId: string, clientY: number): number {
  const col = columnElements().find((el) => el.dataset.colId === columnId);
  if (!col) return 0;
  const middles = Array.from(col.querySelectorAll<HTMLElement>('[data-card-id]')).map((el) => {
    const r = el.getBoundingClientRect();
    return r.top + r.height / 2;
  });
  return insertIndex(clientY, middles);
}
