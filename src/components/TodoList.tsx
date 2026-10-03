import { boxProps } from './textBox';
import { memo, useEffect, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ITEM_INDENT, sections } from '../model/checklist';
import { DRAG_THRESHOLD } from '../model/constants';
import type { TodoCard, TodoItem } from '../model/types';
import { appStore, useAppState } from '../store/appStore';
import { AutoSizeInput } from './AutoSizeInput';
import { clientToCanvas } from './canvasDom';
import { GrowTextarea } from './GrowTextarea';
import { useTakeFocus } from './useTakeFocus';
import { ChevronIcon, GripIcon, TrashIcon } from './icons';
import { itemHintAt, rowAt, rowUnder } from './itemDom';
import { columnOf } from '../model/board';
import { followEdges } from './edgeFollow';

function flatten(items: TodoItem[], depth = 0): { item: TodoItem; depth: number }[] {
  return items.flatMap((item) => [{ item, depth }, ...flatten(item.children, depth + 1)]);
}

/** A to-do list's body: title, open items, and the "Completed" section. */
export function TodoBody({ card }: { card: TodoCard }) {
  const appendTarget = useAppState((s) => {
    const h = s.ui.itemDrag?.hint;
    return !!h && 'cardId' in h && h.cardId === card.id && h.drop.mode === 'append';
  });
  const { open, done } = sections(card.items);
  const title = useRef<HTMLInputElement>(null);
  useTakeFocus(card.id, title);

  return (
    <div className={`todo-body${appendTarget ? ' append-target' : ''}`} data-todo-of={card.id}>
      <AutoSizeInput
        className="card-title"
        ref={title}
        aria-label="List title"
        {...boxProps({ cardId: card.id }, card.style)}
        placeholder="List title"
        value={card.title}
        onChange={(text) => appStore.setCardTitle(card.id, text)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
          e.preventDefault();
          appStore.focusFirstItem(card.id);
        }}
      />
      <div className="todo-items">
        {flatten(open).map(({ item, depth }) => (
          <ItemRow key={item.id} cardId={card.id} item={item} depth={depth} />
        ))}
      </div>
      {done.length > 0 && (
        <div className="completed">
          <button
            type="button"
            className="completed-toggle"
            aria-expanded={card.completedOpen}
            onClick={() => appStore.toggleCompletedSection(card.id)}
          >
            <ChevronIcon collapsed={!card.completedOpen} />
            Completed
          </button>
          {card.completedOpen &&
            flatten(done).map(({ item, depth }) => <ItemRow key={item.id} cardId={card.id} item={item} depth={depth} />)}
        </div>
      )}
    </div>
  );
}

const ItemRow = memo(function ItemRow({ cardId, item, depth }: { cardId: string; item: TodoItem; depth: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
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
  // Just ticked and about to move to Completed, or just arrived there (a short animation).
  const leaving = useAppState((s) => s.ui.completing.includes(item.id));
  const arrived = useAppState((s) => s.ui.arrived.includes(item.id));

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
    if (e.key === 'Enter' && !e.shiftKey) {
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
    } else if (e.key === 'Backspace' && e.currentTarget.value === '') {
      if (appStore.itemBackspace(cardId, item.id)) e.preventDefault();
    } else if (e.key === 'Delete' && !e.shiftKey && atEnd(e.currentTarget)) {
      if (appStore.itemDeleteAtEnd(cardId, item.id)) e.preventDefault();
    }
    // Up / Down arrows are handled board-wide (keyboardNav.ts), across items and cards.
  }

  const classes = [
    'todo-item',
    (item.done || leaving) && 'done',
    picked && 'picked',
    mark && `mark-${mark}`,
    dimmed && 'dimmed',
    leaving && 'leaving',
    arrived && 'arrived',
  ];
  return (
    <div
      className={classes.filter(Boolean).join(' ')}
      data-item-id={item.id}
      style={{ paddingLeft: depth * ITEM_INDENT }}
      onPointerDown={rowPointerDown(cardId, item.id)}
    >
      {/* The label widens the area you can press to 24px; the box itself stays 16px. */}
      <label className="tick">
        <input type="checkbox" aria-label="Done" checked={item.done || leaving} onChange={() => appStore.toggleItem(cardId, item.id)} />
      </label>
      <GrowTextarea
        ref={ref}
        className="item-text"
        aria-label="Item text"
        {...boxProps({ cardId, itemId: item.id }, item.style)}
        placeholder="Add an item"
        value={item.text}
        onChange={(text) => appStore.setItemText(cardId, item.id, text)}
        onKeyDown={onKeyDown}
      />
      {/* Every item has a trash can on hover (owner's request; the spec had it on completed items only). */}
      <button type="button" className="item-trash" aria-label="Delete item" title="Delete item" onClick={() => appStore.trashItem(cardId, item.id)}>
        <TrashIcon />
      </button>
      <button type="button" className="item-grip" aria-label="Drag item" onPointerDown={gripPointerDown(cardId, item.id)}>
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
    appStore.select(cardId);
    // Shift+click extends the selection, or starts one from the item being typed in.
    const typingIn = document.activeElement?.closest<HTMLElement>(`[data-card-id="${cardId}"] [data-item-id]`)?.dataset.itemId;
    if (e.shiftKey && appStore.extendItemSelection(cardId, itemId, typingIn)) {
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      return;
    }
    appStore.clearItemSelection();

    let selecting = false;
    const onMove = (ev: { clientX: number; clientY: number }) => {
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
    const start = { x: e.clientX, y: e.clientY };
    let started = false;

    const onMove = (ev: { clientX: number; clientY: number }) => {
      if (!started) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
        started = true;
        appStore.startItemDrag(cardId, itemId, clientToCanvas(ev.clientX, ev.clientY));
      }
      const d = appStore.getState().ui.itemDrag;
      if (d) appStore.moveItemDrag(clientToCanvas(ev.clientX, ev.clientY), itemHintAt(ev.clientX, ev.clientY, d));
    };
    const edges = followEdges((p) => started && onMove(p));
    const onPointerMove = (ev: PointerEvent) => {
      edges.track(ev);
      onMove(ev);
    };
    const finish = (ev: PointerEvent) => {
      edges.stop();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (!started) return;
      if (ev.type === 'pointercancel') appStore.cancelItemDrag();
      else appStore.dropItems();
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };
}
