import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dayKey, draftFor, dragDraft, emailGuests, newDraft, rangeLabel, searchDayLabel, searchGroups, timeLabel, type CalEvent, type DayKey, type Draft } from '../model/calendar';
import { appStore, useAppState } from '../store/appStore';
import { calendar, useCalendar, type CalendarState } from '../store/calendar';
import { CalendarDaysIcon, CloseIcon, ExternalIcon, SearchIcon } from './icons';
import { beginEventDrag } from './eventDrag';
import { useCalendarKeys } from './calendarKeys';
import { EventCard } from './calendar/EventCard';
import { EventForm } from './calendar/EventForm';
import { MonthGrid } from './calendar/MonthGrid';
import { MoveAsk } from './calendar/MoveAsk';
import { Note, answerLook, answerSaid, type OnDrag } from './calendar/shared';
import { DayEvents, WeekList } from './calendar/WeekList';

// Google Calendar side panel (owner request, 2026-10-06): the signed-in person's primary calendar,
// a week or a month, beside the board. The person's own events can be added, moved, renamed and
// deleted, with their guests, one or all of a repeating series (job #85); the rest open in Google Calendar. Calendar events aren't board data:
// not in Version history. A change's Undo message (job 217) or, with the panel open, Ctrl+Z (owner request 2026-11-17) undoes it.

/**
 * Opens the panel: a round button by the zoom control (the toolbar is full at 1280px), a tile in ⋯
 * on a phone (`labelled`; its name there is still "Google Calendar"). Only there for someone signed in (or a demo person, locally).
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
        // The keyboard goes into the panel it opened, so its keys (N, T, the arrows) work straight away.
        if (!open) requestAnimationFrame(() => document.querySelector<HTMLElement>('.side-panel')?.focus({ preventScroll: true }));
      }}
    >
      <CalendarDaysIcon />
      Calendar
    </button>
  );
}

/** At most one calendar overlay is open at a time: an event card, the add/edit form, or a drag-move guest prompt. */
type Overlay =
  | { kind: 'card'; event: CalEvent; opener: HTMLElement }
  | { kind: 'form'; event: CalEvent | null; draft: Draft; opener: HTMLElement }
  | { kind: 'move'; event: CalEvent; from: DayKey; to: DayKey; opener: HTMLElement };

