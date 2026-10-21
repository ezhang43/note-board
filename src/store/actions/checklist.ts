import { createItem, newId } from '../../model/cards';
import { announce, count } from '../announce';
import { columnOf } from '../../model/board';
import * as C from '../../model/checklist';
import { completedSectionCount, deleteCompletedSections } from '../../model/completed';
import { boardLists, columnLists, deleteAcross, multiAsText, rangeAcross, setDoneAcross, visibleItems, type ListSelection } from '../../model/multiSelect';
import { snapIf } from '../../model/geometry';
import type { Point, TodoItem } from '../../model/types';
import type { StoreContext } from '../core';
import { copyText, keyboardInitiated, reducedMotion } from '../env';
import type { ItemDrag, ItemHint } from '../types';

// Checklist actions: editing items, ticking, selecting several items, copying them, dragging them.

/** How long a ticked item takes to leave for the Completed section, and to settle in there (ms). */
export const COMPLETE_LEAVE_MS = 280;
export const COMPLETE_ARRIVE_MS = 450;

export function checklistActions(ctx: StoreContext) {
  const { commit, updateUi, requestSettle } = ctx;
  /** Copied checklist items. */
  let itemClipboard: TodoItem[] | null = null;

  /**
   * Press-and-hold lift: how far each row slides. The lifted rows' list closes up over them, and the
   * list under the finger (the same one, or another) opens a gap there. Dropping on the board or on
   * nothing opens no gap.
   */
  function liftSlide(d: ItemDrag, hint: ItemHint | null): Record<string, number> {
    const { heights } = d.lift!;
    const gap = Object.values(heights).reduce((sum, h) => sum + h, 0);
    const itemsOf = (cardId: string) => {
      const card = ctx.state.board.cards[cardId];
      return card?.kind === 'todo' ? C.displayOrder(card.items) : [];
    };
    const mark = hint && 'markMode' in hint && hint.markMode && hint.markId ? { markId: hint.markId, markMode: hint.markMode } : null;
    const target = mark && hint && 'cardId' in hint ? hint.cardId : null;
    const order = itemsOf(d.cardId);
    const before = mark && target === d.cardId ? C.gapBefore(order, mark, d.allIds) : null;
    const slide = C.slideOffsets(order, heights, before, gap);
    if (!mark || !target || target === d.cardId) return slide;
    return { ...slide, ...C.slideOffsets(itemsOf(target), {}, C.gapBefore(itemsOf(target), mark, d.allIds), gap) };
  }

  /** Select the checklist items shown from `anchor` to `to` in one list. */
  function selectItemRange(cardId: string, anchor: string, to: string) {
    const card = ctx.state.board.cards[cardId];
    if (card?.kind !== 'todo') return;
    const ids = C.itemRange(card.items, anchor, to);
    if (ids.length) updateUi({ itemSel: { cardId, anchor, ids }, selection: [cardId] });
  }

  /** The selected checklist items, if `itemId` in `cardId` is one of several selected in that one list; otherwise null. */
  function selectedItemsIncluding(cardId: string, itemId: string): string[] | null {
    const sel = ctx.state.ui.itemSel;
    return sel && !sel.lists && sel.cardId === cardId && sel.ids.length > 1 && sel.ids.includes(itemId) ? sel.ids : null;
  }

  /** The selection across several lists, if `itemId` in `cardId` is part of it. */
  function listsIncluding(cardId: string, itemId: string): ListSelection[] | null {
    const lists = ctx.state.ui.itemSel?.lists;
    return lists?.some((l) => l.cardId === cardId && l.ids.includes(itemId)) ? lists : null;
  }

  /** Select items in several lists (or one, which is then a plain item selection). */
  function selectLists(lists: ListSelection[], level?: 'column' | 'board', anchor?: { cardId: string; itemId: string }) {
    if (!lists.length) return;
    const first = anchor ? (lists.find((l) => l.cardId === anchor.cardId) ?? lists[0]) : lists[0];
    const sel = { cardId: first.cardId, anchor: anchor?.itemId ?? first.ids[0], ids: first.ids };
    updateUi({ itemSel: lists.length > 1 || level ? { ...sel, lists, level } : sel, selection: [first.cardId] });
  }

  /** How many items are selected across these lists (what a screen reader is told). */
  const itemsIn = (lists: ListSelection[]) => lists.reduce((n, l) => n + l.ids.length, 0);

  /** Delete / Backspace with checklist items selected. Returns false when no items are selected. */
  function deleteSelectedItems(): boolean {
    const sel = ctx.state.ui.itemSel;
    if (!sel) return false;
    if (sel.lists) {
      const lists = sel.lists;
      ctx.deleting(`Deleted ${count(itemsIn(lists), 'item')}`, () => commit((b) => deleteAcross(b, lists), { ui: { itemSel: null } }));
      return true;
    }
    ctx.deleting(`Deleted ${count(sel.ids.length, 'item')}`, () => commit((b) => C.editItems(b, sel.cardId, (items) => C.deleteItems(items, sel.ids)), { ui: { itemSel: null } }));
    return true;
  }

  /** Tab / Shift+Tab with several items selected: they all move in (or out) one level together. */
  function tabSelectedItems(outdent: boolean) {
    const sel = ctx.state.ui.itemSel;
    // Tab doesn't apply across several lists (owner's choice).
    if (!sel || sel.lists) return;
    commit((b) => C.editItems(b, sel.cardId, (items) => (outdent ? C.outdentItems(items, sel.ids) : C.indentItems(items, sel.ids))));
  }

  function copyItems(): boolean {
    const sel = ctx.state.ui.itemSel;
    if (sel?.lists) {
      const board = ctx.state.board;
      itemClipboard = sel.lists.flatMap((l) => {
        const card = board.cards[l.cardId];
        return card?.kind === 'todo' ? C.copyItems(card.items, l.ids) : [];
      });
      copyText(multiAsText(board, sel.lists));
      return itemClipboard.length > 0;
    }
    const card = sel && ctx.state.board.cards[sel.cardId];
    if (!sel || card?.kind !== 'todo') return false;
    itemClipboard = C.copyItems(card.items, sel.ids);
    if (!itemClipboard.length) return false;
    copyText(C.selectionAsText(card.items, sel.ids));
    return true;
  }

  const actions = {
    // ---------- selecting items in one list or several (Ctrl+A ladder, owner request) ----------
    /** Ctrl+A in an item whose text is all selected: every item shown in that list. */
    selectWholeList(cardId: string) {
      const card = ctx.state.board.cards[cardId];
      if (card?.kind !== 'todo') return;
      selectLists([{ cardId, ids: visibleItems(card) }]);
    },
    /**
     * Ctrl+A with items selected: the next step. Some of a list → the whole list → every list in its
     * column (a loose list skips this) → every item on the board, where it stays.
     */
    selectAllStep() {
      const sel = ctx.state.ui.itemSel;
      if (!sel || sel.level === 'board') return;
      const board = ctx.state.board;
      // Only some of one list's items: the whole list comes first.
      const card = board.cards[sel.cardId];
      if (!sel.lists && card?.kind === 'todo') {
        const all = visibleItems(card);
        if (all.some((id) => !sel.ids.includes(id))) return selectLists([{ cardId: sel.cardId, ids: all }]);
      }
      const col = sel.level ? null : columnOf(board, sel.cardId);
      if (col && !col.collapsed) selectLists(columnLists(board, col.id), 'column');
      else selectLists(boardLists(board), 'board');
    },
    /** Press-and-drag from an item into another card of the same column: everything between. */
    selectAcross(columnId: string, from: { cardId: string; itemId: string }, to: { cardId: string; itemId: string }) {
      selectLists(rangeAcross(ctx.state.board, columnId, from, to), undefined, from);
    },

    // ---------- editing items ----------
    /** Ctrl+Shift+Up / Down: move the item past its neighbour; the cursor stays in it at `caret`. */
    moveItem(cardId: string, itemId: string, dir: -1 | 1, caret: number) {
      commit((b) => C.editItems(b, cardId, (items) => C.moveItemBy(items, itemId, dir)), { ui: { focusItem: itemId, focusOffset: caret } });
    },
    /** Enter in a list's title: the cursor moves to its first item. */
    focusFirstItem(cardId: string) {
      const card = ctx.state.board.cards[cardId];
      if (card?.kind !== 'todo') return;
      const first = C.displayOrder(card.items)[0];
      if (first) updateUi({ focusItem: first, focusOffset: null });
    },
    /**
     * Enter, like a text editor: splits the item at the cursor (`start`–`end`; the end of its text if
     * not given), or adds a blank item above when the cursor is at the start of its text.
     */
    itemEnter(cardId: string, itemId: string, start?: number, end?: number) {
      commit((b) => {
        const card = b.cards[cardId];
        if (card?.kind !== 'todo') return null;
        const text = C.findItem(card.items, itemId)?.item.text ?? '';
        const from = start ?? text.length;
        const r = C.enterItem(card.items, itemId, from, end ?? from, createItem());
        if (!r) return null;
        return { board: C.editItems(b, cardId, () => r.items), ui: { focusItem: r.focus, focusOffset: r.offset, itemSel: null } };
      });
    },
    /** Tab nests the item under the one above; Shift+Tab moves it out a level. With several items selected, they all move. */
    itemTab(cardId: string, itemId: string, outdent: boolean) {
      if (selectedItemsIncluding(cardId, itemId)) return tabSelectedItems(outdent);
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
      ctx.flushPendingTick();
      const card = ctx.state.board.cards[cardId];
      if (card?.kind !== 'todo') return;
      const item = C.findItem(card.items, itemId)?.item;
      if (!item) return;
      // One of the items selected across several lists: tick (or untick) them all at once.
      const lists = listsIncluding(cardId, itemId);
      if (lists) {
        // simple: the count includes selected sub-items, which tick but don't move; fine to say aloud.
        if (commit((b) => setDoneAcross(b, lists, !item.done)) && !item.done) announce(`Moved to Completed: ${count(itemsIn(lists), 'item')}`);
        return;
      }
      const ids = selectedItemsIncluding(cardId, itemId) ?? [itemId];
      const next = C.setItemsDone(card.items, ids, !item.done);
      // Top-level items this tick sends to the Completed section (said to screen readers once they are there).
      const moved = next.filter((it) => it.done && !card.items.find((o) => o.id === it.id)?.done);
      // Applied to the list as it is then (another device's change may have arrived meanwhile).
      const apply = () => {
        const done = commit((b) => C.editItems(b, cardId, (items) => C.setItemsDone(items, ids, !item.done)));
        if (done && moved.length) announce(`Moved to Completed: ${moved.length === 1 ? moved[0].text.trim() || 'item' : count(moved.length, 'item')}`);
      };
      // Top-level items this tick sends to the Completed section get a short leaving animation first (not when a key did it).
      const leaving = next.filter((it) => it.done && !card.items.find((o) => o.id === it.id)?.done).flatMap(C.subtreeIds);
      if (!leaving.length || reducedMotion() || keyboardInitiated()) return void apply();
      updateUi({ completing: leaving });
      const finish = () => {
        ctx.pending.tick = null;
        apply();
        updateUi({ completing: [], arrived: leaving });
        setTimeout(() => {
          const arrived = ctx.state.ui.arrived;
          if (arrived === leaving || arrived.every((x) => leaving.includes(x))) updateUi({ arrived: [] });
        }, COMPLETE_ARRIVE_MS);
      };
      ctx.pending.tick = { timer: setTimeout(finish, COMPLETE_LEAVE_MS), apply: finish };
    },
    /**
     * Ctrl+Enter while typing in an item (owner request, 2026-10-15; also the phone item bar's Tick,
     * 2026-10-19): the same as its Done box. After a
     * tick the cursor moves to the next open item (below, else above); after an untick it stays at
     * `caret`. Returns false when no open item is left: the field should let go, the list stays selected.
     */
    tickFromKeyboard(cardId: string, itemId: string, caret: number): boolean {
      ctx.flushPendingTick();
      const card = ctx.state.board.cards[cardId];
      const item = card?.kind === 'todo' ? C.findItem(card.items, itemId)?.item : null;
      if (card?.kind !== 'todo' || !item) return false;
      const ticking = !item.done;
      const ids = listsIncluding(cardId, itemId)?.find((l) => l.cardId === cardId)?.ids ?? selectedItemsIncluding(cardId, itemId) ?? [itemId];
      actions.toggleItem(cardId, itemId);
      const focus = ticking ? C.nextOpenItem(card.items, C.setItemsDone(card.items, ids, true), itemId) : itemId;
      updateUi({ focusItem: focus, focusOffset: ticking ? null : caret, ...(focus ? {} : { selection: [cardId] }) });
      return !!focus;
    },
    /**
     * Trash can: deletes the item and everything under it (or every selected item, if it is one of them).
     * `keepTyping` (the phone's item bar): the cursor moves to the item above (else below), so the keyboard stays up.
     */
    trashItem(cardId: string, itemId: string, keepTyping = false) {
      const lists = listsIncluding(cardId, itemId);
      if (lists) {
        ctx.deleting(`Deleted ${count(itemsIn(lists), 'item')}`, () => commit((b) => deleteAcross(b, lists), { ui: { itemSel: null } }));
        return;
      }
      const ids = selectedItemsIncluding(cardId, itemId) ?? [itemId];
      ctx.deleting(`Deleted ${count(ids.length, 'item')}`, () =>
        commit((b) => {
          const card = b.cards[cardId];
          if (card?.kind !== 'todo') return null;
          const items = C.deleteItems(card.items, ids);
          const focus = keepTyping ? C.focusAfterRemoving(visibleItems(card), items, ids) : null;
          return { board: C.editItems(b, cardId, () => items), ui: { itemSel: null, ...(focus ? { focusItem: focus, focusOffset: null } : {}) } };
        }),
      );
    },
    /**
     * Undo from the phone's item bar. The item being typed in can be redrawn or removed by the undo, so
     * the cursor goes back into it at `caret` (else the item next to it) and the keyboard stays up.
     */
    undoInItem(cardId: string, itemId: string, caret: number) {
      const before = ctx.state.board.cards[cardId];
      const shown = before?.kind === 'todo' ? visibleItems(before) : [];
      const board = ctx.state.board;
      ctx.undoOn(ctx.state.boards.open, 'undo');
      if (ctx.state.board !== board) announce('Undid the last change');
      const after = ctx.state.board.cards[cardId];
      if (after?.kind !== 'todo') return;
      const focus = C.findItem(after.items, itemId) ? itemId : C.focusAfterRemoving(shown, after.items, [itemId]);
      if (focus) updateUi({ focusItem: focus, focusOffset: focus === itemId ? caret : null });
    },
    toggleCompletedSection: (cardId: string) => commit((b) => C.toggleCompletedSection(b, cardId)),
    /** Uncheck all (owner request): every item in the list unticked, to use it again. One undo step. */
    uncheckAll: (cardId: string) => commit((b) => C.editItems(b, cardId, C.uncheckAll)),
    /** Ctrl+Shift+Backspace (owner request): ask "Delete N completed items?", or say there are none. */
    askDeleteCompleted() {
      if (ctx.state.ui.preview) return; // an old version is being looked at: nothing can be changed
      ctx.flushPendingTick(); // an item still on its way to Completed counts
      updateUi({ deleteCompleted: completedSectionCount(ctx.state.board) ? 'ask' : 'none' });
    },
    cancelDeleteCompleted: () => updateUi({ deleteCompleted: null }),
    /** Delete every item in the open board's Completed sections. One undo step. */
    confirmDeleteCompleted() {
      ctx.deleting('Deleted the completed items', () => commit((b) => deleteCompletedSections(b), { ui: { deleteCompleted: null, itemSel: null } }));
      updateUi({ deleteCompleted: null });
    },

    // ---------- selecting several checklist items ----------
    selectItemRange,
    /**
     * Shift+click: extend the item selection to `to`. With no selection in this list yet, the range
     * starts from `from` (the item being typed in), if given. Returns false if there is nothing to extend from.
     */
    extendItemSelection(cardId: string, to: string, from?: string | null): boolean {
      const sel = ctx.state.ui.itemSel;
      const anchor = sel?.cardId === cardId ? sel.anchor : from;
      if (!anchor) return false;
      selectItemRange(cardId, anchor, to);
      return true;
    },
    clearItemSelection: () => updateUi({ itemSel: null }),
    copyItems,
    deleteSelectedItems,
    /** Cut removes exactly what was copied: the selected items. Unselected sub-items stay, moving up a level. */
    cutItems(): boolean {
      const sel = ctx.state.ui.itemSel;
      if (!sel || sel.lists || !copyItems()) return false;
      commit((b) => C.editItems(b, sel.cardId, (items) => C.removeExactly(items, sel.ids)), { ui: { itemSel: null } });
      return true;
    },
    /** Pastes copied items right after the selected items, and selects the pasted ones. */
    pasteItems(): boolean {
      const sel = ctx.state.ui.itemSel;
      const card = sel && ctx.state.board.cards[sel.cardId];
      if (!sel || sel.lists || card?.kind !== 'todo' || !itemClipboard?.length) return false;
      const order = C.displayOrder(card.items).filter((id) => sel.ids.includes(id));
      const fresh = C.freshCopies(itemClipboard);
      commit((b) => C.editItems(b, sel.cardId, (items) => C.pasteItemsAfter(items, order[order.length - 1], fresh)), {
        ui: { itemSel: { cardId: sel.cardId, anchor: fresh[0].id, ids: fresh.flatMap(C.subtreeIds) } },
      });
      return true;
    },

    // ---------- dragging checklist items ----------
    /** Start dragging an item by its grip (or every selected item, if it is one of them). */
    startItemDrag(cardId: string, itemId: string, at: Point, measure?: (ids: string[]) => NonNullable<ItemDrag['lift']>) {
      const card = ctx.state.board.cards[cardId];
      if (card?.kind !== 'todo') return;
      const loc = C.findItem(card.items, itemId);
      if (!loc || listsIncluding(cardId, itemId)) return; // items in several lists: dragging does nothing (owner, 2026-10-03)
      const selected = selectedItemsIncluding(cardId, itemId);
      const roots = selected ? C.rootsOf(card.items, selected) : [itemId];
      const subtrees = roots.map((id) => C.findItem(card.items, id)!.item);
      const allIds = subtrees.flatMap(C.subtreeIds);
      const height = subtrees.reduce((h, it) => Math.max(h, C.subtreeHeight(it)), 0);
      const kids = allIds.length - 1;
      const label = roots.length > 1 ? `${allIds.length} items` : loc.item.text || 'Untitled item';
      const extra = roots.length > 1 || !kids ? '' : `+ ${kids} ${kids === 1 ? 'sub-item' : 'sub-items'}`;
      const drag: ItemDrag = { cardId, roots, allIds, height, label, extra, at, hint: null };
      if (measure) drag.lift = measure(allIds);
      updateUi({ itemDrag: drag.lift ? { ...drag, slide: liftSlide(drag, null) } : drag, confirm: null });
    },
    moveItemDrag(at: Point, hint: ItemHint | null) {
      const d = ctx.state.ui.itemDrag;
      if (d) updateUi({ itemDrag: { ...d, at, hint, ...(d.lift && { slide: liftSlide(d, hint) }) } });
    },
    cancelItemDrag: () => updateUi({ itemDrag: null }),
    /**
     * Drop dragged items where the hint says: into a list, or as a new list (on the board, or at the
     * end of a collapsed column). A list emptied by the drag is gone; the list they went into is then selected.
     */
    dropItems() {
      const d = ctx.state.ui.itemDrag;
      if (!d) return;
      const h = d.hint;
      if (!h) return updateUi({ itemDrag: null });
      const keep = d.roots.length > 1 ? d.allIds : null;
      if ('newList' in h) {
        const id = newId('k');
        const snap = (v: number) => snapIf(ctx.state.board.snap, v);
        const columnId = h.columnId;
        commit((b) => C.moveItems(b, d.cardId, d.roots, { newList: { id, x: snap(h.newList.x), y: snap(h.newList.y), columnId } }), {
          ui: { itemDrag: null, itemSel: null, selection: [id] },
        });
        return requestSettle([columnId ?? id]);
      }
      commit((b) => {
        const board = C.moveItems(b, d.cardId, d.roots, { cardId: h.cardId, drop: h.drop });
        const ui = { itemDrag: null, itemSel: keep ? { cardId: h.cardId, anchor: d.roots[0], ids: keep } : null };
        return { board, ui: board.cards[d.cardId] ? ui : { ...ui, selection: [h.cardId] } };
      });
    },
  };
  return actions;
}
