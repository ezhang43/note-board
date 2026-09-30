import * as B from '../model/board';
import { createCard, createColumn } from '../model/cards';
import { copyBlocks, pasteBlocks, type ClipEntry } from '../model/clipboard';
import { CARD_W, COLUMN_W, NEW_BLOCK_H } from '../model/constants';
import { emptyHistory, recordChange, redo, undo, type History } from '../model/history';
import { blocksTouching, landingSpot, settle, snapAll, spotForNewBlock } from '../model/layout';
import type { ColorKey } from '../model/palette';
import { BOARD_KEY, VIEW_KEY, parseBoard, parseView, serializeBoard, serializeView, type StorageLike } from '../model/persist';
import type { Board, CardKind, Point, Rect, Size, Tool, View } from '../model/types';
import { centreOf, panBy, resetZoom, screenToBoard, zoomBy } from '../model/view';

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
}

/** A block being resized: its size so far, which blocks it matches, and the size label by the pointer. */
export interface Resize {
  kind: 'card' | 'column';
  id: string;
  w: number;
  /** null = width only (a column's right edge). */
  h: number | null;
  matchIds: string[];
  label: string;
  /** Where to show the label, in screen pixels from the canvas's top-left. */
  labelAt: Point;
}

/** "Delete …?" confirmation, shown on `columnId`, for deleting `ids`. */
export interface ConfirmDelete {
  columnId: string;
  ids: string[];
}

