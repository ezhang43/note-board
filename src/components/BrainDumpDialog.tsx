import { useEffect, useRef } from 'react';
import { IMPORT_MAX_CARDS } from '../model/importFile';
import { minutesLabel, parseBrainDump } from '../model/brainDump';
import { appStore, useAppState } from '../store/appStore';
import { CloseIcon } from './icons';
import { useCoverBoard } from './textField';

// Brain dump (wow plan, job 3): type or paste one thing per line; the cards they will make are shown as
// you type, and "Add N cards" puts them on the board, selected, as one undo step. Opened from the Add
// group, the ⋯ menu, and on a phone from the + sheet and the ⋯ sheet.

export function BrainDumpDialog() {
  return useAppState((s) => s.ui.brainDumpOpen) ? <Dialog /> : null;
}

function Dialog() {
  // What was typed is kept in the store while the dialog is closed (a stray Escape or tap outside loses nothing),
  // cleared once the cards are added, and never outlives this person's session.
  const text = useAppState((s) => s.ui.brainDumpText);
  const backdrop = useRef<HTMLDivElement>(null);
  useCoverBoard(backdrop);
  const close = appStore.closeBrainDump;

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !e.isComposing && close();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [close]);

  const drafts = parseBrainDump(text);
  const n = drafts.length;
  // If nothing could be added (the board became view-only meanwhile) the dialog still closes and the text is kept.
  const add = () => {
    appStore.addBrainDump(drafts);
    close();
  };

  return (
    <div ref={backdrop} className="shortcuts-backdrop brain-dump-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <section className="shortcuts-panel brain-dump" role="dialog" aria-modal="true" aria-label="Brain dump">
        <header className="shortcuts-header">
          <h2>Brain dump</h2>
          <button type="button" className="icon-button" aria-label="Close" title="Close (Escape)" onClick={close}>
            <CloseIcon />
          </button>
        </header>
        <p className="shortcuts-hint">One thing per line. Start a line with [ ] to make it a checklist. Add a time like 30m or 1h30 if you want.</p>
        <textarea
          className="feedback-text brain-dump-text"
          aria-label="Brain dump text"
          autoFocus
          rows={7}
          value={text}
          placeholder={'Buy milk\n[ ] Pack bag 20m\nWrite report 1h30'}
          onChange={(e) => appStore.setBrainDumpText(e.currentTarget.value)}
        />
        <div className="brain-dump-preview">
          {n === 0 ? (
            <p className="shortcuts-hint">The cards you will get show up here.</p>
          ) : (
            <ul aria-label="Cards to add">
              {drafts.map((d, i) => (
                <li key={i}>
                  <span className="brain-dump-kind">{d.kind === 'todo' ? 'Checklist' : 'Note'}</span>
                  <span className="brain-dump-title">{d.title}</span>
                  {d.minutes !== undefined && <span className="brain-dump-time">{minutesLabel(d.minutes)}</span>}
                </li>
              ))}
            </ul>
          )}
          {n === IMPORT_MAX_CARDS && <p className="shortcuts-hint">{IMPORT_MAX_CARDS} is the most at once. If you pasted more lines than that, the rest is left out.</p>}
          {drafts.some((d) => d.minutes !== undefined) && <p className="shortcuts-hint">Times show here only. They are not saved on the cards yet.</p>}
        </div>
        <div className="confirm-actions">
          <button type="button" className="confirm-cancel" onClick={close}>
            Cancel
          </button>
          <button type="button" className="confirm-send" disabled={n === 0} onClick={add}>
            {n === 1 ? 'Add 1 card' : `Add ${n} cards`}
          </button>
        </div>
      </section>
    </div>
  );
}
