import type React from 'react';
import { blockOf } from '../model/board';
import { BLOCK_MIN_H, GRID } from '../model/constants';
import { resizeFrom, type ResizeDir } from '../model/sizing';
import { appStore } from '../store/appStore';
import { clientToBoard, clientToCanvas, otherBlockSizes } from './canvasDom';
import { holdOrPan } from './touchHold';

/**
 * Pointer handling for a resize handle or edge grip. `dir` says which edge or corner it is: 'e' is a
 * right-edge strip (width only), 'se' the bottom-right corner (width and minimum height), and the
 * other edges and corners work the same from their side (owner request 2026-10-21).
 */
export function resizePointerDown(kind: 'card' | 'column', id: string, dir: ResizeDir, minH?: number) {
  return (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const block = e.currentTarget.closest<HTMLElement>('[data-card-id], [data-col-id]')!;
    // By finger, moving straight away moves the board; resting a moment first resizes (owner request).
    if (e.pointerType === 'touch') return holdOrPan(e.nativeEvent, (start) => beginResize(kind, id, dir, minH, block, start), () => appStore.select(id));
    beginResize(kind, id, dir, minH, block, { x: e.clientX, y: e.clientY });
  };
}

/** Resize `block` as the pointer moves from `from` (screen point); letting go keeps the new size. */
function beginResize(kind: 'card' | 'column', id: string, dir: ResizeDir, minH: number | undefined, block: HTMLElement, from: { x: number; y: number }) {
  appStore.select(id);
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

  const at0 = blockOf(appStore.getState().board, id);
  if (!at0) return;
  // offsetWidth / offsetHeight are in board pixels (they ignore the zoom).
  const startRect = { x: at0.x, y: at0.y, w: block.offsetWidth, h: block.offsetHeight };
  // From the top edge the bottom edge has to stay put, so a card can't be made shorter than its content.
  let lowest = minH;
  if (dir.includes('n') && kind === 'card') {
    const kept = block.style.minHeight;
    block.style.minHeight = '0px';
    lowest = Math.max(minH ?? BLOCK_MIN_H, block.offsetHeight);
    block.style.minHeight = kept;
  }
  const start = clientToBoard(from.x, from.y);
  const candidates = otherBlockSizes(block);
  const snap = appStore.getState().board.snap;
  let moved = false;

  const onMove = (ev: PointerEvent) => {
    moved = true;
    const p = clientToBoard(ev.clientX, ev.clientY);
    const at = clientToCanvas(ev.clientX, ev.clientY);
    appStore.showResize({ kind, id, dir, ...resizeFrom(kind, dir, startRect, { x: p.x - start.x, y: p.y - start.y }, candidates, snap, lowest), labelAt: { x: at.x + 16, y: at.y + 16 } });
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
}

/**
 * Arrow keys on a focused resize handle (keyboard access): → / ← make it 20px wider / narrower,
 * ↓ / ↑ taller / shorter on a corner handle; Shift for 100px. Each press is one undo step.
 */
export function resizeKeyDown(kind: 'card' | 'column', id: string, dir: 'e' | 'se', minH?: number) {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    const step = GRID * (e.shiftKey ? 5 : 1);
    const dw = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
    const dh = dir === 'se' ? (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0) : 0;
    if (!dw && !dh) return;
    // Keep the arrows from also moving the block or panning.
    e.preventDefault();
    e.stopPropagation();
    const block = e.currentTarget.closest<HTMLElement>('[data-card-id], [data-col-id]')!;
    const saved = blockOf(appStore.getState().board, id);
    // The saved size, not the drawn one, which may still be gliding from the last press.
    const w0 = saved?.w ?? block.offsetWidth;
    const h0 = (saved && 'collapsedH' in saved && saved.collapsed ? saved.collapsedH : saved?.h) ?? block.offsetHeight;
    const start = { x: saved?.x ?? 0, y: saved?.y ?? 0, w: w0, h: h0 };
    appStore.showResize({ kind, id, dir, ...resizeFrom(kind, dir, start, { x: dw, y: dh }, [], false, minH), labelAt: { x: -9999, y: -9999 } });
    appStore.commitResize();
  };
}
