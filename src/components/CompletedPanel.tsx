import { useMemo, useRef, type CSSProperties } from 'react';
import { ITEM_INDENT } from '../model/checklist';
import { completedCardOf, dayLabel, mergeCompleted, type CompletedRow as CompletedRowData } from '../model/completed';
import { styleCss } from '../model/textStyle';
import type { TodoItem } from '../model/types';
import { appStore, useAppState } from '../store/appStore';
import { FindMarks } from './FindMarks';
import { CompletedIcon } from './icons';

/** True while the current search match is in the Completed panel and the panel is shut (the ⋯ button and the entry are ringed). */
export const useCompletedFindTarget = () =>
  useAppState((s) => {
    const at = s.ui.find?.current?.showInstead;
    return !!at && s.ui.sidePanel !== 'completed' && s.board.cards[at]?.kind === 'completed';
  });

/**
 * Opens the Completed panel (Job #51): a row in the ⋯ More menu on a computer, a tile in the ⋯ sheet
 * on a phone (owner request 2026-11-12). While a search match is in the shut panel, it is ringed.
 */
export function CompletedButton({ onOpen }: { onOpen?: () => void }) {
  const open = useAppState((s) => s.ui.sidePanel === 'completed');
  const findTarget = useCompletedFindTarget();
  return (
    <button
      type="button"
      className={['tb-button opens-panel', findTarget && 'find-target'].filter(Boolean).join(' ')}
      aria-label="Completed"
      title="Completed items"
      aria-pressed={open}
      onClick={() => {
        appStore.toggleSidePanel('completed');
        onOpen?.();
      }}
    >
      <CompletedIcon />
      Completed
    </button>
  );
}

/**
 * The Completed panel: items moved here by Clean up, grouped by day, newest first. Unticking one sends it back.
 * The Main checklist's cleaned-up items are mixed in under the same days, marked "Checklist" (owner, 2026-11-13);
 * each stays in its own board's record.
 */
export function CompletedPanel() {
  const own = useAppState((s) => completedCardOf(s.board));
  const list = useAppState((s) => {
    const id = appStore.completedChecklist();
    const board = id ? s.boards.others[id] : undefined;
    return board ? completedCardOf(board) : null;
  });
  const days = useMemo(() => mergeCompleted(own, list), [own, list]);
  const ref = useRef<HTMLDivElement>(null);
  // Nothing goes back on a read-only board (job 161) or while an old version is shown.
  const readOnly = useAppState(() => appStore.completedReadOnly());
  const untick = (row: CompletedRowData) => {
    // The ticked row goes away: the keyboard stays in the panel, so Ctrl+Z there takes the untick back.
    ref.current?.focus({ preventScroll: true });
    appStore.untickCompleted(row.entry.item.id, row.checklist);
  };
  return (
    <div className="completed-panel" ref={ref} tabIndex={-1}>
      {!days.length ? (
        <p className="completed-empty">Ticked items stay in their list. Press <b>Clean up</b> (in a list or the toolbar) to move them here, grouped by day.</p>
      ) : (
        days.map((g) => (
          <section key={g.date} className="completed-day" aria-label={dayLabel(g.date)}>
            <h3 className="completed-date">{dayLabel(g.date)}</h3>
            {g.rows.map((r) => (
              <CompletedRow key={`${r.checklist ? 'c' : 'b'}:${r.entry.item.id}`} row={r} readOnly={readOnly} onUntick={untick} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

/**
 * One cleaned-up item: untick it to send it back to its list. Its sub-items are shown as they were. The Main
 * checklist's rows are not Find matches here (Find on All boards finds them on that board).
 */
function CompletedRow({ row, readOnly, onUntick }: { row: CompletedRowData; readOnly: boolean; onUntick: (r: CompletedRowData) => void }) {
  const { entry, cardId, checklist } = row;
  const find = checklist ? null : cardId;
  return (
    <div className="completed-entry" data-entry-id={entry.item.id}>
      <div className="completed-row">
        <label className="tick">
          <input
            type="checkbox"
            aria-label={`Send "${entry.item.text}" back to ${checklist ? 'Checklist' : entry.fromTitle || 'its list'}`}
            title="Untick to send it back to its list"
            checked
            disabled={readOnly}
            onChange={() => onUntick(row)}
          />
        </label>
        <CompletedText item={entry.item} find={find} />
        <span className="completed-from">{checklist ? 'Checklist' : entry.fromTitle || 'List'}</span>
      </div>
      <CompletedChildren items={entry.item.children} depth={1} find={find} />
    </div>
  );
}

/** An item's text, as a Find match when `find` names the record it is in. */
function CompletedText({ item, find }: { item: TodoItem; find: string | null }) {
  const key = find && `done:${find}:${item.id}`;
  return (
    <span className="completed-text" data-find={key || undefined} style={styleCss(item.style) as CSSProperties}>
      {key ? <FindMarks find={key} text={item.text} /> : item.text}
    </span>
  );
}

function CompletedChildren({ items, depth, find }: { items: TodoItem[]; depth: number; find: string | null }) {
  return items.map((it) => (
    <div key={it.id}>
      <div className={`completed-row sub${it.done ? ' done' : ''}`} style={{ paddingLeft: depth * ITEM_INDENT }}>
        <input type="checkbox" aria-label={it.text.trim() ? `Done: ${it.text.trim()}` : 'Done'} checked={it.done} disabled />
        <CompletedText item={it} find={find} />
      </div>
      <CompletedChildren items={it.children} depth={depth + 1} find={find} />
    </div>
  ));
}
