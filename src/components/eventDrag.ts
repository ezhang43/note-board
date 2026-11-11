import type { PointerEvent as ReactPointerEvent } from 'react';
import type { DayKey } from '../model/calendar';

// Dragging a calendar event onto another day (owner request, 2026-11-11). The days it can land on
// (a Week row, a Month cell) carry `data-day`; the one under the pointer gets `data-drop` and the grabbed
// chip `data-dragging`, which the CSS draws. This file only follows the pointer; which date it means and
// what is saved are decided by the model and the store (`dragDraft`, `calendar.move`).

/** How far the pointer must travel before a press is a drag; less is still a click that opens the event. */
const THRESHOLD = 4;

/**
 * Called from a chip's pointerdown. `onDrop` gets the day the chip was grabbed on and the day it was let
 * go on, only when they differ. Escape cancels.
 * simple: the panel doesn't scroll by itself while dragging near its edge, so a day out of view is
 * reached by scrolling first (or by the form's Start date); add edge scrolling if that proves a nuisance.
 */
export function beginEventDrag(down: ReactPointerEvent<HTMLElement>, onDrop: (from: DayKey, to: DayKey) => void) {
  const chip = down.currentTarget;
  const from = chip.closest<HTMLElement>('[data-day]')?.dataset.day;
  // simple: mouse and pen only. A finger on a chip is how the panel scrolls, so a touch drag needs its own
  // long-press design; until then a tap still opens the event.
  if (!from || down.button !== 0 || down.pointerType === 'touch' || !down.isPrimary) return;

  const rect = chip.getBoundingClientRect();
  const grabX = down.clientX - rect.left;
  const grabY = down.clientY - rect.top;
  let ghost: HTMLElement | null = null;
  let target: HTMLElement | null = null;
  let cancelled = false;

  const dayAt = (x: number, y: number) => {
    const day = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-day]') ?? null;
    return day && day.dataset.day !== from ? day : null;
  };
  const mark = (day: HTMLElement | null) => {
    if (day === target) return;
    target?.removeAttribute('data-drop');
    target = day;
    target?.setAttribute('data-drop', '');
  };
  const place = (x: number, y: number) => {
    // The `translate` property, not `transform`: the CSS `scale` lift is applied before `transform` and would scale the offset too.
    if (ghost) ghost.style.translate = `${x - grabX}px ${y - grabY}px`;
  };
  const start = () => {
    ghost = chip.cloneNode(true) as HTMLElement;
    ghost.classList.add('cal-ghost');
    // The clone sits on <body>, outside the Month grid whose narrow rule hides the time and dot.
    if (chip.closest('.cal-month.narrow')) ghost.classList.add('narrow');
    ghost.removeAttribute('data-event');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.tabIndex = -1;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.append(ghost);
    document.body.classList.add('cal-dragging');
    chip.setAttribute('data-dragging', '');
  };
  const clean = () => {
    ghost?.remove();
    ghost = null;
    mark(null);
    document.body.classList.remove('cal-dragging');
    chip.removeAttribute('data-dragging');
  };
  const stop = () => {
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', abort, true);
    window.removeEventListener('keydown', key, true);
    window.removeEventListener('blur', abort);
  };

  function move(e: PointerEvent) {
    if (cancelled) return;
    // The panel closed under the pointer: nothing to drag any more.
    if (!chip.isConnected) return abort();
    if (!ghost) {
      if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < THRESHOLD) return;
      start();
    }
    place(e.clientX, e.clientY);
    mark(dayAt(e.clientX, e.clientY));
  }
  function up(e: PointerEvent) {
    stop();
    const dropped = ghost !== null && !cancelled;
    const to = dropped ? dayAt(e.clientX, e.clientY)?.dataset.day : undefined;
    const dragged = ghost !== null || cancelled;
    clean();
    if (dragged) {
      // The click the browser sends after the release would otherwise pick the day or open the event.
      const swallow = (c: Event) => (c.stopPropagation(), c.preventDefault());
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, true));
    }
    if (to) onDrop(from as DayKey, to as DayKey);
  }
  function abort() {
    stop();
    clean();
  }
  function key(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !ghost) return;
    // The drag's own Escape: no panel, card or form sees it.
    e.stopImmediatePropagation();
    e.preventDefault();
    cancelled = true;
    clean();
  }

  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', abort, true);
  window.addEventListener('keydown', key, true);
  // Another window or tab took over mid-drag: the release would never reach this page.
  window.addEventListener('blur', abort);
}
