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
 */
export function holdOrPan(
  e: PointerEvent | { clientX: number; clientY: number; pointerId: number },
  onHold: (start: Point, at: Point, done: () => void) => void,
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
    if (ev.type === 'pointerup' && !panning) onTap?.();
  }
  listen(true);
}

/**
 * A finger can be lost without its lift-off ever reaching the page: on an iPhone, its own text handling can take a
 * touch over (job 197: a new item was left floating over the board, out of its list, until the page was reloaded).
 * Every gesture that follows a finger (a lift, a card drag, a resize, a hold still waiting) ends on `pointercancel`,
 * so one is sent for each finger still thought to be down when it can't be: a new touch starts with no other finger
 * on the screen, or the page is hidden or loses focus. A cancelled gesture changes nothing: the item, card or size stays as it was.
 */
function endLostFingers() {
  const down = new Map<number, number>(); // finger (pointer id) → when it touched
  const cancel = (ids: number[]) => {
    for (const pointerId of ids) window.dispatchEvent(new PointerEvent('pointercancel', { pointerId, pointerType: 'touch' }));
  };
  window.addEventListener('pointerdown', (e) => e.pointerType === 'touch' && down.set(e.pointerId, e.timeStamp), true);
  const lifted = (e: PointerEvent) => down.delete(e.pointerId);
  window.addEventListener('pointerup', lifted, true);
  window.addEventListener('pointercancel', lifted, true);
  // Every finger on the screen is new: any finger from an earlier touch is gone (the new one's own pointerdown,
  // just before or after this, is not touched).
  window.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== e.changedTouches.length) return;
      cancel([...down].filter(([, t]) => t < e.timeStamp - 100).map(([id]) => id));
    },
    true,
  );
  window.addEventListener('blur', () => cancel([...down.keys()]));
  document.addEventListener('visibilitychange', () => document.hidden && cancel([...down.keys()]));
}
if (typeof window !== 'undefined') endLostFingers();
