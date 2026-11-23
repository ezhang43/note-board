import { useEffect, useRef, useState } from 'react';
import {
  draftFor,
  endTimeOptions,
  isEmail,
  moveDraftStart,
  moveDraftStartTime,
  startTimeOptions,
  validateDraft,
  withGuest,
  type CalEvent,
  type DayKey,
  type Draft,
} from '../../model/calendar';
import { titleTime } from '../../model/calendarTitleTime';
import { parseRecurrence, sameRepeat, validateRepeat, type Repeat } from '../../model/calendarRepeat';
import { appStore } from '../../store/appStore';
import { BAD_EMAIL, calendar } from '../../store/calendar';
import { CloseIcon } from '../icons';
import { keyboardCover } from '../ItemBar';
import { panelCovers } from '../textField';
import { TimePicker, closeTimeList } from '../TimePicker';
import { usePhone } from '../usePhone';
import { Question, useChange } from './Question';
import { RepeatField } from './RepeatField';
import { useCardPlace } from './shared';

const START_TIMES = startTimeOptions();

/** Phone: how much of the bottom of the window the on-screen keyboard covers, so the sheet sits above it (0 with no keyboard up). */
function useKeyboardCover(phone: boolean) {
  const [cover, setCover] = useState(0);
  useEffect(() => {
    const v = window.visualViewport;
    if (!phone || !v) return;
    const update = () => setCover(keyboardCover());
    v.addEventListener('resize', update);
    v.addEventListener('scroll', update);
    return () => {
      v.removeEventListener('resize', update);
      v.removeEventListener('scroll', update);
    };
  }, [phone]);
  return phone ? cover : 0;
}

/**
 * Adding (`event` null) or changing one of the person's own events; Delete asks only for a series or
 * guests (job #209). An overlay like the event card (owner request, 2026-10-24, job 211), opened from
 * `opener`, with the list still in view: adding starts as a small quick-add (title, day, times, All day), "More options" opens the
 * full form with what was typed kept; changing opens the full form straight away. Escape, × or a
 * click outside close it without saving; saving or deleting closes it.
 */
