import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { addDays, dayLabel, eventsOnDay, sundayStart, timeLabel, weekDays, type CalEvent, type DayKey } from '../../model/calendar';
import { WEEKS_DRAWN, recenterOn, weekAtLine } from '../../model/weekList';
import { calendar, useCalendar } from '../../store/calendar';
import { ExternalIcon, PlusIcon } from '../icons';
import { answerLook, answerSaid, type OnDrag } from './shared';

export function DayEvents({
  day,
  today,
  past,
  columns,
  events,
  reveal,
  onPick,
  onDrag,
  onAdd,
}: {
  day: DayKey;
  today: boolean;
  /** Before today: shown faded (owner request, 2026-11-20). */
  past: boolean;
  /** The Week list: the date on the left, the events in a column to its right (owner request 2026-10-24, job 210). */
  columns: boolean;
  events: CalEvent[];
  reveal: RefObject<boolean>;
  onPick: (e: CalEvent, opener: HTMLElement) => void;
  onDrag: OnDrag;
  onAdd: (opener: HTMLElement) => void;
}) {
  const label = dayLabel(day);
  const list = eventsOnDay(events, day);
  // An event whose change is still on its way to Google is marked busy (owner request 2026-11-17).
  const { sending } = useCalendar();
  const section = useRef<HTMLElement>(null);
  // Picking a day in the Month grid shows its list (under the grid, maybe below the visible part of the panel).
  useEffect(() => {
    if (!reveal.current) return;
    reveal.current = false;
    section.current?.scrollIntoView({ block: 'nearest' });
  });
  return (
    <section ref={section} data-day={day} data-date={day} className={`cal-day${today ? ' today' : ''}${past ? ' past' : ''}${columns ? ' columns' : ''}`} aria-label={label} aria-current={today && columns ? 'date' : undefined}>
      <h3>
        {/* The column is narrow: "Thu 15", the month is in the range above (a section's own name keeps "Thu 15 Oct"). */}
        {columns ? label.slice(0, label.lastIndexOf(' ')) : label}
        {today && !columns && <span className="cal-today">· Today</span>}
        <button type="button" className="icon-button cal-add" aria-label={`Add event on ${label}`} title="Add an event" onClick={(e) => onAdd(e.currentTarget)}>
          <PlusIcon />
        </button>
      </h3>
      {list.map((e) => (
        <button
          key={e.id}
          type="button"
          className={`cal-event${e.editable ? '' : ' read-only'}${answerLook(e)}`}
          data-event={e.id}
          aria-busy={sending.includes(e.id) || undefined}
          aria-label={`${timeLabel(e)} ${e.title}${e.editable ? '' : ', read-only'}${answerSaid(e)}`}
          onClick={(ev) => onPick(e, ev.currentTarget)}
          onPointerDown={e.editable ? (ev) => onDrag(ev, e) : undefined}
        >
          <span className="cal-time">{timeLabel(e)}</span>
          <span className="cal-title">{e.title}</span>
          {!e.editable && <ExternalIcon />}
        </button>
      ))}
    </section>
  );
}

/** How far below the list's top the week looked at is read: a little way in, so a short week brought to the top counts as that week. */
const PROBE = 96;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * The Week list as one list of days that scrolls on into earlier and later weeks (owner request, 2026-11-20). It draws
 * WEEKS_DRAWN weeks each side of a middle week, moving the middle as it is scrolled, and keeps the day at the top where it
 * is whenever weeks are added, removed or filled in above it (done here, as Safari has no CSS scroll anchoring). The week at
 * the top is the one looked at (the heading). ‹ ›, Today and a picked day (`jump`) scroll to the week of `day`: smoothly when
 * it is near (at once with reduced motion), at once from far away. A week whose events aren't known yet is a light placeholder.
 */
