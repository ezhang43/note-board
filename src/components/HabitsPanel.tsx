import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { dayKey, dayLabel, monthGrid, MONTH_NAMES, MONTHS, weekDays, weekStart, type DayKey } from '../model/calendar';
import { habitList, habitViewLabel, habitYear, isHabitViewNow, moveHabitView, tickedDays, type HabitView } from '../model/habits';
import { appStore, useAppState } from '../store/appStore';
import { collab } from '../sync/collabSession';
import { HabitsIcon, TrashIcon } from './icons';
import { usePhone } from './usePhone';
import { WeightCard } from './WeightCard';

/**
 * The Habits button (owner request, 2026-10-19): opens the Habits side panel, or closes it. By the
 * zoom control, or a tile in the ⋯ panel on a phone (`labelled`), next to Journal.
 */
export function HabitsButton({ labelled = false, onOpen }: { labelled?: boolean; onOpen?: () => void }) {
  const open = useAppState((s) => s.ui.sidePanel === 'habits');
  return (
    <button
      type="button"
      className={labelled ? 'tb-button' : 'help-button dock-tool'}
      aria-label="Habits"
      title="Track daily habits"
      aria-pressed={open}
      onClick={() => {
        if (appStore.openHabits() === 'loading') collab.setNotice('Your shared boards are still loading. Try again in a moment.');
        onOpen?.();
      }}
    >
      <HabitsIcon />
      Habits
    </button>
  );
}

/**
 * The Habits side panel (owner request, 2026-10-19; Month and Year views 2026-10-20): each habit on
 * the Habits board for a week, a month (days to tick) or a year (view only), and a box to add one.
 * Every change goes through the store, so it is saved, synced and undoable (Ctrl+Z here). Which view
 * and which week, month or year is shown is view state: it isn't saved, and the panel opens on this week.
 */
