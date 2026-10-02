import * as B from '../model/board';
import { createCard, createColumn, createItem, newId } from '../model/cards';
import * as C from '../model/checklist';
import type { ItemDrop } from '../model/checklist';
import { snapIf } from '../model/geometry';
import { copyBlocks, pasteBlocks, type ClipEntry } from '../model/clipboard';
import { CARD_W, COLUMN_W, GRID, NEW_BLOCK_H } from '../model/constants';
import { emptyHistory, recordChange, redo, undo, type History } from '../model/history';
import { blockRect, blocksTouching, landingSpot, settle, snapAll, spotForNewBlock } from '../model/layout';
import type { ColorKey } from '../model/palette';
import { cleanUp, completedCardOf, dayKey, restoreEntry } from '../model/completed';
import { addImported, estimateHeight, packInLanes, parseMilanote, placeCards } from '../model/milanote';
import { BOARD_KEY, VIEW_KEY, parseBoard, parseView, serializeBoard, serializeView, type StorageLike } from '../model/persist';
import type { Board, CardKind, Point, Rect, Size, TodoItem, Tool, View } from '../model/types';
import { THEME_KEY, startingTheme } from '../model/theme';
import { centreOf, panBy, resetZoom, screenToBoard, zoomBy } from '../model/view';
import { dropBoard, recordPushes, returnPushes, type Pushes } from '../model/placement';

/** A block being dragged. x / y are its top-left on the board while it follows the pointer. */
export interface Drag {
  kind: 'card' | 'column';
  id: string;
  x: number;
  y: number;
  /** Where it started, so other selected blocks can move by the same amount. */
  startX: number;
  startY: number;
  /** Other selected blocks moving along with it. */
  group: string[];
  /** The column a dragged card is over (it will drop into it), if any. */
  overColumn: string | null;
  /** Where the block will land if dropped now, when that differs from x / y (shown as a dashed outline). */
  land: Rect | null;
  /** Blocks pushed out of the way to make room, and where they would go (shown live while dragging). */
  bumped: Record<string, Point>;
}

/** A block being resized: its size so far, which blocks it matches, and the size label by the pointer. */
export interface Resize {
  kind: 'card' | 'column';
  id: string;
  /** The size it gets when let go. */
  w: number;
  /** null = width only (a column's right edge). */
  h: number | null;
  /** The size drawn while dragging (follows the pointer smoothly). */
  liveW: number;
  liveH: number | null;
  matchIds: string[];
  label: string;
  /** Where to show the label, in screen pixels from the canvas's top-left. */
  labelAt: Point;
}

/** A new card or column being dragged from the toolbar onto the board (it doesn't exist until dropped). */
export interface NewDrag {
  kind: CardKind | 'column';
  /** Pointer position in screen pixels from the canvas's top-left; null while off the board. */
  at: Point | null;
  /** The column the pointer is over (the card will go into it), if any. */
  overColumn: string | null;
  /** Where the card will appear if dropped now on empty board. */
  land: Rect | null;
}

/** "Delete …?" confirmation, shown on `columnId`, for deleting `ids`. */
export interface ConfirmDelete {
  columnId: string;
  ids: string[];
}

/** Checklist items selected together (by press-and-drag or Shift+click), all in one list. */
export interface ItemSelection {
  cardId: string;
  /** The item the range started from. */
  anchor: string;
  ids: string[];
}

/** Where dragged checklist items would go if dropped now, and which row shows the drop mark. */
export type ItemHint =
  | { cardId: string; drop: ItemDrop; markId: string | null; markMode: 'before' | 'after' | 'nest' | null }
  | { newList: Point };

/** Checklist items being dragged by their grip. */
export interface ItemDrag {
  cardId: string;
  /** The dragged items (not counting their sub-items), in order. */
  roots: string[];
  /** The dragged items and all their sub-items. */
  allIds: string[];
  /** Deepest nesting under the dragged items, to keep drops within 6 levels. */
  height: number;
  label: string;
  extra: string;
  /** Pointer position, in screen pixels from the canvas's top-left. */
  at: Point;
  hint: ItemHint | null;
}

/** Things on screen that are not board data: never saved, never undoable. */
export interface Ui {
  selection: string[];
  itemSel: ItemSelection | null;
  itemDrag: ItemDrag | null;
  /** A checklist item whose text box should get the cursor (at the end of its text, unless focusOffset says where). */
  focusItem: string | null;
  focusOffset: number | null;
  /** Checklist items on their way to the Completed section (shown ticked, fading) and the ones that just arrived. */
  completing: string[];
  arrived: string[];
  colourMenuOpen: boolean;
  confirm: ConfirmDelete | null;
  drag: Drag | null;
  /** A new card being dragged from a toolbar Add button. */
  newDrag: NewDrag | null;
  resize: Resize | null;
  /** The selection box being drawn, in screen pixels from the canvas's top-left. */
  marquee: Rect | null;
  canUndo: boolean;
  canRedo: boolean;
}

export interface AppState {
  /** Board data: saved straight away after every change, and undoable. */
  board: Board;
  /** Pan / zoom / tool: pan and zoom are saved shortly after they stop changing. */
  view: View;
  ui: Ui;
}

/** Wait this long after the last pan/zoom before saving it, so scrolling doesn't write on every frame. */
export const VIEW_SAVE_DELAY = 250;
/** Wait this long after the last board change before saving, so typing doesn't save on every key. */
export const BOARD_SAVE_DELAY = 150;
/** How long a ticked item takes to leave for the Completed section, and to settle in there (ms). */
export const COMPLETE_LEAVE_MS = 280;
export const COMPLETE_ARRIVE_MS = 450;

