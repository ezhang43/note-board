import { useState } from 'react';
import {
  dayKey,
  dayLabel,
  draftFor,
  eventsOnDay,
  monthGrid,
  moveDraftStart,
  newDraft,
  rangeLabel,
  timeLabel,
  weekDays,
  type CalEvent,
  type DayKey,
  type Draft,
} from '../model/calendar';
import { appStore, useAppState } from '../store/appStore';
import { calendar, useCalendar } from '../store/calendar';
import { CalendarDaysIcon, ExternalIcon, PlusIcon } from './icons';

// Google Calendar side panel (owner request, 2026-10-06): the signed-in person's primary calendar,
// a week or a month, beside the board. Simple events can be added, moved, renamed and deleted;
// the rest open in Google Calendar. Calendar events aren't board data: no undo, not in Version history.

/**
 * Opens the panel: a round button by the zoom control (the toolbar is full at 1280px), a line in ⋯
 * on a phone. Only there for someone signed in (or a demo person, locally).
 */
export function CalendarButton({ labelled = false, onOpen }: { labelled?: boolean; onOpen?: () => void }) {
  const open = useAppState((s) => s.ui.sidePanel === 'calendar');
  if (!calendar.available) return null;
  return (
    <button
      type="button"
      className={labelled ? 'tb-button' : 'help-button'}
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
      {labelled && 'Google Calendar'}
    </button>
  );
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** What the side panel shows for Google Calendar. */
export function CalendarPanel() {
  const s = useCalendar();
  const [editing, setEditing] = useState<{ event: CalEvent | null; draft: Draft } | null>(null);
  const [viewing, setViewing] = useState<CalEvent | null>(null);
  const today = dayKey(new Date());
  const unit = s.view === 'week' ? 'week' : 'month';

  if (editing) return <EventForm event={editing.event} start={editing.draft} onDone={() => setEditing(null)} />;
  if (viewing) return <ReadOnlyEvent event={viewing} onBack={() => setViewing(null)} />;

  const pick = (e: CalEvent) => (e.editable ? setEditing({ event: e, draft: draftFor(e) }) : setViewing(e));
  const dayList = (day: DayKey) => (
    <DayEvents key={day} day={day} today={day === today} events={s.events ?? []} onPick={pick} onAdd={() => setEditing({ event: null, draft: newDraft(day) })} />
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
          <button type="button" className="tb-button" onClick={() => void calendar.load()}>
            Try again
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
            <MonthGrid day={s.day} today={today} events={s.events} />
            {dayList(s.day)}
          </>
        ))}
    </div>
  );
}

function DayEvents({ day, today, events, onPick, onAdd }: { day: DayKey; today: boolean; events: CalEvent[]; onPick: (e: CalEvent) => void; onAdd: () => void }) {
  const label = dayLabel(day);
  const list = eventsOnDay(events, day);
  return (
    <section className={`cal-day${today ? ' today' : ''}`} aria-label={label}>
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

function MonthGrid({ day, today, events }: { day: DayKey; today: DayKey; events: CalEvent[] }) {
  const month = day.slice(0, 7);
  return (
    <div className="cal-month" role="grid" aria-label={rangeLabel('month', day)}>
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
            const count = eventsOnDay(events, d).length;
            const classes = ['cal-cell', d.slice(0, 7) !== month && 'outside', d === today && 'today'].filter(Boolean).join(' ');
            return (
              <button
                key={d}
                type="button"
                role="gridcell"
                className={classes}
                aria-selected={d === day}
                aria-label={`${dayLabel(d)}${count ? `, ${count} ${count === 1 ? 'event' : 'events'}` : ''}`}
                onClick={() => void calendar.pickDay(d)}
              >
                {Number(d.slice(8))}
                {count > 0 && <span className="cal-dot" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Repeating events, events with guests or reminders of their own: shown, and changed in Google Calendar. */
function ReadOnlyEvent({ event, onBack }: { event: CalEvent; onBack: () => void }) {
  return (
    <div className="cal cal-detail">
      <h3 className="cal-detail-title">{event.title}</h3>
      <p className="cal-detail-when">
        {event.allDay ? dayLabel(event.start) : dayLabel(event.start.slice(0, 10))} · {timeLabel(event)}
      </p>
      <p className="history-note">Repeating events, events with guests and events with their own reminders can only be changed in Google Calendar.</p>
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

/** Adding (`event` null) or changing a simple event; Delete asks first. */
function EventForm({ event, start, onDone }: { event: CalEvent | null; start: Draft; onDone: () => void }) {
  const [draft, setDraft] = useState(start);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const change = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    const problem = await action();
    setBusy(false);
    if (problem) setNote(problem);
    else onDone();
  }

  return (
    <form
      className="cal cal-form"
      aria-label={event ? 'Change event' : 'New event'}
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => calendar.save(event?.id ?? null, draft));
      }}
    >
      <h3 className="cal-detail-title">{event ? 'Change event' : 'New event'}</h3>
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
          <button type="button" className="tb-button cal-delete" disabled={busy} onClick={() => setAsking(true)}>
            Delete
          </button>
        )}
      </div>
      {event && asking && (
        <div
          className="confirm cal-confirm"
          role="alertdialog"
          aria-label={`Delete “${event.title}”?`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setAsking(false);
          }}
        >
          <div className="confirm-title">{`Delete “${event.title}”?`}</div>
          <div className="confirm-actions">
            <button type="button" className="confirm-cancel" autoFocus onClick={() => setAsking(false)}>
              Keep
            </button>
            <button
              type="button"
              className="confirm-delete"
              onClick={() => {
                setAsking(false);
                void run(() => calendar.remove(event.id));
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
