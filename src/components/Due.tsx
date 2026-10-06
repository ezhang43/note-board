import { useEffect, useMemo, useRef } from 'react';
import { shownName } from '../model/board';
import { dayKey } from '../model/completed';
import { addDays, dueItems, dueLabel, dueState } from '../model/due';
import type { TodoItem } from '../model/types';
import { appStore, useAppState } from '../store/appStore';
import { revealOnBoard } from './canvasDom';
import { CalendarIcon, CloseIcon } from './icons';
import { usePhone } from './usePhone';

// Due dates on checklist items (owner request, 2026-10-05): a chip on the item, a small picker, and
// the Due panel listing what is due today or overdue on every board. No reminders or notifications.

/** Today on this computer, as YYYY-MM-DD. */
export const today = () => dayKey(new Date());

/** The chip after an item's text: "Today", "Tue 20 Oct"… red when overdue. Pressing it changes the date. */
export function DueChip({ cardId, itemId, due, done }: { cardId: string; itemId: string; due: string; done: boolean }) {
  const now = today();
  const label = dueLabel(due, now);
  const state = done ? 'done' : dueState(due, now);
  return (
    <button
      type="button"
      className={`due-chip ${state}`}
      data-due-anchor={itemId}
      aria-label={`Due ${label}${state === 'overdue' ? ' (overdue)' : ''}. Change the due date`}
      title="Change the due date"
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => appStore.openDuePicker(cardId, itemId)}
    >
      {label}
    </button>
  );
}

/** The calendar button shown on hover beside the trash, to give an item a due date. */
export function DueButton({ cardId, itemId }: { cardId: string; itemId: string }) {
  return (
    <button
      type="button"
      className="item-due"
      data-due-anchor={itemId}
      aria-label="Due date"
      title="Give this item a due date"
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => appStore.openDuePicker(cardId, itemId)}
    >
      <CalendarIcon />
    </button>
  );
}

/** The item's due date ('' for none), or undefined when the item is gone. */
function dueOf(items: TodoItem[], id: string): string | undefined {
  for (const it of items) {
    if (it.id === id) return it.due ?? '';
    const inner = dueOf(it.children, id);
    if (inner !== undefined) return inner;
  }
  return undefined;
}

/** The date picker: Today, Tomorrow, Next week, any day, or no due date. Escape or a click outside closes it. */
export function DuePicker() {
  const dueFor = useAppState((s) => s.ui.dueFor);
  const current = useAppState((s) => {
    const card = s.ui.dueFor && s.board.cards[s.ui.dueFor.cardId];
    return card?.kind === 'todo' ? dueOf(card.items, s.ui.dueFor!.itemId) : undefined;
  });
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dueFor) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!box.current?.contains(t) && !t.closest?.('[data-due-anchor]')) appStore.closeDuePicker();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && appStore.closeDuePicker();
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', key);
    };
  }, [dueFor]);

  // The item went (undo, another device): forget it, so Escape and clicks work as usual again.
  const gone = dueFor !== null && current === undefined;
  useEffect(() => {
    if (gone) appStore.closeDuePicker();
  }, [gone]);

  if (!dueFor || current === undefined) return null;
  const row = document.querySelector(`[data-item-id="${CSS.escape(dueFor.itemId)}"]`);
  const r = (row?.querySelector('[data-due-anchor]') ?? row)?.getBoundingClientRect();
  const left = r ? Math.max(8, Math.min(window.innerWidth - 228, r.right - 220)) : 16;
  const top = r ? Math.max(8, Math.min(window.innerHeight - 230, r.bottom + 6)) : 80;
  const now = today();
  const set = (due: string | null) => appStore.setItemDue(dueFor.cardId, dueFor.itemId, due);
  return (
    <div ref={box} className="due-picker" role="dialog" aria-label="Due date" style={{ left, top }}>
      <button type="button" onClick={() => set(now)}>
        Today
      </button>
      <button type="button" onClick={() => set(addDays(now, 1))}>
        Tomorrow
      </button>
      <button type="button" onClick={() => set(addDays(now, 7))}>
        Next week
      </button>
      <input type="date" aria-label="Pick a day" value={current} onChange={(e) => e.target.value && set(e.target.value)} />
      {current && (
        <button type="button" className="due-clear" onClick={() => set(null)}>
          No due date
        </button>
      )}
    </div>
  );
}

