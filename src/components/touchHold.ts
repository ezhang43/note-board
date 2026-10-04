import { DRAG_THRESHOLD } from '../model/constants';
import { appStore } from '../store/appStore';

/** How long a finger has to rest before it can move or resize something (owner request). */
export const HOLD_MS = 450;

type Point = { x: number; y: number };

/**
 * Touch screens (owner request): one finger moving straight away moves the board around, so
 * looking around never moves or resizes anything by accident. Resting the finger for a moment
 * first calls `onHold` (with where the finger started and where it is now), which takes over.
 * A quick tap does neither. The long-press copy / paste menu is kept away meanwhile.
 */
export function holdOrPan(e: PointerEvent | { clientX: number; clientY: number; pointerId: number }, onHold: (start: Point, at: Point, done: () => void) => void) {
  const start = { x: e.clientX, y: e.clientY };
  let at = start;
  let panning = false;
  const noMenu = (ev: Event) => ev.preventDefault();
  const allowMenu = () => setTimeout(() => window.removeEventListener('contextmenu', noMenu, true), 300);
  window.addEventListener('contextmenu', noMenu, true);

  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    const next = { x: ev.clientX, y: ev.clientY };
    if (!panning && Math.hypot(next.x - start.x, next.y - start.y) >= DRAG_THRESHOLD) {
      clearTimeout(timer);
      panning = true;
      appStore.panBy(next.x - start.x, next.y - start.y);
    } else if (panning) appStore.panBy(next.x - at.x, next.y - at.y);
    at = next;
  };
  const listen = (on: boolean) => {
    for (const [type, fn] of [['pointermove', onMove], ['pointerup', end], ['pointercancel', end]] as const) {
      if (on) window.addEventListener(type, fn);
      else window.removeEventListener(type, fn);
    }
  };
  const timer = setTimeout(() => {
    listen(false);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.getSelection()?.removeAllRanges();
    navigator.vibrate?.(10);
    onHold(start, at, allowMenu);
  }, HOLD_MS);
  function end(ev: PointerEvent) {
    if (ev.pointerId !== e.pointerId) return;
    clearTimeout(timer);
    listen(false);
    allowMenu();
  }
  listen(true);
}