export function WeekList({ day, jump, loaded, today, dayList }: { day: DayKey; jump: number; loaded: DayKey[]; today: DayKey; dayList: (day: DayKey, columns: boolean) => ReactNode }) {
  const list = useRef<HTMLDivElement>(null);
  const [middle, setMiddle] = useState(() => sundayStart(day));
  const weeks = useMemo(() => Array.from({ length: 2 * WEEKS_DRAWN + 1 }, (_, i) => addDays(middle, 7 * (i - WEEKS_DRAWN))), [middle]);
  // The day row at the list's top and how far from the top it sits, as last seen.
  const anchor = useRef<{ date: string; offset: number } | null>(null);
  // The last `jump` scrolled to (null: none yet, the first is at once), and whether a smooth scroll of ours is under way.
  const done = useRef<number | null>(null);
  const ours = useRef<(() => void) | null>(null);
  const middleRef = useRef(middle);
  middleRef.current = middle;

  const top = (el: Element) => el.getBoundingClientRect().top - list.current!.getBoundingClientRect().top;
  const readAnchor = () => {
    for (const row of list.current?.querySelectorAll<HTMLElement>('[data-date]') ?? []) {
      const at = top(row);
      if (at + row.offsetHeight > 0) return void (anchor.current = { date: row.dataset.date!, offset: at });
    }
  };
  // The week at a line a little below the top: the one the heading names.
  const follow = () => {
    const box = list.current!;
    const tops = [...box.querySelectorAll<HTMLElement>('[data-week]')].map((w): [DayKey, number] => [w.dataset.week!, top(w)]);
    const week = weekAtLine(tops, Math.min(PROBE, box.clientHeight / 3));
    if (!week) return;
    void calendar.scrolledTo(week);
    if (recenterOn(middleRef.current, week)) setMiddle(week);
  };

  useLayoutEffect(() => {
    const box = list.current;
    if (!box) return;
    // Whatever changed above the day at the top (weeks added or let go, a placeholder filled in), it stays where it was;
    // not during a glide of ours, which writing the scroll position would stop (the glide is set right where it ends).
    // simple: the fix is a scroll position write, which can cut short a finger's fling on an iPhone when weeks above change
    // mid-fling; if that shows on a real phone, hold the fix until the scroll stops.
    const row = anchor.current && box.querySelector(`[data-date="${anchor.current.date}"]`);
    if (row && anchor.current && !ours.current) {
      const moved = top(row) - anchor.current.offset;
      if (Math.abs(moved) >= 1) box.scrollTop += moved;
    }
    if (done.current !== jump) {
      const target = sundayStart(day);
      // Drawn around the week first (so there is room to bring it to the top), then scrolled to.
      if (target !== middle) {
        if (!row) anchor.current = null;
        readAnchor();
        return setMiddle(target);
      }
      const first = done.current === null;
      done.current = jump;
      const week = box.querySelector<HTMLElement>(`[data-week="${target}"]`);
      if (week) {
        const to = box.scrollTop + top(week);
        // Near (the day that was at the top is still drawn): a smooth scroll; the first time, from far, or with reduced motion: at once.
        const smooth = !first && row !== null && Math.abs(to - box.scrollTop) < 3 * box.clientHeight && !reducedMotion();
        ours.current?.();
        if (smooth) {
          // The scroll is ours until it ends (`scrollend`, or where that is missing, once it has stood still for a moment):
          // the week looked at is already the one asked for. It ends with the week exactly at the top, in case the rows
          // above changed meanwhile.
          let still = 0;
          let last = box.scrollTop;
          const stop = () => {
            box.removeEventListener('scrollend', end);
            clearInterval(timer);
            ours.current = null;
          };
          const end = () => {
            stop();
            const week = box.querySelector<HTMLElement>(`[data-week="${target}"]`);
            if (week && Math.abs(top(week)) >= 1) box.scrollTop += top(week);
            readAnchor();
            follow();
          };
          const timer = setInterval(() => {
            still = Math.abs(box.scrollTop - last) < 1 ? still + 1 : 0;
            last = box.scrollTop;
            if (still >= 3) end();
          }, 50);
          box.addEventListener('scrollend', end);
          ours.current = stop;
          box.scrollTo({ top: to, behavior: 'smooth' });
        } else box.scrollTop = to;
      }
    }
    readAnchor();
  });
  useEffect(() => () => ours.current?.(), []);

  const onScroll = () => {
    readAnchor();
    if (!ours.current) follow();
  };

  return (
    <div className="cal-weeks" ref={list} onScroll={onScroll}>
      {weeks.map((w) => (
        <div key={w} className="cal-week" data-week={w}>
          {loaded.includes(w)
            ? weekDays(w).map((d) => dayList(d, true))
            : weekDays(w).map((d) => {
                const label = dayLabel(d);
                return (
                  <div key={d} data-date={d} className={`cal-day columns placeholder${d === today ? ' today' : ''}${d < today ? ' past' : ''}`}>
                    <h3>{label.slice(0, label.lastIndexOf(' '))}</h3>
                    <span className="cal-slot" />
                  </div>
                );
              })}
        </div>
      ))}
    </div>
  );
}
