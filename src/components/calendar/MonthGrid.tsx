import { useLayoutEffect, useState, type RefObject } from 'react';
import { cellLines, cellTime, dayLabel, eventsOnDay, monthGrid, rangeLabel, timeLabel, type CalEvent, type DayKey } from '../../model/calendar';
import { calendar, useCalendar } from '../../store/calendar';
import { answerLook, answerSaid, type OnDrag } from './shared';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Cells under this width keep two lines, names only: a time leaves no room for the name. */
const NARROW_CELL = 70;

export function MonthGrid({
  day,
  today,
  events,
  reveal,
  onPick,
  onDrag,
  onAdd,
}: {
  day: DayKey;
  today: DayKey;
  events: CalEvent[];
  reveal: RefObject<boolean>;
  onPick: (e: CalEvent, opener: HTMLElement) => void;
  onDrag: OnDrag;
  onAdd: (day: DayKey, opener: HTMLElement) => void;
}) {
  const month = day.slice(0, 7);
  const { sending } = useCalendar();
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
                  return (
                    <button
                      key={e.id}
                      type="button"
                      className={`cal-chip${e.allDay ? ' all-day' : ''}${e.editable ? '' : ' read-only'}${answerLook(e)}`}
                      data-event={e.id}
                      aria-busy={sending.includes(e.id) || undefined}
                      aria-label={`${timeLabel(e)} ${e.title}${e.editable ? '' : ', read-only'}${answerSaid(e)}`}
                      title={`${time && `${time} `}${e.title}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onPick(e, ev.currentTarget);
                      }}
                      onPointerDown={e.editable ? (ev) => onDrag(ev, e) : undefined}
                    >
                      {!e.allDay && <span className="cal-chip-dot" aria-hidden="true" />}
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
    </div>
  );
}
