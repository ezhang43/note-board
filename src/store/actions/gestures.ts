import * as B from '../../model/board';
import { pourList } from '../../model/checklist';
import { CARD_W, COLUMN_W, NEW_BLOCK_H } from '../../model/constants';
import { overlaps, snapIf } from '../../model/geometry';
import { alignTo } from '../../model/align';
import { blockRect, landingSpot, topLevelRects } from '../../model/layout';
import { dropBoard } from '../../model/placement';
import type { Board, Point, Rect } from '../../model/types';
import type { StoreContext } from '../core';
import type { Drag, NewDrag, Resize } from '../types';
import { addNewCard, addNewColumn } from './blocks';

// Pointer gestures on blocks: dragging a block, dragging a new block from the toolbar, resizing.

export function gestureActions(ctx: StoreContext) {
  const { commit, updateUi, requestSettle, measured, heights } = ctx;
  /** The last drag preview, kept while the pointer stays over the same grid spot. */
  let dragPreview: { board: Board; tx: number; ty: number; at: Point; bumped: Record<string, Point> } | null = null;

  /** Size of a block being dragged, as it will be once dropped loose on the board. */
  /** The box around every block of a group drag, moved by `by` from where they were. */
  function groupBox(d: Drag, by: { x: number; y: number }) {
    const rects = [d.id, ...d.group].flatMap((id) => blockRect(ctx.state.board, id, measured) ?? []);
    const left = Math.min(...rects.map((r) => r.x));
    const top = Math.min(...rects.map((r) => r.y));
    const right = Math.max(...rects.map((r) => r.x + r.w));
    const bottom = Math.max(...rects.map((r) => r.y + r.h));
    return { x: left + by.x, y: top + by.y, w: right - left, h: bottom - top };
  }

  function draggedSize(d: Drag) {
    const { board } = ctx.state;
    const h = heights.get(d.id) ?? NEW_BLOCK_H.column;
    if (d.kind === 'column') return { w: board.columns[d.id]?.w ?? COLUMN_W, h };
    return { w: board.cards[d.id]?.w ?? CARD_W, h };
  }

  return {
    // ---------- dragging a new card or column from the toolbar ----------
    startNewDrag: (kind: NewDrag['kind']) => updateUi({ newDrag: { kind, at: null, overColumn: null, land: null }, confirm: null }),
    /**
     * The pointer moved: `at` is where it is on the canvas (null when off the board), `boardAt` the
     * same point in board coordinates. On empty board the block would appear with its top edge
     * just above the pointer, at the nearest free spot. A new card over a column goes into it;
     * a new column can't, so it just lands at the nearest free spot.
     */
    moveNewDrag(at: Point | null, boardAt: Point | null, overColumn: string | null) {
      const d = ctx.state.ui.newDrag;
      if (!d) return;
      const { board } = ctx.state;
      const intoColumn = d.kind !== 'column' && at ? overColumn : null;
      let land: Rect | null = null;
      if (at && boardAt && !intoColumn) {
        const size = d.kind === 'column' ? { w: COLUMN_W, h: NEW_BLOCK_H.column } : { w: CARD_W, h: NEW_BLOCK_H[d.kind] };
        const snap = (v: number) => snapIf(board.snap, v);
        const spot = landingSpot(board, '', snap(boardAt.x - size.w / 2), snap(boardAt.y - 18), size, measured);
        land = { ...spot, ...size };
      }
      updateUi({ newDrag: { ...d, at, overColumn: intoColumn, land } });
    },
    cancelNewDrag: () => updateUi({ newDrag: null }),
    /** Let go: a card goes into the column under the pointer (at `index`); otherwise the block goes at the landing spot. */
    dropNewDrag(index: number | null) {
      const d = ctx.state.ui.newDrag;
      updateUi({ newDrag: null });
      if (!d) return;
      if (d.kind === 'column') {
        if (d.land) addNewColumn(ctx, { x: d.land.x, y: d.land.y });
      } else if (d.overColumn && index != null) addNewCard(ctx, d.kind, { type: 'column', columnId: d.overColumn, index });
      else if (d.land) addNewCard(ctx, d.kind, { type: 'loose', x: d.land.x, y: d.land.y });
    },

    // ---------- dragging blocks ----------
    startDrag(kind: Drag['kind'], id: string, x: number, y: number) {
      const { board, ui } = ctx.state;
      const sel = ui.selection;
      const topLevel = board.order.includes(id);
      // A selected block dragged together with other selected blocks moves them all.
      const group = topLevel && sel.includes(id) ? sel.filter((s) => s !== id && board.order.includes(s)) : [];
      dragPreview = null;
      updateUi({
        drag: { kind, id, x, y, startX: x, startY: y, group, overColumn: null, intoList: null, land: null, bumped: {}, guides: [], exactX: false, exactY: false },
        confirm: null,
      });
    },
    /**
     * The pointer moved. `overColumn`: the column it is over; `overList`: the checklist whose body it
     * is over (a dragged checklist pours into a loose one, owner request). Lists inside a column are
     * not poured into, so cards still drop into and move within columns as before.
     */
    moveDrag(px: number, py: number, overColumn: string | null, overList: string | null = null) {
      const d = ctx.state.ui.drag;
      if (!d) return;
      const { board } = ctx.state;
      // Several blocks move as one: they don't drop into columns or lists.
      const loose = !!overList && overList !== d.id && board.order.includes(overList);
      const pours = !d.group.length && loose && board.cards[d.id]?.kind === 'todo' && board.cards[overList!]?.kind === 'todo';
      const intoList = pours ? overList : null;
      const over = d.group.length || intoList ? null : overColumn;
      if (over || intoList) {
        dragPreview = null;
        if (d.x === px && d.y === py && d.overColumn === over && d.intoList === intoList) return;
        return updateUi({ drag: { ...d, x: px, y: py, overColumn: over, intoList, land: null, bumped: {}, guides: [], exactX: false, exactY: false } });
      }
      // The dragged block lines up with nearby blocks' edges and middles (alignment guides), leaving
      // out blocks it is on top of: those are about to move out of its way. Several blocks dragged
      // together line up as one: the box around them all (owner request).
      const moved = { x: px - d.startX, y: py - d.startY };
      const rect = d.group.length ? groupBox(d, moved) : { x: px, y: py, ...draggedSize(d) };
      const box = alignTo(rect, topLevelRects(board, measured, [d.id, ...d.group]).filter((o) => !overlaps(rect, o)));
      const aligned = { ...box, x: px + box.x - rect.x, y: py + box.y - rect.y };
      const { x, y } = aligned;
      if (d.x === x && d.y === y && d.overColumn === null && d.intoList === null && d.guides.length === aligned.guides.length) return;
      // The block follows the pointer exactly. It will land on the grid spot under it (dashed
      // outline), and takes priority there: blocks in the way are shown moving aside right away.
      // Within the same grid spot the preview is unchanged, so it isn't worked out again.
      const tx = aligned.alignedX ? x : snapIf(board.snap, x);
      const ty = aligned.alignedY ? y : snapIf(board.snap, y);
      const p = dragPreview;
      if (!p || p.board !== board || p.tx !== tx || p.ty !== ty) {
        const { at, bumped } = dropBoard(board, { ...d, x, y, exactX: aligned.alignedX, exactY: aligned.alignedY }, measured);
        dragPreview = { board, tx, ty, at, bumped };
      }
      const { at, bumped } = dragPreview!;
      const land = !d.group.length && (at.x !== x || at.y !== y) ? { ...at, ...draggedSize(d) } : null;
      updateUi({ drag: { ...d, x, y, overColumn: null, intoList: null, land, bumped, guides: aligned.guides, exactX: aligned.alignedX, exactY: aligned.alignedY } });
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
      const d = ctx.state.ui.drag;
      if (!d) return;
      if (d.intoList) {
        commit((b) => pourList(b, d.id, d.intoList!), { ui: { drag: null, selection: [d.intoList] } });
        return requestSettle([d.intoList]);
      }
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
      const r = ctx.state.ui.resize;
      if (!r) return;
      commit(
        (b) => (r.kind === 'card' ? B.resizeCard(b, r.id, r.w, r.h ?? undefined) : B.resizeColumn(b, r.id, r.w, r.h ?? undefined)),
        { ui: { resize: null } },
      );
      requestSettle([r.id]);
    },
  };
}
