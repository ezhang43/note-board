import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { dayKey, dayLabel, monthGrid, MONTH_NAMES, MONTHS, weekDays, weekStart, type DayKey } from '../model/calendar';
import { doneToday, habitColor, habitList, habitViewLabel, habitYear, isHabitViewNow, moveHabitView, periodCount, tickedDays, weekCount, type HabitView } from '../model/habits';
import { journalLongDate } from '../model/journal';
import { BOLD_KEYS, PALETTE, type BoldKey } from '../model/palette';
import type { TodoCard } from '../model/types';
import { appStore, useAppState } from '../store/appStore';
import { collab } from '../sync/collabSession';
import { CheckIcon, HabitsIcon, MoreIcon, PlusIcon } from './icons';
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
 * The Habits side panel (owner request, 2026-10-19; Month and Year views 2026-10-20; the Ledger
 * design, owner pick 2026-10-22): each habit on the Habits board as a row of one sheet, for a week
 * (the weekdays once at the top, a tick for each day), a month (days to tick) or a year (view only),
 * and a row to add one. Every change goes through the store, so it is saved, synced and undoable
 * (Ctrl+Z here). Which view and which week, month or year is shown is view state: it isn't saved,
 * and the panel opens on this week.
 */
const VIEWS: HabitView[] = ['week', 'month', 'year'];
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** What a habit's count says: "3 of 7 this week" (or "3/7" in a narrow panel), "18 of 21 days", "233 days". */
function Count({ habit, view, shown, today }: { habit: TodoCard; view: HabitView; shown: DayKey; today: DayKey }) {
  if (view === 'week') {
    const n = weekCount(habit, shown);
    return (
      <span className="habit-count">
        <span className="habit-count-long">{n} of 7 this week</span>
        <span className="habit-count-short" aria-hidden>
          {n}/7
        </span>
      </span>
    );
  }
  const { ticked, of } = periodCount(habit, view, shown, today);
  return <span className="habit-count">{view === 'month' && of > 0 ? `${ticked} of ${Math.max(of, ticked)} days` : `${ticked} ${ticked === 1 ? 'day' : 'days'}`}</span>;
}