/** True when the computer is set to reduce motion (or there is no screen, as in unit tests). */
function reducedMotion(): boolean {
  return typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** After expanding a block, blocks it pushes aside within this long (ms) are remembered, to go back when it collapses. */
export const EXPAND_WATCH_MS = 1500;
/** Imported cards start this far (screen pixels) below the top of the board area. */
export const IMPORT_TOP_MARGIN = 40;

const emptyUi: Ui = {
  selection: [],
  itemSel: null,
  itemDrag: null,
  focusItem: null,
  focusOffset: null,
  completing: [],
  arrived: [],
  colourMenuOpen: false,
  confirm: null,
  drag: null,
  newDrag: null,
  resize: null,
  marquee: null,
  canUndo: false,
  canRedo: false,
};

export type Store = ReturnType<typeof createStore>;

/** Runs a function soon, after the current work (and, in the browser, after drawing). */
type Schedule = (fn: () => void) => void;
const later: Schedule = (fn) => setTimeout(fn, 0);

/** Puts text on the computer's clipboard, so it can be pasted into other apps (does nothing without one). */
function copyText(text: string) {
  try {
    void globalThis.navigator?.clipboard?.writeText(text).catch(() => {});
  } catch {
    // No clipboard access: copying within the board still works.
  }
}

/** Whether the computer is set to dark mode (false where there is no browser, as in unit tests). */
function prefersDark(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  } catch {
    return false;
  }
}

