import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  canChangeSeries,
  cellLines,
  cellTime,
  dayKey,
  dayLabel,
  draftBody,
  draftFor,
  emailGuests,
  eventsOnDay,
  isEmail,
  monthGrid,
  moveDraftStart,
  newDraft,
  clampPanelWidth,
  PANEL_MIN,
  PANEL_STEP,
  rangeLabel,
  timeLabel,
  weekDays,
  withGuest,
  type CalEvent,
  type DayKey,
  type Draft,
} from '../model/calendar';
import { appStore, useAppState } from '../store/appStore';
import { BAD_EMAIL, BAD_TIMES, calendar, useCalendar, type Choice } from '../store/calendar';
import { CalendarDaysIcon, CloseIcon, ExternalIcon, PlusIcon } from './icons';

// Google Calendar side panel (owner request, 2026-10-06): the signed-in person's primary calendar,
// a week or a month, beside the board. The person's own events can be added, moved, renamed and
// deleted, with their guests, one or all of a repeating series (job #85); the rest open in Google Calendar. Calendar events aren't board data: no undo, not in Version history.

/**
 * Opens the panel: a round button by the zoom control (the toolbar is full at 1280px), a line in ⋯
 * on a phone. Only there for someone signed in (or a demo person, locally).
 */
export function CalendarButton({ labelled = false, onOpen }: { labelled?: boolean; onOpen?: () => void }) {
  const open = useAppState((s) => s.ui.sidePanel === 'calendar');
  // Google's sign-in script, loaded ahead so the click can open its window straight away.
  useEffect(() => calendar.prepare(), []);
  if (!calendar.available) return null;
  return (
    <button
      type="button"
      className={labelled ? 'tb-button' : 'help-button dock-tool'}
      aria-label="Google Calendar"
      title="Google Calendar"
      aria-pressed={open}
      onClick={() => {
        // Straight from the click, so Google's window asking for calendar access isn't blocked.
        if (!open) void calendar.open();
        appStore.toggleSidePanel('calendar');
        onOpen?.();
      }}
    >
      <CalendarDaysIcon />
      {labelled ? 'Google Calendar' : 'Calendar'}
    </button>
  );
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** What the side panel shows for Google Calendar. */
export function CalendarPanel() {
  const s = useCalendar();
  const [editing, setEditing] = useState<{ event: CalEvent | null; draft: Draft } | null>(null);
  const [viewing, setViewing] = useState<CalEvent | null>(null);
  // Set when a day is picked in the Month grid: its list sits under the grid, so it is scrolled into view (job #56).
  const reveal = useRef(false);
  const today = dayKey(new Date());
  const unit = s.view === 'week' ? 'week' : 'month';

  if (editing) return <EventForm event={editing.event} start={editing.draft} onDone={() => setEditing(null)} />;
  if (viewing) return <ReadOnlyEvent event={viewing} onBack={() => setViewing(null)} />;

  const pick = (e: CalEvent) => (e.editable ? setEditing({ event: e, draft: draftFor(e) }) : setViewing(e));
  const dayList = (day: DayKey) => (
    <DayEvents key={day} day={day} today={day === today} events={s.events ?? []} reveal={reveal} onPick={pick} onAdd={() => setEditing({ event: null, draft: newDraft(day) })} />
  );

  return (
    <div className="cal">
      <div className="cal-bar">
        <div className="cal-views" role="group" aria-label="Show">
          <button type="button" className="tb-button" aria-pressed={s.view === 'week'} onClick={() => void calendar.setView('week')}>
            Week
          </button>
          <button type="button" className="tb-button" aria-pressed={s.view === 'month'} onClick={() => void calendar.setView('month')}>
            Month
          </button>
        </div>
        <button type="button" className="tb-button" onClick={() => void calendar.goToday()}>
          Today
        </button>
      </div>
      <div className="cal-bar">
        <button type="button" className="icon-button cal-step" aria-label={`Previous ${unit}`} title={`Previous ${unit}`} onClick={() => void calendar.step(-1)}>
          ‹
        </button>
        <h3 className="cal-range" aria-live="polite">
          {rangeLabel(s.view, s.day)}
        </h3>
        <button type="button" className="icon-button cal-step" aria-label={`Next ${unit}`} title={`Next ${unit}`} onClick={() => void calendar.step(1)}>
          ›
        </button>
      </div>

      {s.note ? (
        <div className="cal-note" role="status">
          <p className="history-note">{s.note}</p>
          {/* Straight from the click, so Google's window isn't blocked. */}
          <button type="button" className={`tb-button${s.needsAccess ? ' cal-connect' : ''}`} onClick={() => void calendar.load()}>
            {s.needsAccess ? 'Connect Google Calendar' : 'Try again'}
          </button>
        </div>
      ) : (
        s.events === null && <p className="history-note">Loading…</p>
      )}

      {s.events !== null &&
        (s.view === 'week' ? (
          weekDays(s.day).map(dayList)
        ) : (
          <>
            <MonthGrid day={s.day} today={today} events={s.events} reveal={reveal} onPick={pick} />
            {dayList(s.day)}
          </>
        ))}
    </div>
  );
}

function DayEvents({
  day,
  today,
  events,
  reveal,
  onPick,
  onAdd,
}: {
  day: DayKey;
  today: boolean;
  events: CalEvent[];
  reveal: RefObject<boolean>;
  onPick: (e: CalEvent) => void;
  onAdd: () => void;
}) {
  const label = dayLabel(day);
  const list = eventsOnDay(events, day);
  const section = useRef<HTMLElement>(null);
  // Picking a day in the Month grid shows its list (under the grid, maybe below the visible part of the panel).
  useEffect(() => {
    if (!reveal.current) return;
    reveal.current = false;
    section.current?.scrollIntoView({ block: 'nearest' });
  });
  return (
    <section ref={section} className={`cal-day${today ? ' today' : ''}`} aria-label={label}>
      <h3>
        {label}
        {today && <span className="cal-today">· Today</span>}
        <button type="button" className="icon-button cal-add" aria-label={`Add event on ${label}`} title="Add an event" onClick={onAdd}>
          <PlusIcon />
        </button>
      </h3>
      {list.map((e) => (
        <button
          key={e.id}
          type="button"
          className={`cal-event${e.editable ? '' : ' read-only'}`}
          aria-label={`${timeLabel(e)} ${e.title}${e.editable ? '' : ', read-only'}`}
          onClick={() => onPick(e)}
        >
          <span className="cal-time">{timeLabel(e)}</span>
          <span className="cal-title">{e.title}</span>
          {!e.editable && <ExternalIcon />}
        </button>
      ))}
    </section>
  );
}

/** Cells under this width keep two lines, names only: a time leaves no room for the name. */
const NARROW_CELL = 70;

function MonthGrid({ day, today, events, reveal, onPick }: { day: DayKey; today: DayKey; events: CalEvent[]; reveal: RefObject<boolean>; onPick: (e: CalEvent) => void }) {
  const month = day.slice(0, 7);
  const [narrow, setNarrow] = useState(true);
  const [grid, setGrid] = useState<HTMLDivElement | null>(null);
  // Measured before the first paint, so a wide grid doesn't first show two lines.
  useLayoutEffect(() => {
    if (!grid) return;
    const measure = () => setNarrow(grid.clientWidth / 7 < NARROW_CELL);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(grid);
    return () => watch.disconnect();
  }, [grid]);
  return (
    <div ref={setGrid} className={`cal-month${narrow ? ' narrow' : ''}`} role="grid" aria-label={rangeLabel('month', day)}>
      <div role="row" className="cal-row">
        {WEEKDAYS.map((d) => (
          <span key={d} role="columnheader" className="cal-weekday">
            {d}
          </span>
        ))}
      </div>
      {monthGrid(day).map((week) => (
        <div key={week[0]} role="row" className="cal-row">
          {week.map((d) => {
            const list = eventsOnDay(events, d);
            const { shown, more } = cellLines(list, narrow ? 2 : 3);
            const count = list.length;
            const name = `${dayLabel(d)}${count ? `, ${count} ${count === 1 ? 'event' : 'events'}` : ''}`;
            const classes = ['cal-cell', d.slice(0, 7) !== month && 'outside', d === today && 'today'].filter(Boolean).join(' ');
            const pickDay = () => {
              reveal.current = true;
              void calendar.pickDay(d);
            };
            return (
              // The whole cell picks its day; the date is the button for the keyboard (buttons can't hold the event buttons).
              <div key={d} role="gridcell" className={classes} aria-selected={d === day} aria-label={name} onClick={pickDay}>
                <button type="button" className="cal-date" aria-label={`Show ${dayLabel(d)}`} onClick={(e) => (e.stopPropagation(), pickDay())}>
                  {Number(d.slice(8))}
                </button>
                {shown.map((e) => {
                  const time = cellTime(e, d);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      className={`cal-chip${e.allDay ? ' all-day' : ''}${e.editable ? '' : ' read-only'}`}
                      aria-label={`${timeLabel(e)} ${e.title}${e.editable ? '' : ', read-only'}`}
                      title={`${time && `${time} `}${e.title}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onPick(e);
                      }}
                    >
                      {!e.allDay && <span className="cal-chip-dot" aria-hidden="true" />}
                      {time && <span className="cal-chip-time">{time}</span>}
                      <span className="cal-chip-title">{e.title}</span>
                    </button>
                  );
                })}
                {more > 0 && (
                  <button type="button" className="cal-more" onClick={(e) => (e.stopPropagation(), pickDay())}>
                    +{more} more
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Others' events, events with reminders of their own or of Google's special kinds: shown, and changed in Google Calendar. */
function ReadOnlyEvent({ event, onBack }: { event: CalEvent; onBack: () => void }) {
  return (
    <div className="cal cal-detail">
      <h3 className="cal-detail-title">{event.title}</h3>
      <p className="cal-detail-when">
        {event.allDay ? dayLabel(event.start) : dayLabel(event.start.slice(0, 10))} · {timeLabel(event)}
      </p>
      <p className="history-note">Events from others, events with their own reminders, and Google’s special kinds (like Out of office) can only be changed in Google Calendar.</p>
      <a className="tb-button cal-open" href={event.link} target="_blank" rel="noopener noreferrer">
        <ExternalIcon />
        Open in Google Calendar
      </a>
      <button type="button" className="tb-button" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

/**
 * The questions asked before saving or deleting (job #85): "which events?" for one of a repeating
 * series (and "Delete?" for any event), then "Send update emails to guests?" when there are guests.
 */
type Ask = { action: 'save' | 'delete'; step: 'which' | 'emails'; all?: boolean };

/** Adding (`event` null) or changing one of the person's own events; Delete asks first. */
function EventForm({ event, start, onDone }: { event: CalEvent | null; start: Draft; onDone: () => void }) {
  const [draft, setDraft] = useState(start);
  const [guest, setGuest] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const change = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const seriesOk = canChangeSeries(event, draft);

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    const problem = await action();
    setBusy(false);
    if (problem) setNote(problem);
    else onDone();
  }

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

  /** Asks the next question, or saves / deletes with the answers given. */
  function next(action: Ask['action'], d: Draft, choice: Choice, step: 'start' | Ask['step']) {
    if (step === 'start' && (action === 'delete' || event?.series)) return setAsk({ action, step: 'which' });
    if (step !== 'emails' && emailGuests(event, action === 'save' ? d : null)) return setAsk({ action, step: 'emails', all: choice.all });
    setAsk(null);
    void run(() => (action === 'save' ? calendar.save(event?.id ?? null, d, choice) : calendar.remove(event!.id, choice)));
  }

  const title = !ask ? '' : ask.step === 'emails' ? 'Send update emails to guests?' : ask.action === 'save' ? 'Save changes to which events?' : `Delete “${event?.title}”?`;
  const pick = (all: boolean) => () => ask && next(ask.action, draft, { all }, 'which');

  return (
    <form
      className="cal cal-form"
      aria-label={event ? 'Change event' : 'New event'}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const d = addGuest();
        if (!d) return;
        // Wrong times are said before any question.
        if (!draftBody(d, 'UTC')) return setNote(BAD_TIMES);
        next('save', d, {}, 'start');
      }}
    >
      <h3 className="cal-detail-title">{event ? 'Change event' : 'New event'}</h3>
      {/* Locked while a question is open, so the answer goes with what was asked about. */}
      <fieldset className="cal-fields" disabled={ask !== null}>
        <label className="cal-field">
          <span>Title</span>
          <input type="text" aria-label="Title" autoFocus placeholder="(No title)" value={draft.title} onChange={(e) => change({ title: e.currentTarget.value })} />
        </label>
        <label className="cal-check">
          <input type="checkbox" checked={draft.allDay} onChange={(e) => change({ allDay: e.currentTarget.checked })} />
          All day
        </label>
        <div className="cal-field">
          <span>Starts</span>
          <div className="cal-when">
            <input type="date" aria-label="Start date" value={draft.startDate} onChange={(e) => setDraft(moveDraftStart(draft, e.currentTarget.value))} />
            {!draft.allDay && <input type="time" aria-label="Start time" value={draft.startTime} onChange={(e) => change({ startTime: e.currentTarget.value })} />}
          </div>
        </div>
        <div className="cal-field">
          <span>Ends</span>
          <div className="cal-when">
            <input type="date" aria-label="End date" value={draft.endDate} onChange={(e) => change({ endDate: e.currentTarget.value })} />
            {!draft.allDay && <input type="time" aria-label="End time" value={draft.endTime} onChange={(e) => change({ endTime: e.currentTarget.value })} />}
          </div>
        </div>
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
        {note && (
          <p className="cal-error" role="status">
            {note}
          </p>
        )}
        <div className="cal-actions">
          <button type="submit" className="tb-button cal-save" disabled={busy}>
            Save
          </button>
          <button type="button" className="tb-button" onClick={onDone}>
            Cancel
          </button>
          {event && (
            <button type="button" className="tb-button cal-delete" disabled={busy} onClick={() => next('delete', draft, {}, 'start')}>
              Delete
            </button>
          )}
        </div>
      </fieldset>
      {ask && (
        <div
          className="confirm cal-confirm"
          role="alertdialog"
          aria-label={title}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setAsk(null);
          }}
        >
          <div className="confirm-title">{title}</div>
          {ask.step === 'which' && ask.action === 'save' && !seriesOk && <p className="history-note">Moving it to another day, or to or from all day, changes only this event.</p>}
          <div className="confirm-actions">
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
              <>
                <button type="button" className="confirm-cancel" autoFocus={ask.action === 'delete'} onClick={() => setAsk(null)}>
                  {ask.action === 'delete' ? 'Keep' : 'Cancel'}
                </button>
                {!event?.series ? (
                  <button type="button" className="confirm-delete" onClick={pick(false)}>
                    Delete
                  </button>
                ) : (
                  <>
                    <button type="button" className={ask.action === 'delete' ? 'confirm-delete' : 'confirm-send'} autoFocus={ask.action === 'save'} onClick={pick(false)}>
                      Only this event
                    </button>
                    {(ask.action === 'delete' || seriesOk) && (
                      <button type="button" className={ask.action === 'delete' ? 'confirm-delete' : 'confirm-send'} onClick={pick(true)}>
                        All events in the series
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </form>
  );
}

/**
 * A strip on the panel's left edge to drag (or use the arrow keys on) to make the panel wider or
 * narrower; double-click puts the usual width back (owner request, 2026-10-16). Week and Month keep
 * their own widths. Not part of the panel itself, which scrolls and would clip it.
 */
export function CalendarResizeHandle() {
  const s = useCalendar();
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const set = (width: number) => calendar.setWidth(s.view, clampPanelWidth(width, window.innerWidth));
  const now = clampPanelWidth(s.widths[s.view], windowWidth);
  return (
    <div
      className="cal-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize calendar"
      aria-valuemin={PANEL_MIN}
      aria-valuemax={Math.max(PANEL_MIN, windowWidth - PANEL_MIN)}
      aria-valuenow={now}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && set(window.innerWidth - e.clientX)}
      onDoubleClick={() => calendar.resetWidth(s.view)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        // Not a board shortcut: the arrows must not nudge selected blocks.
        e.preventDefault();
        e.stopPropagation();
        set(now + (e.key === 'ArrowLeft' ? PANEL_STEP : -PANEL_STEP));
      }}
    />
  );
}
