import { useEffect, useRef, useState } from 'react';
import { canChangeSeries, emailGuests, type CalEvent, type Draft } from '../../model/calendar';
import { calendar, type Choice } from '../../store/calendar';

/**
 * The questions asked before saving or deleting (job #85): "which events?" for one of a repeating
 * series, then "Send update emails to guests?" when there are guests. A one-off event is deleted
 * without asking (owner request, 2026-10-24, job #209); its Undo message brings it back (job 217).
 */
export type Ask = { action: 'save' | 'delete'; step: 'which' | 'emails'; all?: boolean };
export type Next = (action: Ask['action'], d: Draft, choice: Choice, step: 'start' | Ask['step']) => void;

/** Saving or deleting an event, asking first: used by the change form and the event's card alike. */
export function useChange(event: CalEvent | null, onDone: () => void) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // "All events in the series" waits for Google with the form open, so its Save says Saving… (one event is shown at once).
  const [saving, setSaving] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);

  async function run(waits: boolean, action: () => Promise<string | null>) {
    setBusy(true);
    setSaving(waits);
    const problem = await action();
    setBusy(false);
    setSaving(false);
    if (problem) setNote(problem);
    else onDone();
  }

  /** Asks the next question, or saves / deletes with the answers given. */
  const next: Next = (action, d, choice, step) => {
    if (step === 'start' && event?.series) return setAsk({ action, step: 'which' });
    if (step !== 'emails' && emailGuests(event, action === 'save' ? d : null)) return setAsk({ action, step: 'emails', all: choice.all });
    setAsk(null);
    const waits = action === 'save' && choice.all === true && !!event?.series;
    void run(waits, () => (action === 'save' ? calendar.save(event, d, choice) : calendar.remove(event!.id, choice)));
  };

  return { note, setNote, busy, saving, ask, setAsk, next };
}

/** The question open before a save or delete goes ahead: which events, then whether to email the guests. */
export function Question({ event, draft, ask, repeatChanged = false, next, onCancel }: { event: CalEvent | null; draft: Draft; ask: Ask; repeatChanged?: boolean; next: Next; onCancel: () => void }) {
  const seriesOk = canChangeSeries(event, draft);
  const title = ask.step === 'emails' ? 'Send update emails to guests?' : ask.action === 'save' ? 'Save changes to which events?' : `Delete “${event?.title}”?`;
  const pick = (all: boolean) => () => next(ask.action, draft, { all }, 'which');
  // A series' delete question takes the keyboard itself, not a delete button, so a held Enter's auto-repeat
  // (from the trash or the form's Delete) can't delete "Only this event" (job #209). Tab reaches the buttons.
  const pair = ask.step === 'which' && ask.action === 'delete';
  const seriesOnly = ask.step === 'which' && ask.action === 'save' && repeatChanged;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pair) box.current?.focus();
  }, [pair]);
  return (
    <div
      ref={box}
      className="confirm cal-confirm"
      role="alertdialog"
      aria-label={title}
      tabIndex={pair ? -1 : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <div className="confirm-title">{title}</div>
      {ask.step === 'which' && ask.action === 'save' && !seriesOk && <p className="history-note">Moving it to another day, or to or from all day, changes only this event.</p>}
      {seriesOnly && seriesOk && <p className="history-note">Changing how it repeats updates all events in the series.</p>}
      <div className={pair ? 'confirm-actions cal-pair' : 'confirm-actions'}>
        {ask.step === 'emails' ? (
          <>
            <button type="button" className="confirm-cancel" onClick={() => next(ask.action, draft, { all: ask.all, notify: false }, 'emails')}>
              Don’t send
            </button>
            <button type="button" className="confirm-send" autoFocus onClick={() => next(ask.action, draft, { all: ask.all, notify: true }, 'emails')}>
              Send
            </button>
          </>
        ) : (
          // Only a series is asked which (job #209). Deleting has no Keep: Escape, × or a click outside keep it.
          <>
            {ask.action === 'save' && (
              <button type="button" className="confirm-cancel" onClick={onCancel}>
                Cancel
              </button>
            )}
            {!seriesOnly && (
              <button type="button" className={ask.action === 'delete' ? 'confirm-delete' : 'confirm-send'} autoFocus={!pair} onClick={pick(false)}>
                Only this event
              </button>
            )}
            {(ask.action === 'delete' || seriesOk) && (
              <button type="button" className={ask.action === 'delete' ? 'confirm-delete' : 'confirm-send'} autoFocus={seriesOnly} onClick={pick(true)}>
                All events in the series
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
