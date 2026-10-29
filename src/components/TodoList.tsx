import { BoardReadOnly, boxProps } from './textBox';
import { styleCss } from '../model/textStyle';
import { openLinkOnCtrlClick } from './TextLinks';
import { memo, use, useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { canMoveItem, ITEM_INDENT } from '../model/checklist';
import type { TodoCard, TodoItem } from '../model/types';
import { appStore, useAppState } from '../store/appStore';
import { AutoSizeInput } from './AutoSizeInput';
import { GrowTextarea } from './GrowTextarea';
import { useTakeFocus } from './useTakeFocus';
import { ArrowIcon, GripIcon, TrashIcon } from './icons';
import { heldAfterRemoving, removeItemByKey, rowAt, rowUnder, trackItemDrag } from './itemDom';
import { columnOf } from '../model/board';
import { followEdges } from './edgeFollow';

function flatten(items: TodoItem[], depth = 0): { item: TodoItem; depth: number }[] {
  return items.flatMap((item) => [{ item, depth }, ...flatten(item.children, depth + 1)]);
}

/** A to-do list's title. It sits on the card's button row (see CardView), so the list's body starts right under it. */
export function TodoTitle({ card }: { card: TodoCard }) {
  const title = useRef<HTMLInputElement>(null);
  useTakeFocus(card.id, title);
  return (
    <AutoSizeInput
      className="card-title"
      ref={title}
      aria-label="List title"
      {...boxProps({ cardId: card.id }, card.style)}
      find={`title:${card.id}`}
      placeholder="List title"
      value={card.title}
      onChange={(text) => appStore.setCardTitle(card.id, text)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
        e.preventDefault();
        appStore.focusFirstItem(card.id);
      }}
    />
  );
}

/** A to-do list's body: its items in order, ticked ones in place (job 200). */
export function TodoBody({ card }: { card: TodoCard }) {
  return (
    <div className="todo-body" data-todo-of={card.id}>
      <div className="todo-items">
        {flatten(card.items).map(({ item, depth }) => (
          <ItemRow key={item.id} cardId={card.id} item={item} depth={depth} />
        ))}
      </div>
    </div>
  );
}

