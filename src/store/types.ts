import type { Match } from '../model/search';
import type { VersionMeta } from '../model/versions';
import type { Guide } from '../model/align';
import type { ItemDrop } from '../model/checklist';
import type { ListSelection } from '../model/multiSelect';
import type { Board, CardKind, Point, Rect, View } from '../model/types';

// The shapes of the store's state: board data, view, and what is on screen (ui).

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
  /** Alignment guides to show, and which axes are lined up (those land exactly there, not on the grid). */
  guides: Guide[];
  exactX: boolean;
  exactY: boolean;
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
  /**
   * Items selected in several lists (Ctrl+A step 3 or 4, or a drag into the next cards of a column):
   * every list's selected items, in board order. Then only Copy, Delete and ticking apply.
   */
  lists?: ListSelection[];
  /** Which Ctrl+A step made it: every list in the column, or the whole board. */
  level?: 'column' | 'board';
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
  /** A new note, link or column whose first text field should get the cursor. */
  focusBlock: string | null;
  /** Checklist items on their way to the Completed section (shown ticked, fading) and the ones that just arrived. */
  completing: string[];
  arrived: string[];
  colourMenuOpen: boolean;
  /** The keyboard shortcuts panel (? button or ? key). */
  shortcutsOpen: boolean;
  confirm: ConfirmDelete | null;
  drag: Drag | null;
  /** A new card being dragged from a toolbar Add button. */
  newDrag: NewDrag | null;
  resize: Resize | null;
  /** The selection box being drawn, in screen pixels from the canvas's top-left. */
  marquee: Rect | null;
  canUndo: boolean;
  canRedo: boolean;
  /** The version history panel is open (owner request). */
  historyOpen: boolean;
  /**
   * An old version being looked at: the board shows it instead of the real one, which stays as it
   * is (and keeps syncing). Nothing can be changed meanwhile.
   */
  preview: { meta: VersionMeta; board: Board } | null;
  /** Search (owner request): what is being looked for, and the match being shown (null: none). */
  find: { query: string; current: Match | null } | null;
}

/**
 * Every board (owner request: several boards): which is home, which is open on this device, and
 * the boards not open now. The open board itself is `AppState.board`.
 */
export interface Boards {
  home: string;
  open: string;
  others: Record<string, Board>;
}

export interface AppState {
  /** The open board's data: saved straight away after every change, and undoable. */
  board: Board;
  /** The other boards, and which board is open (saved with the open board, undo is per board). */
  boards: Boards;
  /** Pan / zoom / tool: pan and zoom are saved shortly after they stop changing. */
  view: View;
  ui: Ui;
}

export const emptyUi: Ui = {
  selection: [],
  itemSel: null,
  itemDrag: null,
  focusItem: null,
  focusOffset: null,
  focusBlock: null,
  completing: [],
  arrived: [],
  colourMenuOpen: false,
  shortcutsOpen: false,
  confirm: null,
  drag: null,
  newDrag: null,
  resize: null,
  marquee: null,
  canUndo: false,
  canRedo: false,
  historyOpen: false,
  preview: null,
  find: null,
};