export function EventForm({ event, start, opener, onClose }: { event: CalEvent | null; start: Draft; opener: HTMLElement; onClose: () => void }) {
  const [draft, setDraft] = useState(start);
  const [guest, setGuest] = useState('');
  const [more, setMore] = useState(event !== null);
  const [seriesRepeat, setSeriesRepeat] = useState<{ status: 'loading' | 'ready' | 'error'; initial: Repeat; anchor: DayKey }>(() =>
    event?.series ? { status: 'loading', initial: { kind: 'none' }, anchor: start.startDate } : { status: 'ready', initial: { kind: 'none' }, anchor: start.startDate },
  );
  const ref = useRef<HTMLFormElement>(null);
  const title = useRef<HTMLInputElement>(null);
  const phone = usePhone();
  const cover = useKeyboardCover(phone);
  // Load the series' repeat rule when editing an existing repeating event (anchored to the series' own first day).
  useEffect(() => {
    if (!event?.series) return;
    let alive = true;
    void calendar.getSeries(event.series).then((series) => {
      if (!alive) return;
      if (!series) return setSeriesRepeat({ status: 'error', initial: { kind: 'none' }, anchor: start.startDate });
      const anchor = draftFor(series).startDate;
      const parsed = parseRecurrence(series.recurrence, anchor);
      setSeriesRepeat({ status: 'ready', initial: parsed, anchor });
      setDraft((d) => (d.repeat === undefined ? { ...d, repeat: parsed } : d));
    });
    return () => {
      alive = false;
    };
  }, [event?.series, start.startDate]);
  // Focus goes back to the button it came from (the panel when that is gone, after a change moved the event).
  const finish = () => {
    (opener.isConnected ? opener : document.querySelector<HTMLElement>('.side-panel'))?.focus();
    onClose();
  };
  const { note, setNote, busy, saving, ask, setAsk, next } = useChange(event, finish);
  const change = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const endTimes = endTimeOptions(draft.startTime, draft.endDate === draft.startDate);
  const cancel = () => {
    setAsk(null);
    ref.current?.focus();
  };
  const repeatAnchor = event?.series && seriesRepeat.status === 'ready' ? seriesRepeat.anchor : draft.startDate;
  const currentRepeat: Repeat = draft.repeat ?? seriesRepeat.initial;
  const repeatChanged =
    Boolean(event?.series) &&
    seriesRepeat.status === 'ready' &&
    seriesRepeat.initial.kind !== 'unsupported' &&
    draft.repeat !== undefined &&
    !sameRepeat(seriesRepeat.initial, draft.repeat, repeatAnchor, start.allDay);
  const repeatUnit = currentRepeat.kind === 'custom' ? currentRepeat.rule.unit : '';
  const place = useCardPlace(ref, opener, [more, ask, note, draft.allDay, draft.guests.length, seriesRepeat.status, currentRepeat.kind, repeatUnit]);

  // Escape closes it (first the question, if one is open), wherever the keyboard is, even in the title
  // (capture and stopImmediatePropagation, as for the card: the board's shortcuts and the panel's own Escape never see it).
  // While a change to all of a series is on its way it stays, so Google's answer (or refusal) can show in it.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const { shortcutsOpen, confirm, deleteCompleted } = appStore.getState().ui;
      if (e.key !== 'Escape' || shortcutsOpen || confirm || deleteCompleted || panelCovers()) return;
      e.stopImmediatePropagation();
      // An open time list takes this Escape; the form stays.
      if (closeTimeList() || busy) return;
      if (ask) cancel();
      else finish();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });
  // A click or tap anywhere else closes it, as for the card, except on the panel's resize strip (so the
  // overlay can follow the edge). Nothing typed is asked about: it closes, as Google Calendar's does.
  // While a change to all of a series is on its way, clicks elsewhere in the panel wait too.
  useEffect(() => {
    const outside = (t: EventTarget | null) => t instanceof Node && !ref.current?.contains(t);
    const down = (e: PointerEvent) => {
      if (!busy && outside(e.target) && !(e.target instanceof Element && e.target.closest('.panel-resize, .time-list'))) onClose();
    };
    const click = (e: MouseEvent) => {
      if (busy && outside(e.target) && e.target instanceof Element && e.target.closest('.side-panel')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('click', click, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('click', click, true);
    };
  });

  /** Adds the guest typed in: the draft with it, or null (and a note) when it isn't an email address. */
  function addGuest(): Draft | null {
    const email = guest.trim();
    if (!email) return draft;
    if (!isEmail(email)) {
      setNote(BAD_EMAIL);
      return null;
    }
    const next = { ...draft, guests: withGuest(event, draft.guests, email) };
    setDraft(next);
    setGuest('');
    setNote(null);
    return next;
  }

  const allDayField = (
    <label className="cal-check">
      <input type="checkbox" checked={draft.allDay} onChange={(e) => change({ allDay: e.currentTarget.checked })} />
      All day
    </label>
  );
  const startDateInput = <input type="date" aria-label="Start date" value={draft.startDate} onChange={(e) => setDraft(moveDraftStart(draft, e.currentTarget.value))} />;
  const startTimePicker = <TimePicker label="Start time" value={draft.startTime} options={START_TIMES} onChange={(t) => setDraft(moveDraftStartTime(draft, t))} />;
  const endTimePicker = <TimePicker label="End time" value={draft.endTime} options={endTimes} onChange={(t) => change({ endTime: t })} />;
  const repeatField = (
    <RepeatField
      repeat={currentRepeat}
      status={seriesRepeat.status}
      startDate={repeatAnchor}
      labelled={more}
      onChange={(repeat) => {
        setNote(null);
        change({ repeat });
      }}
    />
  );

  return (
    <form
      ref={ref}
      className={`cal-card cal-form${more ? ' more' : ''}`}
      aria-label={event ? 'Change event' : 'New event'}
      noValidate
      tabIndex={-1}
      style={phone && cover ? { bottom: cover, maxHeight: (window.visualViewport?.height ?? 0) - 16 } : place}
      onSubmit={(e) => {
        e.preventDefault();
        const typed = addGuest();
        if (!typed) return;
        // A time typed in the title ("Dinner 8pm") becomes the start, and leaves the title (owner request, 2026-11-22):
        // only when the title was changed in this form, so an old name holding a time never moves the event. The form
        // keeps what was typed, so a Save again after a question's Cancel saves the same.
        const d = typed.title === start.title ? typed : titleTime(typed);
        // Wrong times or repeat settings are said before any question (repeat is validated only when it will be saved).
        const problem = validateDraft(d, { event, repeatChanged, repeatAnchor, validateRepeat });
        if (problem) return setNote(problem);
        setNote(null);
        next('save', d, {}, 'start');
      }}
    >
      <div className="cal-card-head">
        <h3 className="cal-detail-title">{event ? 'Change event' : 'New event'}</h3>
        <button type="button" className="icon-button" aria-label="Close" title="Close" disabled={busy} onClick={finish}>
          <CloseIcon />
        </button>
      </div>
      {/* Locked while a question is open, so the answer goes with what was asked about. */}
      <fieldset className="cal-fields" disabled={ask !== null}>
        <label className="cal-field">
          {more && <span>Title</span>}
          <input ref={title} type="text" aria-label="Title" autoFocus placeholder="(No title)" value={draft.title} onChange={(e) => change({ title: e.currentTarget.value })} />
        </label>
        {more ? (
          <>
            {allDayField}
            <div className="cal-field">
              <span>Starts</span>
              <div className="cal-when">
                {startDateInput}
                {!draft.allDay && startTimePicker}
              </div>
            </div>
            <div className="cal-field">
              <span>Ends</span>
              <div className="cal-when">
                <input type="date" aria-label="End date" value={draft.endDate} onChange={(e) => change({ endDate: e.currentTarget.value })} />
                {!draft.allDay && endTimePicker}
              </div>
            </div>
            {repeatField}
            <div className="cal-field">
              <span>Guests</span>
              {draft.guests.length > 0 && (
                <ul className="cal-guests">
                  {draft.guests.map((g) => (
                    <li key={g}>
                      <span className="cal-guest">{g}</span>
                      <button type="button" className="icon-button" aria-label={`Remove guest ${g}`} title="Remove guest" onClick={() => change({ guests: draft.guests.filter((x) => x !== g) })}>
                        <CloseIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="cal-when">
                <input
                  type="email"
                  aria-label="Guest email"
                  placeholder="Add a guest by email"
                  value={guest}
                  onChange={(e) => setGuest(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    // Enter adds the guest rather than saving.
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    addGuest();
                  }}
                />
                <button type="button" className="tb-button" aria-label="Add guest" onClick={addGuest}>
                  Add
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="cal-field">{startDateInput}</div>
            {!draft.allDay && (
              <div className="cal-field">
                <div className="cal-when cal-times">
                  {startTimePicker}
                  <span aria-hidden="true">–</span>
                  {endTimePicker}
                </div>
              </div>
            )}
            {allDayField}
            {repeatField}
          </>
        )}
        {note && (
          <p className="cal-error" role="status">
            {note}
          </p>
        )}
        <div className="cal-actions">
          <button type="submit" className="tb-button cal-save" disabled={busy}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {more ? (
            <button type="button" className="tb-button" onClick={finish}>
              Cancel
            </button>
          ) : (
            <button
              type="button"
              className="tb-button"
              onClick={() => {
                setMore(true);
                title.current?.focus();
              }}
            >
              More options
            </button>
          )}
          {event && (
            <button type="button" className="tb-button cal-delete" disabled={busy} onClick={() => next('delete', draft, {}, 'start')}>
              Delete
            </button>
          )}
        </div>
      </fieldset>
      {ask && <Question event={event} draft={draft} ask={ask} repeatChanged={repeatChanged} next={next} onCancel={cancel} />}
    </form>
  );
}
