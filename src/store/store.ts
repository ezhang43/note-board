import * as B from '../model/board';
import { createCard, createColumn } from '../model/cards';
import { CARD_W, NEW_BLOCK_H } from '../model/constants';
import { spotForNewBlock } from '../model/layout';
import type { ColorKey } from '../model/palette';
import { BOARD_KEY, VIEW_KEY, parseBoard, parseView, serializeBoard, serializeView, type StorageLike } from '../model/persist';
import type { Board, CardKind, Point, Size, Tool, View } from '../model/types';
import { centreOf, panBy, resetZoom, screenToBoard, zoomBy } from '../model/view';

/** A block being dragged. x / y are its top-left on the board while it follows the pointer. */
export interface Drag {
  kind: 'card' | 'column';
  id: string;
  x: number;
  y: number;
  /** The column a dragged card is over (it will drop into it), if any. */
  overColumn: string | null;
}

/** Things on screen that are not board data: never saved, never undoable. */
export interface Ui {
  selection: string[];
  colourMenuOpen: boolean;
  /** Column whose "Delete …?" confirmation is showing. */
  confirmDelete: string | null;
  drag: Drag | null;
}

export interface AppState {
  /** Board data: saved straight away after every change. */
  board: Board;
  /** Pan / zoom / tool: pan and zoom are saved shortly after they stop changing. */
  view: View;
  ui: Ui;
}

/** Wait this long after the last pan/zoom before saving it, so scrolling doesn't write on every frame. */
export const VIEW_SAVE_DELAY = 250;

const emptyUi: Ui = { selection: [], colourMenuOpen: false, confirmDelete: null, drag: null };

export type Store = ReturnType<typeof createStore>;

