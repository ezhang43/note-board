/**
 * ↓ ↑ Home End move focus through the items of the `role="menu"` the key was pressed in, wrapping
 * round (a screen reader announces a menu, so its user expects this). True when it moved: the event
 * is then stopped, so a menu around this one doesn't move it a second time.
 */
export function arrowThroughMenu(e: { key: string; target: EventTarget; preventDefault: () => void; stopPropagation: () => void }): boolean {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || !(e.target instanceof Element)) return false;
  const items = [...(e.target.closest('[role="menu"]')?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled, [aria-disabled="true"])') ?? [])];
  const at = items.indexOf(e.target as HTMLElement);
  if (at < 0) return false;
  e.preventDefault();
  e.stopPropagation();
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  items[next].focus();
  return true;
}
