import { useEffect } from 'react';
import { ZOOM_STEP } from '../model/constants';
import { shownName } from '../model/board';
import { shortcutKey } from '../model/keys';
import { appStore } from '../store/appStore';
import { collab } from '../sync/collabSession';
import { handleArrowKey } from './keyboardNav';
import type { FormatAsk } from '../store/actions/format';
import { focusedBox } from './textBox';
import { isTextField, panelCovers } from './textField';

/** Board-wide keyboard shortcuts (⌘ works in place of Ctrl on a Mac). */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = shortcutKey(e);

      // Undo / redo go through the board's history from anywhere, even inside a text field —
      // except while a panel covers the board, where they'd change the board unseen: in the panel's own
      // box the browser undoes its typing (the board is inert then, so that can't reach it); elsewhere nothing.
      if (panelCovers() && mod && (key === 'z' || key === 'y')) return isTextField(e.target) ? undefined : run(e, () => {});
      // In the Journal panel they step the Journal board's own history, leaving the open board as it is.
      const inJournal = appStore.getState().ui.sidePanel === 'journal' && e.target instanceof Element && e.target.closest('.side-panel') !== null;
      if (inJournal && mod && key === 'z' && !e.shiftKey) return run(e, appStore.undoJournal);
      if (inJournal && mod && key === 'y') return run(e, appStore.redoJournal);
      if (mod && key === 'z' && !e.shiftKey) return run(e, appStore.undo);
      if (mod && key === 'y') return run(e, appStore.redo);
      if (mod && key === 'z' && e.shiftKey) return run(e, () => {}); // does nothing, on purpose

      // Zoom keys work everywhere, so the browser never zooms the whole page instead.
      if (mod && (key === '=' || key === '+')) return run(e, () => appStore.zoomAtCentre(ZOOM_STEP));
      if (mod && (key === '-' || key === '_')) return run(e, () => appStore.zoomAtCentre(1 / ZOOM_STEP));
      if (mod && key === '0') return run(e, appStore.resetZoom);
      // Nothing below acts on the board while a panel covers it (Send feedback, Delete account),
      // wherever focus is: it can be on the page itself after a click on the panel's text.
      if (panelCovers()) return;
      // Shift+1: fit to screen (as in Figma and Miro), outside text fields.
      if (e.shiftKey && !mod && !e.altKey && e.code === 'Digit1' && !isTextField(e.target)) return run(e, appStore.fitToScreen);

      // Arrows move between a card's fields and between cards; Alt+arrows jump card to card.
      if (handleArrowKey(e)) return e.preventDefault();

      // Text formatting (owner request): on the box being typed in, or else on the selected
      // checklist items, or every text box in the selected cards and columns.
      const format = mod && !e.altKey ? formatAsk(e, key) : null;
      if (format) {
        const typing = focusedBox();
        if (typing) return run(e, () => appStore.formatBoxes([typing.box], format));
        const boxes = isTextField(e.target) ? [] : appStore.selectedBoxes();
        if (boxes.length) return run(e, () => appStore.formatBoxes(boxes, format));
      }

      // Escape while typing in a card leaves the text field, keeping the card selected (so arrows then move it).
      if (key === 'escape' && isTextField(e.target) && (e.target as HTMLElement).closest('[data-card-id], [data-col-id]')) {
        return (e.target as HTMLElement).blur();
      }

      // Ctrl+A in a checklist item whose text is already all selected: every item in that list
      // (step 2 of the Ctrl+A ladder; step 1 is the browser selecting the text).
      if (mod && key === 'a' && e.target instanceof HTMLTextAreaElement) {
        const field = e.target;
        const cardId = field.closest('[data-item-id]') && field.closest<HTMLElement>('[data-card-id]')?.dataset.cardId;
        if (cardId && field.selectionStart === 0 && field.selectionEnd === field.value.length) {
          field.blur();
          return run(e, () => appStore.selectWholeList(cardId));
        }
      }

      // Everything below is for blocks and checklist items, and is ignored while typing.
      if (isTextField(e.target) || e.altKey) return;

      const state = appStore.getState();
      // ? opens the keyboard shortcuts panel; Escape closes it.
      if (e.key === '?' && !mod) return run(e, appStore.toggleShortcuts);
      if (key === 'escape' && state.ui.shortcutsOpen) return appStore.closeShortcuts();
      // Ctrl+Shift+Backspace: delete every item in the board's Completed sections, after asking.
      // The Control key on a Mac too: there ⌘+Shift+Backspace is the browser's Clear browsing data.
      if (e.ctrlKey && !e.metaKey && e.shiftKey && key === 'backspace') return run(e, appStore.askDeleteCompleted);
      if (key === 'escape' && state.ui.deleteCompleted) return appStore.cancelDeleteCompleted();
      // While it asks, no other board key acts behind the question (Tab, Enter and Space work its buttons).
      if (state.ui.deleteCompleted === 'ask') return;

      // Ctrl+arrows switch boards (owner request, 2026-10-16). Control only: on a Mac the system
      // often keeps these keys for Spaces, and ⌘+arrows are the browser's.
      const move = BOARD_MOVE[e.key];
      // A held key doesn't race through the boards, and the shortcuts list stays put behind it.
      if (move && e.ctrlKey && !e.metaKey && !e.shiftKey) {
        return run(e, () => {
          if (e.repeat || e.isComposing || state.ui.shortcutsOpen) return;
          const id = appStore.moveBoard(move);
          if (id) toast(`Switched to ${shownName(appStore.boardName(id))}`);
        });
      }

      // Several checklist items selected: these keys act on the items.
      if (state.ui.itemSel) {
        if (key === 'delete' || key === 'backspace') return run(e, appStore.deleteSelectedItems);
        if (key === 'escape') return appStore.clearItemSelection();
        // Ctrl+A again: every list in the column, then every item on the board.
        if (mod && key === 'a') return run(e, appStore.selectAllStep);
        if (key === 'tab') return run(e, () => appStore.tabSelectedItems(e.shiftKey));
        if (mod && key === 'c') return run(e, appStore.copyItems);
        if (mod && key === 'x') return run(e, appStore.cutItems);
        if (mod && key === 'v' && appStore.pasteItems()) return e.preventDefault();
      }

      // Arrows move the selected blocks one grid step (Shift: five).
      const step = NUDGE[e.key];
      if (step && !mod && !state.ui.itemSel) {
        const n = e.shiftKey ? 5 : 1;
        if (appStore.nudgeSelection(step[0] * n, step[1] * n)) e.preventDefault();
        return;
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

const BOARD_MOVE: Record<string, 'next' | 'previous' | 'up' | 'down'> = { ArrowRight: 'next', ArrowLeft: 'previous', ArrowUp: 'up', ArrowDown: 'down' };

/** A short note that goes by itself (the notice banner, cleared after a moment unless something else replaced it). */
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastText: string | null = null;
function toast(text: string) {
  // A note someone has to read and dismiss (a failed delete, a share that stopped) is never covered.
  if (collab.notice() && collab.notice() !== toastText) return;
  toastText = text;
  collab.setNotice(text);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => collab.notice() === text && collab.setNotice(null), 2500);
}

const NUDGE: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

/** Ctrl+B bold, Ctrl+I italic, Ctrl+Shift+> larger, Ctrl+Shift+< smaller (by key position too, as on other layouts). */
function formatAsk(e: KeyboardEvent, key: string): FormatAsk | null {
  if (e.shiftKey && (e.key === '>' || e.code === 'Period')) return 'larger';
  if (e.shiftKey && (e.key === '<' || e.code === 'Comma')) return 'smaller';
  if (e.shiftKey) return null;
  return key === 'b' ? 'bold' : key === 'i' ? 'italic' : null;
}

function run(e: KeyboardEvent, action: () => unknown) {
  e.preventDefault();
  action();
}
