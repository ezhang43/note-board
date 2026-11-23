import { useEffect, useRef, type RefObject } from 'react';

/**
 * Priority tiers for Escape dismissal (highest runs first; LIFO within the same tier):
 * - `'capture'`: active pointer drag (`eventDrag`) or hotkey recording (`ShortcutsPanel`)
 * - `'modal'`: full-board modal dialogs (`aria-modal="true"`, `ConfirmDialog`, `Tour`)
 * - `'overlay'`: popovers, menus, floating cards, search/format bars, confirm alerts (default)
 * - `'panel'`: persistent side panels (`SidePanel`, `HistoryPanel`, `ChecklistPanel`)
 */
export type EscapePriority = 'panel' | 'overlay' | 'modal' | 'capture';

const RANK: Record<EscapePriority, number> = {
  panel: 0,
  overlay: 1,
  modal: 2,
  capture: 3,
};

/**
 * Handler for an Escape key press on the central LIFO overlay stack.
 * Return `true` (or call `e.preventDefault()`) to consume the Escape press so lower layers
 * and board-level shortcuts do not also run. Return `false` or `void` (without preventing default)
 * to pass Escape to the next layer below.
 */
export type EscapeHandler = (e: KeyboardEvent) => boolean | void;

interface Entry {
  handle: EscapeHandler;
  priority: EscapePriority;
  order: number;
}

const stack: Entry[] = [];
let nextOrder = 0;
let listening = false;

function dispatch(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  // Highest priority tier first, LIFO (highest order) within each tier.
  const ordered = [...stack].sort((a, b) => RANK[b.priority] - RANK[a.priority] || b.order - a.order);
  for (const entry of ordered) {
    if (!stack.includes(entry)) continue;
    const consumed = entry.handle(e);
    if (consumed === true || e.defaultPrevented) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
  }
}

function syncListener() {
  if (stack.length > 0 && !listening) {
    window.addEventListener('keydown', dispatch, true);
    listening = true;
  } else if (stack.length === 0 && listening) {
    window.removeEventListener('keydown', dispatch, true);
    listening = false;
  }
}

/**
 * Imperatively pushes an Escape handler onto the central LIFO stack.
 * Returns a cleanup function that removes that specific entry.
 */
export function pushEscapeLayer(handle: EscapeHandler, priority: EscapePriority = 'overlay'): () => void {
  const entry: Entry = { handle, priority, order: nextOrder++ };
  stack.push(entry);
  syncListener();
  return () => {
    const idx = stack.indexOf(entry);
    if (idx !== -1) stack.splice(idx, 1);
    syncListener();
  };
}

/**
 * While `active` is true, registers `onEscape` on the central LIFO Escape stack.
 * Always calls the latest `onEscape` callback without detaching/reordering on re-renders.
 */
export function useEscapeLayer(active: boolean, onEscape: EscapeHandler, priority: EscapePriority = 'overlay') {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    if (!active) return;
    return pushEscapeLayer((e) => ref.current(e), priority);
  }, [active, priority]);
}

/**
 * Calls `onOutside(e)` on capture-phase `pointerdown` outside `ref.current` while `active` is true.
 * Uses a ref for callbacks so re-renders never churn listeners.
 * If `ignore(target)` returns true, the press is treated as inside (e.g. a resize strip or portal list).
 */
export function useOutsidePointerDown(
  active: boolean,
  ref: RefObject<HTMLElement | null>,
  onOutside: (e: PointerEvent) => void,
  ignore?: (target: Element | null) => boolean,
) {
  const cbRef = useRef({ onOutside, ignore });
  cbRef.current = { onOutside, ignore };
  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node) || ref.current?.contains(target)) return;
      if (cbRef.current.ignore?.(target instanceof Element ? target : null)) return;
      cbRef.current.onOutside(e);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [active, ref]);
}
