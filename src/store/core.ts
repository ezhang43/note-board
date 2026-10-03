import { centreOf, screenToBoard } from '../model/view';
import { emptyHistory, recordChange, redo as redoStep, undo as undoStep, type History } from '../model/history';
import { settle, type MeasuredHeight } from '../model/layout';
import { packInLanes, placeCards } from '../model/milanote';
import { BOARD_KEY, VIEW_KEY, parseBoard, parseView, serializeBoard, serializeView, type StorageLike } from '../model/persist';
import { recordPushes, type Pushes } from '../model/placement';
import { blockOf, type LayoutSnapshot } from '../model/board';
import { FONT_KEY, startingFontSize } from '../model/font';
import { THEME_KEY, startingTheme } from '../model/theme';
import type { Board, Point, Size, View } from '../model/types';
import { prefersDark, type Schedule } from './env';
import { emptyUi, type AppState, type Ui } from './types';

// The store's core: the one state object, saving, undo history, the change function and the
// overlap clean-up queue. The action files (blocks, gestures, checklist) work through this.

/** Wait this long after the last pan/zoom before saving it, so scrolling doesn't write on every frame. */
export const VIEW_SAVE_DELAY = 250;
/** Wait this long after the last board change before saving, so typing doesn't save on every key. */
export const BOARD_SAVE_DELAY = 150;

/** What `commit`'s function returns: the new board, the new board with ui changes, or null for "nothing to do". */
export type Change = Board | { board: Board; ui?: Partial<Ui> } | null;

export interface StoreContext {
  /** The current state (read it again after any change). */
  readonly state: AppState;
  set(next: AppState): void;
  /**
   * Every user change to board data goes through here, so every change can be undone.
   * `merge` names a text field: a burst of typing in it is one undo step.
   * A tick still animating is applied first, so actions must work out their change inside `fn`, from
   * the board it is given (never from state.board read beforehand). Returns the new board, or null
   * when `fn` returned null (then nothing changes).
   */
  commit(fn: (b: Board) => Change, opts?: { ui?: Partial<Ui>; merge?: string }): Board | null;
  updateUi(change: Partial<Ui>): void;
  updateView(fn: (v: View) => View): void;
  /**
   * Clear up overlaps soon: after the change has been drawn, so real heights are known.
   * Waits while a drag or resize is in progress. Part of the change that caused it, not a separate undo step.
   */
  requestSettle(anchors?: string[]): void;
  /** Last drawn heights of blocks, in board pixels. Not state: nothing re-renders when they change. */
  heights: Map<string, number>;
  measured: MeasuredHeight;
  /** Middle of what's on screen, in board coordinates. */
  screenCentre(): Point;
  /** Size of the board area on screen. */
  viewportSize(): Size;
  /** The selection, minus blocks that no longer exist (or are listed in `gone`). */
  liveSelection(board: Board, gone?: string[]): string[];
  /** Apply a tick that is still waiting for its animation. */
  flushPendingTick(): void;
  /** A tick waiting for its leaving animation to finish before it is applied. */
  pending: { tick: { timer: ReturnType<typeof setTimeout>; apply: () => void } | null };
  /**
   * Layout memory that is not board data (forgotten on reload): blocks pushed aside by each expanded
   * block, the block just expanded (while its growth may still push others), and just-imported cards
   * waiting to be laid out again with their real heights.
   */
  layout: {
    pushedBy: Map<string, Pushes>;
    expanding: { id: string; until: number } | null;
    importLayout: { ids: string[]; origin: Point } | null;
    /** The layout before and right after Collapse all, so Expand all can give it back. */
    collapseAll: { before: LayoutSnapshot; after: LayoutSnapshot } | null;
    /** Until when (ms) blocks opened by Expand all are still growing; meanwhile higher blocks win. */
    expandAllUntil: number;
  };
  /** Saves a value in the browser (does nothing if storage is unavailable). */
  write(key: string, value: string): void;
}

