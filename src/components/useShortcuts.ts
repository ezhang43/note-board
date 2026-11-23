import { useEffect } from 'react';
import { ZOOM_STEP } from '../model/constants';
import { shownName } from '../model/board';
import { DEFAULT_HOTKEYS, matches, stopsWhenLost } from '../model/hotkeys';
import { shortcutKey } from '../model/keys';
import { sizeKeyDir } from '../model/textStyle';
import { appStore, storeOfCard } from '../store/appStore';
import { collab } from '../sync/collabSession';
import { handleArrowKey } from './keyboardNav';
import { isPhone } from './usePhone';
import type { FormatAsk } from '../store/actions/format';
import { itemOf, removeItemByKey } from './itemDom';
import { focusedBox } from './textBox';
import { cursorLost, forgetLostCursor, leaveField, watchLostCursor } from './lostCursor';
import { isTextField, panelCovers } from './textField';
import { calendar } from '../store/calendar';
import { calendarFirst } from '../store/undoClock';

/** Where keys never act on the board behind (C-M1): panels, popover menus and the Undo message. */
const NOT_THE_BOARD = '.side-panel, .history-panel, .checklist-panel, .format-bar, .share-panel, .file-menu, .boards-menu, .toolbar-more, .colour-menu, .phone-sheet, .undo-toast';

/** Where arrows belong to the thing itself, so they never pan the board: resize handles, drop-down lists, dialogs and menus. */
const ARROWS_THEIRS = '.resize-edge, .resize-corner, select, [role="dialog"], [role="alertdialog"], [role="menu"]';

/** Screen pixels the board pans per arrow press (Shift: five times that). */
const PAN_STEP = 80;

/**
 * A Word-style highlight of letters in one list that the next typed character replaces (owner request, 2026-11-01).
 * Not while a container's "Delete …?" or the completed-items question asks, not for Ctrl chords or composed input,
 * and not for keys pressed on a focused button, link, menu summary or drop-down list: those keys belong to it.
 */
function typesOverWords(e: KeyboardEvent): boolean {
  const { itemSel, confirm, deleteCompleted } = appStore.getState().ui;
  return !!itemSel?.words && !itemSel.lists && !e.isComposing && !(e.ctrlKey || e.metaKey) && !confirm && deleteCompleted !== 'ask'
    && !(e.target instanceof Element && e.target.closest('button, a, summary, select, [role="button"]'));
}