/** Things on screen that are not board data: never saved, never undoable. */
export interface Ui {
  selection: string[];
  colourMenuOpen: boolean;
  confirm: ConfirmDelete | null;
  drag: Drag | null;
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

const emptyUi: Ui = {
  selection: [],
  colourMenuOpen: false,
  confirm: null,
  drag: null,
  resize: null,
  marquee: null,
  canUndo: false,
  canRedo: false,
};

export type Store = ReturnType<typeof createStore>;

/** Runs a function soon, after the current work (and, in the browser, after drawing). */
type Schedule = (fn: () => void) => void;
const later: Schedule = (fn) => setTimeout(fn, 0);

export function createStore(storage: StorageLike | null, schedule: Schedule = later) {
  let state: AppState = {
    board: parseBoard(read(BOARD_KEY)),
    view: parseView(read(VIEW_KEY)),
    ui: emptyUi,
  };
  const listeners = new Set<() => void>();
  let viewTimer: ReturnType<typeof setTimeout> | null = null;
  let viewportSize: Size = { width: 0, height: 0 };
  /** Last drawn heights of blocks, in board pixels. Not state: nothing re-renders when they change. */
  const heights = new Map<string, number>();
  /** A checklist item whose text box should get the cursor as soon as it appears. */
  let focusRequest: string | null = null;
  /** Blocks that just moved, grew or were resized: they stay put when overlaps are cleared up. */
  const settleAnchors = new Set<string>();
  let settleQueued = false;
  let history: History = emptyHistory;
  /** Copied blocks, and how many times they have been pasted. */
  let clipboard: { entries: ClipEntry[]; pastes: number } | null = null;
  /** Selection when the selection box started (kept when Ctrl is held). */
  let marqueeBase: string[] = [];

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

  function set(next: AppState) {
    if (next.board === state.board && next.view === state.view && next.ui === state.ui) return;
    const prev = state;
    state = next;
    if (next.board !== prev.board) write(BOARD_KEY, serializeBoard(next.board));
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
   */
  function commit(fn: (b: Board) => Board, opts: { ui?: Partial<Ui>; merge?: string } = {}) {
    const before = state.board;
    const board = fn(before);
    if (board !== before) history = recordChange(history, before, opts.merge ?? null, Date.now());
    set({ ...state, board, ui: uiWith(opts.ui ?? {}) });
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
      set({ ...state, board: settle(state.board, measured, a) });
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

  /** The selection, minus blocks that no longer exist (or are listed in `gone`). */
  function liveSelection(board: Board, gone: string[] = []): string[] {
    return state.ui.selection.filter((id) => (board.cards[id] || board.columns[id]) && !gone.includes(id));
  }

  /** Put newly pasted / duplicated blocks on the board and select them. */
  function placeCopies(entries: ClipEntry[], times: number) {
    const { board, ids } = pasteBlocks(state.board, entries, times);
    commit(() => board, { ui: { selection: ids, confirm: null } });
    // Pasted blocks keep their spot; whatever they would cover moves out of the way.
    requestSettle(ids.map((id) => (board.order.includes(id) ? id : B.columnOf(board, id)?.id ?? id)));
  }

  function restore(result: { history: History; board: Board } | null) {
    if (!result) return;
    history = result.history;
    set({
      ...state,
      board: result.board,
      ui: uiWith({ selection: liveSelection(result.board), confirm: null, drag: null, resize: null, marquee: null }),
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
    flush: flushView,
    setViewportSize(size: Size) {
      viewportSize = size;
    },
    setMeasuredHeight(id: string, h: number) {
      if (heights.get(id) === h) return;
      heights.set(id, h);
      // A loose block or column that grew may now cover something: move that out of its way.
      if (state.board.order.includes(id)) requestSettle([id]);
    },
    /** True (once) if this checklist item was just created and should get the cursor. */
    takeFocusRequest(itemId: string): boolean {
      if (focusRequest !== itemId) return false;
      focusRequest = null;
      return true;
    },

    // ---------- undo ----------
    undo: () => restore(undo(history, state.board)),
    redo: () => restore(redo(history, state.board)),

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
    panBy: (dx: number, dy: number) => updateView((v) => panBy(v, dx, dy)),
    zoomAt: (at: Point, factor: number) => updateView((v) => zoomBy(v, at, factor)),
    zoomAtCentre: (factor: number) => updateView((v) => zoomBy(v, centreOf(viewportSize), factor)),
    resetZoom: () => updateView((v) => resetZoom(v, viewportSize)),

    // ---------- selection and menus ----------
    /** Select just this block. */
    select: (id: string) => {
      const sel = state.ui.selection;
      updateUi({ selection: sel.length === 1 && sel[0] === id ? sel : [id] });
    },
    /**
     * Pressing a block: with Ctrl / Shift it is added to or removed from the selection;
     * otherwise it becomes the selection, unless it is already part of a bigger selection
     * (so dragging it moves the whole selection).
     */
    pressBlock(id: string, additive: boolean) {
      const sel = state.ui.selection;
      if (additive) updateUi({ selection: sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id] });
      else if (!sel.includes(id)) updateUi({ selection: [id] });
    },
    /** Ctrl+A: every column and loose card. */
    selectAll: () => updateUi({ selection: [...state.board.order] }),
    /** Click on empty board or Escape: clear the selection and close menus. */
    clearSelection: () => updateUi({ selection: [], colourMenuOpen: false, confirm: null }),
    toggleColourMenu() {
      if (!state.ui.selection.length) return;
      updateUi({ colourMenuOpen: !state.ui.colourMenuOpen });
    },
    closeColourMenu: () => updateUi({ colourMenuOpen: false }),
    recolourSelection: (color: ColorKey) => commit((b) => B.recolour(b, state.ui.selection, color)),

    // ---------- selection box (Select tool) ----------
    /** Start a selection box. With `keep` (Ctrl held) the current selection is added to. */
    startMarquee(at: Point, keep: boolean) {
      marqueeBase = keep ? state.ui.selection : [];
      updateUi({ marquee: { x: at.x, y: at.y, w: 0, h: 0 }, selection: marqueeBase, colourMenuOpen: false, confirm: null });
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
    addCard(kind: CardKind) {
      const card = createCard(kind);
      const selected = state.ui.selection.length === 1 ? state.ui.selection[0] : null;
      const place =
        B.placementForNewCard(state.board, selected) ??
        ({ type: 'loose', ...spotForNewBlock(state.board, CARD_W, NEW_BLOCK_H[kind], screenCentre(), measured) } as const);
      if (card.kind === 'todo') focusRequest = card.items[0].id;
      commit((b) => B.addCard(b, card, place), { ui: { selection: [card.id] } });
    },
    addColumn() {
      const col = createColumn();
      const spot = spotForNewBlock(state.board, col.w, NEW_BLOCK_H.column, screenCentre(), measured);
      commit((b) => B.addColumn(b, { ...col, ...spot }), { ui: { selection: [col.id] } });
    },

    // ---------- editing ----------
    setNoteText: (id: string, text: string) =>
      commit((b) => B.updateCard(b, id, (c) => (c.kind === 'note' && c.text !== text ? { ...c, text } : c)), { merge: `text:${id}` }),
    setCardTitle: (id: string, title: string) =>
      commit((b) => B.updateCard(b, id, (c) => (c.kind !== 'note' && c.title !== title ? { ...c, title } : c)), { merge: `title:${id}` }),
    setLinkUrl: (id: string, url: string) =>
      commit((b) => B.updateCard(b, id, (c) => (c.kind === 'link' && c.url !== url ? { ...c, url } : c)), { merge: `url:${id}` }),
    setItemText: (cardId: string, itemId: string, text: string) =>
      commit((b) => B.setItemText(b, cardId, itemId, text), { merge: `item:${itemId}` }),
    toggleItemDone: (cardId: string, itemId: string) => commit((b) => B.toggleItemDone(b, cardId, itemId)),
    setColumnTitle: (id: string, title: string) => commit((b) => B.updateColumn(b, id, { title }), { merge: `coltitle:${id}` }),
    toggleCollapsed: (id: string) => commit((b) => B.toggleCollapsed(b, id)),

    // ---------- deleting ----------
    deleteCard(id: string) {
      commit((b) => B.deleteCard(b, id), { ui: { selection: liveSelection(state.board, [id]) } });
    },
    askDeleteColumn: (id: string) => updateUi({ confirm: { columnId: id, ids: [id] } }),
    cancelDelete: () => updateUi({ confirm: null }),
    confirmDelete() {
      const c = state.ui.confirm;
      if (!c) return;
      const next = B.deleteBlocks(state.board, c.ids);
      commit(() => next, { ui: { confirm: null, selection: liveSelection(next) } });
    },
    /**
     * Delete / Backspace: delete the selection. If it includes a column, the same confirmation as
     * the column's × appears first. Returns false when nothing is selected.
     */
    deleteSelection(): boolean {
      const ids = liveSelection(state.board);
      if (!ids.length) return false;
      const firstColumn = ids.find((id) => state.board.columns[id]);
      if (firstColumn) {
        updateUi({ confirm: { columnId: firstColumn, ids } });
        return true;
      }
      const next = B.deleteBlocks(state.board, ids);
      commit(() => next, { ui: { selection: liveSelection(next), colourMenuOpen: false } });
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

    // ---------- dragging ----------
    startDrag(kind: Drag['kind'], id: string, x: number, y: number) {
      const sel = state.ui.selection;
      const topLevel = state.board.order.includes(id);
      // A selected block dragged together with other selected blocks moves them all.
      const group = topLevel && sel.includes(id) ? sel.filter((s) => s !== id && state.board.order.includes(s)) : [];
      updateUi({ drag: { kind, id, x, y, startX: x, startY: y, group, overColumn: null, land: null }, confirm: null });
    },
    moveDrag(x: number, y: number, overColumn: string | null) {
      const d = state.ui.drag;
      if (!d) return;
      // Several blocks move as one: they don't drop into columns and have no single landing spot.
      const over = d.group.length ? null : overColumn;
      if (d.x === x && d.y === y && d.overColumn === over) return;
      let land: Rect | null = null;
      if (!over && !d.group.length) {
        const size = draggedSize(d);
        const spot = landingSpot(state.board, d.id, x, y, size, measured);
        if (spot.x !== x || spot.y !== y) land = { ...spot, ...size };
      }
      updateUi({ drag: { ...d, x, y, overColumn: over, land } });
    },
    cancelDrag() {
      updateUi({ drag: null });
      requestSettle();
    },
    /**
     * Finish a drag. `index` is where a card dropped on a column goes in it; otherwise the block
     * lands at the nearest free spot to where it was let go.
     */
    dropDrag(index: number | null) {
      const d = state.ui.drag;
      if (!d) return;
      if (d.group.length) {
        const ids = [d.id, ...d.group];
        commit((b) => B.moveBlocksBy(b, ids, d.x - d.startX, d.y - d.startY), { ui: { drag: null } });
        return requestSettle(ids);
      }
      const at = d.land ?? { x: d.x, y: d.y };
      if (d.kind === 'column') {
        commit((b) => B.moveColumn(b, d.id, at.x, at.y), { ui: { drag: null } });
        return requestSettle([d.id]);
      }
      const intoColumn = d.overColumn && index != null;
      const place: B.Placement = intoColumn ? { type: 'column', columnId: d.overColumn!, index: index! } : { type: 'loose', ...at };
      commit((b) => B.moveCard(b, d.id, place), { ui: { drag: null } });
      requestSettle([intoColumn ? d.overColumn! : d.id]);
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
        (b) => (r.kind === 'card' ? B.resizeCard(b, r.id, r.w, r.h ?? b.cards[r.id]?.h ?? 0) : B.resizeColumn(b, r.id, r.w, r.h ?? undefined)),
        { ui: { resize: null } },
      );
      requestSettle([r.id]);
    },
  };
}
