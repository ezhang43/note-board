/** Size of one grid step on the board, in board pixels. */
export const GRID = 20;

/** Zoom limits (30%–250%) and the step used by the zoom buttons and Ctrl+= / Ctrl+−. */
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 2.5;
export const ZOOM_STEP = 1.2;

/** How strongly Ctrl+scroll and trackpad pinch zoom. */
export const WHEEL_ZOOM_SPEED = 0.0025;

export const DEFAULT_BOARD_NAME = 'My first board';

/** Block sizes, in board pixels. */
export const CARD_W = 240;
export const COLUMN_W = 280;
/** A card inside a column is the column width minus 16px on each side. */
export const COLUMN_CARD_INSET = 16;
/** Minimum height of an open column. */
export const COLUMN_MIN_H = 220;

/** Resizing limits. */
export const CARD_MIN_W = 200;
export const CARD_MAX_W = 640;
export const COLUMN_MIN_W = 240;
export const COLUMN_MAX_W = 640;
export const BLOCK_MIN_H = 100;
export const BLOCK_MAX_H = 700;

/** While resizing, a width or height this close to another block's snaps to match it. */
export const SIZE_MATCH_TOLERANCE = 8;

/** Loose blocks keep at least this much space between them. */
export const BLOCK_GAP = 10;

/** A press only becomes a drag after the pointer moves this far (screen pixels). */
export const DRAG_THRESHOLD = 5;

/** While dragging a card, a column counts as "under" the pointer up to this far below its bottom edge. */
export const COLUMN_DROP_REACH = 60;

/**
 * Heights to assume for a brand-new block before it has been drawn and measured,
 * so it can be placed where it won't cover anything.
 */
export const NEW_BLOCK_H = { note: 160, todo: 120, link: 160, completed: 160, column: COLUMN_MIN_H } as const;
