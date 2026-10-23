import { DRAG_THRESHOLD } from '../model/constants';
import { appStore } from '../store/appStore';

/** How long a finger has to rest before it can move or resize something (owner request). */
export const HOLD_MS = 450;

type Point = { x: number; y: number };

/**
 * Touch screens (owner request): one finger moving straight away moves the board around, so
 * looking around never moves or resizes anything by accident. Resting the finger for a moment
 * first calls `onHold` (with where the finger started and where it is now), which takes over.
 * A quick tap does neither (it calls `onTap`). The long-press copy / paste menu is kept away meanwhile.
 * Without `onHold` (the finger is on the text being typed in) a rest does nothing here: the phone's own cursor and selection have it.
 *
 * A finger can be lost without its lift-off reaching the page: on an iPhone, its own text handling can take a touch
 * over (job 197: a lifted item was left floating over the board, out of its list, until a reload). Until `onHold`'s
 * gesture calls `done`, a new first finger on the screen (or this finger's id coming down again), or the page being
 * hidden or losing focus, ends it the way a cancelled touch does (it sends the missing `pointercancel`), so nothing moves.
 */
export function holdOrPan(
  e: PointerEvent | { clientX: number; clientY: number; pointerId: number },
  onHold: ((start: Point, at: Point, done: () => void) => void) | null,
  onTap?: () => void,
) {
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
  const timer = onHold
    ? setTimeout(() => {
        listen(false);
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        window.getSelection()?.removeAllRanges();
        navigator.vibrate?.(10);
        onHold(start, at, () => {
          lost(false);
          allowMenu();
        });
      }, HOLD_MS)
    : undefined;
  function end(ev: PointerEvent) {
    if (ev.pointerId !== e.pointerId) return;
    clearTimeout(timer);
    listen(false);
    lost(false);
    allowMenu();
    if (ev.type === 'pointerup' && !panning) onTap?.();
  }
  // Watching for a lost finger. Run in the capture phase on the window, so a new touch's own gesture hasn't started yet.
  const onDown = (ev: PointerEvent) => {
    if (ev.pointerId === e.pointerId || ev.isPrimary) cancel();
  };
  const onHide = () => {
    if (document.hidden) cancel();
  };
  const cancel = () => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: e.pointerId, pointerType: 'touch' }));
  function lost(on: boolean) {
    if (on) {
      window.addEventListener('pointerdown', onDown, true);
      window.addEventListener('blur', cancel);
      document.addEventListener('visibilitychange', onHide);
    } else {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', onHide);
    }
  }
  listen(true);
  lost(true);
}
