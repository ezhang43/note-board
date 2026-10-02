import * as B from '../../model/board';
import { createCard, createColumn } from '../../model/cards';
import { copyBlocks, pasteBlocks, type ClipEntry } from '../../model/clipboard';
import { cleanUp, completedCardOf, dayKey, restoreEntry } from '../../model/completed';
import { CARD_W, COLUMN_W, GRID, NEW_BLOCK_H } from '../../model/constants';
import { blockRect, blocksTouching, settle, snapAll, spotForNewBlock } from '../../model/layout';
import { addImported, estimateHeight, packInLanes, parseMilanote } from '../../model/milanote';
import type { ColorKey } from '../../model/palette';
import { returnPushes } from '../../model/placement';
import { THEME_KEY } from '../../model/theme';
import type { CardKind, Point, Tool } from '../../model/types';
import { centreOf, panBy, resetZoom, screenToBoard, zoomBy } from '../../model/view';
import type { StoreContext } from '../core';

// Board, view, selection and block actions: adding, importing, editing, collapsing, deleting,
// copying and moving cards and columns.

/** After expanding a block, blocks it pushes aside within this long (ms) are remembered, to go back when it collapses. */
export const EXPAND_WATCH_MS = 1500;
/** Imported cards start this far (screen pixels) below the top of the board area. */
export const IMPORT_TOP_MARGIN = 40;

/** Adds a new card and selects it; a new to-do list gets the cursor in its first item. */
export function addNewCard(ctx: StoreContext, kind: CardKind, place: B.Placement) {
  const card = createCard(kind);
  const focusItem = card.kind === 'todo' ? card.items[0].id : null;
  ctx.commit((b) => B.addCard(b, card, place), { ui: { selection: [card.id], itemSel: null, focusItem } });
  ctx.requestSettle([place.type === 'column' ? place.columnId : card.id]);
}

/** Adds a new column at a spot and selects it. */
export function addNewColumn(ctx: StoreContext, at: Point) {
  const col = { ...createColumn(), ...at };
  ctx.commit((b) => B.addColumn(b, col), { ui: { selection: [col.id], itemSel: null } });
  ctx.requestSettle([col.id]);
}