/** What the side panel shows for Google Calendar. */
export function CalendarPanel() {
  const s = useCalendar();
  // The active overlay (event card, add/edit form, or drag-move prompt) and the button it opened from.
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  // Set when a day is picked in the Month grid: its list sits under the grid, so it is scrolled into view (job #56).
  const reveal = useRef(false);
  const today = dayKey(new Date());
  const unit = s.view === 'week' ? 'week' : 'month';
  // The list it was opened from changed (another week or month, by keyboard too): the overlay goes with it.
  useLayoutEffect(() => {
    if (overlay && !overlay.opener.isConnected) setOverlay(null);
  });

  // ‹ ›, Today, T and the arrows move to another week or month: the card goes with the list it was opened from (the Week
  // list keeps it drawn, so this is said here); a scroll of the list keeps it.
  const jumped = useRef(s.jump);
  useLayoutEffect(() => {
    if (jumped.current === s.jump) return;
    jumped.current = s.jump;
    setOverlay((o) => (o?.kind === 'card' ? null : o));
  }, [s.jump]);

  const edit = (event: CalEvent, opener: HTMLElement) => {
    setOverlay({ kind: 'form', event, draft: draftFor(event), opener });
  };
  // Clicking an event whose card is already open edits it (job #131); a read-only one has nothing to edit, so its card just stays,
  // and so does one with a change still on its way to Google (owner request 2026-11-17).
  const pick = (event: CalEvent, opener: HTMLElement) => {
    if (overlay?.kind !== 'card' || overlay.event.id !== event.id) setOverlay({ kind: 'card', event, opener });
    else if (event.editable && !s.sending.includes(event.id)) edit(event, opener);
  };
  // The card shows the event as the list shows it now (a change that Google refused goes back in it too).
  const openEvent = overlay?.kind === 'card' ? (s.events?.find((e) => e.id === overlay.event.id) ?? overlay.event) : null;
  const add = (day: DayKey, opener: HTMLElement) => setOverlay({ kind: 'form', event: null, draft: newDraft(day), opener });
  // Dragging an event onto another day (owner request, 2026-11-11): saved like an edit's Save, asking about the guests first.
  const drag: OnDrag = (down, event) => {
    // Not while its last change is still on its way to Google (a press still opens its card).
    if (s.sending.includes(event.id)) return;
    const opener = down.currentTarget;
    beginEventDrag(down, (from, to) => {
      const draft = dragDraft(event, from, to);
      if (!draft) return;
      if (emailGuests(event, draft)) setOverlay({ kind: 'move', event, from, to, opener });
      else {
        setOverlay(null);
        void calendar.move(event.id, from, to);
      }
    });
  };
  // N, T, ← and → (owner request 2026-11-17); N closes an open card, as a click on a + would.
  const showSearch = () => {
    setOverlay((o) => (o?.kind === 'card' ? null : o));
    calendar.openSearch();
    // The keyboard goes into the box once it is drawn (a box already open is focused again).
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.cal-search input')?.focus());
  };
  useCalendarKeys(
    overlay?.kind === 'form' || overlay?.kind === 'move',
    (day, opener) => add(day, opener),
    showSearch,
  );
  // A result clicked in the search: its day is shown, then its card opens on the event there (waits while that day's events load).
  const [goTo, setGoTo] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (goTo === null || s.search || s.loading) return;
    const event = s.events?.find((e) => e.id === goTo);
    const opener = event && document.querySelector<HTMLElement>(`.side-panel [data-event="${CSS.escape(goTo)}"]`);
    if (event && opener) setOverlay({ kind: 'card', event, opener });
    setGoTo(null);
  });
  const found = (event: CalEvent) => {
    calendar.closeSearch();
    setOverlay(null);
    setGoTo(event.id);
    void calendar.pickDay(event.start.slice(0, 10));
  };
  const dayList = (day: DayKey, columns = false) => (
    <DayEvents key={day} day={day} today={day === today} past={day < today} columns={columns} events={s.events ?? []} reveal={reveal} onPick={pick} onDrag={drag} onAdd={(opener) => add(day, opener)} />
  );

  const weekly = s.view === 'week' && s.events !== null && !s.search?.text.trim();

  return (
    <div className={`cal${weekly ? ' weekly' : ''}`}>
      {s.search && <SearchBox search={s.search} />}
      <div className="cal-bar">
        <div className="cal-views" role="group" aria-label="Show">
          <button type="button" className="tb-button" aria-pressed={s.view === 'week'} onClick={() => void calendar.setView('week')}>
            Week
          </button>
          <button type="button" className="tb-button" aria-pressed={s.view === 'month'} onClick={() => void calendar.setView('month')}>
            Month
          </button>
        </div>
        <div className="cal-tools">
          <button type="button" className="icon-button" aria-label="Search events" title="Search events" aria-pressed={s.search !== null} onClick={showSearch}>
            <SearchIcon />
          </button>
          <button type="button" className="tb-button" onClick={() => void calendar.goToday()}>
            Today
          </button>
        </div>
      </div>
      <div className="cal-bar">
        <span className="habit-steps">
          <button type="button" className="habit-step" aria-label={`Previous ${unit}`} title={`Previous ${unit}`} onClick={() => void calendar.step(-1)}>
            ‹
          </button>
          <button type="button" className="habit-step" aria-label={`Next ${unit}`} title={`Next ${unit}`} onClick={() => void calendar.step(1)}>
            ›
          </button>
        </span>
        <h3 className="cal-range" aria-live="polite">
          {rangeLabel(s.view, s.day)}
        </h3>
      </div>

      {s.search?.text.trim() ? (
        <SearchResults search={s.search} today={today} onPick={found} />
      ) : s.note ? (
        <Note note={s.note} needsAccess={s.needsAccess} retry={() => void calendar.load()} />
      ) : (
        s.events === null && <p className="history-note">Loading…</p>
      )}

      {!s.search?.text.trim() &&
        s.events !== null &&
        (s.view === 'week' ? (
          <WeekList day={s.day} jump={s.jump} loaded={s.loaded} today={today} dayList={dayList} />
        ) : (
          <>
            <MonthGrid day={s.day} today={today} events={s.events} reveal={reveal} onPick={pick} onDrag={drag} onAdd={add} />
            {dayList(s.day)}
          </>
        ))}
      {calendar.canDisconnect && !s.search?.text.trim() && s.events !== null && <Disconnect />}
      {overlay?.kind === 'card' && openEvent && (
        <EventCard
          key={openEvent.id}
          event={openEvent}
          sending={s.sending.includes(openEvent.id)}
          opener={overlay.opener}
          onClose={() => setOverlay(null)}
          onEdit={() => edit(openEvent, overlay.opener)}
        />
      )}
      {overlay?.kind === 'form' && <EventForm event={overlay.event} start={overlay.draft} opener={overlay.opener} onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'move' && (
        <MoveAsk key={overlay.event.id} event={overlay.event} from={overlay.from} to={overlay.to} opener={overlay.opener} onClose={() => setOverlay(null)} />
      )}
    </div>
  );
}

