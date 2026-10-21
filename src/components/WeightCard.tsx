import { useMemo, useState } from 'react';
import { dayKey, dayLabel, MONTHS, type DayKey } from '../model/calendar';
import { weightCard, weightChart, weightEntries, type HabitView } from '../model/habits';
import type { Board } from '../model/types';
import { appStore } from '../store/appStore';

/**
 * The Weight card at the top of the Habits panel (owner request, 2026-10-21): a box for today's
 * weight in kg, and a small chart of the weights in the week, month or year the panel shows. Saving
 * and removing go through the store (one undoable change each), so it is saved and synced like habits.
 */
const W = 300;
const H = 112;
const LEFT = 34;
const RIGHT = 292;
const TOP = 10;
const BOTTOM = 86;
const short = (d: DayKey) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

export function WeightCard({ board, view, shown, today }: { board: Board | undefined; view: HabitView; shown: DayKey; today: DayKey }) {
  const entries = useMemo(() => weightEntries(board && weightCard(board)), [board]);
  const chart = weightChart(entries, view, shown);
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const todays = entries.find((e) => e.day === today);
  const latest = chart.points[chart.points.length - 1];
  const px = (x: number) => LEFT + x * (RIGHT - LEFT);
  const py = (y: number) => BOTTOM - y * (BOTTOM - TOP);

  const save = () => {
    if (!text.trim()) return setBad(false); // a blank does nothing
    const kept = appStore.saveWeight(text, dayKey(new Date()));
    setBad(kept === null);
    if (kept !== null) setText('');
  };

  return (
    <section className="weight" aria-label="Weight">
      <div className="weight-title">Weight</div>
      <form
        className="weight-new"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          type="text"
          inputMode="decimal"
          aria-label="Today’s weight in kg"
          placeholder="kg"
          enterKeyHint="done"
          value={text}
          onChange={(e) => {
            setText(e.currentTarget.value);
            setBad(false);
          }}
          // Escape leaves the box (a second Escape closes the panel), as in the other boxes.
          onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.closest<HTMLElement>('.habits-panel')?.focus()}
        />
        <button type="submit" className="tb-button" aria-label="Save weight">
          Save
        </button>
      </form>
      {bad && (
        <p className="weight-note" role="alert">
          Enter a weight from 20.0 to 400.0 kg.
        </p>
      )}
      {todays && <p className="weight-today">Today: {todays.kg.toFixed(1)} kg</p>}
      {chart.points.length === 0 ? (
        <p className="weight-empty">No weight entered in this {view}.</p>
      ) : (
        <>
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
                  <text x={LEFT - 4} y={TOP + 3} textAnchor="end">
                    {chart.max!.toFixed(1)}
                  </text>
                  <text x={LEFT - 4} y={BOTTOM + 3} textAnchor="end">
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
            {chart.points.length > 1 && <polyline className="weight-line" points={chart.points.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')} />}
            {chart.points.map((p) => (
              <circle key={p.day} className="weight-point" cx={px(p.x)} cy={py(p.y)} r={3}>
                <title>{`${dayLabel(p.day)}: ${p.kg.toFixed(1)} kg`}</title>
              </circle>
            ))}
          </svg>
          <div className="weight-latest">
            <span>
              Latest: {latest.kg.toFixed(1)} kg, {dayLabel(latest.day)}
            </span>
            <button type="button" className="icon-button weight-remove" aria-label={`Remove weight for ${dayLabel(latest.day)}`} title="Remove this weight" onClick={() => appStore.removeWeight(latest.day)}>
              ×
            </button>
          </div>
        </>
      )}
    </section>
  );
}
