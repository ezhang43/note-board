import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { DRAG_THRESHOLD } from '../model/constants';
import type { CardKind } from '../model/types';
import { appStore } from '../store/appStore';
import { clientToBoard, clientToCanvas, columnUnder, dropIndex, isOverCanvas } from './canvasDom';

/**
 * Props for a toolbar Add button: a click adds the card as usual; pressing and dragging onto the
 * board (at least 5px) places it where it is let go instead.
 */
export function useNewCardDrag(kind: CardKind) {
  // Set when a drag just happened, so the click that may follow it doesn't add a second card.
  const dragged = useRef(false);

  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    dragged.current = false;
    const start = { x: e.clientX, y: e.clientY };
    let started = false;

    const onMove = (ev: PointerEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
        started = true;
        dragged.current = true;
        appStore.startNewDrag(kind);
      }
      const onBoard = isOverCanvas(ev.clientX, ev.clientY);
      appStore.moveNewDrag(
        onBoard ? clientToCanvas(ev.clientX, ev.clientY) : null,
        onBoard ? clientToBoard(ev.clientX, ev.clientY) : null,
        onBoard ? columnUnder(ev.clientX, ev.clientY) : null,
      );
    };
    const finish = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (!started) return;
      if (ev.type === 'pointercancel') return appStore.cancelNewDrag();
      const over = appStore.getState().ui.newDrag?.overColumn;
      appStore.dropNewDrag(over ? dropIndex(over, ev.clientY) : null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  function onClick() {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    appStore.addCard(kind);
  }

  return { onPointerDown, onClick };
}