const ItemRow = memo(function ItemRow({ cardId, item, depth }: { cardId: string; item: TodoItem; depth: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const readOnly = use(BoardReadOnly);
  const wantsFocus = useAppState((s) => s.ui.focusItem === item.id);
  const focusOffset = useAppState((s) => (s.ui.focusItem === item.id ? s.ui.focusOffset : null));
  const picked = useAppState((s) => {
    const sel = s.ui.itemSel;
    if (!sel) return false;
    if (sel.lists) return sel.lists.some((l) => l.cardId === cardId && l.ids.includes(item.id));
    return sel.cardId === cardId && sel.ids.includes(item.id);
  });
  const mark = useAppState((s) => {
    const h = s.ui.itemDrag?.hint;
    return h && 'markId' in h && h.markId === item.id ? h.markMode : null;
  });
  const dimmed = useAppState((s) => !!s.ui.itemDrag && s.ui.itemDrag.cardId === cardId && s.ui.itemDrag.allIds.includes(item.id));
  // Lifted by press-and-hold (phone): the rows slide aside by this many px (0: back in place).
  const lifting = useAppState((s) => !!s.ui.itemDrag?.lift);
  const slide = useAppState((s) => s.ui.itemDrag?.slide?.[item.id] ?? 0);
  // Whether the hover arrows have anywhere to go: 1 = up, 2 = down (a number, so the selector stays cheap to compare).
  // simple: this walks the card's items for every row on each change; fine for lists of a few hundred items, cache per card if lists grow far larger.
  const moves = useAppState((s) => {
    const card = s.board.cards[cardId];
    if (card?.kind !== 'todo') return 0;
    return (canMoveItem(card.items, item.id, -1) ? 1 : 0) + (canMoveItem(card.items, item.id, 1) ? 2 : 0);
  });

  // Put the cursor in this item's text when asked: at the end (new item, Tab, Backspace) or at a
  // given spot (where two items were joined by Delete).
  useEffect(() => {
    const el = ref.current;
    if (!wantsFocus || !el) return;
    el.focus({ preventScroll: true });
    const at = focusOffset ?? el.value.length;
    el.setSelectionRange(at, at);
    appStore.focusTaken(item.id);
  }, [wantsFocus, focusOffset, item.id]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      // Ctrl+Enter (⌘+Enter): tick or untick, like the Done box (owner request, 2026-10-15).
      e.preventDefault();
      const el = e.currentTarget;
      if (!appStore.tickFromKeyboard(cardId, item.id, el.selectionStart)) el.blur();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const el = e.currentTarget;
      appStore.itemEnter(cardId, item.id, el.selectionStart, el.selectionEnd);
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation(); // not the board's Up / Down
      appStore.moveItem(cardId, item.id, e.key === 'ArrowUp' ? -1 : 1, e.currentTarget.selectionStart);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      appStore.itemTab(cardId, item.id, e.shiftKey);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && heldAfterRemoving(e)) {
      e.preventDefault(); // the held key that just removed an item goes no further
    } else if (e.key === 'Delete' && item.done && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.currentTarget.selectionStart === e.currentTarget.selectionEnd) {
      // Delete in a ticked item removes it, like its trash can (owner request 2026-10-29, job 218); selected letters are still just deleted.
      removeItemByKey(e, () => appStore.deleteTickedItem(cardId, item.id));
    } else if (e.key === 'Backspace' && e.currentTarget.value === '') {
      if (appStore.itemBackspace(cardId, item.id)) e.preventDefault();
    } else if (e.key === 'Delete' && !e.shiftKey && atEnd(e.currentTarget)) {
      if (appStore.itemDeleteAtEnd(cardId, item.id)) e.preventDefault();
    }
    // Up / Down arrows are handled board-wide (keyboardNav.ts), across items and cards.
  }

  const classes = [
    'todo-item',
    item.done && 'done',
    picked && 'picked',
    mark && `mark-${mark}`,
    dimmed && 'dimmed',
    lifting && 'lifting',
  ];
  return (
    <div
      className={classes.filter(Boolean).join(' ')}
      data-item-id={item.id}
      // The row knows its text's size too, so the tick box can sit on the middle of the first line.
      style={{ paddingLeft: depth * ITEM_INDENT, transform: lifting ? `translateY(${slide}px)` : undefined, '--ts': styleCss(item.style)['--ts'] } as CSSProperties}
      onPointerDown={rowPointerDown(cardId, item.id)}
    >
      {/* The label widens the area you can press to 24px; the box itself stays 16px. */}
      {/* A clicked box keeps the keyboard, in Safari too (which doesn't focus it), so Delete then removes this item, not the card (job 218). */}
      <label className="tick">
        <input type="checkbox" aria-label={item.text.trim() ? `Done: ${item.text.trim()}` : 'Done'} checked={item.done} disabled={readOnly} onChange={() => appStore.toggleItem(cardId, item.id)} onClick={(e) => e.currentTarget.focus({ preventScroll: true })} />
      </label>
      <GrowTextarea
        ref={ref}
        className="item-text"
        aria-label="Item text"
        {...boxProps({ cardId, itemId: item.id }, item.style)}
        find={`item:${cardId}:${item.id}`}
        placeholder="Add an item"
        value={item.text}
        onChange={(text) => appStore.setItemText(cardId, item.id, text)}
        onKeyDown={onKeyDown}
        onClick={openLinkOnCtrlClick}
      />
      {/* Move up / down in a small pill over the free end of the row above (below the first row), on hover or keyboard focus, like the phone's item bar and Ctrl+Shift+Up / Down (owner request, 2026-10-18; the pill, 2026-10-22). */}
      {/* Faded (aria-disabled) at the end of its level; a list of one item has nothing to move, so no pill. The cursor goes into the item, as with the keyboard. */}
      {moves !== 0 && (
        <span className="item-arrows">
          {([-1, 1] as const).map((dir) => {
            const label = dir < 0 ? 'Move up' : 'Move down';
            const can = (moves & (dir < 0 ? 1 : 2)) !== 0;
            return (
              <button
                key={dir}
                type="button"
                className="item-arrow"
                aria-label={label}
                title={label}
                aria-disabled={!can || undefined}
                tabIndex={can ? undefined : -1}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => can && appStore.moveItem(cardId, item.id, dir, document.activeElement === ref.current ? (ref.current?.selectionStart ?? 0) : item.text.length)}
              >
                <ArrowIcon down={dir > 0} />
              </button>
            );
          })}
        </span>
      )}
      {/* Every item has a trash can on hover (owner's request; the spec had it on completed items only). */}
      {/* Pressing it leaves the cursor in the item: on a touch screen the trash only shows while the item has it. */}
      <button
        type="button"
        className="item-trash"
        aria-label="Delete item"
        title="Delete item"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => appStore.trashItem(cardId, item.id)}
      >
        <TrashIcon />
      </button>
      <button type="button" className="item-grip" aria-label="Drag item" tabIndex={-1} onPointerDown={gripPointerDown(cardId, item.id)}>
        <GripIcon />
      </button>
    </div>
  );
});