/** The ⋯ on a habit: rename it, give it one of the 8 bold colors (or the default green), or delete it. */
function HabitMenu({ habit, onRename }: { habit: TodoCard; onRename: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const color = habitColor(habit);
  useEffect(() => {
    if (!open) return;
    // A press outside, or Escape, shuts it (Escape leaves the panel open while a menu is, see escapeIsForPanel).
    const press = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', press, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', press, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [open]);
  const pick = (key: BoldKey | null) => {
    appStore.setHabitColor(habit.id, key);
    setOpen(false);
    button.current?.focus();
  };
  return (
    <div className="habit-menu-wrap" ref={root}>
      <button ref={button} type="button" className="icon-button habit-more" aria-label={`More for ${habit.title || 'habit'}`} aria-haspopup="true" aria-expanded={open} title="More" onClick={() => setOpen((o) => !o)}>
        <MoreIcon />
      </button>
      {open && (
        <div className="habit-menu" role="group" aria-label={`Options for ${habit.title || 'habit'}`}>
          <button
            type="button"
            className="habit-menu-item"
            onClick={() => {
              setOpen(false);
              onRename();
            }}
          >
            Rename
          </button>
          <div className="habit-menu-label">Color</div>
          <div className="habit-swatches" role="radiogroup" aria-label="Color">
            <button type="button" role="radio" aria-checked={color === null} aria-label="Default" title="Default" className="habit-swatch" onClick={() => pick(null)} />
            {BOLD_KEYS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={color === k} aria-label={PALETTE[k].label} title={PALETTE[k].label} className="habit-swatch" data-hc={k} onClick={() => pick(k)} />
            ))}
          </div>
          <button
            type="button"
            className="habit-menu-item habit-menu-delete"
            onClick={() => {
              setOpen(false);
              button.current?.focus(); // the habit's row goes; focus is then kept in the panel (see `focused`)
              appStore.deleteHabit(habit.id); // at once, with the Undo message (owner, 2026-10-22)
            }}
          >
            Delete habit
          </button>
        </div>
      )}
    </div>
  );
}

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
  const phone = usePhone();
  const touch = phone || (window.matchMedia?.('(pointer: coarse)').matches ?? false);
  const root = useRef<HTMLDivElement>(null);
  const newBox = useRef<HTMLInputElement>(null);
  /** What in the panel had the keyboard last, so it stays in the panel when undo or delete takes that away. */
  const focused = useRef<Element | null>(null);
  useLayoutEffect(() => {
    if (focused.current && !focused.current.isConnected) {
      focused.current = null;
      root.current?.focus();
    }
  });
  // The new-habit box has the cursor when the panel opens (it sits below the habits, so the panel isn't scrolled to it).
  const touchAtOpen = useRef(touch);
  useEffect(() => {
    if (!touchAtOpen.current) newBox.current?.focus({ preventScroll: true });
  }, []);
  // The weekdays stick under the view bar while the habits scroll: the bar's height tells where.
  const bar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const set = () => root.current?.style.setProperty('--bar-h', `${el.offsetHeight - 8}px`);
    set();
    const watch = new ResizeObserver(set);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const add = () => {
    if (appStore.addHabit(name)) setName('');
  };
  // Escape leaves a text box (a second Escape closes the panel), as on the board.
  const leave = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') root.current?.focus();
  };

  const n = habits.length;
  const done = doneToday(habits, today);
  const weekday = journalLongDate(today).split(',')[0];
  const newRow = (
    <form
      className="habit-new"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <PlusIcon size={16} />
      <input ref={newBox} type="text" aria-label="New habit" placeholder="New habit" enterKeyHint="done" value={name} onChange={(e) => setName(e.currentTarget.value)} onKeyDown={leave} />
    </form>
  );

  /** One habit's name (editable in place), its count and its ⋯; `inputs` has the name boxes so Rename can focus one. */
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const head = (h: TodoCard) => (
    <div className="habit-head">
      <input
        type="text"
        aria-label="Habit name"
        placeholder="Habit name"
        value={h.title}
        ref={(el) => {
          if (el) inputs.current.set(h.id, el);
          else inputs.current.delete(h.id);
        }}
        onChange={(e) => appStore.renameHabit(h.id, e.currentTarget.value)}
        onKeyDown={leave}
      />
      <Count habit={h} view={view} shown={shown} today={today} />
      <HabitMenu
        habit={h}
        onRename={() => {
          inputs.current.get(h.id)?.focus();
          inputs.current.get(h.id)?.select();
        }}
      />
    </div>
  );

  return (
    <div
      className={`habits-panel${phone ? ' is-phone' : ''}`}
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
      <p className="habits-sub">
        {n === 0 ? (
          journalLongDate(today)
        ) : done === n ? (
          <>
            {weekday} ·{' '}
            <span className="habits-alldone">
              <CheckIcon /> All {n} done
            </span>
          </>
        ) : (
          `${weekday} · ${done} of ${n} done`
        )}
      </p>
      <div className="habit-viewbar" ref={bar}>
        <div className="habit-seg" role="group" aria-label="View">
          <span className="habit-seg-thumb" style={{ transform: `translateX(${VIEWS.indexOf(view) * 100}%)` }} aria-hidden />
          {VIEWS.map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <div className="habit-nav">
          <span className="habit-nav-label" aria-live="polite">
            {habitViewLabel(view, shown)}
          </span>
          {!isHabitViewNow(view, shown, today) && (
            <button type="button" className="habit-today" onClick={() => setShown(today)}>
              Today
            </button>
          )}
          <span className="habit-steps">
            <button type="button" className="habit-step" aria-label={`Previous ${view}`} title={`Previous ${view}`} onClick={() => setShown(moveHabitView(view, shown, -1))}>
              ‹
            </button>
            <button type="button" className="habit-step" aria-label={`Next ${view}`} title={`Next ${view}`} onClick={() => setShown(moveHabitView(view, shown, 1))}>
              ›
            </button>
          </span>
        </div>
      </div>
      <WeightCard board={board} view={view} shown={shown} today={today} />
      <div className={`habit-sheet habit-sheet-${view}`}>
        {n === 0 && (
          <div className="habits-empty">
            <span className="habits-empty-icon" aria-hidden>
              <HabitsIcon />
            </span>
            <h3>No habits yet</h3>
            <p>Add one, then tick each day you do it.</p>
            <button type="button" className="tb-button habits-empty-add" onClick={() => newBox.current?.focus()}>
              <PlusIcon /> Add a habit
            </button>
          </div>
        )}
        {n > 0 && view === 'week' && (
          <div className="habit-days-head" aria-hidden>
            {weekDays(weekStart(shown)).map((d, i) => (
              <span key={d} className={`habit-dh${d === today ? ' today' : ''}`}>
                <span className="habit-wd">{WEEKDAYS[i]}</span>
                <span className="habit-dn">{Number(d.slice(8))}</span>
              </span>
            ))}
          </div>
        )}
        <div className="habit-rows">
          {habits.map((h) => {
            const ticked = tickedDays(h);
            const color = habitColor(h);
            const dayButton = (d: DayKey, children: React.ReactNode) => (
              <button
                key={d}
                type="button"
                className={`habit-day${d > today ? ' ahead' : ''}`}
                aria-label={`${h.title || 'Habit'}, ${dayLabel(d)}`}
                aria-pressed={ticked.has(d)}
                aria-current={d === today ? 'date' : undefined}
                onClick={() => appStore.toggleHabitDay(h.id, d)}
              >
                {children}
              </button>
            );
            return (
              <section key={h.id} className="habit" data-hc={color ?? undefined}>
                {head(h)}
                {view === 'week' && (
                  <div className="habit-week">
                    {weekDays(weekStart(shown)).map((d) =>
                      dayButton(
                        d,
                        <span className="habit-tk" aria-hidden>
                          <CheckIcon />
                        </span>,
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
                    {monthGrid(shown)
                      .flat()
                      .map((d) =>
                        d.slice(0, 7) === shown.slice(0, 7)
                          ? dayButton(
                              d,
                              <span className="habit-num" aria-hidden>
                                {Number(d.slice(8))}
                              </span>,
                            )
                          : <span key={d} />,
                      )}
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
                          aria-label={`${MONTH_NAMES[m]} ${month.slice(0, 4)}, ${inMonth.filter((d) => ticked.has(d)).length} ticked`}
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
                          const cls = !d ? 'none' : `${ticked.has(d) ? 'on' : ''} ${d > today ? 'ahead' : ''} ${d === today ? 'today' : ''}`;
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
        {newRow}
      </div>
    </div>
  );
}
