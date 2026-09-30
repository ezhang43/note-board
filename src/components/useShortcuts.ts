import { useEffect } from 'react';
import { ZOOM_STEP } from '../model/constants';
import { appStore } from '../store/appStore';

export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === 'TEXTAREA') return true;
  return target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'checkbox';
}

/** Board-wide keyboard shortcuts. */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Zoom keys work everywhere, so the browser never zooms the whole page instead.
      if (mod && (key === '=' || key === '+')) return run(e, () => appStore.zoomAtCentre(ZOOM_STEP));
      if (mod && (key === '-' || key === '_')) return run(e, () => appStore.zoomAtCentre(1 / ZOOM_STEP));
      if (mod && key === '0') return run(e, appStore.resetZoom);

      // Everything below is ignored while typing.
      if (isTextField(e.target) || mod || e.altKey) return;
      if (key === 'escape') appStore.clearSelection();
      else if (key === 'h') appStore.setTool('hand');
      else if (key === 'v') appStore.setTool('select');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function run(e: KeyboardEvent, action: () => void) {
  e.preventDefault();
  action();
}
