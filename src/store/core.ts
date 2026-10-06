import { centreOf, screenToBoard } from '../model/view';
import { emptyHistory, recordChange, redo as redoStep, undo as undoStep, type History } from '../model/history';
import { closeGaps, settle, type MeasuredHeight } from '../model/layout';
import { packInLanes, placeCards } from '../model/milanote';
import { BOARD_KEY, VIEW_KEY, parseView, serializeView, type StorageLike } from '../model/persist';
import { OPEN_BOARD_KEY, isLeftoverBoard, parseWorkspace, serializeWorkspace, type Workspace } from '../model/workspace';
import { recordPushes, type Pushes } from '../model/placement';
import { blockOf, layoutSnapshot, type LayoutSnapshot } from '../model/board';
import { FONT_KEY, startingFontSize } from '../model/font';
import { THEME_KEY, startingTheme } from '../model/theme';
import type { Board, Point, Size, View } from '../model/types';
import { prefersDark, type Schedule } from './env';
import { emptyUi, type AppState, type Boards, type Ui } from './types';

// The store's core: the one state object, saving, undo history, the change function and the
// overlap clean-up queue. The action files (blocks, gestures, checklist) work through this.

/** Wait this long after the last pan/zoom before saving it, so scrolling doesn't write on every frame. */
export const VIEW_SAVE_DELAY = 250;
/** Wait this long after the last board change before saving, so typing doesn't save on every key. */
export const BOARD_SAVE_DELAY = 150;
/** How long after a collapse the gaps below keep closing as the new heights come in (ms). */
const CLOSING_MS = 1500;
/** What a gesture shows while it lasts; cleared when it ends, even while an old version is shown. */
const GESTURE_UI = new Set(['drag', 'newDrag', 'itemDrag', 'resize', 'marquee']);

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
  /** Collapse something (`collapse` makes the change), then close the gaps it leaves below. */
  startClosing(collapse: () => void): void;
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
    /**
     * The layout before and right after Collapse all, so Expand all can give it back; the open
     * heights, to close the gaps while the collapsed heights come in (until `until`); and which
     * blocks it was for (`scope`: the selected ids, or null for everything).
     */
    collapseAll: { before: LayoutSnapshot; after: LayoutSnapshot; scope: string[] | null } | null;
    /**
     * Just after something collapsed: where blocks were and how tall they were drawn before, so the
     * gaps below can be closed while the collapsed heights come in (until `until`). `after` is
     * where that left them.
     */
    closing: { before: LayoutSnapshot; after: LayoutSnapshot; openH: Record<string, number>; until: number } | null;
    /** Until when (ms) blocks opened by Expand all are still growing; meanwhile higher blocks win. */
    expandAllUntil: number;
  };
  /** Saves a value in the browser (does nothing if storage is unavailable). */
  write(key: string, value: string): void;
  /** Every board as saved: the open one and the others (the same object until one changes). */
  workspace(): Workspace;
  /** Change the boards that aren't open (adding or removing boards). Not undoable. */
  setOthers(fn: (others: Record<string, Board>) => Record<string, Board>): void;
  /** Open another board: its own undo history, nothing selected, brought into view once drawn. */
  openBoard(id: string): void;
  /** Swap in every board (from elsewhere, or a backup of every board); undo starts over. */
  replaceWorkspace(ws: Workspace): void;
}

/** What is cleared on screen when a different board is shown. */
const BOARD_SWITCH_UI: Partial<Ui> = {
  selection: [],
  confirm: null,
  deleteCompleted: null,
  drag: null,
  resize: null,
  marquee: null,
  itemSel: null,
  itemDrag: null,
  newDrag: null,
  completing: [],
  arrived: [],
  focusItem: null,
  focusOffset: null,
  focusBlock: null,
  colourMenuOpen: false,
  preview: null,
  dueFor: null,
  arrowSel: null,
};

/** The boards as one object, in a fixed order (so saving the same boards gives the same text). */
function workspaceFrom(board: Board, boards: Boards): Workspace {
  const all: Record<string, Board> = { ...boards.others, [boards.open]: board };
  return { home: boards.home, boards: Object.fromEntries(Object.keys(all).sort().map((id) => [id, all[id]])) };
}