/** A small Disconnect calendar link at the bottom (owner decision 2026-11-20): the helper forgets the connection, on every device. */
function Disconnect() {
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const link = useRef<HTMLButtonElement>(null);
  const go = () => {
    // Found now: once disconnected this link is gone with the events.
    const panel = link.current?.closest('.cal');
    setBusy(true);
    setFailed(false);
    calendar.disconnect().then(
      () => {
        // Keyboard focus moves to Connect Google Calendar in the note that replaces the events.
        requestAnimationFrame(() => panel?.querySelector<HTMLButtonElement>('.cal-connect')?.focus());
      },
      () => {
        setBusy(false);
        setFailed(true);
      },
    );
  };
  return (
    <div className="cal-disconnect">
      <button ref={link} type="button" className="cal-disconnect-link" aria-disabled={busy} onClick={busy ? undefined : go}>
        Disconnect calendar
      </button>
      {failed && (
        <p className="history-note" role="status">
          Couldn't disconnect. Try again.
        </p>
      )}
    </div>
  );
}

/** The search box at the top of the panel (owner request, 2026-11-19). Escape or × closes it, whichever of its parts has the keyboard. */
function SearchBox({ search }: { search: NonNullable<CalendarState['search']> }) {
  const close = () => {
    calendar.closeSearch();
    // The keyboard stays in the panel, so its keys still work.
    document.querySelector<HTMLElement>('.cal-tools button')?.focus();
  };
  return (
    <div
      className="cal-search"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        close();
      }}
    >
      <SearchIcon />
      <input type="search" aria-label="Search events" placeholder="Search events" autoComplete="off" value={search.text} onChange={(e) => calendar.setSearchText(e.target.value)} />
      <button type="button" className="icon-button" aria-label="Close search" title="Close search (Esc)" onClick={close}>
        <CloseIcon />
      </button>
    </div>
  );
}

/** What the search found for the text typed: dates with their events, upcoming first, then earlier days, most recent first. */
function SearchResults({ search, today, onPick }: { search: NonNullable<CalendarState['search']>; today: DayKey; onPick: (e: CalEvent) => void }) {
  if (search.note) return <Note note={search.note} needsAccess={search.needsAccess} retry={() => void calendar.searchNow()} />;
  if (search.results === null) return <p className="history-note" role="status">Searching…</p>;
  if (search.results.length === 0) return <p className="history-note" role="status">No events found</p>;
  return (
    <div className="cal-results">
      {searchGroups(search.results, today).map(({ day, events }) => (
        <section key={day} data-day={day} className={`cal-day${day === today ? ' today' : ''}`} aria-label={searchDayLabel(day, today)}>
          <h3>
            {searchDayLabel(day, today)}
            {day === today && <span className="cal-today">· Today</span>}
          </h3>
          {events.map((e) => (
            <button key={e.id} type="button" className={`cal-event${e.editable ? '' : ' read-only'}${answerLook(e)}`} aria-label={`${timeLabel(e)} ${e.title}${e.editable ? '' : ', read-only'}${answerSaid(e)}`} onClick={() => onPick(e)}>
              <span className="cal-time">{timeLabel(e)}</span>
              <span className="cal-title">{e.title}</span>
              {!e.editable && <ExternalIcon />}
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
