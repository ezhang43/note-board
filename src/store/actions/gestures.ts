import * as B from '../../model/board';
import { pourList } from '../../model/checklist';
import { CARD_W, COLUMN_W, NEW_BLOCK_H } from '../../model/constants';
import { overlaps, snapIf } from '../../model/geometry';
import { alignTo } from '../../model/align';
import { blockRect, landingSpot, pushUp, shiftRow, topLevelRects } from '../../model/layout';
import { dropBoard } from '../../model/placement';
import type { Board, Point, Rect } from '../../model/types';
import type { StoreContext } from '../core';
import type { Drag, NewDrag, Resize } from '../types';
import { addNewCard, addNewColumn } from './blocks';

// Pointer gestures on blocks: dragging a block, dragging a new block from the toolbar, resizing.

export function gestureActions(ctx: StoreContext) {
  const { commit, updateUi, requestSettle, measured } = ctx;
  /** The last drag preview, kept while the pointer stays over the same grid spot. */
  /** The block being resized as it was before the drag, to tell its row and what is above it from what it now covers. */
  let resizeStart: { id: string; rect: Rect } | null = null;
  let dragPreview: { board: Board; tx: number; ty: number; at: Point; bumped: Record<string, Point> } | null = null;

  /** The box around every block of a group drag, moved by `by` from where they were. */
  function groupBox(d: Drag, by: { x: number; y: number }) {
    const rects = [d.id, ...d.group].flatMap((id) => blockRect(ctx.state.board, id, measured) ?? []);
    const left = Math.min(...rects.map((r) => r.x));
    const top = Math.min(...rects.map((r) => r.y));
    const right = Math.max(...rects.map((r) => r.x + r.w));
    const bottom = Math.max(...rects.map((r) => r.y + r.h));
    return { x: left + by.x, y: top + by.y, w: right - left, h: bottom - top };
  }

  /** Size of a block being dragged, as it will be once dropped loose on the board (a card not drawn yet is as tall as a card). */
  function draggedSize(d: Drag) {
    const r = blockRect(ctx.state.board, d.id, measured);
    return { w: r?.w ?? (d.kind === 'column' ? COLUMN_W : CARD_W), h: r?.h ?? NEW_BLOCK_H.column };
  }

  return {
    // ---------- dragging a new card or column from the toolbar ----------
    // Nothing is moved, resized or added on a read-only board (job 161): these gestures don't start there.
    startNewDrag: (kind: NewDrag['kind']) => !ctx.viewOnly() && updateUi({ newDrag: { kind, at: null, overColumn: null, land: null }, confirm: null }),
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
      if (ctx.viewOnly()) return;
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
    showResize(resize: Resize) {
      if (ctx.viewOnly()) return;
      // The first call of a drag still sees the block as it was (its height is not measured again yet).
      const rect = !ctx.state.ui.resize || resizeStart?.id !== resize.id ? blockRect(ctx.state.board, resize.id, measured) : null;
      if (rect) resizeStart = { id: resize.id, rect };
      updateUi({ resize, confirm: null });
    },
    cancelResize() {
      resizeStart = null;
      updateUi({ resize: null });
      requestSettle();
    },
    commitResize() {
      const r = ctx.state.ui.resize;
      if (!r) return;
      commit(
        (b) => {
          const at = B.blockOf(b, r.id);
          if (!at) return b;
          // The left and top edges also move the block's corner (the far edge stays where it was);
          // the right and bottom edges leave its position alone.
          const was = resizeStart?.id === r.id ? resizeStart.rect : blockRect(b, r.id, measured);
          const west = r.dir?.includes('w') ?? false;
          const north = r.dir?.includes('n') ?? false;
          let next = B.resizeBlock(b, r.id, { x: west ? (r.x ?? at.x) : at.x, y: north ? (r.y ?? at.y) : at.y, w: r.w, h: r.h });
          // Blocks it now covers make room, only now that it is let go (owner decisions 2026-10-19, 2026-10-21,
          // job #142): from the top edge, those that were above it move up; from the right edge its row
          // neighbours (level with where it was) slide right, from the left edge left. Growing down only
          // pushes what is below it down (the settle that follows).
          const sized = (id: string) => (north && id === r.id && r.h != null ? r.h : measured(id));
          if (north && was) next = pushUp(next, r.id, sized, was.y);
          const out = blockRect(next, r.id, sized);
          if (west && was && out && out.x < was.x) return shiftRow(next, r.id, sized, undefined, 'left', was);
          if (r.dir?.includes('e') && was && out && out.x + out.w > was.x + was.w) return shiftRow(next, r.id, sized, undefined, 'right', was);
          return next;
        },
        { ui: { resize: null } },
      );
      resizeStart = null;
      requestSettle([r.id]);
    },
  };
}