/** The cursor is at the very end of the text, with nothing selected. */
function atEnd(el: HTMLTextAreaElement) {
  return el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
}

/**
 * Pressing a row: Shift+click extends the item selection; holding the mouse down and moving
 * over other rows selects the range between them.
 */
function rowPointerDown(cardId: string, itemId: string) {
  return (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('button, .tick, input[type="checkbox"]')) return;
    e.stopPropagation(); // pressing a row never drags the card
    // By finger a bigger selection is kept for now, so holding the item moves the whole selection;
    // a quick tap narrows it to this card (blockHoldPointerDown).
    const sel = appStore.getState().ui.selection;
    if (!(e.pointerType === 'touch' && sel.length > 1 && sel.includes(cardId))) appStore.select(cardId);
    // Shift+click extends the selection, or starts one from the item being typed in.
    const typingIn = document.activeElement?.closest<HTMLElement>(`[data-card-id="${CSS.escape(cardId)}"] [data-item-id]`)?.dataset.itemId;
    if (e.shiftKey && appStore.extendItemSelection(cardId, itemId, typingIn)) {
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      return;
    }
    appStore.clearItemSelection();
    // By finger, moving moves the board instead (owner request), so no range selection.
    if (e.pointerType === 'touch') return;

    let selecting = false;
    const onMove = (ev: { clientX: number; clientY: number }) => {
      if (appStore.getState().ui.drag) return; // a long press turned this into dragging the card
      const over = rowUnder(ev.clientX, ev.clientY, cardId);
      // Into another card of the same column: the selection carries on across the cards (owner request).
      const elsewhere = over ? null : rowAt(ev.clientX, ev.clientY);
      const col = elsewhere && columnOf(appStore.getState().board, cardId);
      if (elsewhere && col && col.id === columnOf(appStore.getState().board, elsewhere.cardId)?.id) {
        if (!selecting && document.activeElement instanceof HTMLElement) document.activeElement.blur();
        selecting = true;
        window.getSelection()?.removeAllRanges();
        return appStore.selectAcross(col.id, { cardId, itemId }, elsewhere);
      }
      if (!selecting) {
        if (!over || over === itemId) return;
        selecting = true;
        // Now selecting rows, not text.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }
      window.getSelection()?.removeAllRanges();
      if (over) appStore.selectItemRange(cardId, itemId, over);
    };
    // At the edge of the screen the board keeps moving and the selection keeps growing (owner request).
    const edges = followEdges((p) => selecting && onMove(p));
    const onPointerMove = (ev: PointerEvent) => {
      edges.track(ev);
      onMove(ev);
    };
    const finish = () => {
      edges.stop();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };
}

/** Dragging an item by its grip (with its sub-items, or all selected items). */
function gripPointerDown(cardId: string, itemId: string) {
  return (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    appStore.select(cardId);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    trackItemDrag(cardId, itemId, { x: e.clientX, y: e.clientY }, e.pointerId);
  };
}