/** Items due today or overdue on every board, worked out again only when a board changes. */
function useDueItems(on = true) {
  const board = useAppState((s) => s.board);
  const boards = useAppState((s) => s.boards);
  return useMemo(() => (on ? dueItems(appStore.workspace(), today()) : []), [on, board, boards]);
}

/** The button by the zoom control that opens the Due panel, showing how many items are due. */
export function DuePanelButton({ labelled = false }: { labelled?: boolean }) {
  const open = useAppState((s) => s.ui.dueOpen);
  const count = useDueItems().length;
  return (
    <button
      type="button"
      className={labelled ? 'tb-button due-button' : 'help-button due-button'}
      aria-label={`Due today and overdue (${count})`}
      title="Due today and overdue"
      aria-pressed={open}
      onClick={appStore.toggleDuePanel}
    >
      <CalendarIcon size={16} />
      {labelled && 'Due today'}
      {count > 0 && <span className="due-count">{count}</span>}
    </button>
  );
}

/** The Due panel: unticked items due today or before, on every board. Clicking one goes to it. */
export function DuePanel() {
  const open = useAppState((s) => s.ui.dueOpen);
  const several = useAppState((s) => Object.keys(s.boards.others).length > 0);
  const phone = usePhone();
  const items = useDueItems(open);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !appStore.getState().ui.dueFor && appStore.toggleDuePanel();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);

  if (!open) return null;
  const go = (boardId: string, cardId: string, itemId: string) => {
    appStore.goToItem(boardId, cardId, itemId);
    if (phone) appStore.toggleDuePanel(); // on a phone the panel covers the board
    // Once the board has been drawn (and brought into view), move it so the item is in sight.
    let frames = 3;
    const step = () => {
      if (--frames > 0) return void requestAnimationFrame(step);
      const el = document.querySelector(`[data-card-id="${CSS.escape(cardId)}"] [data-item-id="${CSS.escape(itemId)}"]`) ?? document.querySelector(`[data-card-id="${CSS.escape(cardId)}"]`);
      if (el) revealOnBoard(el);
    };
    requestAnimationFrame(step);
  };
  const now = today();
  const groups = [
    { title: 'Overdue', rows: items.filter((d) => d.state === 'overdue') },
    { title: 'Today', rows: items.filter((d) => d.state === 'today') },
  ].filter((g) => g.rows.length);
  return (
    <aside className="history-panel due-panel" aria-label="Due">
      <header className="history-head">
        <h2>Due</h2>
        <button type="button" className="icon-button" aria-label="Close the Due list" title="Close (Esc)" onClick={appStore.toggleDuePanel}>
          <CloseIcon />
        </button>
      </header>
      {!groups.length && <p className="history-note">Nothing is due today. To give a checklist item a due date, point at it and click the calendar button.</p>}
      {groups.map((g) => (
        <section key={g.title} className="history-day" aria-label={g.title}>
          <h3>{g.title}</h3>
          {g.rows.map((d) => (
            <button key={`${d.boardId}:${d.itemId}`} type="button" className="history-row due-row" onClick={() => go(d.boardId, d.cardId, d.itemId)}>
              <span className="history-time">{d.text.trim() || 'Untitled item'}</span>
              <span className="history-detail">
                {[several && shownName(d.boardName), d.listTitle.trim() || 'List', d.state === 'overdue' && dueLabel(d.due, now)].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </section>
      ))}
    </aside>
  );
}
