import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { journalEntries } from '../model/journal';
import { appStore, useAppState } from '../store/appStore';
import { GrowTextarea } from './GrowTextarea';

/**
 * The Journal side panel (owner request, 2026-10-18): the dated notes on the Journal board, newest
 * day first, each one's text ready to edit. Today's note gets the cursor when the panel opens.
 * Typing goes through the store like typing on the board, so it is saved and undoable.
 */
export function JournalPanel() {
  const board = useAppState((s) => {
    const id = s.ui.journalBoard;
    if (!id) return undefined;
    return id === s.boards.open ? s.board : s.boards.others[id];
  });
  const entries = useMemo(() => (board ? journalEntries(board) : []), [board]);
  const root = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLTextAreaElement>(null);
  /** The entry being typed in, so the panel keeps the keyboard if undo takes that entry away. */
  const typing = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = first.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useLayoutEffect(() => {
    if (typing.current && !typing.current.isConnected) {
      typing.current = null;
      root.current?.focus();
    }
  });

  return (
    <div className="journal-panel" tabIndex={-1} ref={root}>
      {entries.map((e, i) => (
        <section key={e.id} className="journal-entry">
          <h3>{e.date}</h3>
          <GrowTextarea
            ref={i === 0 ? first : undefined}
            value={e.body}
            onChange={(v) => appStore.setJournalText(e.id, v)}
            aria-label={`Journal, ${e.date}`}
            onFocus={(ev) => (typing.current = ev.currentTarget)}
            onBlur={(ev) => {
              const el = ev.currentTarget;
              // After a blur caused by the entry going away, `typing` still names it (see above).
              queueMicrotask(() => {
                if (el.isConnected && typing.current === el) typing.current = null;
              });
            }}
            onKeyDown={(ev) => {
              // Escape leaves the text (a second Escape closes the panel), as on the board.
              if (ev.key === 'Escape') root.current?.focus();
            }}
          />
        </section>
      ))}
    </div>
  );
}