export function createCore(storage: StorageLike | null, schedule: Schedule) {
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

  let state: AppState = {
    board: parseBoard(read(BOARD_KEY)),
    view: { ...parseView(read(VIEW_KEY)), theme: startingTheme(read(THEME_KEY), prefersDark()), fontSize: startingFontSize(read(FONT_KEY)) },
    ui: emptyUi,
  };
  const listeners = new Set<() => void>();
  let viewTimer: ReturnType<typeof setTimeout> | null = null;
  let boardTimer: ReturnType<typeof setTimeout> | null = null;
  let viewportSize: Size = { width: 0, height: 0 };
  const heights = new Map<string, number>();
  /** Blocks that just moved, grew or were resized: they stay put when overlaps are cleared up. */
  const settleAnchors = new Set<string>();
  let settleQueued = false;
  let history: History = emptyHistory;
  const pending: StoreContext['pending'] = { tick: null };
  const layout: StoreContext['layout'] = { pushedBy: new Map(), expanding: null, importLayout: null, collapseAll: null, expandAllUntil: 0 };
  const measured: MeasuredHeight = (id) => heights.get(id);

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

  function flushPendingTick() {
    if (!pending.tick) return;
    clearTimeout(pending.tick.timer);
    pending.tick.apply();
  }

  const commit: StoreContext['commit'] = (fn, opts = {}) => {
    flushPendingTick();
    const before = state.board;
    const result = fn(before);
    if (!result) return null;
    const { board, ui } = 'board' in result ? result : { board: result, ui: undefined };
    if (board !== before) history = recordChange(history, before, opts.merge ?? null, Date.now());
    set({ ...state, board, ui: uiWith({ ...opts.ui, ...ui }) });
    return board;
  };

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
      // After Expand all, everything grows at once: the higher block wins, so blocks only move down.
      if (Date.now() <= layout.expandAllUntil) a.sort((p, q) => (blockOf(state.board, p)?.y ?? 0) - (blockOf(state.board, q)?.y ?? 0));
      // Blocks grow here (expanding, typing, columns filling up): what is below them goes straight down.
      const board = settle(state.board, measured, a, true);
      const exp = layout.expanding;
      if (exp && Date.now() <= exp.until) layout.pushedBy.set(exp.id, recordPushes(layout.pushedBy.get(exp.id), state.board, board));
      set({ ...state, board });
    });
  }

  /**
   * Imported cards are first laid out with guessed heights. Once every one has been drawn, lay the
   * lanes out again with the real heights, so cards sit 20px apart. Part of the import, not a
   * separate undo step.
   */
  function relayoutImport() {
    const pendingImport = layout.importLayout;
    if (!pendingImport) return;
    const ids = pendingImport.ids.filter((id) => state.board.cards[id] && state.board.order.includes(id));
    if (!ids.length) layout.importLayout = null;
    if (!layout.importLayout || !ids.every((id) => heights.has(id))) return;
    const { spots } = packInLanes(ids, (id) => heights.get(id)!, pendingImport.origin);
    layout.importLayout = null;
    set({ ...state, board: placeCards(state.board, spots) });
    requestSettle(ids);
  }

  function liveSelection(board: Board, gone: string[] = []): string[] {
    return state.ui.selection.filter((id) => (board.cards[id] || board.columns[id]) && !gone.includes(id));
  }

  /** Swap in a board (from undo, redo or elsewhere), clearing anything in progress on screen. */
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

  const ctx: StoreContext = {
    get state() {
      return state;
    },
    set,
    commit,
    updateUi: (change) => set({ ...state, ui: uiWith(change) }),
    updateView: (fn) => set({ ...state, view: fn(state.view) }),
    requestSettle,
    heights,
    measured,
    screenCentre: () => screenToBoard(state.view, centreOf(viewportSize)),
    viewportSize: () => viewportSize,
    liveSelection,
    flushPendingTick,
    pending,
    layout,
    write,
  };

  /** The store's own methods: reading, subscribing, saving on the way out, sizes, undo. */
  const api = {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Saves any waiting board change and pan/zoom now (used when the page is hidden or closed). */
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
    /**
     * Swap in a board that came from elsewhere (the online copy). Not a change the user made here,
     * so undo history starts over rather than undoing into the old board.
     */
    replaceBoard(board: Board) {
      history = emptyHistory;
      restore({ history, board });
    },
    // A tick still animating is applied first, so Ctrl+Z right after ticking undoes that tick.
    undo() {
      flushPendingTick();
      restore(undoStep(history, state.board));
    },
    redo() {
      flushPendingTick();
      restore(redoStep(history, state.board));
    },
  };

  return { ctx, api };
}
