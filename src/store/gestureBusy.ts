import type { Store } from './store';

/** Whether a board-changing pointer gesture is in progress, so incoming remote versions wait until it ends. */
export function isGestureBusy(store: Store): boolean {
  const ui = store.getState().ui;
  return Boolean(ui.drag || ui.resize || ui.newDrag || ui.itemDrag);
}
