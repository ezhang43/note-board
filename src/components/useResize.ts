import type React from 'react';
import { blockOf } from '../model/board';
import { GRID } from '../model/constants';
import { resizeTo } from '../model/sizing';
import { appStore } from '../store/appStore';
import { clientToBoard, clientToCanvas, otherBlockSizes } from './canvasDom';

/**
 * Pointer handling for a resize handle. `axes` is 'both' for a corner handle (width and
 * minimum height) or 'width' for a column's right-edge strip.
 */
export function resizePointerDown(kind: 'card' | 'column', id: string, axes: 'both' | 'width', minH?: number) {
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
      appStore.showResize({ kind, id, ...resizeTo(kind, raw, candidates, snap, minH), labelAt: { x: at.x + 16, y: at.y + 16 } });
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

/**
 * Arrow keys on a focused resize handle (keyboard access): → / ← make it 20px wider / narrower,
 * ↓ / ↑ taller / shorter on a corner handle; Shift for 100px. Each press is one undo step.
 */
export function resizeKeyDown(kind: 'card' | 'column', id: string, axes: 'both' | 'width', minH?: number) {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    const step = GRID * (e.shiftKey ? 5 : 1);
    const dw = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
    const dh = axes === 'both' ? (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0) : 0;
    if (!dw && !dh) return;
    // Keep the arrows from also moving the block or panning.
    e.preventDefault();
    e.stopPropagation();
    const block = e.currentTarget.closest<HTMLElement>('[data-card-id], [data-col-id]')!;
    const saved = blockOf(appStore.getState().board, id);
    // The saved size, not the drawn one, which may still be gliding from the last press.
    const w0 = saved?.w ?? block.offsetWidth;
    const h0 = (saved && 'collapsedH' in saved && saved.collapsed ? saved.collapsedH : saved?.h) ?? block.offsetHeight;
    const raw = { w: w0 + dw, h: axes === 'both' ? h0 + dh : null };
    appStore.showResize({ kind, id, ...resizeTo(kind, raw, [], false, minH), labelAt: { x: -9999, y: -9999 } });
    appStore.commitResize();
  };
}
