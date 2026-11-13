import { useEffect, useRef, useState, type ClipboardEvent, type CSSProperties } from 'react';
import { ITEMS_MARKER, JOURNAL_MARKER } from '../store/env';
import { GrowTextarea } from './GrowTextarea';
import { BoardReadOnly } from './textBox';
import { doneCount, hasTicked } from '../model/checklist';
import { checklistCardOf } from '../model/mainChecklist';
import type { ItemDrag } from '../store/store';
import { appStore, BoardScope, useAppState } from '../store/appStore';
import { collab } from '../sync/collabSession';
import { ClipboardCheckIcon, CloseIcon } from './icons';
import { escapeIsForChecklist } from './textField';
import { TodoBody } from './TodoList';
import { usePhone } from './usePhone';

/**
 * The main checklist (owner request, 2026-11-12): one checklist, the same whichever board is open, in a
 * panel on the left, the only panel there, so it can stay open beside the Journal, Habits, the calendar or
 * any other panel on the right. On a phone it fills the screen, one panel at a time. Its list is kept on
 * a board of its own, "Main checklist" (hidden from the Boards menu), so it is saved, synced and backed
 * up like any board; every checklist feature works on it as on the board, with its own undo.
 */
export function ChecklistPanel() {
  // The saved list, never an old version being looked at (shown in place of the board while its board is open).
  const id = useAppState(() => appStore.checklistBoard());
  const card = useAppState(() => {
    const board = id && appStore.workspace().boards[id];
    return board ? checklistCardOf(board) : null;
  });
  const close = () => appStore.openChecklist();
  // While Version history shows an old version nothing can be changed (as on the board), so the panel says so (PR 274 check).
  const previewing = useAppState((s) => s.ui.preview !== null);
  useEffect(() => {
    // Escape in the panel closes it (one in a panel on the right closes that one: escapeIsForChecklist).
    const key = (e: KeyboardEvent) => escapeIsForChecklist(e) && close();
    // Capture: seen before the page's own shortcuts close the list that Escape was for.
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);
  const phone = usePhone();
  const { done, total } = card ? doneCount(card.items) : { done: 0, total: 0 };
  return (
    // tabIndex -1: a click on its heading or blank space keeps the keyboard in the panel, so keys meant for it never reach the board.
    <aside className="checklist-panel" aria-label="Checklist" tabIndex={-1}>
      <header className="history-head">
        <h2>Checklist</h2>
        {total > 0 && (
          <span className="title-count checklist-count" aria-label={`${done} of ${total} done`}>
            {done}/{total}
          </span>
        )}
        {previewing && <span className="role-badge checklist-old">Viewing an old version</span>}
        {card && id && !previewing && hasTicked(card.items) && (
          <button
            type="button"
            className="list-clean-up"
            title="Move the ticked items into the Completed panel, under today's date"
            onClick={() => appStore.storeFor(id).cleanUpList(card.id)}
          >
            Clean up
          </button>
        )}
        <button type="button" className="icon-button" aria-label="Close checklist" title="Close (Esc)" onClick={close}>
          <CloseIcon />
        </button>
      </header>
      <BoardReadOnly value={previewing}>
        {card && id ? (
          <BoardScope value={id}>
            {/* The list's own box, so its rows, keys and drags work as in a list on the board (data-card-id). */}
            <div className="card checklist-sheet" data-card-id={card.id} data-kind="todo">
              <TodoBody card={card} />
            </div>
            <PanelGhost cardId={card.id} />
          </BoardScope>
        ) : (
          <EmptyList phone={phone} />
        )}
      </BoardReadOnly>
    </aside>
  );
}

/**
 * No list yet (never typed in, or its board deleted): an empty item to type in. Nothing is made until the first
 * letter, so opening the panel changes nothing (PR 274 check: a device with an old offline copy would otherwise
 * upload it over newer boards). Typing, pasting (copied items go in as items) or Enter there acts as in a list.
 */
function EmptyList({ phone }: { phone: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('');
  const composing = useRef(false);
  const plainPaste = useRef(false);
  useEffect(() => {
    // The cursor starts in it when the panel opens, as in a list (not on a phone), but never taken from a text box
    // elsewhere, as when the list is deleted by another device while the person types on the board.
    const at = document.activeElement;
    if (!phone && !(at instanceof HTMLElement && at.closest('input, textarea, [contenteditable="true"]'))) ref.current?.focus({ preventScroll: true });
  }, []);
  // A word being composed (an input method, or a phone keyboard) starts the list once it is done, not halfway.
  const start = (text: string) => {
    if (text) appStore.startChecklist(text);
  };
  const paste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const types = e.clipboardData.types;
    const journal = types.includes(JOURNAL_MARKER);
    // Ctrl+Shift+V pastes plain text, as in a list.
    if (plainPaste.current || (!types.includes(ITEMS_MARKER) && !journal)) return;
    e.preventDefault();
    const plain = e.clipboardData.getData('text/plain');
    const made = appStore.startChecklist('');
    if (!made) return;
    const s = appStore.storeFor(made.board);
    const done = journal ? s.pasteJournalInto(made.card, made.item, e.clipboardData.getData(JOURNAL_MARKER)) : s.pasteItemsInto(made.card, made.item);
    if (!done) s.setItemText(made.card, made.item, plain);
  };
  return (
    <div className="card checklist-sheet" data-kind="todo">
      <div className="todo-body">
        <div className="todo-items">
          <div className="todo-item">
            <label className="tick">
              <input type="checkbox" aria-label="Done" checked={false} disabled readOnly />
            </label>
            {/* The first letter swaps this box for the new list's first item, which takes the cursor. */}
            <GrowTextarea
              ref={ref}
              className="item-text"
              aria-label="Item text"
              placeholder="Add an item"
              value={draft}
              onChange={(text) => {
                setDraft(text);
                if (!composing.current) start(text);
              }}
              onCompositionStart={() => (composing.current = true)}
              onCompositionEnd={(e) => {
                composing.current = false;
                start(e.currentTarget.value);
              }}
              // Enter in an empty item adds nothing, as in a list (and puts no line break in the first item).
              onKeyDown={(e) => {
                plainPaste.current = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v';
                if (e.key === 'Enter') e.preventDefault();
              }}
              onPaste={paste}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The ghost of items dragged in the panel, drawn at the pointer (the board's own ghost is under the panel). */
function PanelGhost({ cardId }: { cardId: string }) {
  const drag = useAppState((s) => (s.ui.itemDrag?.cardId === cardId && s.ui.itemDrag.inPanel ? s.ui.itemDrag : null));
  if (!drag) return null;
  return (
    <div className={drag.lift ? 'item-ghost moving lifted panel-ghost' : 'item-ghost moving panel-ghost'} data-testid="item-ghost" style={ghostStyle(drag)}>
      <span className="item-ghost-label">{drag.label}</span>
      {drag.extra && <span className="item-ghost-extra">{drag.extra}</span>}
    </div>
  );
}

function ghostStyle({ at, lift }: ItemDrag): CSSProperties {
  if (!lift) return { translate: `${at.x + 14}px ${at.y + 10}px` };
  const x = Math.max(8, Math.min(at.x - lift.width / 2, window.innerWidth - lift.width - 8));
  return { width: lift.width, translate: `${x}px max(8px, calc(${at.y + 12}px - 100%))` };
}

/** Opens and closes the Checklist panel: in the bottom pill beside Journal and Habits, and a tile in the phone's ⋯ panel (`labelled`). */
export function ChecklistButton({ labelled = false, onOpen }: { labelled?: boolean; onOpen?: () => void }) {
  const open = useAppState((s) => s.ui.checklistOpen);
  const phone = usePhone();
  return (
    <button
      type="button"
      className={labelled ? 'tb-button' : 'help-button dock-tool'}
      aria-label="Checklist"
      title="Your main checklist"
      aria-pressed={open}
      onClick={() => {
        if (appStore.openChecklist(phone) === 'loading') collab.setNotice('Your shared boards are still loading. Try again in a moment.');
        onOpen?.();
      }}
    >
      <ClipboardCheckIcon />
      Checklist
    </button>
  );
}
