import { useEffect, useRef } from 'react';
import { draftFor, type CalEvent } from '../../model/calendar';
import { whenLabel } from '../../model/eventCard';
import { appStore } from '../../store/appStore';
import { calendar } from '../../store/calendar';
import { useEscapeLayer, useOutsidePointerDown } from '../escapeLayer';
import { CloseIcon, ExternalIcon, PencilIcon, TrashIcon } from '../icons';
import { isTextField, panelCovers } from '../textField';
import { Question, useChange } from './Question';
import { useCardPlace } from './shared';

/**
 * The small card a clicked event opens, as in Google Calendar (owner request, 2026-10-19, job #108):
 * beside the event with the list still in view (a sheet from the bottom on a phone). The pencil opens
 * the change form, the trash deletes (as the form's Delete does: a one-off at once, a series after
 * asking which, job #209), and so do Delete and Backspace; pressed again, they answer a series' question
 * with all of it. Others' events, and Google's special kinds, show without pencil and trash.
 */
export function EventCard({ event, sending, opener, onClose, onEdit }: { event: CalEvent; sending: boolean; opener: HTMLElement; onClose: () => void; onEdit: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const draft = draftFor(event);
  // Gone (another event's card opened, or the panel closed) before Google answered: nothing to close or focus.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // Deleted: the keyboard goes to the panel, as the event's button is gone. The card may already be
  // gone too (its button left the page first), so only a keyboard left with nowhere to be moves.
  const { note, busy, ask, setAsk, next } = useChange(event, () => {
    if (alive.current) onClose();
    if (document.activeElement === document.body) document.querySelector<HTMLElement>('.side-panel')?.focus();
  });
  const remove = () => next('delete', draft, {}, 'start');
  const close = () => {
    onClose();
    if (opener.isConnected) opener.focus();
  };
  const cancel = () => {
    setAsk(null);
    ref.current?.focus();
  };
  const place = useCardPlace(ref, opener, [ask, note]);

  // preventScroll: the first focus can come before the card has its place.
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  // Escape closes the card (or its open question first), except while a series delete is on its way.
  useEscapeLayer(true, (e) => {
    if (isTextField(e.target)) return false;
    if (busy) return true;
    if (ask) cancel();
    else close();
    return true;
  });
  // Delete, E, Enter, Ctrl+D and blocked calendar keys belong to the card while it is open (capture: before
  // the board's own shortcuts, so a block selected on the board is never deleted behind it).
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const { shortcutsOpen, confirm, deleteCompleted } = appStore.getState().ui;
    if (shortcutsOpen || confirm || deleteCompleted || panelCovers() || isTextField(e.target)) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      // Only a fresh press: a held key's auto-repeat never deletes or answers.
      if (!event.editable || busy || sending || e.repeat) return;
      if (!ask) remove();
      // A fresh second press answers a series' "Delete?" with all of it (job #132). Never the guest-email question.
      else if (ask.action === 'delete' && ask.step === 'which') next('delete', draft, { all: true }, 'which');
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key.toLowerCase() === 'e' || (e.key === 'Enter' && !(e.target instanceof Element && e.target.closest('button, a'))))) {
      // E, or Enter on the card itself (a button keeps its own Enter), edits it as the pencil does (owner request 2026-11-17).
      if (!event.editable || busy || sending || ask || e.repeat) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onEdit();
    } else if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'd') {
      // Ctrl+D: a copy at the same time, without its guests, so no one is invited unasked (owner request 2026-11-17).
      // Never the board's duplicate or the browser's bookmark behind the card.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!event.editable || busy || sending || ask || e.repeat) return;
      void calendar.copy(event.id);
      close();
    } else if ((busy || ask) && !e.ctrlKey && !e.metaKey && !e.altKey && ['n', 't', 'ArrowLeft', 'ArrowRight'].includes(e.key.length === 1 ? e.key.toLowerCase() : e.key)) {
      // N, T, ← and → wait while its question is open or a series delete is on its way (they would close the card).
      e.stopImmediatePropagation();
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);
  // A click or tap anywhere else closes it, except on the panel's resize strip, so the card can follow
  // the edge, and on its own event's button, whose click edits it (job #131).
  useOutsidePointerDown(!busy, ref, onClose, (t) => t?.closest('[data-event]')?.getAttribute('data-event') === event.id || Boolean(t?.closest('.panel-resize')));
  // While all of a series is being deleted, clicks elsewhere in the panel (another event, another
  // week, the panel's ×) wait too, so the card stays to show Google's answer.
  useEffect(() => {
    if (!busy) return;
    const click = (e: MouseEvent) => {
      if (e.target instanceof Node && !ref.current?.contains(e.target) && e.target instanceof Element && e.target.closest('.side-panel')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('click', click, true);
    return () => document.removeEventListener('click', click, true);
  }, [busy]);

  return (
    <div ref={ref} className="cal-card" role="dialog" aria-label={event.title} tabIndex={-1} style={place}>
      <div className="cal-card-tools">
        {event.editable && (
          <>
            {/* Not while an earlier change to it is still on its way to Google (owner request 2026-11-17). */}
            <button type="button" className="icon-button" aria-label="Edit event" title="Edit event" disabled={busy || sending || ask !== null} onClick={onEdit}>
              <PencilIcon />
            </button>
            <button type="button" className="icon-button" aria-label="Delete event" title="Delete event" disabled={busy || sending || ask !== null} onClick={remove}>
              <TrashIcon />
            </button>
          </>
        )}
        <button type="button" className="icon-button" aria-label="Close" title="Close" disabled={busy} onClick={close}>
          <CloseIcon />
        </button>
      </div>
      <h3 className="cal-detail-title">{event.title}</h3>
      <p className="cal-detail-when">{whenLabel(event)}</p>
      {draft.guests.length > 0 && (
        <ul className="cal-guests" aria-label="Guests">
          {draft.guests.map((g) => (
            <li key={g}>
              <span className="cal-guest">{g}</span>
            </li>
          ))}
        </ul>
      )}
      {!event.editable && (
        <>
          <p className="history-note">Events from others, events with their own reminders, and Google’s special kinds (like Out of office) can only be changed in Google Calendar.</p>
          <a className="tb-button cal-open" href={event.link} target="_blank" rel="noopener noreferrer">
            <ExternalIcon />
            Open in Google Calendar
          </a>
        </>
      )}
      {note && (
        <p className="cal-error" role="status">
          {note}
        </p>
      )}
      {ask && <Question event={event} draft={draft} ask={ask} next={next} onCancel={cancel} />}
    </div>
  );
}