/** Board-wide keyboard shortcuts (⌘ works in place of Ctrl on a Mac). */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = shortcutKey(e);
      const inChecklist = isInChecklist(e);

      const undoAction = resolveUndoAction(e, inChecklist);
      if (undoAction !== null) return undoAction === 'browser' ? undefined : run(e, undoAction);

      // Zoom keys work everywhere, so the browser never zooms the whole page instead.
      if (mod && (key === '=' || key === '+')) return run(e, () => appStore.zoomAtCentre(ZOOM_STEP));
      if (mod && (key === '-' || key === '_')) return run(e, () => appStore.zoomAtCentre(1 / ZOOM_STEP));
      if (mod && key === '0') return run(e, appStore.resetZoom);

      // Keys pressed in a side panel never act on the board behind it (the Journal and Habits panels have their own
      // history above; undo, redo and zoom, handled above, work from every panel).
      // Not while a dialog covers the board (Brain dump, AI settings, Sign out?, Send feedback): the items selected in the panel
      // behind it are out of reach, so Tab, Delete and Ctrl+X on a dialog button leave them alone (undo and redo, above, still work).
      if (inChecklist && panelCovers()) return;
      if (inChecklist) {
        handleChecklistKeys(e, key, mod, 'panel');
        return;
      }
      // Any side panel, Version history too, the format bar, the toolbar's menus (File, Boards, Arrange, Color, ⋯), the Share
      // panel and the Undo message: a button or tick box in them is not a text field, but its keys aren't the board's.
      // The path is read from the event, not the target: Escape closes a menu before this runs and takes its button out of the page.
      if (e.composedPath().some((el) => el instanceof Element && el.matches(NOT_THE_BOARD))) return;
      // Nothing below acts on the board while a panel covers it (Send feedback, Delete account),
      // wherever focus is: it can be on the page itself after a click on the panel's text.
      if (panelCovers()) return;
      // Shift+1: fit to screen (as in Figma and Miro), outside text fields.
      // Not over a word highlight: there "!" (Shift+1) is a typed character that replaces the words, like any letter.
      if (e.shiftKey && !mod && !e.altKey && e.code === 'Digit1' && !isTextField(e.target) && !typesOverWords(e)) return run(e, appStore.fitToScreen);

      // Shared editing keys (formatting, arrows, Escape out of a text box, Ctrl+A step 2 in a checklist item).
      if (handleChecklistKeys(e, key, mod, 'board', 'editing')) return;

      // Everything below is for blocks and checklist items, and is ignored while typing.
      if (isTextField(e.target) || e.altKey) return;
      const state = appStore.getState();
      // ? opens the keyboard shortcuts panel (it closes itself on ? or Escape: it covers the board).
      if (e.key === '?' && !mod) return run(e, appStore.toggleShortcuts);
      // Ctrl+Shift+Backspace: delete every ticked item on the board, after asking.
      // The Control key on a Mac too: there ⌘+Shift+Backspace is the browser's Clear browsing data.
      if (e.ctrlKey && !e.metaKey && e.shiftKey && key === 'backspace') return run(e, appStore.askDeleteCompleted);
      if (key === 'escape' && state.ui.deleteCompleted) return appStore.cancelDeleteCompleted();
      // A container's "Delete …?" with items selected: Escape closes the question (the items stay selected), and Tab
      // is left to the browser to move between the question's buttons; the store keeps its other item keys off the list.
      if (key === 'escape' && state.ui.confirm && state.ui.itemSel) return appStore.cancelDelete();
      // While it asks, no other board key acts behind the question (Tab, Enter and Space work its buttons).
      if (state.ui.deleteCompleted === 'ask') return;
      // The keyboard fell out of a block without the person leaving it (something else took its text box away, job
      // sync-keeps-cursor): until a click or focus move, Delete, Backspace and the arrows typed on as if still in the
      // box only let the selection go (Ctrl+A then Delete too). Every other key works as usual (owner, PR #242).
      if (cursorLost() && stopsWhenLost(e, state.view.hotkeys.delete)) {
        e.preventDefault();
        return appStore.clearSelection();
      }

      // Ctrl+arrows switch boards (owner request, 2026-10-16). Control only: on a Mac the system
      // often keeps these keys for Spaces, and ⌘+arrows are the browser's.
      const move = BOARD_MOVE[e.key];
      // A held key doesn't race through the boards, and the shortcuts list stays put behind it.
      if (move && e.ctrlKey && !e.metaKey && !e.shiftKey) {
        return run(e, () => {
          if (e.repeat || e.isComposing || state.ui.shortcutsOpen) return;
          const id = appStore.moveBoard(move);
          if (!id) return;
          forgetLostCursor(); // a new board: nothing there was being typed in
          toast(`Switched to ${shownName(appStore.boardName(id))}`);
        });
      }

      // Checklist item keys (word-highlight typing, selected items, or Delete/Backspace on a focused item button).
      if (handleChecklistKeys(e, key, mod, 'board', 'items')) return;

      // Arrows move the selected blocks one grid step (Shift: five). With nothing selected they pan the board
      // like scrolling (owner request 2026-10-29): a view change only, and not on a phone-sized window.
      const step = NUDGE[e.key];
      if (step && !mod && !state.ui.itemSel) {
        const n = e.shiftKey ? 5 : 1;
        if (appStore.nudgeSelection(step[0] * n, step[1] * n)) e.preventDefault();
        else if (!e.isComposing && !isPhone() && !e.composedPath().some((el) => el instanceof Element && el.matches(ARROWS_THEIRS))) {
          e.preventDefault();
          appStore.panBy(-step[0] * n * PAN_STEP, -step[1] * n * PAN_STEP);
        }
        return;
      }

      // The block shortcuts use the keys this device chose (hotkeys.ts); the defaults are the usual ones.
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
      if (matches(hk.delete, e) || (!mod && key === 'backspace')) {
        if (appStore.deleteSelection()) e.preventDefault();
      } else if (!mod && key === 'escape') appStore.clearSelection();
    };
    window.addEventListener('keydown', onKey);
    const unwatch = watchLostCursor();
    return () => {
      window.removeEventListener('keydown', onKey);
      unwatch();
    };
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
  const size = sizeKeyDir(e);
  if (size) return size === 1 ? 'larger' : 'smaller';
  if (e.shiftKey) return null;
  return key === 'b' ? 'bold' : key === 'i' ? 'italic' : null;
}

/** True when the key was pressed in one of the panels or menus other than `but`. */
function inAnyPanelBut(e: KeyboardEvent, but: string): boolean {
  return e.composedPath().some((el) => el instanceof Element && el.matches(NOT_THE_BOARD) && !el.matches(but));
}

const noop = () => {};

/** Result of resolving an undo/redo chord: `null` (not undo/redo), `'browser'` (native text undo), or an action to run. */
export type UndoResolution = 'browser' | (() => unknown) | null;