export function createStore(storage: StorageLike | null, schedule: Schedule = later) {
  let state: AppState = {
    board: parseBoard(read(BOARD_KEY)),
    view: { ...parseView(read(VIEW_KEY)), theme: startingTheme(read(THEME_KEY), prefersDark()) },
    ui: emptyUi,
  };
  const listeners = new Set<() => void>();
  let viewTimer: ReturnType<typeof setTimeout> | null = null;
  let boardTimer: ReturnType<typeof setTimeout> | null = null;
  let viewportSize: Size = { width: 0, height: 0 };
  /** Last drawn heights of blocks, in board pixels. Not state: nothing re-renders when they change. */
  const heights = new Map<string, number>();
  /** Blocks that just moved, grew or were resized: they stay put when overlaps are cleared up. */
  const settleAnchors = new Set<string>();
  let settleQueued = false;
  let history: History = emptyHistory;
  /** Copied blocks, and how many times they have been pasted. */
  let clipboard: { entries: ClipEntry[]; pastes: number } | null = null;
  /** Selection when the selection box started (kept when Ctrl is held). */
  let marqueeBase: string[] = [];
  /** Copied checklist items. */
  let itemClipboard: TodoItem[] | null = null;
  /**
   * Blocks pushed aside when a card or column was expanded, by the expanded block's id: where each
   * pushed block was, and where it was pushed to. Collapsing the block again puts them back.
   * Not board data: forgotten on reload.
   */
  const pushedBy = new Map<string, Pushes>();
  /** The block just expanded, while its growth may still push others aside. */
  let expanding: { id: string; until: number } | null = null;
  /** The last drag preview, kept while the pointer stays over the same grid spot. */
  let dragPreview: { board: Board; tx: number; ty: number; at: Point; bumped: Record<string, Point> } | null = null;
  /** A tick waiting for its leaving animation to finish before it is applied. */
  let pendingTick: { timer: ReturnType<typeof setTimeout>; apply: () => void } | null = null;
  /** Just-imported cards, laid out again in their lanes once their real heights are known. */
  let importLayout: { ids: string[]; origin: Point } | null = null;

  function read(key: string): string | null {
    try {
      return storage ? storage.getItem(key) : null;
    } catch {
      return null;
    }
  }

  function write(key: string, value: string) {
    try {
      storage?.setItem(key, value);
    } catch {
      // Storage full or blocked: keep working, the board just isn't saved.
    }
  }

  function flushView() {
    if (viewTimer) clearTimeout(viewTimer);
    viewTimer = null;
    write(VIEW_KEY, serializeView(state.view));
  }

  function flushBoard() {
    if (!boardTimer) return;
    clearTimeout(boardTimer);
    boardTimer = null;
    write(BOARD_KEY, serializeBoard(state.board));
  }

  function set(next: AppState) {
    if (next.board === state.board && next.view === state.view && next.ui === state.ui) return;
    const prev = state;
    state = next;
    if (next.board !== prev.board) {
      if (boardTimer) clearTimeout(boardTimer);
      boardTimer = setTimeout(flushBoard, BOARD_SAVE_DELAY);
    }
    if (next.view.panX !== prev.view.panX || next.view.panY !== prev.view.panY || next.view.zoom !== prev.view.zoom) {
      if (viewTimer) clearTimeout(viewTimer);
      viewTimer = setTimeout(flushView, VIEW_SAVE_DELAY);
    }
    listeners.forEach((l) => l());
  }

  /** New ui with `change` applied, or the same object when nothing changes. */
  function uiWith(change: Partial<Ui>): Ui {
    const ui = state.ui;
    const full = { ...change, canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
    return (Object.keys(full) as (keyof Ui)[]).every((k) => ui[k] === full[k]) ? ui : { ...ui, ...full };
  }

  /**
   * Every user change to board data goes through here, so every change can be undone.
   * `merge` names a text field: a burst of typing in it is one undo step.
   * A tick still animating is applied first, so actions must work out their change inside `fn`, from
   * the board it is given (never from state.board read beforehand). `fn` returns the new board, or
   * the new board with ui changes that depend on it, or null for "nothing to do" (then nothing
   * changes and commit returns null; otherwise it returns the new board).
   */
  function commit(
    fn: (b: Board) => Board | { board: Board; ui?: Partial<Ui> } | null,
    opts: { ui?: Partial<Ui>; merge?: string } = {},
  ): Board | null {
    flushPendingTick();
    const before = state.board;
    const result = fn(before);
    if (!result) return null;
    const { board, ui } = 'board' in result ? result : { board: result, ui: undefined };
    if (board !== before) history = recordChange(history, before, opts.merge ?? null, Date.now());
    set({ ...state, board, ui: uiWith({ ...opts.ui, ...ui }) });
    return board;
  }

  function updateView(fn: (v: View) => View) {
    set({ ...state, view: fn(state.view) });
  }

  function updateUi(change: Partial<Ui>) {
    set({ ...state, ui: uiWith(change) });
  }

  /**
   * Clear up overlaps soon: after the change has been drawn, so real heights are known.
   * Waits while a drag or resize is in progress. The clean-up belongs to the change that caused
   * it, so it is not a separate undo step.
   */
  function requestSettle(anchors: string[] = []) {
    // Re-adding moves a block to the end, so the most recent change is last.
    anchors.forEach((a) => {
      settleAnchors.delete(a);
      settleAnchors.add(a);
    });
    if (settleQueued) return;
    settleQueued = true;
    schedule(() => {
      settleQueued = false;
      if (state.ui.drag || state.ui.resize) return;
      // The most recent change wins when two anchored blocks are in each other's way.
      const a = [...settleAnchors].reverse();
      settleAnchors.clear();
      // Blocks grow here (expanding, typing, columns filling up): what is below them goes straight down.
      const board = settle(state.board, measured, a, true);
      if (expanding && Date.now() <= expanding.until) pushedBy.set(expanding.id, recordPushes(pushedBy.get(expanding.id), state.board, board));
      set({ ...state, board });
    });
  }

  /** Middle of what's on screen, in board coordinates. */
  function screenCentre(): Point {
    return screenToBoard(state.view, centreOf(viewportSize));
  }

  const measured = (id: string) => heights.get(id);

  /** Size of a block being dragged, as it will be once dropped loose on the board. */
  function draggedSize(d: Drag) {
    const h = heights.get(d.id) ?? NEW_BLOCK_H.column;
    if (d.kind === 'column') return { w: state.board.columns[d.id]?.w ?? COLUMN_W, h };
    return { w: state.board.cards[d.id]?.w ?? CARD_W, h };
  }

  /** Adds a new card and selects it; a new to-do list gets the cursor in its first item. */
  function addNewCard(kind: CardKind, place: B.Placement) {
    const card = createCard(kind);
    const focusItem = card.kind === 'todo' ? card.items[0].id : null;
    commit((b) => B.addCard(b, card, place), { ui: { selection: [card.id], itemSel: null, focusItem } });
    requestSettle([place.type === 'column' ? place.columnId : card.id]);
  }

  /** Adds a new column at a spot and selects it. */
  function addNewColumn(at: Point) {
    const col = { ...createColumn(), ...at };
    commit((b) => B.addColumn(b, col), { ui: { selection: [col.id], itemSel: null } });
    requestSettle([col.id]);
  }

  /**
   * Imported cards are first laid out with guessed heights. Once every one has been drawn, lay the
   * lanes out again with the real heights, so cards sit 20px apart. Part of the import, not a
   * separate undo step.
   */
  function relayoutImport() {
    if (!importLayout) return;
    const ids = importLayout.ids.filter((id) => state.board.cards[id] && state.board.order.includes(id));
    if (!ids.length) importLayout = null;
    if (!importLayout || !ids.every((id) => heights.has(id))) return;
    const { spots } = packInLanes(ids, (id) => heights.get(id)!, importLayout.origin);
    importLayout = null;
    set({ ...state, board: placeCards(state.board, spots) });
    requestSettle(ids);
  }

  /** Select the checklist items shown from `anchor` to `to` in one list. */
  function selectItemRange(cardId: string, anchor: string, to: string) {
    const card = state.board.cards[cardId];
    if (card?.kind !== 'todo') return;
    const ids = C.itemRange(card.items, anchor, to);
    if (ids.length) updateUi({ itemSel: { cardId, anchor, ids }, selection: [cardId] });
  }

  /** Delete / Backspace with checklist items selected. Returns false when no items are selected. */
  function deleteSelectedItems(): boolean {
    const sel = state.ui.itemSel;
    if (!sel) return false;
    commit((b) => C.editItems(b, sel.cardId, (items) => C.deleteItems(items, sel.ids)), {
      ui: { itemSel: null },
    });
    return true;
  }

  /** Apply a tick that is still waiting for its animation (before any other change, so nothing is lost). */
  function flushPendingTick() {
    if (!pendingTick) return;
    clearTimeout(pendingTick.timer);
    pendingTick.apply();
  }

  /** Tab / Shift+Tab with several items selected: they all move in (or out) one level together. */
  function tabSelectedItems(outdent: boolean) {
    const sel = state.ui.itemSel;
    if (!sel) return;
    commit((b) => C.editItems(b, sel.cardId, (items) => (outdent ? C.outdentItems(items, sel.ids) : C.indentItems(items, sel.ids))));
  }

  function copyItems(): boolean {
    const sel = state.ui.itemSel;
    const card = sel && state.board.cards[sel.cardId];
    if (!sel || card?.kind !== 'todo') return false;
    itemClipboard = C.copyItems(card.items, sel.ids);
    if (!itemClipboard.length) return false;
    copyText(C.selectionAsText(card.items, sel.ids));
    return true;
  }

  /** The selected checklist items, if `itemId` in `cardId` is one of several selected; otherwise null. */
  function selectedItemsIncluding(cardId: string, itemId: string): string[] | null {
    const sel = state.ui.itemSel;
    return sel && sel.cardId === cardId && sel.ids.length > 1 && sel.ids.includes(itemId) ? sel.ids : null;
  }

  /** The selection, minus blocks that no longer exist (or are listed in `gone`). */
  function liveSelection(board: Board, gone: string[] = []): string[] {
    return state.ui.selection.filter((id) => (board.cards[id] || board.columns[id]) && !gone.includes(id));
  }

  /** Put newly pasted / duplicated blocks on the board and select them. */
  function placeCopies(entries: ClipEntry[], times: number) {
    let ids: string[] = [];
    const board = commit((b) => {
      const pasted = pasteBlocks(b, entries, times);
      ids = pasted.ids;
      return { board: pasted.board, ui: { selection: ids, confirm: null } };
    })!;
    // Pasted blocks keep their spot; whatever they would cover moves out of the way.
    requestSettle(ids.map((id) => B.topLevelOf(board, id)));
  }

  function restore(result: { history: History; board: Board } | null) {
    if (!result) return;
    history = result.history;
    set({
      ...state,
      board: result.board,
      ui: uiWith({
        selection: liveSelection(result.board),
        confirm: null,
        drag: null,
        resize: null,
        marquee: null,
        itemSel: null,
        itemDrag: null,
        completing: [],
        arrived: [],
      }),
    });
    requestSettle();
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Saves any pending pan/zoom now (used when the page is closed). */
    flush() {
      flushBoard();
      flushView();
    },
    setViewportSize(size: Size) {
      viewportSize = size;
    },
    setMeasuredHeight(id: string, h: number) {
      if (heights.get(id) === h) return;
      heights.set(id, h);
      relayoutImport();
      // A loose block or column that grew may now cover something: move that out of its way.
      if (state.board.order.includes(id)) requestSettle([id]);
    },
    /** The checklist item that was asked to take the cursor has taken it. */
    focusTaken: (itemId: string) => {
      if (state.ui.focusItem === itemId) updateUi({ focusItem: null, focusOffset: null });
    },

    /**
     * Swap in a board that came from elsewhere (the online copy). Not a change the user made here,
     * so undo history starts over rather than undoing into the old board.
     */
    replaceBoard(board: Board) {
      history = emptyHistory;
      restore({ history, board });
    },

    // ---------- undo ----------
    // A tick still animating is applied first, so Ctrl+Z right after ticking undoes that tick.
    undo: () => {
      flushPendingTick();
      restore(undo(history, state.board));
    },
    redo: () => {
      flushPendingTick();
      restore(redo(history, state.board));
    },

    // ---------- board ----------
    renameBoard: (name: string) => commit((b) => B.renameBoard(b, name), { merge: 'board-name' }),
    /** Turning snapping back on moves every block (position and resized sizes) onto the grid. */
    toggleSnap() {
      const on = !state.board.snap;
      commit((b) => (on ? snapAll(B.setSnap(b, true)) : B.setSnap(b, false)));
      if (on) requestSettle();
    },

    // ---------- view ----------
    setTool: (tool: Tool) => updateView((v) => (v.tool === tool ? v : { ...v, tool })),
    /** Light / dark toggle: switches the look and remembers the choice on this device. */
    toggleTheme() {
      const theme = state.view.theme === 'dark' ? 'light' : 'dark';
      updateView((v) => ({ ...v, theme }));
      write(THEME_KEY, theme);
    },
    panBy: (dx: number, dy: number) => updateView((v) => panBy(v, dx, dy)),
    zoomAt: (at: Point, factor: number) => updateView((v) => zoomBy(v, at, factor)),
    zoomAtCentre: (factor: number) => updateView((v) => zoomBy(v, centreOf(viewportSize), factor)),
    resetZoom: () => updateView((v) => resetZoom(v, viewportSize)),

    // ---------- selection and menus ----------
    /** Select just this block. (Selected checklist items stay selected if they are in it.) */
    select: (id: string) => {
      const sel = state.ui.selection;
      updateUi({ selection: sel.length === 1 && sel[0] === id ? sel : [id], itemSel: state.ui.itemSel?.cardId === id ? state.ui.itemSel : null });
    },
    /**
     * Pressing a block: with Ctrl / Shift it is added to or removed from the selection;
     * otherwise it becomes the selection, unless it is already part of a bigger selection
     * (so dragging it moves the whole selection).
     */
    pressBlock(id: string, additive: boolean) {
      const sel = state.ui.selection;
      if (additive) updateUi({ selection: sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id], itemSel: null });
      else if (!sel.includes(id)) updateUi({ selection: [id], itemSel: null });
      else updateUi({ itemSel: null });
    },
    /** Ctrl+A: every column and loose card. */
    selectAll: () => updateUi({ selection: [...state.board.order], itemSel: null }),
    /** Click on empty board or Escape: clear the selection and close menus. */
    clearSelection: () => updateUi({ selection: [], itemSel: null, colourMenuOpen: false, confirm: null }),
    toggleColourMenu() {
      if (!state.ui.selection.length) return;
      updateUi({ colourMenuOpen: !state.ui.colourMenuOpen });
    },
    closeColourMenu: () => updateUi({ colourMenuOpen: false }),
    /** Auto-colour: give every column its own colour. */
    autoColour: () => commit((b) => B.autoColour(b)),
    recolourSelection: (color: ColorKey | null) => commit((b) => B.recolour(b, state.ui.selection, color)),

    // ---------- selection box (Select tool) ----------
    /** Start a selection box. With `keep` (Ctrl held) the current selection is added to. */
    startMarquee(at: Point, keep: boolean) {
      marqueeBase = keep ? state.ui.selection : [];
      updateUi({ marquee: { x: at.x, y: at.y, w: 0, h: 0 }, selection: marqueeBase, itemSel: null, colourMenuOpen: false, confirm: null });
    },
    /** The box now runs from `from` to `to` (canvas pixels): select everything it touches, live. */
    updateMarquee(from: Point, to: Point) {
      const box = { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) };
      const a = screenToBoard(state.view, { x: box.x, y: box.y });
      const z = state.view.zoom;
      const hits = blocksTouching(state.board, { ...a, w: box.w / z, h: box.h / z }, measured);
      updateUi({ marquee: box, selection: [...marqueeBase, ...hits.filter((id) => !marqueeBase.includes(id))] });
    },
    endMarquee: () => updateUi({ marquee: null }),

    // ---------- adding ----------
    /** Clicking Add Note / To-do list / Link. */
    addCard(kind: CardKind) {
      const selected = state.ui.selection.length === 1 ? state.ui.selection[0] : null;
      const place =
        B.placementForNewCard(state.board, selected) ??
        ({ type: 'loose', ...spotForNewBlock(state.board, CARD_W, NEW_BLOCK_H[kind], screenCentre(), measured) } as const);
      addNewCard(kind, place);
    },

    /**
     * Import a board exported from Milanote as Markdown: its cards are added loose to this board,
     * in lanes, at the top middle of the screen (or the nearest free space), and selected.
     * One undo removes them all. Returns how many cards were added.
     */
    importMilanote(markdown: string): number {
      const cards = parseMilanote(markdown);
      if (!cards.length) return 0;
      const ids = cards.map((c) => c.id);
      const guess = new Map(cards.map((c) => [c.id, estimateHeight(c)]));
      const size = packInLanes(ids, (id) => guess.get(id)!, { x: 0, y: 0 });
      const top = screenToBoard(state.view, { x: 0, y: IMPORT_TOP_MARGIN }).y;
      const want = { x: screenCentre().x - size.w / 2, y: top };
      const origin = spotForNewBlock(state.board, size.w, size.h, { x: screenCentre().x, y: top + size.h / 2 }, measured);
      const { spots } = packInLanes(ids, (id) => guess.get(id)!, origin);
      commit((b) => addImported(b, cards, spots), { ui: { selection: ids, itemSel: null, colourMenuOpen: false, confirm: null } });
      importLayout = { ids, origin };
      // If free space was found elsewhere, bring it to where the cards were meant to appear.
      const z = state.view.zoom;
      if (Math.abs(want.x - origin.x) > GRID || Math.abs(want.y - origin.y) > GRID)
        updateView((v) => panBy(v, Math.round((want.x - origin.x) * z), Math.round((want.y - origin.y) * z)));
      return cards.length;
    },

    /**
     * Clean up: every ticked checklist item moves into the board's Completed card, under today's
     * date. The first Clean up makes that card, at the free spot nearest the middle of the screen.
     * One undo step. Returns how many items moved.
     */
    cleanUp(now: Date = new Date()): number {
      let count = 0;
      let made: string | null = null;
      commit((b) => {
        const place = { type: 'loose', ...spotForNewBlock(b, CARD_W, NEW_BLOCK_H.completed, screenCentre(), measured) } as const;
        const result = cleanUp(b, dayKey(now), place);
        if (!result.count) return null;
        count = result.count;
        if (!completedCardOf(b)) made = result.cardId;
        return { board: result.board, ui: { selection: result.cardId ? [result.cardId] : [], itemSel: null, confirm: null } };
      });
      if (made) requestSettle([made]);
      return count;
    },

    /** Unticking an item in the Completed card sends it back to its list (or a new list, if that's gone). */
    restoreCompleted(itemId: string) {
      let cardId: string | null = null;
      const board = commit((b) => {
        const done = completedCardOf(b);
        if (!done) return null;
        // If its list is gone, the new list goes next to the Completed card.
        const near = blockRect(b, B.topLevelOf(b, done.id), measured);
        const centre = near ? { x: near.x + near.w + CARD_W / 2 + 20, y: near.y + NEW_BLOCK_H.todo / 2 } : screenCentre();
        const place = { type: 'loose', ...spotForNewBlock(b, CARD_W, NEW_BLOCK_H.todo, centre, measured) } as const;
        const result = restoreEntry(b, itemId, place);
        cardId = result.cardId;
        return cardId ? result.board : null;
      });
      if (board && cardId && board.order.includes(cardId)) requestSettle([cardId]);
    },

    /** Clicking New column. */
    addColumn() {
      addNewColumn(spotForNewBlock(state.board, COLUMN_W, NEW_BLOCK_H.column, screenCentre(), measured));
    },

    // ---------- dragging a new card or column from the toolbar ----------
    startNewDrag: (kind: NewDrag['kind']) => updateUi({ newDrag: { kind, at: null, overColumn: null, land: null }, confirm: null }),
    /**
     * The pointer moved: `at` is where it is on the canvas (null when off the board), `boardAt` the
     * same point in board coordinates. On empty board the block would appear with its top edge
     * just above the pointer, at the nearest free spot. A new card over a column goes into it;
     * a new column can't, so it just lands at the nearest free spot.
     */
    moveNewDrag(at: Point | null, boardAt: Point | null, overColumn: string | null) {
      const d = state.ui.newDrag;
      if (!d) return;
      const intoColumn = d.kind !== 'column' && at ? overColumn : null;
      let land: Rect | null = null;
      if (at && boardAt && !intoColumn) {
        const size = d.kind === 'column' ? { w: COLUMN_W, h: NEW_BLOCK_H.column } : { w: CARD_W, h: NEW_BLOCK_H[d.kind] };
        const at = (v: number) => snapIf(state.board.snap, v);
        const spot = landingSpot(state.board, '', at(boardAt.x - size.w / 2), at(boardAt.y - 18), size, measured);
        land = { ...spot, ...size };
      }
      updateUi({ newDrag: { ...d, at, overColumn: intoColumn, land } });
    },
    cancelNewDrag: () => updateUi({ newDrag: null }),
    /** Let go: a card goes into the column under the pointer (at `index`); otherwise the block goes at the landing spot. */
    dropNewDrag(index: number | null) {
      const d = state.ui.newDrag;
      updateUi({ newDrag: null });
      if (!d) return;
      if (d.kind === 'column') {
        if (d.land) addNewColumn({ x: d.land.x, y: d.land.y });
      } else if (d.overColumn && index != null) addNewCard(d.kind, { type: 'column', columnId: d.overColumn, index });
      else if (d.land) addNewCard(d.kind, { type: 'loose', x: d.land.x, y: d.land.y });
    },

    // ---------- editing ----------
    setNoteText: (id: string, text: string) =>
      commit((b) => B.updateCard(b, id, (c) => (c.kind === 'note' && c.text !== text ? { ...c, text } : c)), { merge: `text:${id}` }),
    setCardTitle: (id: string, title: string) =>
      commit((b) => B.updateCard(b, id, (c) => ((c.kind === 'todo' || c.kind === 'link') && c.title !== title ? { ...c, title } : c)), { merge: `title:${id}` }),
    setLinkUrl: (id: string, url: string) =>
      commit((b) => B.updateCard(b, id, (c) => (c.kind === 'link' && c.url !== url ? { ...c, url } : c)), { merge: `url:${id}` }),
    setItemText: (cardId: string, itemId: string, text: string) =>
      commit((b) => B.setItemText(b, cardId, itemId, text), { merge: `item:${itemId}` }),
    setColumnTitle: (id: string, title: string) => commit((b) => B.updateColumn(b, id, { title }), { merge: `coltitle:${id}` }),
    /** Collapse all / Expand all: if anything is open, collapse everything; otherwise open everything. One undo step. */
    toggleAllCollapsed() {
      const collapse = B.anyExpanded(state.board);
      pushedBy.clear();
      expanding = null;
      commit((b) => B.setAllCollapsed(b, collapse));
    },

    /**
     * Collapse arrow. Expanding starts remembering which blocks the growing block pushes aside;
     * collapsing puts them back (part of the same undo step).
     */
    toggleCollapsed(id: string) {
      const blk = B.blockOf(state.board, id);
      if (!blk) return;
      if (blk.collapsed) {
        pushedBy.delete(id);
        expanding = { id, until: Date.now() + EXPAND_WATCH_MS };
        commit((b) => B.toggleCollapsed(b, id));
        return;
      }
      if (expanding?.id === id) expanding = null;
      const top = B.topLevelOf(state.board, id);
      const pushes = pushedBy.get(id);
      pushedBy.delete(id);
      commit((b) => (pushes ? returnPushes(B.toggleCollapsed(b, id), pushes, top, measured) : B.toggleCollapsed(b, id)));
    },

    // ---------- checklists ----------
    /** Enter: a new item below, at the same level, with the cursor in it. */
    itemEnter(cardId: string, itemId: string) {
      const item = createItem();
      commit((b) => C.editItems(b, cardId, (items) => C.addItemAfter(items, itemId, item)), { ui: { focusItem: item.id, itemSel: null } });
    },
    /** Tab nests the item under the one above; Shift+Tab moves it out a level. With several items selected, they all move. */
    itemTab(cardId: string, itemId: string, outdent: boolean) {
      const sel = state.ui.itemSel;
      if (sel?.cardId === cardId && sel.ids.includes(itemId) && sel.ids.length > 1) return tabSelectedItems(outdent);
      commit((b) => C.editItems(b, cardId, (items) => (outdent ? C.outdentItem(items, itemId) : C.indentItem(items, itemId))), {
        ui: { focusItem: itemId },
      });
    },
    tabSelectedItems,
    /** Delete at the end of an item pulls the item below up into it. Returns whether it did. */
    itemDeleteAtEnd(cardId: string, itemId: string): boolean {
      return !!commit((b) => {
        const card = b.cards[cardId];
        const result = card?.kind === 'todo' ? C.mergeNextItem(card.items, itemId) : null;
        if (!result) return null;
        return { board: C.editItems(b, cardId, () => result.items), ui: { focusItem: itemId, focusOffset: result.caret, itemSel: null } };
      });
    },
    /** Backspace in an empty item deletes it (not the list's last item). Returns whether it did. */
    itemBackspace(cardId: string, itemId: string): boolean {
      return !!commit((b) => {
        const card = b.cards[cardId];
        const result = card?.kind === 'todo' ? C.removeEmptyItem(card.items, itemId) : null;
        if (!result) return null;
        return { board: C.editItems(b, cardId, () => result.items), ui: { focusItem: result.focus } };
      });
    },
    /** Tick / untick. With several items selected, ticking any one ticks (or unticks) them all. */
    toggleItem(cardId: string, itemId: string) {
      flushPendingTick();
      const card = state.board.cards[cardId];
      if (card?.kind !== 'todo') return;
      const item = C.findItem(card.items, itemId)?.item;
      if (!item) return;
      const ids = selectedItemsIncluding(cardId, itemId) ?? [itemId];
      const next = C.setItemsDone(card.items, ids, !item.done);
      // Applied to the list as it is then (another device's change may have arrived meanwhile).
      const apply = () => commit((b) => C.editItems(b, cardId, (items) => C.setItemsDone(items, ids, !item.done)));
      // Top-level items this tick sends to the Completed section get a short leaving animation first.
      const leaving = next.filter((it) => it.done && !card.items.find((o) => o.id === it.id)?.done).flatMap(C.subtreeIds);
      if (!leaving.length || reducedMotion()) return apply();
      updateUi({ completing: leaving });
      const finish = () => {
        pendingTick = null;
        apply();
        updateUi({ completing: [], arrived: leaving });
        setTimeout(() => {
          if (state.ui.arrived === leaving || state.ui.arrived.every((x) => leaving.includes(x))) updateUi({ arrived: [] });
        }, COMPLETE_ARRIVE_MS);
      };
      pendingTick = { timer: setTimeout(finish, COMPLETE_LEAVE_MS), apply: finish };
    },
    /** Trash can: deletes the item and everything under it (or every selected item, if it is one of them). */
    trashItem(cardId: string, itemId: string) {
      const ids = selectedItemsIncluding(cardId, itemId) ?? [itemId];
      commit((b) => C.editItems(b, cardId, (items) => C.deleteItems(items, ids)), { ui: { itemSel: null } });
    },
    toggleCompletedSection: (cardId: string) => commit((b) => C.toggleCompletedSection(b, cardId)),

    // ---------- selecting several checklist items ----------
    selectItemRange,
    /** Shift+click: extend the item selection to here. Returns false if there is no selection in this list to extend. */
    /**
     * Shift+click: extend the item selection to `to`. With no selection in this list yet, the range
     * starts from `from` (the item being typed in), if given.
     */
    extendItemSelection(cardId: string, to: string, from?: string | null): boolean {
      const sel = state.ui.itemSel;
      const anchor = sel?.cardId === cardId ? sel.anchor : from;
      if (!anchor) return false;
      selectItemRange(cardId, anchor, to);
      return true;
    },
    clearItemSelection: () => updateUi({ itemSel: null }),
    copyItems,
    deleteSelectedItems: () => deleteSelectedItems(),
    /** Cut removes exactly what was copied: the selected items. Unselected sub-items stay, moving up a level. */
    cutItems(): boolean {
      const sel = state.ui.itemSel;
      if (!sel || !copyItems()) return false;
      commit((b) => C.editItems(b, sel.cardId, (items) => C.removeExactly(items, sel.ids)), { ui: { itemSel: null } });
      return true;
    },
    /** Pastes copied items right after the selected items, and selects the pasted ones. */
    pasteItems(): boolean {
      const sel = state.ui.itemSel;
      const card = sel && state.board.cards[sel.cardId];
      if (!sel || card?.kind !== 'todo' || !itemClipboard?.length) return false;
      const order = C.displayOrder(card.items).filter((id) => sel.ids.includes(id));
      const fresh = C.freshCopies(itemClipboard);
      commit((b) => C.editItems(b, sel.cardId, (items) => C.pasteItemsAfter(items, order[order.length - 1], fresh)), {
        ui: { itemSel: { cardId: sel.cardId, anchor: fresh[0].id, ids: fresh.flatMap(C.subtreeIds) } },
      });
      return true;
    },

    // ---------- dragging checklist items ----------
    /** Start dragging an item by its grip (or every selected item, if it is one of them). */
    startItemDrag(cardId: string, itemId: string, at: Point) {
      const card = state.board.cards[cardId];
      if (card?.kind !== 'todo') return;
      const loc = C.findItem(card.items, itemId);
      if (!loc) return;
      const selected = selectedItemsIncluding(cardId, itemId);
      const roots = selected ? C.rootsOf(card.items, selected) : [itemId];
      const subtrees = roots.map((id) => C.findItem(card.items, id)!.item);
      const allIds = subtrees.flatMap(C.subtreeIds);
      const height = subtrees.reduce((h, it) => Math.max(h, C.subtreeHeight(it)), 0);
      const kids = allIds.length - 1;
      const label = roots.length > 1 ? `${allIds.length} items` : loc.item.text || 'Untitled item';
      const extra = roots.length > 1 || !kids ? '' : `+ ${kids} ${kids === 1 ? 'sub-item' : 'sub-items'}`;
      updateUi({ itemDrag: { cardId, roots, allIds, height, label, extra, at, hint: null }, confirm: null });
    },
    moveItemDrag(at: Point, hint: ItemHint | null) {
      const d = state.ui.itemDrag;
      if (d) updateUi({ itemDrag: { ...d, at, hint } });
    },
    cancelItemDrag: () => updateUi({ itemDrag: null }),
    /** Drop dragged items where the hint says: into a list, or onto the board as a new list. */
    dropItems() {
      const d = state.ui.itemDrag;
      if (!d) return;
      const h = d.hint;
      if (!h) return updateUi({ itemDrag: null });
      const keep = d.roots.length > 1 ? d.allIds : null;
      if ('newList' in h) {
        const id = newId('k');
        const at = (v: number) => snapIf(state.board.snap, v);
        commit((b) => C.moveItems(b, d.cardId, d.roots, { newList: { id, x: at(h.newList.x), y: at(h.newList.y) } }), {
          ui: { itemDrag: null, itemSel: null, selection: [id] },
        });
        return requestSettle([id]);
      }
      commit((b) => C.moveItems(b, d.cardId, d.roots, { cardId: h.cardId, drop: h.drop }), {
        ui: { itemDrag: null, itemSel: keep ? { cardId: h.cardId, anchor: d.roots[0], ids: keep } : null },
      });
    },

    // ---------- deleting ----------
    deleteCard(id: string) {
      commit((b) => B.deleteCard(b, id), { ui: { selection: liveSelection(state.board, [id]) } });
    },
    askDeleteColumn: (id: string) => updateUi({ confirm: { columnId: id, ids: [id] } }),
    cancelDelete: () => updateUi({ confirm: null }),
    confirmDelete() {
      const c = state.ui.confirm;
      if (!c) return;
      commit((b) => {
        const next = B.deleteBlocks(b, c.ids);
        return { board: next, ui: { confirm: null, selection: liveSelection(next) } };
      });
    },
    /**
     * Delete / Backspace: delete the selection. If it includes a column, the same confirmation as
     * the column's × appears first. Returns false when nothing is selected.
     */
    deleteSelection(): boolean {
      // Not while a block is being dragged or resized: it would vanish from under the pointer.
      if (state.ui.drag || state.ui.resize) return true;
      const ids = liveSelection(state.board);
      if (!ids.length) return false;
      const firstColumn = ids.find((id) => state.board.columns[id]);
      if (firstColumn) {
        updateUi({ confirm: { columnId: firstColumn, ids } });
        return true;
      }
      commit((b) => {
        const next = B.deleteBlocks(b, ids);
        return { board: next, ui: { selection: liveSelection(next), colourMenuOpen: false } };
      });
      return true;
    },

    // ---------- clipboard ----------
    copySelection(): boolean {
      const entries = copyBlocks(state.board, liveSelection(state.board));
      if (!entries.length) return false;
      clipboard = { entries, pastes: 0 };
      return true;
    },
    paste(): boolean {
      if (!clipboard) return false;
      clipboard.pastes += 1;
      placeCopies(clipboard.entries, clipboard.pastes);
      return true;
    },
    /** Ctrl+D: copies of the selection, 40px down and right. Leaves the clipboard alone. */
    duplicate(): boolean {
      const entries = copyBlocks(state.board, liveSelection(state.board));
      if (!entries.length) return false;
      placeCopies(entries, 1);
      return true;
    },

    /**
     * Arrow keys: the selected loose blocks and columns move by `dx`, `dy` grid steps, keeping their
     * spot like a drag (whatever is in the way moves). A single selected card inside a column moves
     * up / down its column instead. Presses in quick succession are one undo step.
     */
    nudgeSelection(dx: number, dy: number): boolean {
      const sel = liveSelection(state.board);
      if (!sel.length) return false;
      const b0 = state.board;
      if (sel.length === 1 && !b0.order.includes(sel[0])) {
        if (dy === 0) return true;
        const id = sel[0];
        commit((b) => B.shiftInColumn(b, id, dy < 0 ? -1 : 1), { merge: `nudge:${id}` });
        requestSettle([B.topLevelOf(state.board, id)]);
        return true;
      }
      const ids = sel.filter((id) => b0.order.includes(id));
      if (!ids.length) return true;
      commit((b) => settle(B.moveBlocksBy(b, ids, dx * GRID, dy * GRID), measured, ids), { merge: `nudge:${ids.join(',')}` });
      return true;
    },

    // ---------- dragging ----------
    startDrag(kind: Drag['kind'], id: string, x: number, y: number) {
      const sel = state.ui.selection;
      const topLevel = state.board.order.includes(id);
      // A selected block dragged together with other selected blocks moves them all.
      const group = topLevel && sel.includes(id) ? sel.filter((s) => s !== id && state.board.order.includes(s)) : [];
      dragPreview = null;
      updateUi({ drag: { kind, id, x, y, startX: x, startY: y, group, overColumn: null, land: null, bumped: {} }, confirm: null });
    },
    moveDrag(x: number, y: number, overColumn: string | null) {
      const d = state.ui.drag;
      if (!d) return;
      // Several blocks move as one: they don't drop into columns.
      const over = d.group.length ? null : overColumn;
      if (d.x === x && d.y === y && d.overColumn === over) return;
      if (over) {
        dragPreview = null;
        return updateUi({ drag: { ...d, x, y, overColumn: over, land: null, bumped: {} } });
      }
      // The block follows the pointer exactly. It will land on the grid spot under it (dashed
      // outline), and takes priority there: blocks in the way are shown moving aside right away.
      // Within the same grid spot the preview is unchanged, so it isn't worked out again.
      const tx = snapIf(state.board.snap, x);
      const ty = snapIf(state.board.snap, y);
      const p = dragPreview;
      if (!p || p.board !== state.board || p.tx !== tx || p.ty !== ty) {
        const { at, bumped } = dropBoard(state.board, { ...d, x, y }, measured);
        dragPreview = { board: state.board, tx, ty, at, bumped };
      }
      const { at, bumped } = dragPreview!;
      const land = !d.group.length && (at.x !== x || at.y !== y) ? { ...at, ...draggedSize(d) } : null;
      updateUi({ drag: { ...d, x, y, overColumn: null, land, bumped } });
    },
    cancelDrag() {
      updateUi({ drag: null });
      requestSettle();
    },
    /**
     * Finish a drag. `index` is where a card dropped on a column goes in it; otherwise the block
     * lands on the grid spot where it was let go, and anything in the way moves aside.
     */
    dropDrag(index: number | null) {
      const d = state.ui.drag;
      if (!d) return;
      if (d.overColumn && index != null) {
        commit((b) => B.moveCard(b, d.id, { type: 'column', columnId: d.overColumn!, index }), { ui: { drag: null } });
        return requestSettle([d.overColumn]);
      }
      let ids: string[] = [];
      commit(
        (b) => {
          const result = dropBoard(b, d, measured);
          ids = result.ids;
          return result.board;
        },
        { ui: { drag: null } },
      );
      requestSettle(ids);
    },

    // ---------- resizing ----------
    /** Show a resize in progress (the board itself only changes when the pointer is released). */
    showResize: (resize: Resize) => updateUi({ resize, confirm: null }),
    cancelResize() {
      updateUi({ resize: null });
      requestSettle();
    },
    commitResize() {
      const r = state.ui.resize;
      if (!r) return;
      commit(
        (b) => (r.kind === 'card' ? B.resizeCard(b, r.id, r.w, r.h ?? b.cards[r.id]?.h ?? null) : B.resizeColumn(b, r.id, r.w, r.h ?? undefined)),
        { ui: { resize: null } },
      );
      requestSettle([r.id]);
    },
  };
}