export function createStore(storage: StorageLike | null) {
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

  /** Every change to board data goes through here (step 4 adds undo history at this point). */
  function updateBoard(fn: (b: Board) => Board, ui?: Partial<Ui>) {
    set({ ...state, board: fn(state.board), ui: ui ? { ...state.ui, ...ui } : state.ui });
  }

  function updateView(fn: (v: View) => View) {
    set({ ...state, view: fn(state.view) });
  }

  function updateUi(change: Partial<Ui>) {
    const ui = state.ui;
    if ((Object.keys(change) as (keyof Ui)[]).every((k) => ui[k] === change[k])) return;
    set({ ...state, ui: { ...ui, ...change } });
  }

  /** Middle of what's on screen, in board coordinates. */
  function screenCentre(): Point {
    return screenToBoard(state.view, centreOf(viewportSize));
  }

  const measured = (id: string) => heights.get(id);

  /** Selection without blocks that no longer exist. */
  function without(ids: string[]): string[] {
    return state.ui.selection.filter((s) => !ids.includes(s));
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
      heights.set(id, h);
    },
    /** True (once) if this checklist item was just created and should get the cursor. */
    takeFocusRequest(itemId: string): boolean {
      if (focusRequest !== itemId) return false;
      focusRequest = null;
      return true;
    },

    // ---------- board ----------
    renameBoard: (name: string) => updateBoard((b) => B.renameBoard(b, name)),
    toggleSnap: () => updateBoard((b) => B.setSnap(b, !b.snap)),

    // ---------- view ----------
    setTool: (tool: Tool) => updateView((v) => (v.tool === tool ? v : { ...v, tool })),
    panBy: (dx: number, dy: number) => updateView((v) => panBy(v, dx, dy)),
    zoomAt: (at: Point, factor: number) => updateView((v) => zoomBy(v, at, factor)),
    zoomAtCentre: (factor: number) => updateView((v) => zoomBy(v, centreOf(viewportSize), factor)),
    resetZoom: () => updateView((v) => resetZoom(v, viewportSize)),

    // ---------- selection and menus ----------
    select: (id: string) => updateUi({ selection: state.ui.selection.length === 1 && state.ui.selection[0] === id ? state.ui.selection : [id] }),
    /** Click on empty board or Escape: clear the selection and close menus. */
    clearSelection: () => updateUi({ selection: [], colourMenuOpen: false, confirmDelete: null }),
    toggleColourMenu() {
      if (!state.ui.selection.length) return;
      updateUi({ colourMenuOpen: !state.ui.colourMenuOpen });
    },
    closeColourMenu: () => updateUi({ colourMenuOpen: false }),
    recolourSelection: (color: ColorKey) => updateBoard((b) => B.recolour(b, state.ui.selection, color)),

    // ---------- adding ----------
    addCard(kind: CardKind) {
      const card = createCard(kind);
      const selected = state.ui.selection.length === 1 ? state.ui.selection[0] : null;
      const place =
        B.placementForNewCard(state.board, selected) ??
        ({ type: 'loose', ...spotForNewBlock(state.board, CARD_W, NEW_BLOCK_H[kind], screenCentre(), measured) } as const);
      if (card.kind === 'todo') focusRequest = card.items[0].id;
      updateBoard((b) => B.addCard(b, card, place), { selection: [card.id] });
    },
    addColumn() {
      const col = createColumn();
      const spot = spotForNewBlock(state.board, col.w, NEW_BLOCK_H.column, screenCentre(), measured);
      updateBoard((b) => B.addColumn(b, { ...col, ...spot }), { selection: [col.id] });
    },

    // ---------- editing ----------
    setNoteText: (id: string, text: string) =>
      updateBoard((b) => B.updateCard(b, id, (c) => (c.kind === 'note' && c.text !== text ? { ...c, text } : c))),
    setCardTitle: (id: string, title: string) =>
      updateBoard((b) => B.updateCard(b, id, (c) => (c.kind !== 'note' && c.title !== title ? { ...c, title } : c))),
    setLinkUrl: (id: string, url: string) =>
      updateBoard((b) => B.updateCard(b, id, (c) => (c.kind === 'link' && c.url !== url ? { ...c, url } : c))),
    setItemText: (cardId: string, itemId: string, text: string) => updateBoard((b) => B.setItemText(b, cardId, itemId, text)),
    toggleItemDone: (cardId: string, itemId: string) => updateBoard((b) => B.toggleItemDone(b, cardId, itemId)),
    setColumnTitle: (id: string, title: string) => updateBoard((b) => B.updateColumn(b, id, { title })),
    toggleCollapsed: (id: string) => updateBoard((b) => B.toggleCollapsed(b, id)),

    // ---------- deleting ----------
    deleteCard: (id: string) => updateBoard((b) => B.deleteCard(b, id), { selection: without([id]) }),
    askDeleteColumn: (id: string) => updateUi({ confirmDelete: id }),
    cancelDeleteColumn: () => updateUi({ confirmDelete: null }),
    confirmDeleteColumn() {
      const id = state.ui.confirmDelete;
      if (!id) return;
      const gone = [id, ...(state.board.columns[id]?.cardIds ?? [])];
      updateBoard((b) => B.deleteColumn(b, id), { confirmDelete: null, selection: without(gone) });
    },

    // ---------- dragging ----------
    startDrag: (drag: Drag) => updateUi({ drag, confirmDelete: null }),
    moveDrag(x: number, y: number, overColumn: string | null) {
      const d = state.ui.drag;
      if (!d || (d.x === x && d.y === y && d.overColumn === overColumn)) return;
      updateUi({ drag: { ...d, x, y, overColumn } });
    },
    cancelDrag: () => updateUi({ drag: null }),
    /**
     * Finish a drag. `index` is where a card dropped on a column goes in it; otherwise the block
     * lands where it was let go.
     */
    dropDrag(index: number | null) {
      const d = state.ui.drag;
      if (!d) return;
      if (d.kind === 'column') return updateBoard((b) => B.moveColumn(b, d.id, d.x, d.y), { drag: null });
      const place: B.Placement =
        d.overColumn && index != null ? { type: 'column', columnId: d.overColumn, index } : { type: 'loose', x: d.x, y: d.y };
      updateBoard((b) => B.moveCard(b, d.id, place), { drag: null });
    },
  };
}
