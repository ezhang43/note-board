import { useEffect } from 'react';
import { ZOOM_STEP } from '../model/constants';
import { appStore } from '../store/appStore';
import { handleArrowKey } from './keyboardNav';
import { isTextField } from './textField';

/** Board-wide keyboard shortcuts (⌘ works in place of Ctrl on a Mac). */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Undo / redo go through the board's history from anywhere, even inside a text field.
      if (mod && key === 'z' && !e.shiftKey) return run(e, appStore.undo);
      if (mod && key === 'y') return run(e, appStore.redo);
      if (mod && key === 'z' && e.shiftKey) return run(e, () => {}); // does nothing, on purpose

      // Zoom keys work everywhere, so the browser never zooms the whole page instead.
      if (mod && (key === '=' || key === '+')) return run(e, () => appStore.zoomAtCentre(ZOOM_STEP));
      if (mod && (key === '-' || key === '_')) return run(e, () => appStore.zoomAtCentre(1 / ZOOM_STEP));
      if (mod && key === '0') return run(e, appStore.resetZoom);

      // Arrows move between a card's fields and between cards; Ctrl+arrows jump card to card.
      if (handleArrowKey(e)) return e.preventDefault();

      // Everything below is for blocks and checklist items, and is ignored while typing.
      if (isTextField(e.target) || e.altKey) return;

      // Several checklist items selected: these keys act on the items.
      if (appStore.getState().ui.itemSel) {
        if (key === 'delete' || key === 'backspace') return run(e, appStore.deleteSelectedItems);
        if (key === 'escape') return appStore.clearItemSelection();
        if (key === 'tab') return run(e, () => appStore.tabSelectedItems(e.shiftKey));
        if (mod && key === 'c') return run(e, appStore.copyItems);
        if (mod && key === 'x') return run(e, appStore.cutItems);
        if (mod && key === 'v' && appStore.pasteItems()) return e.preventDefault();
      }

      if (mod) {
        if (key === 'a') return run(e, appStore.selectAll);
        if (key === 'c' && appStore.copySelection()) return e.preventDefault();
        if (key === 'v' && appStore.paste()) return e.preventDefault();
        if (key === 'd') return run(e, appStore.duplicate); // also stops the browser's bookmark shortcut
        return;
      }
      if (key === 'delete' || key === 'backspace') {
        if (appStore.deleteSelection()) e.preventDefault();
      } else if (key === 'escape') appStore.clearSelection();
      else if (key === 'h') appStore.setTool('hand');
      else if (key === 'v') appStore.setTool('select');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function run(e: KeyboardEvent, action: () => unknown) {
  e.preventDefault();
  action();
}
