import { useMemo, useState } from 'react';
import { dayLabel, MONTHS, type DayKey } from '../model/calendar';
import { FIRST_WEIGHT_DAY, isWeightDay, weightCard, weightChart, weightEntries, type HabitView } from '../model/habits';
import type { Board } from '../model/types';
import { appStore } from '../store/appStore';

/**
 * The Weight card above the habits (owner request, 2026-10-21; the look, owner pick 2026-10-22): a
 * big number for the period's latest weight and how it changed, a box for today's weight in kg, and
 * a small chart of the weights in the week, month or year the panel shows. Saving and removing go
 * through the store (one undoable change each), so it is saved and synced like habits. A date beside
 * the box (today to start with, nothing later) enters a weight for an earlier day, and a folded list
 * of the period's entries corrects or removes any of them (job 177).
 */
const W = 300;
const H = 96;
const LEFT = 34;
const RIGHT = 292;
const TOP = 6;
const BOTTOM = 76;
/** The weights sit between 12% and 88% of the height, so the line never touches the frame. */
const INSET = 0.12;
const short = (d: DayKey) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

const BAD_KG = 'Enter a weight from 20.0 to 400.0 kg.';
type Note = { text: string; ok: boolean } | null;

/** One entry of the list: its weight can be typed over (kept on Enter or leaving the box; Escape drops it) or removed. */
function WeightRow({ day, kg, onNote }: { day: DayKey; kg: number; onNote: (n: Note) => void }) {
  const shown = kg.toFixed(1);
  const panel = (el: HTMLElement) => el.closest<HTMLElement>('.habits-panel');
  return (
    <li className="weight-row">
      <span className="weight-row-day">{dayLabel(day)}</span>
      <input
        key={shown} // the box starts over when the weight changes (undo, another device), while the row and its × stay put
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        aria-label={`Weight for ${dayLabel(day)} in kg`}
        defaultValue={shown}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          const text = e.currentTarget.value;
          if (text.trim() === shown) return;
          const kept = appStore.saveWeight(text, day);
          if (kept !== null) return; // (no note is cleared here: a line vanishing would move the × a click is on)
          e.currentTarget.value = shown; // the old weight goes back
          onNote({ text: BAD_KG, ok: false });
        }}
        // Enter and Escape leave the box (a blur keeps what was typed): Escape first puts the old weight back, and the panel, not the box, then has the keyboard, so Ctrl+Z undoes the change.
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== 'Escape') return;
          if (e.key === 'Escape') e.currentTarget.value = shown;
          panel(e.currentTarget)?.focus();
        }}
      />
      <span className="weight-row-unit">kg</span>
      <button type="button" className="icon-button weight-remove" aria-label={`Remove weight for ${dayLabel(day)}`} title="Remove this weight" onClick={() => appStore.removeWeight(day)}>
        ×
      </button>
    </li>
  );
}

