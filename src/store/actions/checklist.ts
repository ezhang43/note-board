import { createItem, newId } from '../../model/cards';
import { columnOf } from '../../model/board';
import * as C from '../../model/checklist';
import { completedSectionCount, deleteCompletedSections } from '../../model/completed';
import { withDue } from '../../model/due';
import { boardLists, columnLists, deleteAcross, multiAsText, rangeAcross, setDoneAcross, visibleItems, type ListSelection } from '../../model/multiSelect';
import { snapIf } from '../../model/geometry';
import type { Point, TodoItem } from '../../model/types';
import type { StoreContext } from '../core';
import { copyText, reducedMotion } from '../env';
import type { ItemHint } from '../types';

// Checklist actions: editing items, ticking, selecting several items, copying them, dragging them.

/** How long a ticked item takes to leave for the Completed section, and to settle in there (ms). */
export const COMPLETE_LEAVE_MS = 280;
export const COMPLETE_ARRIVE_MS = 450;

export function checklistActions(ctx: StoreContext) {
  const { commit, updateUi, requestSettle } = ctx;
  /** Copied checklist items. */
  let itemClipboard: TodoItem[] | null = null;

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

  /** Delete / Backspace with checklist items selected. Returns false when no items are selected. */
  function deleteSelectedItems(): boolean {
    const sel = ctx.state.ui.itemSel;
    if (!sel) return false;
    if (sel.lists) {
      const lists = sel.lists;
      commit((b) => deleteAcross(b, lists), { ui: { itemSel: null } });
      return true;
    }
    commit((b) => C.editItems(b, sel.cardId, (items) => C.deleteItems(items, sel.ids)), { ui: { itemSel: null } });
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

  return {
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
      if (lists) return void commit((b) => setDoneAcross(b, lists, !item.done));
      const ids = selectedItemsIncluding(cardId, itemId) ?? [itemId];
      const next = C.setItemsDone(card.items, ids, !item.done);
      // Applied to the list as it is then (another device's change may have arrived meanwhile).
      const apply = () => commit((b) => C.editItems(b, cardId, (items) => C.setItemsDone(items, ids, !item.done)));
      // Top-level items this tick sends to the Completed section get a short leaving animation first.
      const leaving = next.filter((it) => it.done && !card.items.find((o) => o.id === it.id)?.done).flatMap(C.subtreeIds);
      if (!leaving.length || reducedMotion()) return void apply();
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
    /** Trash can: deletes the item and everything under it (or every selected item, if it is one of them). */
    trashItem(cardId: string, itemId: string) {
      const lists = listsIncluding(cardId, itemId);
      if (lists) return void commit((b) => deleteAcross(b, lists), { ui: { itemSel: null } });
      const ids = selectedItemsIncluding(cardId, itemId) ?? [itemId];
      commit((b) => C.editItems(b, cardId, (items) => C.deleteItems(items, ids)), { ui: { itemSel: null } });
    },
    toggleCompletedSection: (cardId: string) => commit((b) => C.toggleCompletedSection(b, cardId)),
    // ---------- due dates (owner request) ----------
    openDuePicker: (cardId: string, itemId: string) => ctx.updateUi({ dueFor: { cardId, itemId }, colourMenuOpen: false }),
    closeDuePicker: () => ctx.updateUi({ dueFor: null }),
    /** Give an item a due date ("YYYY-MM-DD"), or none (null). One undo step; the picker closes. */
    setItemDue: (cardId: string, itemId: string, due: string | null) =>
      commit((b) => C.editItems(b, cardId, (items) => withDue(items, itemId, due)), { ui: { dueFor: null } }) ?? ctx.updateUi({ dueFor: null }),
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
    confirmDeleteCompleted: () =>
      commit((b) => deleteCompletedSections(b), { ui: { deleteCompleted: null, itemSel: null } }) ?? updateUi({ deleteCompleted: null }),

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
    startItemDrag(cardId: string, itemId: string, at: Point) {
      const card = ctx.state.board.cards[cardId];
      if (card?.kind !== 'todo') return;
      const loc = C.findItem(card.items, itemId);
      if (!loc) return;
      const selected = selectedItemsIncluding(cardId, itemId);
      const roots = selected ? C.rootsOf(card.items, selected) : [itemId];
      const subtrees = roots.map((id) => C.findItem(card.items, id)!.item);
      const allIds = subtrees.flatMap(C.subtreeIds);
      const height = subtrees.reduce((h, it) => Math.max(h, C.subtreeHeight(it)), 0);
      const kids = allIds.length - 1;
      const label = roots.length > 1 ? `${allIds.length} items` : loc.item.text || 'Untitled item';
      const extra = roots.length > 1 || !kids ? '' : `+ ${kids} ${kids === 1 ? 'sub-item' : 'sub-items'}`;
      updateUi({ itemDrag: { cardId, roots, allIds, height, label, extra, at, hint: null }, confirm: null });
    },
    moveItemDrag(at: Point, hint: ItemHint | null) {
      const d = ctx.state.ui.itemDrag;
      if (d) updateUi({ itemDrag: { ...d, at, hint } });
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
}
