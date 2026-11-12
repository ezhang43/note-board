import { useEffect, type CSSProperties } from 'react';
import { doneCount, hasTicked } from '../model/checklist';
import { checklistCardOf } from '../model/mainChecklist';
import type { ItemDrag } from '../store/store';
import { appStore, BoardScope, useAppState } from '../store/appStore';
import { collab } from '../sync/collabSession';
import { ClipboardCheckIcon, CloseIcon, CompletedIcon } from './icons';
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
  const card = useAppState((s) => {
    const id = appStore.checklistBoard();
    const board = id && (id === s.boards.open ? s.board : s.boards.others[id]);
    return board ? checklistCardOf(board) : null;
  });
  const id = appStore.checklistBoard();
  const close = () => appStore.openChecklist();
  // Its board gone (deleted on another device): the panel closes; opening it again starts a new one.
  const gone = !card || !id;
  useEffect(() => {
    if (gone) close();
  }, [gone]);
  useEffect(() => {
    // Escape in the panel closes it (one in a panel on the right closes that one: escapeIsForChecklist).
    const key = (e: KeyboardEvent) => escapeIsForChecklist(e) && close();
    // Capture: seen before the page's own shortcuts close the list that Escape was for.
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);
  const completedOpen = useAppState((s) => s.ui.sidePanel === 'completed' && !!id && s.ui.completedBoard === id);
  const phone = usePhone();
  if (gone) return null;
  const { done, total } = doneCount(card.items);
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
        {hasTicked(card.items) && (
          <button
            type="button"
            className="list-clean-up"
            title="Move the ticked items into the Completed panel, under today's date"
            onClick={() => appStore.storeFor(id).cleanUpList(card.id)}
          >
            Clean up
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label="Completed"
          title="Items cleaned up from this checklist"
          aria-pressed={completedOpen}
          onClick={() => appStore.openChecklistCompleted(phone)}
        >
          <CompletedIcon />
        </button>
        <button type="button" className="icon-button" aria-label="Close checklist" title="Close (Esc)" onClick={close}>
          <CloseIcon />
        </button>
      </header>
      <BoardScope value={id}>
        {/* The list's own box, so its rows, keys and drags work as in a list on the board (data-card-id). */}
        <div className="card checklist-sheet" data-card-id={card.id} data-kind="todo">
          <TodoBody card={card} />
        </div>
        <PanelGhost cardId={card.id} />
      </BoardScope>
    </aside>
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
