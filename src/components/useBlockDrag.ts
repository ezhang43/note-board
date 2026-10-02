import type React from 'react';
import { blockOf } from '../model/board';
import { DRAG_THRESHOLD } from '../model/constants';
import { appStore, useAppState } from '../store/appStore';
import { clientToBoard, columnUnder, dropIndex } from './canvasDom';
import { followEdges } from './edgeFollow';

const INTERACTIVE = 'input, textarea, button, a, select, label';

/**
 * Pointer handling for a card or column. Pressing selects it (Ctrl / Shift + click adds or removes
 * it from the selection); pressing a blank part and moving at least 5px drags it, together with
 * the rest of the selection.
 */
export function blockPointerDown(kind: 'card' | 'column', id: string) {
  return (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation(); // the board underneath must not pan or clear the selection
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    const interactive = !!(e.target as Element).closest(INTERACTIVE);
    // Clicking into a text field selects just that block; a modifier-click toggles it.
    if (interactive && !additive) return appStore.select(id);
    appStore.pressBlock(id, additive);
    if (interactive) return;

    // Pressing blank card space: no text selection, and leave any text box being edited.
    e.preventDefault();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (additive) return;

    const el = e.currentTarget;
    const start = { x: e.clientX, y: e.clientY };
    let offset: { x: number; y: number } | null = null;

    const onMove = (ev: { clientX: number; clientY: number }) => {
      if (!offset) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
        const r = el.getBoundingClientRect();
        const topLeft = clientToBoard(r.left, r.top);
        const grab = clientToBoard(start.x, start.y);
        offset = { x: grab.x - topLeft.x, y: grab.y - topLeft.y };
        // Start from the block's saved position when it has one, so a group keeps its spacing exactly.
        const s = appStore.getState().board;
        const saved = s.order.includes(id) ? blockOf(s, id) : null;
        appStore.startDrag(kind, id, saved?.x ?? topLeft.x, saved?.y ?? topLeft.y);
      }
      const p = clientToBoard(ev.clientX, ev.clientY);
      // Follow the pointer exactly; the store works out the grid spot it will land on.
      appStore.moveDrag(Math.round(p.x - offset.x), Math.round(p.y - offset.y), kind === 'card' ? columnUnder(ev.clientX, ev.clientY) : null);
    };

    // At the edge of the screen the board keeps moving, and the block with it (owner request).
    const edges = followEdges((p) => offset && onMove(p));
    const onPointerMove = (ev: PointerEvent) => {
      edges.track(ev);
      onMove(ev);
    };
    const finish = (ev: PointerEvent) => {
      edges.stop();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (!offset) {
        // A plain click on a block that was part of a bigger selection selects just that block.
        if (ev.type === 'pointerup') appStore.select(id);
        return;
      }
      if (ev.type === 'pointercancel') return appStore.cancelDrag();
      const over = appStore.getState().ui.drag?.overColumn;
      appStore.dropDrag(over ? dropIndex(over, ev.clientY) : null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };
}

/**
 * Where to draw a block while another block is being dragged: its preview spot if it is being
 * pushed out of the way, otherwise its own position (moved along if it is part of a group drag).
 */
export function useDragPosition(id: string, own: { x: number; y: number }): { x: number; y: number } {
  const [dx, dy] = useGroupOffset(id);
  const bx = useAppState((s) => s.ui.drag?.bumped[id]?.x);
  const by = useAppState((s) => s.ui.drag?.bumped[id]?.y);
  if (bx !== undefined && by !== undefined) return { x: bx, y: by };
  return { x: own.x + dx, y: own.y + dy };
}

/** How far this block is being moved as part of a group drag (0, 0 when it isn't). */
export function useGroupOffset(id: string): [number, number] {
  const dx = useAppState((s) => (s.ui.drag?.group.includes(id) ? s.ui.drag.x - s.ui.drag.startX : 0));
  const dy = useAppState((s) => (s.ui.drag?.group.includes(id) ? s.ui.drag.y - s.ui.drag.startY : 0));
  return [dx, dy];
}
