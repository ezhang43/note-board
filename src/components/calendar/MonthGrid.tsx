import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cellLines, cellTime, dayLabel, eventsOnDay, monthCellLimit, monthGrid, rangeLabel, timeLabel, type CalEvent, type DayKey } from '../../model/calendar';
import { hoverPreviewPosition, whenLabel } from '../../model/eventCard';
import { calendar, useCalendar } from '../../store/calendar';
import { useEscapeLayer } from '../escapeLayer';
import { answerLook, answerSaid, type OnDrag } from './shared';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Cells under this width hide the start time so the event name keeps room (the time is in the hover preview and day list). */
const NARROW_CELL = 60;
/** Six 2px gaps between 7 columns in `.cal-row`. */
const ROW_GAPS = 12;
/** Initial hover delay before showing the floating preview; subsequent adjacent hovers open instantly. */
const HOVER_DELAY = 160;
/** Grace window after leaving a chip during which hovering another chip still opens instantly. */
const INSTANT_WINDOW = 200;

interface HoverState {
  event: CalEvent;
  anchor: HTMLElement;
  instant: boolean;
}

const canHover = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(hover: hover)').matches : true);

export function MonthGrid({
  day,
  today,
  events,
  reveal,
  overlayOpen,
  onPick,
  onDrag,
  onAdd,
}: {
  day: DayKey;
  today: DayKey;
  events: CalEvent[];
  reveal: RefObject<boolean>;
  overlayOpen: boolean;
  onPick: (e: CalEvent, opener: HTMLElement) => void;
  onDrag: OnDrag;
  onAdd: (day: DayKey, opener: HTMLElement) => void;
}) {
  const month = day.slice(0, 7);
  const { sending } = useCalendar();
  const [cellWidth, setCellWidth] = useState(0);
  const [grid, setGrid] = useState<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<HoverState | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastClosed = useRef(0);

  const clearHover = useCallback(() => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = undefined;
    setHovered((prev) => {
      if (prev) lastClosed.current = Date.now();
      return null;
    });
  }, []);

  // Measured before the first paint, so a wide grid doesn't first show the narrow layout.
  useLayoutEffect(() => {
    if (!grid) return;
    const measure = () => setCellWidth((grid.clientWidth - ROW_GAPS) / 7);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(grid);
    return () => watch.disconnect();
  }, [grid]);

  // Dismiss any hover preview when an overlay opens, the month changes, or the grid unmounts.
  useEffect(() => {
    clearHover();
  }, [overlayOpen, month, clearHover]);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  // Dismiss if the hovered chip unmounts (e.g., Ctrl+Z undo or panel collapse reducing cell cap).
  useLayoutEffect(() => {
    if (hovered && !hovered.anchor.isConnected) clearHover();
  }, [events, cellWidth, hovered, clearHover]);

  // Dismiss when the panel scrolls so a fixed preview never stays detached from its chip.
  useEffect(() => {
    if (!hovered) return;
    const onScroll = () => clearHover();
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [hovered, clearHover]);

  // Escape dismisses the hover preview without closing the Calendar panel.
  useEscapeLayer(hovered !== null, () => {
    clearHover();
    return true;
  });

  const enterChip = (ev: ReactPointerEvent<HTMLButtonElement>, event: CalEvent) => {
    // Mouse-only: touch taps never open a hover preview (mobile-native).
    if (ev.pointerType !== 'mouse' || overlayOpen || !canHover() || document.body.classList.contains('cal-dragging')) return;
    const anchor = ev.currentTarget;
    clearTimeout(hoverTimer.current);
    const immediate = hovered !== null || Date.now() - lastClosed.current < INSTANT_WINDOW;
    if (immediate) {
      setHovered({ event, anchor, instant: true });
    } else {
      hoverTimer.current = setTimeout(() => {
        if (anchor.isConnected && !document.body.classList.contains('cal-dragging')) {
          setHovered({ event, anchor, instant: false });
        }
      }, HOVER_DELAY);
    }
  };

  const narrow = cellWidth < NARROW_CELL;
  const maxEvents = monthCellLimit(cellWidth);

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
            const { shown, more } = cellLines(list, maxEvents);
            const count = list.length;
            const name = `${dayLabel(d)}${count ? `, ${count} ${count === 1 ? 'event' : 'events'}` : ''}`;
            const classes = ['cal-cell', d.slice(0, 7) !== month && 'outside', d === today && 'today', d < today && 'past'].filter(Boolean).join(' ');
            const pickDay = () => {
              reveal.current = true;
              void calendar.pickDay(d);
            };
            // A click on the day that is already picked adds an event to it, as Google Calendar does and as its + does (job #131).
            const clickDay = (opener: HTMLElement) => (d === day ? onAdd(d, opener) : pickDay());
            return (
              // The whole cell picks its day; the date is the button for the keyboard (buttons can't hold the event buttons).
              <div key={d} role="gridcell" data-day={d} className={classes} aria-selected={d === day} aria-label={name} onClick={(e) => clickDay(e.currentTarget.querySelector<HTMLElement>('.cal-date')!)}>
                <button type="button" className="cal-date" aria-label={`Show ${dayLabel(d)}`} onClick={(e) => (e.stopPropagation(), clickDay(e.currentTarget))}>
                  {Number(d.slice(8))}
                </button>
                {shown.map((e) => {
                  const time = cellTime(e, d);
                  const previewing = hovered?.event.id === e.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      className={`cal-chip${e.allDay ? ' all-day' : ''}${e.editable ? '' : ' read-only'}${answerLook(e)}`}
                      data-event={e.id}
                      aria-busy={sending.includes(e.id) || undefined}
                      aria-label={`${timeLabel(e)} ${e.title}${e.editable ? '' : ', read-only'}${answerSaid(e)}`}
                      title={previewing ? undefined : `${time && `${time} `}${e.title}`}
                      onPointerEnter={(ev) => enterChip(ev, e)}
                      onPointerLeave={clearHover}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        clearHover();
                        onPick(e, ev.currentTarget);
                      }}
                      onPointerDown={(ev) => {
                        clearHover();
                        if (e.editable) onDrag(ev, e);
                      }}
                    >
                      <span>
                        {time && <span className="cal-chip-time">{time}</span>}
                        <span className="cal-chip-title">{e.title}</span>
                      </span>
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
      {hovered && !overlayOpen && createPortal(<HoverPreview key={hovered.event.id} event={hovered.event} anchor={hovered.anchor} instant={hovered.instant} />, document.body)}
    </div>
  );
}

/** Non-interactive floating hover preview for a Month event chip (full title, time range, and location if present). */
function HoverPreview({ event, anchor, instant }: { event: CalEvent; anchor: HTMLElement; instant: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; placement: 'above' | 'below' } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor.isConnected) return;
    const rect = anchor.getBoundingClientRect();
    setPos(hoverPreviewPosition(rect, { width: el.offsetWidth, height: el.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }));
  }, [event, anchor]);

  const classes = `cal-hover-preview${event.editable ? '' : ' read-only'}${answerLook(event)}`;
  return (
    <div
      ref={ref}
      role="tooltip"
      className={classes}
      data-place={pos?.placement ?? 'above'}
      data-instant={instant ? '' : undefined}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
    >
      <div className="cal-hover-title">{event.title}</div>
      <div className="cal-hover-when">{whenLabel(event)}</div>
      {event.location && <div className="cal-hover-location">{event.location}</div>}
    </div>
  );
}