const VIEWS: HabitView[] = ['week', 'month', 'year'];
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
export function HabitsPanel() {
  const board = useAppState((s) => {
    const id = appStore.habitsBoard();
    if (!id) return undefined;
    return id === s.boards.open ? s.board : s.boards.others[id];
  });
  const habits = useMemo(() => (board ? habitList(board) : []), [board]);
  // simple: "today" is read when the panel draws; left open past midnight it moves on at the next change.
  const today = dayKey(new Date());
  const [view, setView] = useState<HabitView>('week');
  const [shown, setShown] = useState<DayKey>(today); // any day in the week, month or year on show
  const year = useMemo(() => (view === 'year' ? habitYear(shown) : []), [view, shown]);
  const [name, setName] = useState('');
  // On a phone or touch screen the keyboard would pop up and cover the day boxes, so it waits for a tap.
  const touch = usePhone() || (window.matchMedia?.('(pointer: coarse)').matches ?? false);
  const root = useRef<HTMLDivElement>(null);
  /** What in the panel had the keyboard last, so it stays in the panel when undo or delete takes that away. */
  const focused = useRef<Element | null>(null);
  useLayoutEffect(() => {
    if (focused.current && !focused.current.isConnected) {
      focused.current = null;
      root.current?.focus();
    }
  });

  const add = () => {
    if (appStore.addHabit(name)) setName('');
  };
  // Escape leaves a text box (a second Escape closes the panel), as on the board.
  const leave = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') root.current?.focus();
  };

  return (
    <div
      className="habits-panel"
      tabIndex={-1}
      ref={root}
      onFocus={(e) => (focused.current = e.target)}
      onBlur={(e) => {
        // Leaving the panel; a blur caused by the box going away keeps `focused` (see above).
        const el = e.target;
        queueMicrotask(() => {
          if (el.isConnected && focused.current === el && !root.current?.contains(document.activeElement)) focused.current = null;
        });
      }}
    >
      <div className="habit-viewbar">
        <div className="habit-seg" role="group" aria-label="View">
          <span className="habit-seg-thumb" style={{ transform: `translateX(${VIEWS.indexOf(view) * 100}%)` }} aria-hidden />
          {VIEWS.map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <div className="habit-nav">
          <button type="button" className="habit-step" aria-label={`Previous ${view}`} title={`Previous ${view}`} onClick={() => setShown(moveHabitView(view, shown, -1))}>
            ‹
          </button>
          <span className="habit-nav-label" aria-live="polite">
            {habitViewLabel(view, shown)}
          </span>
          {!isHabitViewNow(view, shown, today) && (
            <button type="button" className="habit-today" onClick={() => setShown(today)}>
              Today
            </button>
          )}
          <button type="button" className="habit-step" aria-label={`Next ${view}`} title={`Next ${view}`} onClick={() => setShown(moveHabitView(view, shown, 1))}>
            ›
          </button>
        </div>
      </div>
      <form
        className="habit-new"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input type="text" aria-label="New habit" placeholder="New habit" autoFocus={!touch} enterKeyHint="done" value={name} onChange={(e) => setName(e.currentTarget.value)} onKeyDown={leave} />
        <button type="submit" className="tb-button">
          Add
        </button>
      </form>
      <WeightCard board={board} view={view} shown={shown} today={today} />
      {habits.length === 0 && <p className="habits-empty">No habits yet. Add one, then tick each day you do it.</p>}
      <div className={`habit-cards${view === 'month' ? ' habit-cards-month' : ''}`}>
        {habits.map((h) => {
          const done = tickedDays(h);
          const dayButton = (d: DayKey, children: React.ReactNode) => (
            <button
              key={d}
              type="button"
              className="habit-day"
              aria-label={`${h.title || 'Habit'}, ${dayLabel(d)}`}
              aria-pressed={done.has(d)}
              aria-current={d === today ? 'date' : undefined}
              onClick={() => appStore.toggleHabitDay(h.id, d)}
            >
              {children}
            </button>
          );
          return (
            <section key={h.id} className="habit">
              <div className="habit-head">
                <input type="text" aria-label="Habit name" placeholder="Habit name" value={h.title} onChange={(e) => appStore.renameHabit(h.id, e.currentTarget.value)} onKeyDown={leave} />
                <button
                  type="button"
                  className="icon-button habit-delete"
                  aria-label={`Delete habit ${h.title}`}
                  title="Delete habit"
                  onClick={() => {
                    if (window.confirm(`Delete the habit “${h.title}” and its ticks? You can bring it back from Version history, or with Ctrl+Z in this panel.`)) appStore.deleteHabit(h.id);
                  }}
                >
                  <TrashIcon />
                </button>
              </div>
              {view === 'week' && (
                <div className="habit-week">
                  {weekDays(weekStart(shown)).map((d) =>
                    dayButton(
                      d,
                      <>
                        <span className="habit-wd" aria-hidden>
                          {dayLabel(d)[0]}
                        </span>
                        <span aria-hidden>{Number(d.slice(8))}</span>
                      </>,
                    ),
                  )}
                </div>
              )}
              {view === 'month' && (
                <div className="habit-cal">
                  {WEEKDAYS.map((w, i) => (
                    <span key={i} className="habit-cal-wd" aria-hidden>
                      {w}
                    </span>
                  ))}
                  {monthGrid(shown).flat().map((d) => (d.slice(0, 7) === shown.slice(0, 7) ? dayButton(d, Number(d.slice(8))) : <span key={d} />))}
                </div>
              )}
              {view === 'year' && (
                <div className="habit-year">
                  <span aria-hidden />
                  {Array.from({ length: 31 }, (_, i) => (
                    <span key={i} className="habit-year-day" aria-hidden>
                      {i === 0 || (i + 1) % 5 === 0 ? i + 1 : ''}
                    </span>
                  ))}
                  {year.map(({ month, days: inMonth }, m) => (
                    <Fragment key={month}>
                      <button
                        type="button"
                        className="habit-year-month"
                        aria-label={`${MONTH_NAMES[m]} ${month.slice(0, 4)}, ${inMonth.filter((d) => done.has(d)).length} ticked`}
                        aria-current={month.slice(0, 7) === today.slice(0, 7) ? 'date' : undefined}
                        onClick={() => {
                          setView('month');
                          setShown(month);
                        }}
                      >
                        {MONTHS[m]}
                      </button>
                      {Array.from({ length: 31 }, (_, i) => {
                        const d = inMonth[i];
                        const cls = !d ? 'none' : `${done.has(d) ? 'on' : ''} ${d > today ? 'ahead' : ''} ${d === today ? 'today' : ''}`;
                        return <span key={i} className={`habit-sq ${cls}`} aria-hidden />;
                      })}
                    </Fragment>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
