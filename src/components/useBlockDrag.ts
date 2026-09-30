import type React from 'react';
import { DRAG_THRESHOLD } from '../model/constants';
import { snapToGrid } from '../model/geometry';
import { appStore } from '../store/appStore';
import { clientToBoard, columnUnder, dropIndex } from './canvasDom';

const INTERACTIVE = 'input, textarea, button, a, select, label';

/**
 * Pointer handling for a card or column: pressing selects it; pressing a blank part and
 * moving at least 5px drags it.
 */
export function blockPointerDown(kind: 'card' | 'column', id: string) {
  return (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation(); // the board underneath must not pan or clear the selection
    appStore.select(id);
    if ((e.target as Element).closest(INTERACTIVE)) return;

    // Pressing blank card space: no text selection, and leave any text box being edited.
    e.preventDefault();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    const el = e.currentTarget;
    const start = { x: e.clientX, y: e.clientY };
    let offset: { x: number; y: number } | null = null;

    const onMove = (ev: PointerEvent) => {
      if (!offset) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
        const r = el.getBoundingClientRect();
        const topLeft = clientToBoard(r.left, r.top);
        const grab = clientToBoard(start.x, start.y);
        offset = { x: grab.x - topLeft.x, y: grab.y - topLeft.y };
        appStore.startDrag({ kind, id, x: topLeft.x, y: topLeft.y, overColumn: null });
      }
      const p = clientToBoard(ev.clientX, ev.clientY);
      const snap = appStore.getState().board.snap ? snapToGrid : Math.round;
      appStore.moveDrag(snap(p.x - offset.x), snap(p.y - offset.y), kind === 'card' ? columnUnder(ev.clientX, ev.clientY) : null);
    };

    const finish = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (!offset) return;
      if (ev.type === 'pointercancel') return appStore.cancelDrag();
      const over = appStore.getState().ui.drag?.overColumn;
      appStore.dropDrag(over ? dropIndex(over, ev.clientY) : null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };
}
