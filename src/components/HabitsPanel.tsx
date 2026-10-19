import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { dayKey, dayLabel } from '../model/calendar';
import { habitList, streak, thisWeek, tickedDays } from '../model/habits';
import { appStore, useAppState } from '../store/appStore';
import { collab } from '../sync/collabSession';
import { HabitsIcon, TrashIcon } from './icons';
import { usePhone } from './usePhone';

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
 * The Habits side panel (owner request, 2026-10-19): each habit on the Habits board with this
 * week's seven days to tick (any of them, at most once a day) and its streak, and a box to add one.
 * Every change goes through the store, so it is saved, synced and undoable (Ctrl+Z here).
 */
export function HabitsPanel() {
  const board = useAppState((s) => {
    const id = appStore.habitsBoard();
    if (!id) return undefined;
    return id === s.boards.open ? s.board : s.boards.others[id];
  });
  const habits = useMemo(() => (board ? habitList(board) : []), [board]);
  // simple: "today" is read when the panel draws; left open past midnight it moves on at the next change.
  const today = dayKey(new Date());
  const week = thisWeek(today);
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
      {habits.length === 0 && <p className="habits-empty">No habits yet. Add one, then tick each day you do it.</p>}
      {habits.map((h) => {
        const done = tickedDays(h);
        const run = streak(done, today);
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
            <div className="habit-week">
              {week.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="habit-day"
                  aria-label={`${h.title || 'Habit'}, ${dayLabel(d)}`}
                  aria-pressed={done.has(d)}
                  aria-current={d === today ? 'date' : undefined}
                  onClick={() => appStore.toggleHabitDay(h.id, d)}
                >
                  <span className="habit-wd" aria-hidden>
                    {dayLabel(d)[0]}
                  </span>
                  <span aria-hidden>{Number(d.slice(8))}</span>
                </button>
              ))}
            </div>
            <p className="habit-streak">{run ? `${run}-day streak` : 'No streak'}</p>
          </section>
        );
      })}
    </div>
  );
}
