import { useEffect, useState } from 'react';
import { formatTime, isRunning, MAX_MINUTES, MIN_MINUTES, ROUNDS, timeLeft, type Phase, type Pomodoro } from '../model/pomodoro';
import { appStore, pomodoro, useAppState } from '../store/appStore';
import { usePomodoro } from '../store/pomodoro';
import { TimerIcon } from './icons';

// Focus timer (Pomodoro), owner request 2026-10-06: its button (in ⋯ on a phone) opens it
// in the side panel; it keeps running when the panel is closed, and the button shows the time left.

const PHASE_NAME: Record<Phase, string> = { focus: 'Focus', short: 'Short break', long: 'Long break' };

/** The time left, worked out again every second while the timer runs. */
function useTimeLeft(p: Pomodoro): number {
  const [, tick] = useState(0);
  const running = isRunning(p);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  return timeLeft(p, Date.now());
}

/**
 * Opens the focus timer: a round button by the zoom control (the toolbar is full at 1280px), a
 * line in ⋯ on a phone. While a round is running or paused it shows the time left (18:42).
 */
export function PomodoroButton({ labelled = false, onOpen }: { labelled?: boolean; onOpen?: () => void }) {
  const p = usePomodoro(pomodoro);
  const open = useAppState((s) => s.ui.sidePanel === 'pomodoro');
  const left = useTimeLeft(p);
  const time = isRunning(p) || p.timer.left !== null ? formatTime(left) : null;
  return (
    <button
      type="button"
      className={labelled ? 'tb-button' : `help-button pomodoro-button${time ? ' with-time' : ''}`}
      aria-label={time ? `Focus timer, ${time} left` : 'Focus timer'}
      title="Focus timer (Pomodoro)"
      aria-pressed={open}
      onClick={() => {
        appStore.toggleSidePanel('pomodoro');
        onOpen?.();
      }}
    >
      <TimerIcon />
      {labelled && 'Focus timer'}
      {time && <span className="pomodoro-left">{time}</span>}
    </button>
  );
}

const LENGTHS: { which: Phase; label: string }[] = [
  { which: 'focus', label: 'Focus' },
  { which: 'short', label: 'Short break' },
  { which: 'long', label: 'Long break' },
];

/** What the side panel shows for the focus timer. */
export function PomodoroPanel() {
  const p = usePomodoro(pomodoro);
  const left = useTimeLeft(p);
  const running = isRunning(p);
  return (
    <div className="pomodoro">
      <p className="pomodoro-phase">
        {PHASE_NAME[p.timer.phase]} · Round {p.timer.round} of {ROUNDS}
      </p>
      <div className="pomodoro-clock" role="timer" aria-label="Time left">
        {formatTime(left)}
      </div>
      <div className="pomodoro-actions">
        <button type="button" className="tb-button pomodoro-start" onClick={running ? pomodoro.pause : pomodoro.start}>
          {running ? 'Pause' : 'Start'}
        </button>
        <button type="button" className="tb-button" title="Back to the start of this round" onClick={pomodoro.reset}>
          Reset
        </button>
        <button type="button" className="tb-button" title="Go on to the next round" onClick={pomodoro.skip}>
          Skip
        </button>
      </div>

      <h3 className="pomodoro-heading">Lengths</h3>
      {LENGTHS.map(({ which, label }) => (
        <label key={which} className="pomodoro-length">
          <span>{label}</span>
          <input
            type="number"
            inputMode="numeric"
            min={MIN_MINUTES}
            max={MAX_MINUTES}
            step={1}
            aria-label={`${label} (minutes)`}
            defaultValue={p.settings[which]}
            onChange={(e) => pomodoro.setLength(which, e.currentTarget.valueAsNumber)}
            // A length that isn't a whole number of minutes from 1 to 120 goes back to the one in use.
            onBlur={(e) => (e.currentTarget.value = String(pomodoro.get().settings[which]))}
          />
          <span className="pomodoro-unit">min</span>
        </label>
      ))}
      <label className="pomodoro-chime">
        <input type="checkbox" checked={!p.settings.muted} onChange={(e) => pomodoro.setMuted(!e.currentTarget.checked)} />
        Chime when a round ends
      </label>
      <p className="history-note">It keeps running when this panel is closed. The lengths are remembered on this device.</p>
    </div>
  );
}