/** Splits a workspace into the board to open (`open`, if it exists, else home) and the others. */
function split(ws: Workspace, open: string | null): { board: Board; boards: Boards } {
  const id = open && ws.boards[open] ? open : ws.home;
  const others = { ...ws.boards };
  delete others[id];
  return { board: ws.boards[id], boards: { home: ws.home, open: id, others } };
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
    ...split(parseWorkspace(read(BOARD_KEY)), read(OPEN_BOARD_KEY)),
    view: { ...parseView(read(VIEW_KEY)), theme: startingTheme(read(THEME_KEY), prefersDark()), fontSize: startingFontSize(read(FONT_KEY)) },
    ui: emptyUi,
  };
  const listeners = new Set<() => void>();
  let viewTimer: ReturnType<typeof setTimeout> | null = null;
  let boardTimer: ReturnType<typeof setTimeout> | null = null;
  let viewportSize: Size = { width: 0, height: 0 };
  let centreOnArrival = false;
  let outsideChanges = 0;
  /** Changes made here by the person (not blocks re-arranging themselves, nor boards from elsewhere). */
  let edits = 0;
  const heights = new Map<string, number>();
  /** Blocks that just moved, grew or were resized: they stay put when overlaps are cleared up. */
  const settleAnchors = new Set<string>();
  let settleQueued = false;
  let history: History = emptyHistory;
  /** Undo history of each board that isn't open (undo belongs to each board). */
  const histories = new Map<string, History>();
  let wsCache: { board: Board; boards: Boards; ws: Workspace } | null = null;
  function workspace(): Workspace {
    if (!wsCache || wsCache.board !== state.board || wsCache.boards !== state.boards) {
      wsCache = { board: state.board, boards: state.boards, ws: workspaceFrom(state.board, state.boards) };
    }
    return wsCache.ws;
  }
  const pending: StoreContext['pending'] = { tick: null };
  const layout: StoreContext['layout'] = { pushedBy: new Map(), expanding: null, importLayout: null, collapseAll: null, closing: null, expandAllUntil: 0 };
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
    write(BOARD_KEY, serializeWorkspace(workspace()));
  }

  function set(next: AppState) {
    if (next.board === state.board && next.boards === state.boards && next.view === state.view && next.ui === state.ui) return;
    const prev = state;
    state = next;
    if (next.board !== prev.board || next.boards.others !== prev.boards.others) {
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
    // Looking at an old version: nothing can be changed (the board shown isn't the real one), but a
    // gesture that ends still clears what it showed (a drag outline, a size label).
    if (state.ui.preview) {
      const ended = Object.fromEntries(Object.entries(opts.ui ?? {}).filter(([key]) => GESTURE_UI.has(key)));
      if (Object.keys(ended).length) set({ ...state, ui: uiWith(ended) });
      return null;
    }
    flushPendingTick();
    const before = state.board;
    const result = fn(before);
    if (!result) return null;
    const { board, ui } = 'board' in result ? result : { board: result, ui: undefined };
    if (board !== before) {
      history = recordChange(history, before, opts.merge ?? null, Date.now());
      edits++;
    }
    set({ ...state, board, ui: uiWith({ ...opts.ui, ...ui }) });
    return board;
  };

  /**
   * Call before collapsing (`collapse` does it): remembers the heights drawn now, then after the
   * change closes the gaps below as the new heights come in (owner request).
   */
  function startClosing(collapse: () => void) {
    const openH = Object.fromEntries(state.board.order.flatMap((id) => (measured(id) == null ? [] : [[id, measured(id)!]])));
    collapse();
    const at = layoutSnapshot(state.board);
    layout.closing = { before: at, after: at, openH, until: Date.now() + CLOSING_MS };
    requestSettle();
  }

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
      let board = state.board;
      // Just after collapsing: blocks below the collapsed ones move straight up (owner request).
      // Only blocks still where the collapse (or this) left them.
      const ca = layout.closing;
      if (ca && Date.now() <= ca.until) {
        const still = (id: string) => {
          const b = blockOf(board, id);
          const was = ca.before.at[id];
          const left = ca.after.at[id];
          return !!b && ((was && b.x === was.x && b.y === was.y) || (left && b.x === left.x && b.y === left.y));
        };
        board = closeGaps(board, ca.before.at, ca.openH, measured, still);
        ca.after = layoutSnapshot(board);
        // Expand all compares with where Collapse all left blocks: that now includes this.
        if (layout.collapseAll) layout.collapseAll.after = ca.after;
      }
      board = settle(board, measured, a, true);
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

  /**
   * Swap in a board (from undo, redo or elsewhere), clearing anything in progress on screen.
   * `tidy` false: don't re-arrange it now (a board from another device, already tidied there; the
   * heights known here are from before it and would move blocks wrongly). Blocks that change size
   * here are tidied once they have been drawn.
   */
  function restore(result: { history: History; board: Board } | null, tidy = true, boards = state.boards) {
    if (!result) return;
    history = result.history;
    set({
      ...state,
      board: result.board,
      boards,
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
    if (tidy) requestSettle();
  }

  /** Forget what belongs to the board shown until now (drawn heights, layout memory). */
  function forgetShownBoard() {
    flushPendingTick();
    heights.clear();
    settleAnchors.clear();
    layout.pushedBy.clear();
    layout.expanding = null;
    layout.importLayout = null;
    layout.collapseAll = null;
    layout.closing = null;
  }

  function openBoard(id: string) {
    const { boards } = state;
    if (id === boards.open || !boards.others[id]) return;
    forgetShownBoard();
    const left = boards.open;
    histories.set(left, history);
    const others = { ...boards.others, [left]: state.board };
    const board = others[id];
    delete others[id];
    // A new board left empty and unnamed, that no card opens, isn't kept (a shared one always is).
    const shared = state.ui.shares.some((s) => s.boards.includes(left));
    if (!shared && isLeftoverBoard(workspaceFrom(board, { home: boards.home, open: id, others }), left)) {
      delete others[left];
      histories.delete(left);
    }
    history = histories.get(id) ?? emptyHistory;
    histories.delete(id);
    centreOnArrival = true;
    // Search keeps its words, but its match was on the other board.
    const find = state.ui.find && { ...state.ui.find, current: null };
    set({ ...state, board, boards: { ...boards, open: id, others }, ui: uiWith({ ...BOARD_SWITCH_UI, find }) });
    write(OPEN_BOARD_KEY, id);
  }

  /**
   * Swap in every board from elsewhere (the online copy, or a backup of every board). The open
   * board stays open if it is still there, else home opens. Undo starts over on every board.
   */
  function replaceWorkspace(ws: Workspace) {
    const next = split(ws, state.boards.open);
    if (next.boards.open !== state.boards.open) {
      forgetShownBoard();
      write(OPEN_BOARD_KEY, next.boards.open);
      centreOnArrival = true;
    } else if (!state.board.order.length && next.board.order.length) centreOnArrival = true;
    outsideChanges++;
    histories.clear();
    history = emptyHistory;
    restore({ history, board: next.board }, false, next.boards);
  }

  /**
   * Swap in some boards from elsewhere (a shared board others changed), leaving the rest as they
   * are: `null` removes a board. A removed open board opens home instead. The home board is never
   * replaced or removed here. Undo starts over on the boards that changed.
   */
  function replaceBoards(changes: Record<string, Board | null>) {
    const { boards } = state;
    let board = state.board;
    const others = { ...boards.others };
    let openGone = false;
    let changed = false;
    for (const [id, next] of Object.entries(changes)) {
      if (id === boards.home) continue;
      const now = id === boards.open ? board : others[id];
      if (next === now || (!next && !now)) continue;
      changed = true;
      histories.delete(id);
      if (id === boards.open) {
        if (next) board = next;
        else openGone = true;
      } else if (next) others[id] = next;
      else delete others[id];
    }
    if (!changed) return;
    outsideChanges++;
    if (openGone) {
      forgetShownBoard();
      const home = others[boards.home];
      delete others[boards.home];
      history = histories.get(boards.home) ?? emptyHistory;
      histories.delete(boards.home);
      centreOnArrival = true;
      write(OPEN_BOARD_KEY, boards.home);
      set({ ...state, board: home, boards: { ...boards, open: boards.home, others }, ui: uiWith(BOARD_SWITCH_UI) });
      return;
    }
    if (board !== state.board) history = emptyHistory;
    restore({ history, board }, false, { ...boards, others });
  }

  function setOthers(fn: (others: Record<string, Board>) => Record<string, Board>) {
    const others = fn(state.boards.others);
    if (others !== state.boards.others) set({ ...state, boards: { ...state.boards, others } });
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
    startClosing,
    heights,
    measured,
    screenCentre: () => screenToBoard(state.view, centreOf(viewportSize)),
    viewportSize: () => viewportSize,
    liveSelection,
    flushPendingTick,
    pending,
    layout,
    write,
    workspace,
    setOthers,
    openBoard,
    replaceWorkspace,
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
    /** How many boards have arrived from elsewhere (so a change can be told apart from one made here). */
    outsideChanges: () => outsideChanges,
    /** How many edits were made on this page (version history tells them apart from automatic tidying). */
    edits: () => edits,
    /** Whether a board just arrived that should be brought into view (asked once). */
    takeCentreOnArrival() {
      const wanted = centreOnArrival;
      centreOnArrival = false;
      return wanted;
    },
    setViewportSize(size: Size) {
      viewportSize = size;
    },
    setMeasuredHeight(id: string, h: number) {
      // Heights drawn for an old version being looked at aren't the real board's.
      if (state.ui.preview || heights.get(id) === h) return;
      heights.set(id, h);
      relayoutImport();
      // A loose block or column that grew may now cover something: move that out of its way.
      if (state.board.order.includes(id)) requestSettle([id]);
    },
    /**
     * Swap in a board that came from elsewhere (the online copy). Not a change the user made here,
     * so undo history starts over rather than undoing into the old board.
     */
    workspace,
    replaceWorkspace,
    replaceBoards,
    /** The shared boards' details, as the screen shows them (not saved, not undone). */
    setShares(shares: Ui['shares']) {
      set({ ...state, ui: uiWith({ shares }) });
    },
    replaceBoard(board: Board) {
      // The first board to arrive on an empty screen (e.g. the online copy) is brought into view.
      if (!state.board.order.length && board.order.length) centreOnArrival = true;
      outsideChanges++;
      history = emptyHistory;
      restore({ history, board }, false);
    },
    // A tick still animating is applied first, so Ctrl+Z right after ticking undoes that tick.
    undo() {
      if (state.ui.preview) return;
      flushPendingTick();
      const step = undoStep(history, state.board);
      if (step && step.board !== state.board) edits++; // counted before it shows, for version history
      restore(step);
    },
    redo() {
      if (state.ui.preview) return;
      flushPendingTick();
      const step = redoStep(history, state.board);
      if (step && step.board !== state.board) edits++;
      restore(step);
    },
  };

  return { ctx, api };
}
