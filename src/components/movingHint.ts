// While the board is panned or zoomed by a gesture (wheel, pinch, dragging empty board), its moving layer
// gets `.moving` (will-change: transform), so the browser can slide the picture it already drew instead of
// drawing the cards again each frame (job perf-pan-layer). The mark comes off a moment after the last step,
// so the text is drawn sharp again at the new zoom; left on, zoomed text would stay a stretched picture.
// Every step restarts the countdown and nothing waits for a gesture's end, so a lost pointerup or an
// unmount can never leave it on.

/** How long after the last pan or zoom step the mark comes off. */
export const SETTLE_MS = 150;

const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/** One step of a pan or zoom gesture moved `world`. */
export function markMoving(world: HTMLElement | null) {
  if (!world) return;
  clearTimeout(timers.get(world));
  world.classList.add('moving');
  timers.set(
    world,
    setTimeout(() => world.classList.remove('moving'), SETTLE_MS),
  );
}
