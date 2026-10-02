import { createItem, newId } from '../../model/cards';
import * as C from '../../model/checklist';
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

  /** The selected checklist items, if `itemId` in `cardId` is one of several selected; otherwise null. */
  function selectedItemsIncluding(cardId: string, itemId: string): string[] | null {
    const sel = ctx.state.ui.itemSel;
    return sel && sel.cardId === cardId && sel.ids.length > 1 && sel.ids.includes(itemId) ? sel.ids : null;
  }

  /** Delete / Backspace with checklist items selected. Returns false when no items are selected. */
  function deleteSelectedItems(): boolean {
    const sel = ctx.state.ui.itemSel;
    if (!sel) return false;
    commit((b) => C.editItems(b, sel.cardId, (items) => C.deleteItems(items, sel.ids)), { ui: { itemSel: null } });
    return true;
  }

  /** Tab / Shift+Tab with several items selected: they all move in (or out) one level together. */
  function tabSelectedItems(outdent: boolean) {
    const sel = ctx.state.ui.itemSel;
    if (!sel) return;
    commit((b) => C.editItems(b, sel.cardId, (items) => (outdent ? C.outdentItems(items, sel.ids) : C.indentItems(items, sel.ids))));
  }

  function copyItems(): boolean {
    const sel = ctx.state.ui.itemSel;
    const card = sel && ctx.state.board.cards[sel.cardId];
    if (!sel || card?.kind !== 'todo') return false;
    itemClipboard = C.copyItems(card.items, sel.ids);
    if (!itemClipboard.length) return false;
    copyText(C.selectionAsText(card.items, sel.ids));
    return true;
  }

  return {
    // ---------- editing items ----------
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
      const ids = selectedItemsIncluding(cardId, itemId) ?? [itemId];
      commit((b) => C.editItems(b, cardId, (items) => C.deleteItems(items, ids)), { ui: { itemSel: null } });
    },
    toggleCompletedSection: (cardId: string) => commit((b) => C.toggleCompletedSection(b, cardId)),

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
      if (!sel || !copyItems()) return false;
      commit((b) => C.editItems(b, sel.cardId, (items) => C.removeExactly(items, sel.ids)), { ui: { itemSel: null } });
      return true;
    },
    /** Pastes copied items right after the selected items, and selects the pasted ones. */
    pasteItems(): boolean {
      const sel = ctx.state.ui.itemSel;
      const card = sel && ctx.state.board.cards[sel.cardId];
      if (!sel || card?.kind !== 'todo' || !itemClipboard?.length) return false;
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
    /** Drop dragged items where the hint says: into a list, or onto the board as a new list. */
    dropItems() {
      const d = ctx.state.ui.itemDrag;
      if (!d) return;
      const h = d.hint;
      if (!h) return updateUi({ itemDrag: null });
      const keep = d.roots.length > 1 ? d.allIds : null;
      if ('newList' in h) {
        const id = newId('k');
        const snap = (v: number) => snapIf(ctx.state.board.snap, v);
        commit((b) => C.moveItems(b, d.cardId, d.roots, { newList: { id, x: snap(h.newList.x), y: snap(h.newList.y) } }), {
          ui: { itemDrag: null, itemSel: null, selection: [id] },
        });
        return requestSettle([id]);
      }
      commit((b) => C.moveItems(b, d.cardId, d.roots, { cardId: h.cardId, drop: h.drop }), {
        ui: { itemDrag: null, itemSel: keep ? { cardId: h.cardId, anchor: d.roots[0], ids: keep } : null },
      });
    },
  };
}
