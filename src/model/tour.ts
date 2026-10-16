/** The welcome tour (owner request, 2026-10-16). Remembered per device, like the dark-mode choice. */
export const TOUR_KEY = 'note-board:tour-done';

/** Whether the tour should start by itself: only when this device has not finished or skipped it. */
export function tourPending(read: () => string | null): boolean {
  try {
    return read() === null;
  } catch {
    return false; // storage blocked: do not nag
  }
}

type Box = { x: number; y: number; w: number; h: number };

/** Where the tour card goes: under the target (above when short of room), kept inside the window. */
export function placeCard(target: Box, card: { w: number; h: number }, view: { w: number; h: number }) {
  const gap = 12;
  const clamp = (v: number, size: number, max: number) => Math.max(gap, Math.min(v, max - size - gap));
  const below = target.y + target.h + gap;
  const top = below + card.h + gap <= view.h ? below : target.y - gap - card.h;
  return { left: clamp(target.x, card.w, view.w), top: clamp(top, card.h, view.h) };
}