export function WeightCard({ board, view, shown, today, onShow }: { board: Board | undefined; view: HabitView; shown: DayKey; today: DayKey; onShow: (day: DayKey) => void }) {
  const entries = useMemo(() => weightEntries(board && weightCard(board)), [board]);
  const chart = weightChart(entries, view, shown);
  const [text, setText] = useState('');
  const [date, setDate] = useState(today); // '' while the date is cleared or half typed
  const [note, setNote] = useState<Note>(null);
  const first = chart.points[0];
  const latest = chart.points[chart.points.length - 1];
  const px = (x: number) => LEFT + x * (RIGHT - LEFT);
  const py = (y: number) => BOTTOM - (INSET + (1 - 2 * INSET) * y) * (BOTTOM - TOP);
  const change = latest && chart.points.length > 1 ? Math.round((latest.kg - first.kg) * 10) / 10 : null;
  const many = chart.points.length > 14; // a dot for each day would crowd the line: only the latest keeps its dot

  const save = () => {
    if (!text.trim()) return setNote(null); // a blank does nothing
    const day = date;
    if (!isWeightDay(day, today)) return setNote({ text: 'Pick today or an earlier day.', ok: false });
    const was = entries.find((e) => e.day === day);
    const kept = appStore.saveWeight(text, day);
    if (kept === null) return setNote({ text: BAD_KG, ok: false });
    const when = day === today ? 'today' : dayLabel(day);
    // Entering today's first weight needs no word; anything else says what it did.
    setNote(was ? { text: `Replaced ${was.kg.toFixed(1)} kg with ${kept.toFixed(1)} kg for ${when}.`, ok: true } : day === today ? null : { text: `Saved ${kept.toFixed(1)} kg for ${when}.`, ok: true });
    setText('');
    setDate(today);
    if (day < chart.from || day > chart.to) onShow(day); // so the new weight is on the chart
  };

  return (
    <section className="weight" aria-label="Weight">
      <div className="weight-top">
        <div className="weight-title">Weight</div>
        <form
          className="weight-new"
          noValidate // our own note says a later day isn't allowed, not the browser's bubble
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input type="date" aria-label="Date of weight" min={FIRST_WEIGHT_DAY} max={today} value={date} onChange={(e) => (setDate(e.currentTarget.value), setNote(null))} />
          <input
            type="text"
            inputMode="decimal"
            aria-label="Today’s weight in kg"
            placeholder="kg"
            enterKeyHint="done"
            value={text}
            onChange={(e) => {
              setText(e.currentTarget.value);
              setNote(null);
            }}
            // Escape leaves the box (a second Escape closes the panel), as in the other boxes.
            onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.closest<HTMLElement>('.habits-panel')?.focus()}
          />
          <button type="submit" className="tb-button" aria-label="Save weight">
            Save
          </button>
        </form>
      </div>
      {note && (
        <p className={`weight-note${note.ok ? ' ok' : ''}`} role={note.ok ? 'status' : 'alert'}>
          {note.text}
        </p>
      )}
      {chart.points.length === 0 ? (
        <p className="weight-empty">No weight entered in this {view}.</p>
      ) : (
        <>
          <div className="weight-body">
            <div className="weight-text">
              <div className="weight-num">
                <b>{latest.kg.toFixed(1)}</b> kg{latest.day === today && <span className="weight-today"> today</span>}
              </div>
              {change !== null && (
                <div className="weight-change">
                  {change === 0 ? 'No change' : `${change < 0 ? '−' : '+'}${Math.abs(change).toFixed(1)} kg`} this {view}
                </div>
              )}
            </div>
            <svg className="weight-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weight chart, ${chart.points.length} ${chart.points.length === 1 ? 'entry' : 'entries'}, ${chart.min!.toFixed(1)} to ${chart.max!.toFixed(1)} kg`}>
              <line className="weight-grid" x1={LEFT} x2={RIGHT} y1={TOP} y2={TOP} />
              <line className="weight-grid" x1={LEFT} x2={RIGHT} y1={BOTTOM} y2={BOTTOM} />
              <g className="weight-axis">
                {chart.max === chart.min ? (
                  <text x={LEFT - 4} y={py(0.5) + 3} textAnchor="end">
                    {chart.max!.toFixed(1)}
                  </text>
                ) : (
                  <>
                    <text x={LEFT - 4} y={py(1) + 3} textAnchor="end">
                      {chart.max!.toFixed(1)}
                    </text>
                    <text x={LEFT - 4} y={py(0) + 3} textAnchor="end">
                      {chart.min!.toFixed(1)}
                    </text>
                  </>
                )}
                <text x={LEFT} y={H - 6}>
                  {short(chart.from)}
                </text>
                <text x={RIGHT} y={H - 6} textAnchor="end">
                  {short(chart.to)}
                </text>
              </g>
              {chart.points.length > 1 && <path className="weight-area" d={`M${px(first.x)},${BOTTOM} ${chart.points.map((p) => `L${px(p.x)},${py(p.y)}`).join(' ')} L${px(latest.x)},${BOTTOM} Z`} />}
              {chart.points.length > 1 && <polyline className="weight-line" points={chart.points.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')} />}
              {chart.points.map((p) => (
                <circle key={p.day} className={`weight-point${p === latest ? ' latest' : ''}${many && p !== latest ? ' faint' : ''}`} cx={px(p.x)} cy={py(p.y)} r={p === latest ? 4 : 3}>
                  <title>{`${dayLabel(p.day)}: ${p.kg.toFixed(1)} kg`}</title>
                </circle>
              ))}
            </svg>
          </div>
          <div className="weight-latest">
            <span>
              Latest: {latest.kg.toFixed(1)} kg, {dayLabel(latest.day)}
            </span>
            <button type="button" className="icon-button weight-remove" aria-label={`Remove weight for ${dayLabel(latest.day)}`} title="Remove this weight" onClick={() => appStore.removeWeight(latest.day)}>
              ×
            </button>
          </div>
          <details className="weight-entries">
            <summary>Entries ({chart.points.length})</summary>
            <ul>
              {[...chart.points].reverse().map((p) => (
                <WeightRow key={p.day} day={p.day} kg={p.kg} onNote={setNote} />
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