export function blockActions(ctx: StoreContext) {
  const { commit, updateUi, updateView, requestSettle, measured, liveSelection, layout } = ctx;
  /** Copied blocks, and how many times they have been pasted. */
  let clipboard: { entries: ClipEntry[]; pastes: number } | null = null;
  /** Selection when the selection box started (kept when Ctrl is held). */
  let marqueeBase: string[] = [];

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

  return {
    // ---------- board ----------
    renameBoard: (name: string) => commit((b) => B.renameBoard(b, name), { merge: 'board-name' }),
    /** Turning snapping back on moves every block (position and resized sizes) onto the grid. */
    toggleSnap() {
      const on = !ctx.state.board.snap;
      commit((b) => (on ? snapAll(B.setSnap(b, true)) : B.setSnap(b, false)));
      if (on) requestSettle();
    },

    // ---------- view ----------
    setTool: (tool: Tool) => updateView((v) => (v.tool === tool ? v : { ...v, tool })),
    /** Light / dark toggle: switches the look and remembers the choice on this device. */
    toggleTheme() {
      const theme = ctx.state.view.theme === 'dark' ? 'light' : 'dark';
      updateView((v) => ({ ...v, theme }));
      ctx.write(THEME_KEY, theme);
    },
    panBy: (dx: number, dy: number) => updateView((v) => panBy(v, dx, dy)),
    zoomAt: (at: Point, factor: number) => updateView((v) => zoomBy(v, at, factor)),
    zoomAtCentre: (factor: number) => updateView((v) => zoomBy(v, centreOf(ctx.viewportSize()), factor)),
    resetZoom: () => updateView((v) => resetZoom(v, ctx.viewportSize())),

    // ---------- selection and menus ----------
    /** Select just this block. (Selected checklist items stay selected if they are in it.) */
    select: (id: string) => {
      const { selection: sel, itemSel } = ctx.state.ui;
      updateUi({ selection: sel.length === 1 && sel[0] === id ? sel : [id], itemSel: itemSel?.cardId === id ? itemSel : null });
    },
    /**
     * Pressing a block: with Ctrl / Shift it is added to or removed from the selection;
     * otherwise it becomes the selection, unless it is already part of a bigger selection
     * (so dragging it moves the whole selection).
     */
    pressBlock(id: string, additive: boolean) {
      const sel = ctx.state.ui.selection;
      if (additive) updateUi({ selection: sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id], itemSel: null });
      else if (!sel.includes(id)) updateUi({ selection: [id], itemSel: null });
      else updateUi({ itemSel: null });
    },
    /** Ctrl+A: every column and loose card. */
    selectAll: () => updateUi({ selection: [...ctx.state.board.order], itemSel: null }),
    /** Click on empty board or Escape: clear the selection and close menus. */
    clearSelection: () => updateUi({ selection: [], itemSel: null, colourMenuOpen: false, confirm: null }),
    toggleColourMenu() {
      if (!ctx.state.ui.selection.length) return;
      updateUi({ colourMenuOpen: !ctx.state.ui.colourMenuOpen });
    },
    closeColourMenu: () => updateUi({ colourMenuOpen: false }),
    /** Auto-colour: give every column its own colour. */
    autoColour: () => commit((b) => B.autoColour(b)),
    recolourSelection: (color: ColorKey | null) => commit((b) => B.recolour(b, ctx.state.ui.selection, color)),

    // ---------- selection box (Select tool) ----------
    /** Start a selection box. With `keep` (Ctrl held) the current selection is added to. */
    startMarquee(at: Point, keep: boolean) {
      marqueeBase = keep ? ctx.state.ui.selection : [];
      updateUi({ marquee: { x: at.x, y: at.y, w: 0, h: 0 }, selection: marqueeBase, itemSel: null, colourMenuOpen: false, confirm: null });
    },
    /** The box now runs from `from` to `to` (canvas pixels): select everything it touches, live. */
    updateMarquee(from: Point, to: Point) {
      const { view, board } = ctx.state;
      const box = { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) };
      const a = screenToBoard(view, { x: box.x, y: box.y });
      const z = view.zoom;
      const hits = blocksTouching(board, { ...a, w: box.w / z, h: box.h / z }, measured);
      updateUi({ marquee: box, selection: [...marqueeBase, ...hits.filter((id) => !marqueeBase.includes(id))] });
    },
    endMarquee: () => updateUi({ marquee: null }),

    // ---------- adding ----------
    /** Clicking Add Note / To-do list / Link. */
    addCard(kind: CardKind) {
      const { board, ui } = ctx.state;
      const selected = ui.selection.length === 1 ? ui.selection[0] : null;
      const place =
        B.placementForNewCard(board, selected) ??
        ({ type: 'loose', ...spotForNewBlock(board, CARD_W, NEW_BLOCK_H[kind], ctx.screenCentre(), measured) } as const);
      addNewCard(ctx, kind, place);
    },
    /** Clicking New column. */
    addColumn() {
      addNewColumn(ctx, spotForNewBlock(ctx.state.board, COLUMN_W, NEW_BLOCK_H.column, ctx.screenCentre(), measured));
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
      const centre = ctx.screenCentre();
      const top = screenToBoard(ctx.state.view, { x: 0, y: IMPORT_TOP_MARGIN }).y;
      const want = { x: centre.x - size.w / 2, y: top };
      const origin = spotForNewBlock(ctx.state.board, size.w, size.h, { x: centre.x, y: top + size.h / 2 }, measured);
      const { spots } = packInLanes(ids, (id) => guess.get(id)!, origin);
      commit((b) => addImported(b, cards, spots), { ui: { selection: ids, itemSel: null, colourMenuOpen: false, confirm: null } });
      layout.importLayout = { ids, origin };
      // If free space was found elsewhere, bring it to where the cards were meant to appear.
      const z = ctx.state.view.zoom;
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
        const place = { type: 'loose', ...spotForNewBlock(b, CARD_W, NEW_BLOCK_H.completed, ctx.screenCentre(), measured) } as const;
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
        const centre = near ? { x: near.x + near.w + CARD_W / 2 + 20, y: near.y + NEW_BLOCK_H.todo / 2 } : ctx.screenCentre();
        const place = { type: 'loose', ...spotForNewBlock(b, CARD_W, NEW_BLOCK_H.todo, centre, measured) } as const;
        const result = restoreEntry(b, itemId, place);
        cardId = result.cardId;
        return cardId ? result.board : null;
      });
      if (board && cardId && board.order.includes(cardId)) requestSettle([cardId]);
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

    // ---------- collapsing ----------
    /** Collapse all / Expand all: if anything is open, collapse everything; otherwise open everything. One undo step. */
    toggleAllCollapsed() {
      const collapse = B.anyExpanded(ctx.state.board);
      layout.pushedBy.clear();
      layout.expanding = null;
      commit((b) => B.setAllCollapsed(b, collapse));
    },
    /**
     * Collapse arrow. Expanding starts remembering which blocks the growing block pushes aside;
     * collapsing puts them back (part of the same undo step).
     */
    toggleCollapsed(id: string) {
      const blk = B.blockOf(ctx.state.board, id);
      if (!blk) return;
      if (blk.collapsed) {
        layout.pushedBy.delete(id);
        layout.expanding = { id, until: Date.now() + EXPAND_WATCH_MS };
        commit((b) => B.toggleCollapsed(b, id));
        return;
      }
      if (layout.expanding?.id === id) layout.expanding = null;
      const top = B.topLevelOf(ctx.state.board, id);
      const pushes = layout.pushedBy.get(id);
      layout.pushedBy.delete(id);
      commit((b) => (pushes ? returnPushes(B.toggleCollapsed(b, id), pushes, top, measured) : B.toggleCollapsed(b, id)));
    },

    // ---------- deleting ----------
    deleteCard(id: string) {
      commit((b) => B.deleteCard(b, id), { ui: { selection: liveSelection(ctx.state.board, [id]) } });
    },
    askDeleteColumn: (id: string) => updateUi({ confirm: { columnId: id, ids: [id] } }),
    cancelDelete: () => updateUi({ confirm: null }),
    confirmDelete() {
      const c = ctx.state.ui.confirm;
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
      const { board, ui } = ctx.state;
      // Not while a block is being dragged or resized: it would vanish from under the pointer.
      if (ui.drag || ui.resize) return true;
      const ids = liveSelection(board);
      if (!ids.length) return false;
      const firstColumn = ids.find((id) => board.columns[id]);
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
      const entries = copyBlocks(ctx.state.board, liveSelection(ctx.state.board));
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
      const entries = copyBlocks(ctx.state.board, liveSelection(ctx.state.board));
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
      const b0 = ctx.state.board;
      const sel = liveSelection(b0);
      if (!sel.length) return false;
      if (sel.length === 1 && !b0.order.includes(sel[0])) {
        if (dy === 0) return true;
        const id = sel[0];
        commit((b) => B.shiftInColumn(b, id, dy < 0 ? -1 : 1), { merge: `nudge:${id}` });
        requestSettle([B.topLevelOf(ctx.state.board, id)]);
        return true;
      }
      const ids = sel.filter((id) => b0.order.includes(id));
      if (!ids.length) return true;
      commit((b) => settle(B.moveBlocksBy(b, ids, dx * GRID, dy * GRID), measured, ids), { merge: `nudge:${ids.join(',')}` });
      return true;
    },
  };
}
