import { useMemo, useState } from 'react';
import { dayKey, dayLabel, MONTHS, type DayKey } from '../model/calendar';
import { weightCard, weightChart, weightEntries, type HabitView } from '../model/habits';
import type { Board } from '../model/types';
import { appStore } from '../store/appStore';

/**
 * The Weight card above the habits (owner request, 2026-10-21; the look, owner pick 2026-10-22): a
 * big number for the period's latest weight and how it changed, a box for today's weight in kg, and
 * a small chart of the weights in the week, month or year the panel shows. Saving and removing go
 * through the store (one undoable change each), so it is saved and synced like habits.
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

export function WeightCard({ board, view, shown, today }: { board: Board | undefined; view: HabitView; shown: DayKey; today: DayKey }) {
  const entries = useMemo(() => weightEntries(board && weightCard(board)), [board]);
  const chart = weightChart(entries, view, shown);
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const first = chart.points[0];
  const latest = chart.points[chart.points.length - 1];
  const px = (x: number) => LEFT + x * (RIGHT - LEFT);
  const py = (y: number) => BOTTOM - (INSET + (1 - 2 * INSET) * y) * (BOTTOM - TOP);
  const change = latest && chart.points.length > 1 ? Math.round((latest.kg - first.kg) * 10) / 10 : null;
  const many = chart.points.length > 14; // a dot for each day would crowd the line: only the latest keeps its dot

  const save = () => {
    if (!text.trim()) return setBad(false); // a blank does nothing
    const kept = appStore.saveWeight(text, dayKey(new Date()));
    setBad(kept === null);
    if (kept !== null) setText('');
  };

  return (
    <section className="weight" aria-label="Weight">
      <div className="weight-top">
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
      </div>
      {bad && (
        <p className="weight-note" role="alert">
          Enter a weight from 20.0 to 400.0 kg.
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
        </>
      )}
    </section>
  );
}