/** True when a key belongs to the Checklist panel, its scoped popovers (time picker), or items selected in it. */
function isInChecklist(e: KeyboardEvent): boolean {
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest('.checklist-panel, [data-checklist-scope]')) return true;
  const sel = appStore.getState().ui.itemSel;
  if (!sel || storeOfCard(sel.cardId) === appStore) return false;
  // Not while typing elsewhere or on the board: there the keys are that box's or the board's.
  const elsewhere = !!target && (isTextField(target) || target.closest('[data-testid="canvas"]') !== null);
  return !elsewhere && !inAnyPanelBut(e, '.checklist-panel');
}

interface UndoScope {
  match: () => boolean;
  undo: () => unknown;
  redo: () => unknown;
}

/**
 * Picks which undo/redo history a Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z press targets:
 * - `null`: not an undo/redo chord
 * - `'browser'`: leave it to the browser's native text-box undo
 * - a function: prevent default and run it (`noop` swallows the key)
 */
export function resolveUndoAction(e: KeyboardEvent, inChecklist = isInChecklist(e)): UndoResolution {
  const mod = e.ctrlKey || e.metaKey;
  const key = shortcutKey(e);
  if (!mod || (key !== 'z' && key !== 'y')) return null;

  // Undo / redo go through the board's history from anywhere, even inside a text field —
  // except while a panel covers the board, where they'd change the board unseen: in the panel's own
  // box the browser undoes its typing (the board is inert then, so that can't reach it); elsewhere nothing.
  if (panelCovers()) return isTextField(e.target) ? 'browser' : noop;

  const target = e.target instanceof Element ? e.target : null;
  const panel = appStore.getState().ui.sidePanel;
  const inPanel = !!target?.closest('.side-panel');

  // The New habit and weight boxes aren't saved anywhere yet, so there the browser undoes the typing;
  // an empty weight box (just saved) has none, so Ctrl+Z there takes back the saved weight.
  const emptyWeight = e.target instanceof HTMLInputElement && e.target.value === '' && !!target?.closest('.weight-new');
  if (inPanel && !emptyWeight && target?.closest('.habit-new, .weight-new, .jn-rename')) return 'browser';

  const isUndo = key === 'z' && !e.shiftKey;
  const isRedo = key === 'y';

  // Scoped panels step their own history, leaving the open board as it is.
  const scopes: UndoScope[] = [
    // In the Completed panel they step back through the panel's own unticks, each on the board it changed (owner,
    // 2026-11-13: it mixes in the Main checklist's items), and with none left do nothing, never the open board's.
    { match: () => inPanel && panel === 'completed', undo: appStore.undoCompleted, redo: appStore.redoCompleted },
    // In the Checklist panel on the left, its time picker or items selected there (owner request, 2026-11-12).
    { match: () => inChecklist, undo: appStore.undoChecklist, redo: appStore.redoChecklist },
    // In the Habits or Journal panel they step that board's own history.
    { match: () => inPanel && panel === 'habits', undo: appStore.undoHabits, redo: appStore.redoHabits },
    { match: () => inPanel && panel === 'journal', undo: appStore.undoJournal, redo: appStore.redoJournal },
  ];
  const scope = scopes.find((s) => s.match());
  if (scope) return isUndo ? scope.undo : isRedo ? scope.redo : noop;

  // With the Google Calendar panel open they also step this session's event changes, whichever of those and the
  // board's is newer (owner request 2026-11-17). In the event form the browser undoes the typing; its buttons do nothing.
  if (panel === 'calendar') {
    if (target?.closest('.cal-form')) return isTextField(e.target) ? 'browser' : noop;
    const which = isUndo ? 'undo' : 'redo';
    if (calendarFirst(which, appStore.undoMarks(), calendar.marks())) {
      return which === 'undo' ? calendar.undoLast : calendar.redo;
    }
  }

  // Open board history; Ctrl+Shift+Z does nothing, on purpose.
  return isUndo ? appStore.undo : isRedo ? appStore.redo : noop;
}

export type ChecklistScope = 'board' | 'panel';
export type ChecklistPhase = 'editing' | 'items' | 'all';

/**
 * Shared checklist keyboard shortcuts for both board checklists (`'board'`) and the Checklist panel (`'panel'`,
 * owner request, 2026-11-12). In the panel, every action routes through `storeOfCard` so nothing changes the open board,
 * and no block keys run. Returns `true` when the key was handled.
 */
