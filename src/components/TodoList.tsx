import { useEffect, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { sections } from '../model/checklist';
import { DRAG_THRESHOLD } from '../model/constants';
import type { TodoCard, TodoItem } from '../model/types';
import { appStore, useAppState } from '../store/appStore';
import { AutoSizeInput } from './AutoSizeInput';
import { clientToCanvas } from './canvasDom';
import { GrowTextarea } from './GrowTextarea';
import { ChevronIcon, GripIcon, TrashIcon } from './icons';
import { itemHintAt, rowUnder } from './itemDom';

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

  return (
    <div className={`todo-body${appendTarget ? ' append-target' : ''}`} data-todo-of={card.id}>
      <AutoSizeInput
        className="card-title"
        aria-label="List title"
        placeholder="List"
        value={card.title}
        onChange={(title) => appStore.setCardTitle(card.id, title)}
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

function ItemRow({ cardId, item, depth }: { cardId: string; item: TodoItem; depth: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wantsFocus = useAppState((s) => s.ui.focusItem === item.id);
  const focusOffset = useAppState((s) => (s.ui.focusItem === item.id ? s.ui.focusOffset : null));
  const picked = useAppState((s) => !!s.ui.itemSel && s.ui.itemSel.cardId === cardId && s.ui.itemSel.ids.includes(item.id));
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
      appStore.itemEnter(cardId, item.id);
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
      style={{ paddingLeft: depth * 22 }}
      onPointerDown={rowPointerDown(cardId, item.id)}
    >
      <input type="checkbox" aria-label="Done" checked={item.done || leaving} onChange={() => appStore.toggleItem(cardId, item.id)} />
      <GrowTextarea
        ref={ref}
        className="item-text"
        aria-label="Item text"
        placeholder="Item"
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
}

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
    if (e.button !== 0 || (e.target as Element).closest('button, input[type="checkbox"]')) return;
    e.stopPropagation(); // pressing a row never drags the card
    appStore.select(cardId);
    if (e.shiftKey && appStore.extendItemSelection(cardId, itemId)) {
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      return;
    }
    appStore.clearItemSelection();

    let selecting = false;
    const onMove = (ev: PointerEvent) => {
      const over = rowUnder(ev.clientX, ev.clientY, cardId);
      if (!selecting) {
        if (!over || over === itemId) return;
        selecting = true;
        // Now selecting rows, not text.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }
      window.getSelection()?.removeAllRanges();
      if (over) appStore.selectItemRange(cardId, itemId, over);
    };
    const finish = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
    window.addEventListener('pointermove', onMove);
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

    const onMove = (ev: PointerEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
        started = true;
        appStore.startItemDrag(cardId, itemId, clientToCanvas(ev.clientX, ev.clientY));
      }
      const d = appStore.getState().ui.itemDrag;
      if (d) appStore.moveItemDrag(clientToCanvas(ev.clientX, ev.clientY), itemHintAt(ev.clientX, ev.clientY, d));
    };
    const finish = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (!started) return;
      if (ev.type === 'pointercancel') appStore.cancelItemDrag();
      else appStore.dropItems();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };
}
