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
 * Without `onHold` (the finger is on the text being typed in) a rest leaves the finger to the phone's own cursor
 * and selection: no menu kept away, no tap, no panning after it (job 197).
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
  if (onHold) window.addEventListener('contextmenu', noMenu, true);

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
    stopLost();
    if (!onHold) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.getSelection()?.removeAllRanges();
    navigator.vibrate?.(10);
    onHold(start, at, allowMenu);
  }, HOLD_MS);
  function end(ev: PointerEvent) {
    if (ev.pointerId !== e.pointerId) return;
    clearTimeout(timer);
    listen(false);
    stopLost();
    allowMenu();
    if (ev.type === 'pointerup' && !panning) onTap?.();
  }
  listen(true);
  const stopLost = onLostFinger(e.pointerId, () => end(new PointerEvent('pointercancel', { pointerId: e.pointerId })));
}

/**
 * A finger can be lost without its lift-off ever reaching the page: on an iPhone, its own text handling can take a
 * touch over (job 197: a lifted item was left floating over the board, hidden from its list, until a reload). A
 * gesture following pointer `pointerId` calls this as it starts; `cancel` runs (so the gesture ends as a cancelled
 * one, and nothing moves) when a new first finger touches the screen or that pointer comes down again, or when the
 * page is hidden. Returns the function that stops watching: call it when the gesture ends. Call it from the gesture's
 * own pointerdown or later: that pointerdown is not counted.
 * simple: a browser that still counts the lost finger as down makes the next touch a second finger, which doesn't
 * end it (a second finger must not, for a pinch); the page being hidden still does. Upgrade if that is seen on a phone.
 */
export function onLostFinger(pointerId: number, cancel: () => void) {
  const onDown = (ev: PointerEvent) => {
    if (ev.pointerId === pointerId || ev.isPrimary) cancel();
  };
  const onHide = () => {
    if (document.hidden) cancel();
  };
  window.addEventListener('pointerdown', onDown, true);
  document.addEventListener('visibilitychange', onHide);
  return () => {
    window.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('visibilitychange', onHide);
  };
}
