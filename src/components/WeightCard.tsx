import { useEffect, useMemo, useRef, useState } from 'react';
import { dayLabel, type DayKey } from '../model/calendar';
import { FIRST_WEIGHT_DAY, isWeightDay, parseKg, weightCard, weightChart, weightEntries, type HabitView } from '../model/habits';
import type { Board } from '../model/types';
import { appStore } from '../store/appStore';

/**
 * The Weight card above the habits (owner request, 2026-10-21; "weight B", owner pick 2026-10-22,
 * job 179). It reads top to bottom: the period's latest weight (big) and how it changed, the chart of
 * the week, month or year the panel shows, then one input strip (a day button, the weight in kg,
 * Save), then a read-only History list. Tapping a day in History, or choosing a day that already has
 * a weight, fills the strip with it to correct (Save) or remove (Remove); Cancel goes back to today.
 * After a save or a removal, one line in the strip says what happened, with an Undo link (a phone has
 * no Ctrl+Z). Saving and removing go through the store (one undoable change each), so it is saved and
 * synced like habits.
 */
const W = 300;
const H = 108;
const LEFT = 4;
const RIGHT = 262; // the weights are labeled to the right of this, so the line starts at the left edge
const TOP = 6;
const BOTTOM = 86;
/** The weights sit between 12% and 88% of the height, so the line never touches the frame. */
const INSET = 0.12;
const short = (d: DayKey) => dayLabel(d).slice(4); // "19 Oct"

const BAD_KG = 'Enter a weight from 20.0 to 400.0 kg.';
/** A message under the strip. `undo` is set for one the Undo link can still take back: `before` is the board before the change, `after` the board it made (known once it shows). */
type Note = {
  text: string;
  ok: boolean;
  undo?: { before: Board | undefined; after?: Board };
} | null;

const signed = (n: number) => (n === 0 ? '0.0' : `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(1)}`);

