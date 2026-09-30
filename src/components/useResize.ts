import type React from 'react';
import { resizeTo } from '../model/sizing';
import { appStore } from '../store/appStore';
import { clientToBoard, clientToCanvas, otherBlockSizes } from './canvasDom';

/**
 * Pointer handling for a resize handle. `axes` is 'both' for a corner handle (width and
 * minimum height) or 'width' for a column's right-edge strip.
 */
export function resizePointerDown(kind: 'card' | 'column', id: string, axes: 'both' | 'width') {
  return (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    appStore.select(id);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    const block = e.currentTarget.closest<HTMLElement>('[data-card-id], [data-col-id]')!;
    // offsetWidth / offsetHeight are in board pixels (they ignore the zoom).
    const w0 = block.offsetWidth;
    const h0 = block.offsetHeight;
    const start = clientToBoard(e.clientX, e.clientY);
    const candidates = otherBlockSizes(block);
    const snap = appStore.getState().board.snap;
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      moved = true;
      const p = clientToBoard(ev.clientX, ev.clientY);
      const raw = { w: w0 + p.x - start.x, h: axes === 'both' ? h0 + p.y - start.y : null };
      const at = clientToCanvas(ev.clientX, ev.clientY);
      appStore.showResize({ kind, id, ...resizeTo(kind, raw, candidates, snap), labelAt: { x: at.x + 16, y: at.y + 16 } });
    };

    const finish = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (!moved) return;
      if (ev.type === 'pointercancel') appStore.cancelResize();
      else appStore.commitResize();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };
}