export function handleChecklistKeys(
  e: KeyboardEvent,
  key: string,
  mod: boolean,
  scope: ChecklistScope,
  phase: ChecklistPhase = 'all',
): boolean {
  if (phase === 'editing' || phase === 'all') {
    // Text formatting (owner request): on the box being typed in, or else on the selected
    // checklist items, or (on the board) every text box in the selected cards and columns.
    const format = mod && !e.altKey ? formatAsk(e, key) : null;
    if (format) {
      const typing = focusedBox();
      if (typing && (scope === 'board' || 'cardId' in typing.box)) {
        const box = typing.box;
        const st = 'cardId' in box ? storeOfCard(box.cardId) : appStore;
        run(e, () => st.formatBoxes([box], format));
        return true;
      }
      const sel = appStore.getState().ui.itemSel;
      const st = isTextField(e.target) ? null : scope === 'board' ? appStore : sel ? storeOfCard(sel.cardId) : null;
      const boxes = st?.selectedBoxes() ?? [];
      if (st && boxes.length) {
        run(e, () => st.formatBoxes(boxes, format));
        return true;
      }
    }

    // Alt+arrows jump between blocks on the board: not from the panel (nor back a page in the browser).
    if (scope === 'panel' && e.altKey && NUDGE[e.key]) {
      e.preventDefault();
      return true;
    }
    // Arrows move between a card's fields and between cards (on the board) or from item to item (in the panel).
    if (handleArrowKey(e)) {
      e.preventDefault();
      return true;
    }

    // Escape while typing leaves the text field (on the board, only inside a card or column so arrows then move it).
    if (key === 'escape' && isTextField(e.target) && (scope === 'panel' || (e.target as HTMLElement).closest('[data-card-id], [data-col-id]'))) {
      leaveField(e.target as HTMLElement);
      return true;
    }

    // Ctrl+A in a checklist item whose text is already all selected: every item in that list
    // (step 2 of the Ctrl+A ladder; step 1 is the browser selecting the text).
    if (mod && key === 'a' && e.target instanceof HTMLTextAreaElement) {
      const field = e.target;
      const cardId = field.closest('[data-item-id]') && field.closest<HTMLElement>('[data-card-id]')?.dataset.cardId;
      if (cardId && field.selectionStart === 0 && field.selectionEnd === field.value.length) {
        leaveField(field);
        run(e, () => storeOfCard(cardId).selectWholeList(cardId));
        return true;
      }
    }

    if (phase === 'editing') return false;
    if (isTextField(e.target) || e.altKey) return false;
  }

  const state = appStore.getState();
  const sel = state.ui.itemSel;
  const selStore = scope === 'board' ? appStore : sel ? storeOfCard(sel.cardId) : null;
  // Several checklist items selected (in the panel, only when they belong to the panel's own board).
  if (sel && selStore && (scope === 'board' || selStore !== appStore)) {
    // A Word-style highlight of letters across items (owner request, 2026-11-01): a typed letter or Enter replaces
    // them; Delete, Backspace, Ctrl+C and Ctrl+X are the item keys below. Not while a container's "Delete …?" asks.
    if (typesOverWords(e)) {
      if (key === 'enter' && !e.shiftKey) {
        run(e, selStore.enterOverWords);
        return true;
      }
      // simple: one typed letter replaces them; letters built from several keys (accents, Chinese input) aren't caught here.
      if (e.key.length === 1) {
        run(e, () => selStore.deleteWords(e.key));
        return true;
      }
    }
    if (key === 'delete' || key === 'backspace') {
      removeItemByKey(e, selStore.deleteSelectedItems); // held: removes once
      return true;
    }
    if (key === 'escape') {
      selStore.clearItemSelection();
      return true;
    }
    // Ctrl+A again: every item in the list (panel holds one list) or every list in the column, then every item on the board.
    if (mod && key === 'a') {
      run(e, scope === 'panel' ? () => selStore.selectWholeList(sel.cardId) : appStore.selectAllStep);
      return true;
    }
    if (key === 'tab' && !state.ui.confirm) {
      run(e, () => selStore.tabSelectedItems(e.shiftKey));
      return true;
    }
    if (mod && key === 'c') {
      run(e, selStore.copyItems);
      return true;
    }
    if (mod && key === 'x') {
      run(e, selStore.cutItems);
      return true;
    }
    if (mod && key === 'v' && selStore.pasteItems()) {
      e.preventDefault();
      return true;
    }
    if (scope === 'panel') return true;
  }

  // Focus on a checklist item's tick box (or another of its buttons): Delete, Backspace (or the board's delete key)
  // removes that item like its trash can, never the whole card (owner report, job 218).
  const at = itemOf(e.target);
  if (
    at &&
    (scope === 'panel' || state.ui.selection.every((id) => id === at.cardId)) &&
    ((!mod && (key === 'delete' || key === 'backspace')) || (scope === 'board' && matches(state.view.hotkeys.delete, e)))
  ) {
    removeItemByKey(e, () => storeOfCard(at.cardId).trashItem(at.cardId, at.itemId));
    return true;
  }

  return false;
}

function run(e: KeyboardEvent, action: () => unknown) {
  e.preventDefault();
  action();
}