export function WeightCard({ board, view, shown, today, onShow }: { board: Board | undefined; view: HabitView; shown: DayKey; today: DayKey; onShow: (day: DayKey) => void }) {
  const entries = useMemo(() => weightEntries(board && weightCard(board)), [board]);
  const chart = weightChart(entries, view, shown, today);
  const [text, setText] = useState('');
  const [date, setDate] = useState(today); // '' while the date is cleared or half typed
  const [picked, setEditing] = useState(false); // the strip was filled from a day that has a weight, to correct or remove
  const editing = picked && entries.some((e) => e.day === date); // (and it is over if that weight goes: Ctrl+Z, another device)
  const [note, setNote] = useState<Note>(null);
  const box = useRef<HTMLInputElement>(null);
  const focusBox = useRef(false);
  const first = chart.points[0];
  const latest = chart.points[chart.points.length - 1];
  const px = (x: number) => LEFT + x * (RIGHT - LEFT);
  const py = (y: number) => BOTTOM - (INSET + (1 - 2 * INSET) * y) * (BOTTOM - TOP);
  const change = latest && chart.points.length > 1 ? Math.round((latest.kg - first.kg) * 10) / 10 : null;
  const many = chart.points.length > 14; // a dot for each day would crowd the line: only the latest keeps its dot
  /** "Today", or "Mon 19 Oct" (with the year when it isn't this one). */
  const name = (d: DayKey) => (d === today ? 'Today' : d ? `${dayLabel(d)}${d.slice(0, 4) === today.slice(0, 4) ? '' : ` ${d.slice(0, 4)}`}` : 'Pick a day');

  // Undo takes back only this change: it goes as soon as the board changes again (another habit ticked, another device).
  useEffect(() => {
    setNote((n) => {
      if (!n?.undo) return n;
      if (!n.undo.after) return board !== n.undo.before ? { ...n, undo: { ...n.undo, after: board } } : n;
      return board === n.undo.after ? n : null;
    });
  }, [board, note]);
  // Tapping a day in History puts the cursor in the box (after the box shows that day's weight), selected, to type over.
  useEffect(() => {
    if (!focusBox.current) return;
    focusBox.current = false;
    box.current?.focus();
    box.current?.select();
  });

  const reset = () => {
    setText('');
    setDate(today);
    setEditing(false);
  };
  const leave = (el: HTMLElement) => el.closest<HTMLElement>('.habits-panel')?.focus(); // the panel has the keyboard, so Ctrl+Z works

  /** Choose a day (the day button, or a row of History): a day with a weight fills the strip with it (the day button keeps a weight already typed, to replace that day's). */
  const choose = (day: DayKey, fill = false) => {
    const e = entries.find((x) => x.day === day);
    setDate(day);
    setNote(null);
    if (e) {
      if (fill || editing || !text.trim()) setText(e.kg.toFixed(1));
      setEditing(true);
    } else if (editing) {
      setText('');
      setEditing(false);
    }
  };

  const save = () => {
    if (!text.trim()) return; // a blank does nothing
    const day = date;
    if (!isWeightDay(day, today)) return setNote({ text: 'Pick today or an earlier day.', ok: false });
    const kg = parseKg(text);
    if (kg === null) return setNote({ text: BAD_KG, ok: false });
    const was = entries.find((e) => e.day === day);
    if (was?.kg === kg) {
      reset();
      return setNote({
        text: `${name(day)}: ${kg.toFixed(1)} kg, no change`,
        ok: true,
      });
    }
    if (appStore.saveWeight(text, day) === null) return setNote({ text: BAD_KG, ok: false });
    setNote({
      text: `${name(day)}: ${was ? `${was.kg.toFixed(1)} → ${kg.toFixed(1)}` : `saved ${kg.toFixed(1)}`} kg`,
      ok: true,
      undo: { before: board },
    });
    reset();
    if (day < chart.from || day > chart.to) onShow(day); // so the new weight is on the chart
  };

  const remove = () => {
    const was = entries.find((e) => e.day === date);
    if (!was) return;
    appStore.removeWeight(date);
    setNote({
      text: `${name(date)}: removed ${was.kg.toFixed(1)} kg`,
      ok: true,
      undo: { before: board },
    });
    reset();
  };

  const labelDates = (anchor: number) => chart.todayX === null || Math.abs(px(chart.todayX) - anchor) >= 36; // the end dates give way to "Today" beside them
  const before = new Map(entries.map((e, i) => [e.day, i > 0 ? entries[i - 1].kg : null])); // the weight before each day's
  const rows = [...chart.points].reverse().map((p) => ({ ...p, delta: before.get(p.day) == null ? null : Math.round((p.kg - before.get(p.day)!) * 10) / 10 }));

  const strip = (
    <form
      className={`weight-new${editing ? ' editing' : ''}`}
      noValidate // our own note says a later day isn't allowed, not the browser's bubble
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="weight-new-row">
        {/* The day button: the real date box sits invisibly over it, so a tap opens the browser's picker and typing a date still works. */}
        <span className="weight-day">
          <span className="weight-day-text">{name(date)}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <input
            type="date"
            aria-label="Date of weight"
            min={FIRST_WEIGHT_DAY}
            max={today}
            value={date}
            onChange={(e) => choose(e.currentTarget.value)}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker();
              } catch {
                // (a browser without showPicker still has its own date box under the button)
              }
            }}
          />
        </span>
        <label className="weight-kg">
          <input
            ref={box}
            type="text"
            inputMode="decimal"
            aria-label="Weight in kg"
            placeholder="Weight"
            enterKeyHint="done"
            value={text}
            onChange={(e) => {
              setText(e.currentTarget.value);
              setNote(null);
            }}
            onFocus={(e) => editing && e.currentTarget.select()}
            // Escape leaves the box (a second Escape closes the panel), as in the other boxes.
            onKeyDown={(e) => e.key === 'Escape' && leave(e.currentTarget)}
          />
          <span aria-hidden>kg</span>
        </label>
        <button type="submit" className="weight-save" aria-label="Save weight">
          Save
        </button>
      </div>
      {editing && (
        <div className="weight-acts">
          <button
            type="button"
            className="weight-remove"
            onClick={(e) => {
              leave(e.currentTarget);
              remove();
            }}
          >
            Remove
          </button>
          <button
            type="button"
            className="weight-cancel"
            onClick={(e) => {
              leave(e.currentTarget);
              reset();
              setNote(null);
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {note && (
        <p className="weight-msg" role={note.ok ? 'status' : 'alert'}>
          <span className="weight-msg-text">{note.text}</span>
          {note.undo && (
            <button
              type="button"
              className="weight-undo"
              onClick={(e) => {
                leave(e.currentTarget); // this button goes, so the panel keeps the keyboard (Ctrl+Y brings the weight back)
                appStore.undoHabits();
                setNote({ text: 'Undone.', ok: true });
              }}
            >
              Undo
            </button>
          )}
        </p>
      )}
    </form>
  );

  // One list of children in either case, so the strip (and the cursor in its box) stays put when the first weight is saved.
  const none = chart.points.length === 0;
  return (
    <section className="weight" aria-label="Weight">
      <div className="weight-top">
        <div className="weight-title">Weight</div>
        {change !== null && (
          <div className="weight-change">
            {change === 0 ? 'No change' : `${change < 0 ? '↓' : '↑'} ${Math.abs(change).toFixed(1)} kg`} this {view}
          </div>
        )}
      </div>
      {none ? (
        <div className="weight-empty">
          <b>No weight this {view}</b>
          Save one and it shows here as a line.
        </div>
      ) : (
        <div className="weight-hero">
          <div className="weight-num">
            <b>{latest.kg.toFixed(1)}</b> kg
          </div>
          <div className="weight-when">{latest.day === today ? 'Today' : dayLabel(latest.day)}</div>
        </div>
      )}
      {none ? (
        <div className="weight-ghost" aria-hidden />
      ) : (
        <svg
          className="weight-chart"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Weight chart, ${chart.points.length} ${chart.points.length === 1 ? 'entry' : 'entries'}, ${chart.min!.toFixed(1)} to ${chart.max!.toFixed(1)} kg`}
        >
          <line className="weight-grid" x1={LEFT} x2={RIGHT} y1={BOTTOM} y2={BOTTOM} />
          {chart.todayX !== null && <line className="weight-today-line" x1={px(chart.todayX)} x2={px(chart.todayX)} y1={TOP} y2={BOTTOM} />}
          <g className="weight-axis">
            {chart.max === chart.min ? (
              <text x={RIGHT + 6} y={py(0.5) + 4}>
                {chart.max!.toFixed(1)}
              </text>
            ) : (
              <>
                <text x={RIGHT + 6} y={py(1) + 4}>
                  {chart.max!.toFixed(1)}
                </text>
                <text x={RIGHT + 6} y={py(0) + 4}>
                  {chart.min!.toFixed(1)}
                </text>
              </>
            )}
            {labelDates(LEFT) && (
              <text x={LEFT} y={H - 6}>
                {short(chart.from)}
              </text>
            )}
            {labelDates(RIGHT) && (
              <text x={RIGHT} y={H - 6} textAnchor="end">
                {short(chart.to)}
              </text>
            )}
            {chart.todayX !== null && (
              <text className="weight-today-label" x={Math.min(Math.max(px(chart.todayX), LEFT + 14), RIGHT - 14)} y={H - 6} textAnchor="middle">
                Today
              </text>
            )}
          </g>
          {chart.points.length > 1 && <path className="weight-area" d={`M${px(first.x)},${BOTTOM} ${chart.points.map((p) => `L${px(p.x)},${py(p.y)}`).join(' ')} L${px(latest.x)},${BOTTOM} Z`} />}
          {chart.points.length > 1 && <polyline className="weight-line" points={chart.points.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')} />}
          {chart.points.map((p) => {
            const picked = editing && p.day === date;
            return (
              <circle
                key={p.day}
                className={`weight-point${p === latest ? ' latest' : ''}${picked ? ' selected' : ''}${many && p !== latest && !picked ? ' faint' : ''}`}
                cx={px(p.x)}
                cy={py(p.y)}
                r={picked ? 3.7 : p === latest ? 3.2 : 2.2}
              >
                <title>{`${dayLabel(p.day)}: ${p.kg.toFixed(1)} kg`}</title>
              </circle>
            );
          })}
        </svg>
      )}
      {strip}
      {!none && (
        <details className="weight-history">
          <summary>
            History · {chart.points.length}
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <ul>
            {rows.map((p) => (
              <li key={p.day}>
                <button
                  type="button"
                  className="weight-row"
                  aria-pressed={editing && date === p.day}
                  aria-label={`Change or remove ${dayLabel(p.day)}, ${p.kg.toFixed(1)} kg`}
                  onClick={() => {
                    focusBox.current = true;
                    choose(p.day);
                  }}
                >
                  <span>{dayLabel(p.day)}</span>
                  <b>{p.kg.toFixed(1)} kg</b>
                  <span className="weight-row-change">{p.delta === null ? '' : signed(p.delta)}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
