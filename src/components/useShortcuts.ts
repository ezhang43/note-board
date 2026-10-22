import { useEffect } from 'react';
import { ZOOM_STEP } from '../model/constants';
import { shownName } from '../model/board';
import { DEFAULT_HOTKEYS, matches } from '../model/hotkeys';
import { shortcutKey } from '../model/keys';
import { appStore } from '../store/appStore';
import { collab } from '../sync/collabSession';
import { handleArrowKey } from './keyboardNav';
import type { FormatAsk } from '../store/actions/format';
import { focusedBox } from './textBox';
import { isTextField, panelCovers } from './textField';

/** Where keys never act on the board behind (C-M1): panels, popover menus and the Undo message. */
const NOT_THE_BOARD = '.side-panel, .history-panel, .format-bar, .share-panel, .file-menu, .boards-menu, .toolbar-more, .colour-menu, .phone-sheet, .undo-toast';

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
      // In the Journal or Habits panel they step that board's own history, leaving the open board as it is.
      const panel = appStore.getState().ui.sidePanel;
      const inPanel = e.target instanceof Element && e.target.closest('.side-panel') !== null;
      // Any side panel, Version history too, the format bar, the toolbar's menus (File, Boards, Arrange, Color, ⋯), the Share
      // panel and the Undo message: a button or tick box in them is not a text field, but its keys aren't the board's.
      // The path is read from the event, not the target: Escape closes a menu before this runs and takes its button out of the page.
      const inAnyPanel = e.composedPath().some((el) => el instanceof Element && el.matches(NOT_THE_BOARD));
      const inJournal = inPanel && (panel === 'journal' || panel === 'habits');
      // The New habit and weight boxes aren't saved anywhere yet, so there the browser undoes the typing;
      // an empty weight box (just saved) has none, so Ctrl+Z there takes back the saved weight.
      const emptyWeight = e.target instanceof HTMLInputElement && e.target.value === '' && e.target.closest('.weight-new') !== null;
      if (inPanel && mod && (key === 'z' || key === 'y') && !emptyWeight && e.target instanceof Element && e.target.closest('.habit-new, .weight-new')) return;
      const [undo, redo] = panel === 'habits' ? [appStore.undoHabits, appStore.redoHabits] : [appStore.undoJournal, appStore.redoJournal];
      if (inJournal && mod && key === 'z' && !e.shiftKey) return run(e, undo);
      if (inJournal && mod && key === 'y') return run(e, redo);
      if (mod && key === 'z' && !e.shiftKey) return run(e, appStore.undo);
      if (mod && key === 'y') return run(e, appStore.redo);
      if (mod && key === 'z' && e.shiftKey) return run(e, () => {}); // does nothing, on purpose

      // Zoom keys work everywhere, so the browser never zooms the whole page instead.
      if (mod && (key === '=' || key === '+')) return run(e, () => appStore.zoomAtCentre(ZOOM_STEP));
      if (mod && (key === '-' || key === '_')) return run(e, () => appStore.zoomAtCentre(1 / ZOOM_STEP));
      if (mod && key === '0') return run(e, appStore.resetZoom);
      // Keys pressed in a side panel never act on the board behind it (the Journal and Habits panels have their own
      // history above; undo, redo and zoom, handled above, work from every panel).
      if (inAnyPanel) return;
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
      // ? opens the keyboard shortcuts panel (it closes itself on ? or Escape: it covers the board).
      if (e.key === '?' && !mod) return run(e, appStore.toggleShortcuts);
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

      // The tools and block shortcuts use the keys this device chose (hotkeys.ts); the defaults are the usual ones.
      const hk = state.view.hotkeys;
      if (matches(hk.selectAll, e)) return run(e, appStore.selectAll);
      if (matches(hk.copy, e) && appStore.copySelection()) {
        markBlocksCopied();
        return e.preventDefault();
      }
      // Ctrl+V itself is left to the browser's paste event (useDropPaste), which sees what is really on the clipboard.
      // simple: a paste key the person re-mapped can't see the clipboard, so it always pastes the copied blocks.
      if (matches(hk.paste, e) && !matches(DEFAULT_HOTKEYS.paste, e) && appStore.paste()) return e.preventDefault();
      if (matches(hk.duplicate, e)) return run(e, appStore.duplicate); // also stops the browser's bookmark shortcut
      if (matches(hk.hand, e)) return run(e, () => appStore.setTool('hand'));
      if (matches(hk.select, e)) return run(e, () => appStore.setTool('select'));
      if (matches(hk.delete, e) || (!mod && key === 'backspace')) {
        if (appStore.deleteSelection()) e.preventDefault();
      } else if (!mod && key === 'escape') appStore.clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Put on the computer's clipboard when blocks are copied in the app: Ctrl+V pastes them only while it is still there, so a newer copy elsewhere wins. */
export const BLOCKS_MARKER = 'application/x-note-board-blocks';

/** False when the browser refused to write the marker: then the copied blocks are all there is to paste (as before the marker). */
export let markerWritten = true;

/** Writes the marker with the browser's own copy (which replaces whatever was copied before). */
function markBlocksCopied() {
  markerWritten = false;
  const put = (e: ClipboardEvent) => {
    e.clipboardData?.setData(BLOCKS_MARKER, '1');
    e.preventDefault();
    markerWritten = true;
  };
  document.addEventListener('copy', put, { once: true });
  try {
    document.execCommand('copy');
  } finally {
    document.removeEventListener('copy', put);
  }
}

const BOARD_MOVE: Record<string, 'next' | 'previous' | 'up' | 'down'> = { ArrowRight: 'next', ArrowLeft: 'previous', ArrowUp: 'up', ArrowDown: 'down' };

/** A short note that goes by itself (the notice banner, cleared after a moment unless something else replaced it). */
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastText: string | null = null;
export function toast(text: string) {
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
